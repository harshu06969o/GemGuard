"""
GeM-Guard — Tender AI Compiler Pipeline
Strict Specifications:
1. PDF Ingestion: Utilizes PyMuPDF (fitz) to parse tender PDFs, capturing text and table structures.
2. Domain Verification: Validates whether the uploaded file is a legitimate procurement/RFP document.
   Rejects non-tender documents (resumes, general slides, receipts) from generating fake compliance rules.
3. Rule Extraction Engine:
   - When OPENAI_API_KEY is configured: Calls OpenAI (gpt-4o-mini) with structured JSON output.
   - When offline / no API key: High-precision deterministic layout-aware regex & table compiler:
     * Financial turnover thresholds (INR Cr)
     * Make in India (MII) local content exact percentages
     * Statutory registrations (GST, PAN, Udyam, EMD, Experience)
4. Maps outputs directly to Pydantic RequirementRule domain models.
"""

import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    import pymupdf as fitz
except ImportError:
    import fitz

from app.schemas.domain import RequirementRule, RuleSeverity

logger = logging.getLogger("gemguard.tender_compiler")


def get_openai_credentials() -> Tuple[str, str]:
    """Dynamically fetch OpenAI configuration from environment or config."""
    from app.config import OPENAI_API_KEY as CFG_KEY, OPENAI_MODEL as CFG_MODEL
    key = os.getenv("OPENAI_API_KEY", "") or CFG_KEY or ""
    model = os.getenv("OPENAI_MODEL", "") or CFG_MODEL or "gpt-4o-mini"
    return key.strip(), model.strip()


@dataclass
class ParsedTable:
    """Represents an extracted table structure from a PDF page."""
    page_number: int
    headers: List[str]
    rows: List[List[str]]
    markdown: str


@dataclass
class ParsedPDFDocument:
    """Complete parsed output of a tender PDF document."""
    total_pages: int
    full_text: str
    pages_text: List[str]
    tables: List[ParsedTable]
    metadata: Dict[str, Any]
    is_tender: bool = True
    detection_reason: str = ""
    detected_indicators: List[str] = field(default_factory=list)


class TenderPDFParser:
    """
    Parses Tender PDFs using PyMuPDF.
    Captures freeform text, structured table data, and verifies tender domain context.
    """

    TENDER_INDICATORS = [
        "tender", "bid", "bidding", "bidder", "bidders", "rfp", "request for proposal",
        "nit", "notice inviting tender", "procurement", "procuring entity",
        "scope of work", "eligibility criteria", "technical specifications",
        "contract", "gem", "turnover", "commercial terms", "earnest money deposit",
        "emd", "security deposit", "corrigendum", "clause", "evaluation methodology",
        "general conditions", "special conditions", "qualification criteria",
        "competent authority", "cpcl", "ministry", "public procurement", "gem/202",
    ]

    @classmethod
    def detect_tender_document(cls, text: str) -> Tuple[bool, str, List[str]]:
        """
        Validate whether the uploaded PDF possesses genuine tender/procurement characteristics.
        Prevents random non-procurement files (resumes, photos, homework, receipts) from generating mock rules.
        """
        clean_text = text.strip()
        if len(clean_text) < 50:
            return False, "Document contains no readable text or is empty. Please ensure the PDF has searchable text.", []

        lower_text = clean_text.lower()
        matched_indicators = []
        for keyword in cls.TENDER_INDICATORS:
            if re.search(r"\b" + re.escape(keyword) + r"\b", lower_text):
                matched_indicators.append(keyword)

        # A valid procurement tender must match at least 2 distinct domain terms
        if len(matched_indicators) < 2:
            return (
                False,
                f"Uploaded document does not contain tender or procurement terminology (only {len(matched_indicators)} indicator found).",
                matched_indicators,
            )

        return True, "Valid Tender / RFP Document detected.", matched_indicators

    @classmethod
    def parse_pdf(cls, file_path_or_bytes: Union[str, Path, bytes]) -> ParsedPDFDocument:
        """
        Parse a PDF file from a filesystem path or raw bytes.
        Captures page texts, all detected table structures, and domain validity.
        """
        if isinstance(file_path_or_bytes, (str, Path)):
            doc = fitz.open(str(file_path_or_bytes))
        elif isinstance(file_path_or_bytes, (bytes, bytearray)):
            doc = fitz.open(stream=bytes(file_path_or_bytes), filetype="pdf")
        elif hasattr(file_path_or_bytes, "read"):
            content = file_path_or_bytes.read()
            doc = fitz.open(stream=bytes(content), filetype="pdf")
        else:
            raise ValueError(f"Unsupported input type for PDF parsing: {type(file_path_or_bytes)}")

        total_pages = len(doc)
        pages_text: List[str] = []
        parsed_tables: List[ParsedTable] = []

        for page_idx, page in enumerate(doc):
            page_num = page_idx + 1
            # 1. Extract regular text
            text = page.get_text("text") or ""
            pages_text.append(text)

            # 2. Extract tables using PyMuPDF table finder
            try:
                table_finder = page.find_tables()
                if table_finder and table_finder.tables:
                    for table in table_finder.tables:
                        extracted = table.extract()
                        if not extracted or len(extracted) < 2:
                            continue
                        headers = [str(c).strip() if c else f"Col_{i}" for i, c in enumerate(extracted[0])]
                        raw_rows = extracted[1:]
                        rows = [[str(c).strip() if c else "" for c in r] for r in raw_rows]

                        # Generate clean Markdown representation of the table
                        md_lines = [
                            "| " + " | ".join(headers) + " |",
                            "| " + " | ".join(["---"] * len(headers)) + " |",
                        ]
                        for row in rows:
                            padded = row + [""] * (len(headers) - len(row))
                            md_lines.append("| " + " | ".join(padded[:len(headers)]) + " |")

                        parsed_tables.append(ParsedTable(
                            page_number=page_num,
                            headers=headers,
                            rows=rows,
                            markdown="\n".join(md_lines),
                        ))
            except Exception as tbl_err:
                logger.debug("Table detection note on page %d: %s", page_num, tbl_err)

        doc.close()
        full_text = "\n\n".join(pages_text)

        # 3. Check tender authenticity
        is_tender, detection_reason, matched_indicators = cls.detect_tender_document(full_text)

        # 4. Extract metadata from text
        metadata = cls._extract_tender_metadata(full_text)

        logger.info(
            "Parsed PDF: %d pages, %d tables, %d total chars. Tender verified: %s (%s)",
            total_pages,
            len(parsed_tables),
            len(full_text),
            is_tender,
            detection_reason,
        )

        return ParsedPDFDocument(
            total_pages=total_pages,
            full_text=full_text,
            pages_text=pages_text,
            tables=parsed_tables,
            metadata=metadata,
            is_tender=is_tender,
            detection_reason=detection_reason,
            detected_indicators=matched_indicators,
        )

    @classmethod
    def _extract_tender_metadata(cls, text: str) -> Dict[str, Any]:
        """Extract high-level metadata (Tender No, Title, Organization, Closing Date)."""
        meta: Dict[str, Any] = {
            "tender_no": None,
            "title": "Procurement of Materials & Services",
            "organization": "CPCL",
            "closing_date": None,
            "estimated_value": None,
        }

        # Tender reference number regex
        tender_no_patterns = [
            r"GEM/\d{4}/[A-Z]/\d+",
            r"Tender\s+(?:Reference\s+)?(?:Number|No\.?)[\s:]+([A-Z0-9/\-_]+)",
            r"RFP\s+No\.?[\s:]+([A-Z0-9/\-_]+)",
            r"NIT\s+No\.?[\s:]+([A-Z0-9/\-_]+)",
            r"Reference\s+No[\s:]+([A-Z0-9/\-_]+)",
        ]
        for pat in tender_no_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                meta["tender_no"] = m.group(1) if m.groups() else m.group(0)
                break

        # Organization / Issuing Authority
        org_patterns = [
            r"Chennai\s+Petroleum\s+Corporation\s+Limited|CPCL",
            r"Issuing\s+Authority[\s:]+([^\n]+)",
            r"Procuring\s+Entity[\s:]+([^\n]+)",
            r"Ministry\s+of\s+[A-Za-z\s]+",
        ]
        for pat in org_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                matched_org = m.group(1) if m.groups() and m.group(1) else m.group(0)
                if "chennai petroleum" in matched_org.lower() or "cpcl" in matched_org.lower():
                    meta["organization"] = "CPCL"
                else:
                    meta["organization"] = matched_org.strip()
                break

        # Title
        title_patterns = [
            r"Request\s+for\s+Proposal\s*\([^\)]+\)[\s\n]+([^\n]+)",
            r"Scope\s+of\s+Work[\s:]+([^\n\.]+)",
            r"Name\s+of\s+Work[\s:]+([^\n]+)",
            r"Tender\s+Document\s+for\s+([^\n]+)",
            r"Subject[\s:]+([^\n]+)",
        ]
        for pat in title_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                meta["title"] = m.group(1).strip()
                break

        return meta


class RuleExtractionEngine:
    """
    Parses natural language clauses and table structures into executable
    JSON RequirementRule records.
    Extracts:
    - Financial turnover thresholds (INR Cr)
    - Make in India (MII) local content exact percentages
    - Mandatory statutory registrations (GST, PAN, Udyam, EMD, Experience)
    """

    def __init__(self, tender_id: Optional[str] = None):
        self.tender_id = tender_id

    def extract_rules(self, parsed_pdf: ParsedPDFDocument) -> List[RequirementRule]:
        """
        Extract rules using Structured LLM output when available,
        with high-precision deterministic pattern fallback.
        """
        # If the document is not an authentic tender, return empty rules
        if not parsed_pdf.is_tender:
            logger.warning(
                "Rule extraction skipped: Document is not a valid tender/RFP (%s)",
                parsed_pdf.detection_reason,
            )
            return []

        openai_key, openai_model = get_openai_credentials()

        # Attempt structured LLM extraction if OpenAI API key is configured
        if openai_key and openai_key.startswith("sk-"):
            try:
                llm_rules = self._extract_rules_via_llm(parsed_pdf, openai_key, openai_model)
                if llm_rules:
                    logger.info("Successfully extracted %d rules via OpenAI LLM", len(llm_rules))
                    return llm_rules
            except Exception as exc:
                logger.warning("LLM rule extraction failed (%s). Falling back to deterministic engine.", exc)

        # Deterministic extraction
        rules = self._extract_rules_deterministic(parsed_pdf)
        logger.info("Extracted %d rules via deterministic pattern engine", len(rules))
        return rules

    def _extract_rules_via_llm(
        self, parsed_pdf: ParsedPDFDocument, openai_key: str, openai_model: str
    ) -> List[RequirementRule]:
        """Call OpenAI API using structured JSON output format."""
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)

        tables_context = "\n\n".join(
            f"--- Table on Page {t.page_number} ---\n{t.markdown}"
            for t in parsed_pdf.tables[:5]
        )
        context = f"=== TENDER DOCUMENT TEXT (Sample) ===\n{parsed_pdf.full_text[:14000]}\n\n=== EXTRACTED TABLES ===\n{tables_context}"

        system_prompt = (
            "You are an expert AI Procurement Compliance Architect for Indian Public Procurement (GeM / CPCL).\n"
            "Analyze the tender document text and tables, and extract ONLY legitimate eligibility rules explicitly specified.\n"
            "If the document is NOT a tender or RFP document, output {\"is_tender\": false, \"rules\": []}.\n"
            "If it IS a tender, extract all explicit eligibility criteria:\n"
            "1. Financial turnover: metric='annual_turnover_cr', unit='INR_CR', operator='>=', threshold (in Crores)\n"
            "2. Make in India (MII) local content: metric='mii_local_content_percentage', unit='%', operator='>=', threshold (number)\n"
            "3. Statutory registrations if mentioned:\n"
            "   - GST: metric='gst_registration_active', threshold=true, operator='=='\n"
            "   - PAN: metric='pan_card_valid', threshold=true, operator='=='\n"
            "   - Udyam / MSME: metric='udyam_registration_active', threshold=true, operator='=='\n"
            "4. EMD or past experience if required in the text.\n\n"
            "Output valid JSON matching this schema:\n"
            "{\n"
            "  \"is_tender\": true,\n"
            "  \"rules\": [\n"
            "    {\n"
            "      \"clause_id\": \"Clause 3.1\",\n"
            "      \"metric\": \"annual_turnover_cr\",\n"
            "      \"operator\": \">=\",\n"
            "      \"threshold\": 10.0,\n"
            "      \"unit\": \"INR_CR\",\n"
            "      \"severity\": \"CRITICAL\",\n"
            "      \"clause_text\": \"Exact sentence quoted from RFP\",\n"
            "      \"evidence_type\": \"CA_CERTIFICATE\",\n"
            "      \"verification_source\": \"GSTN\"\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        response = client.chat.completions.create(
            model=openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": context},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )

        raw_content = response.choices[0].message.content or "{}"
        parsed = json.loads(raw_content)

        if not parsed.get("is_tender", True):
            return []

        raw_rules = parsed.get("rules", [])
        rules: List[RequirementRule] = []
        for r in raw_rules:
            try:
                r["tender_id"] = self.tender_id
                rule_obj = RequirementRule(**r)
                rules.append(rule_obj)
            except Exception as parse_err:
                logger.warning("Skipped invalid LLM rule item: %s (%s)", r, parse_err)

        return rules

    def _extract_rules_deterministic(self, parsed_pdf: ParsedPDFDocument) -> List[RequirementRule]:
        """
        High-precision deterministic rule extraction engine.
        Parses text and table cells for:
        1. Financial turnover thresholds (INR Cr)
        2. Make in India (MII) local content exact percentages
        3. Mandatory statutory registrations (GST, PAN, Udyam, EMD, Experience)
        """
        text = parsed_pdf.full_text
        rules: List[RequirementRule] = []

        # ── 1. Financial Turnover Threshold ───────────────────────────────────
        turnover_found = False
        turnover_val: Optional[float] = None
        turnover_clause_id = "Clause 3.1"
        turnover_snippet = ""

        turnover_patterns = [
            r"(?:average\s+annual|minimum\s+annual|annual)?\s*turnover\s*(?:of\s+)?(?:not\s+less\s+than|of\s+at\s+least|minimum)?[\s:]*(?:Rs\.?|INR|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(Crore|Cr|Lakh|L)?",
            r"turnover[\s\S]{1,60}?(?:Rs\.?|INR|₹)\s*([0-9]+(?:\.[0-9]+)?)\s*(Crore|Cr|Lakh|L)?",
            r"(?:INR|Rs\.?|₹)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:Crore|Cr)\s+(?:average\s+annual\s+turnover|turnover)",
            r"turnover\s+(?:threshold|requirement)[\s:]*(?:Rs\.?|INR|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(Crore|Cr|Lakh|L)?",
        ]

        for pat in turnover_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                val = float(m.group(1))
                unit_match = (m.group(2) or "").lower()
                if "lakh" in unit_match or unit_match == "l":
                    val = val / 100.0  # Convert Lakhs to Crores
                turnover_val = val
                turnover_found = True

                # Extract surrounding snippet
                start = max(0, m.start() - 60)
                end = min(len(text), m.end() + 100)
                turnover_snippet = text[start:end].replace("\n", " ").strip()

                # Detect clause identifier
                clause_match = re.search(r"(?:Clause|Section|Para)\s+([0-9]+(?:\.[0-9]+)?)", text[max(0, m.start() - 100):m.end()], re.IGNORECASE)
                if clause_match:
                    turnover_clause_id = f"Clause {clause_match.group(1)}"
                break

        # Check table structures for turnover if not found in text
        if not turnover_found:
            for table in parsed_pdf.tables:
                for row in table.rows:
                    row_str = " ".join(row).lower()
                    if "turnover" in row_str:
                        m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(?:cr|crore|lakh)", row_str)
                        if m:
                            val = float(m.group(1))
                            if "lakh" in row_str:
                                val = val / 100.0
                            turnover_val = val
                            turnover_found = True
                            turnover_snippet = f"Extracted from Table: {' | '.join(row)}"
                            break
                if turnover_found:
                    break

        if turnover_found and turnover_val is not None:
            rules.append(RequirementRule(
                tender_id=self.tender_id,
                clause_id=turnover_clause_id,
                metric="annual_turnover_cr",
                operator=">=",
                threshold=turnover_val,
                unit="INR_CR",
                severity="CRITICAL",
                clause_text=turnover_snippet or f"Minimum average annual turnover threshold of INR {turnover_val} Crore",
                evidence_type="CA_CERTIFICATE",
                verification_source="GSTN",
            ))

        # ── 2. Make in India (MII) Local Content Percentage ──────────────────
        mii_found = False
        mii_percentage: Optional[float] = None
        mii_clause_id = "Clause 3.4"
        mii_snippet = ""

        mii_patterns = [
            r"(?:Make\s+in\s+India|MII|local\s+content)[\s\S]{1,60}?(?:minimum|at\s+least)?[\s:]*([0-9]+(?:\.[0-9]+)?)\s*%",
            r"Class-?I\s+local\s+supplier[\s\S]{1,50}?([0-9]+(?:\.[0-9]+)?)\s*%",
            r"minimum\s+([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:local\s+content|MII)",
            r"local\s+content\s+requirement[\s\S]{1,40}?([0-9]+(?:\.[0-9]+)?)\s*%",
        ]

        for pat in mii_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                mii_percentage = float(m.group(1))
                mii_found = True
                start = max(0, m.start() - 50)
                end = min(len(text), m.end() + 80)
                mii_snippet = text[start:end].replace("\n", " ").strip()

                clause_match = re.search(r"(?:Clause|Section|Para)\s+([0-9]+(?:\.[0-9]+)?)", text[max(0, m.start() - 80):m.end()], re.IGNORECASE)
                if clause_match:
                    mii_clause_id = f"Clause {clause_match.group(1)}"
                break

        if mii_found and mii_percentage is not None:
            rules.append(RequirementRule(
                tender_id=self.tender_id,
                clause_id=mii_clause_id,
                metric="mii_local_content_percentage",
                operator=">=",
                threshold=mii_percentage,
                unit="%",
                severity="HIGH",
                clause_text=mii_snippet or f"Local supplier requirement with minimum {mii_percentage}% local content",
                evidence_type="MII_DECLARATION",
                verification_source="DPIIT",
            ))

        # ── 3. Mandatory Statutory Registrations (When Mentioned) ──────────────
        lower_text = text.lower()

        # (a) GST Registration Status
        if "gst" in lower_text or "goods and services tax" in lower_text or "gstin" in lower_text:
            gst_snippet = "Active Goods and Services Tax (GST) registration required."
            m_gst = re.search(r"(?:gst\s+registration|gstin|goods\s+and\s+services\s+tax)[\s\S]{1,120}?(?:active|certificate|form\s+reg-06)", text, re.IGNORECASE)
            if m_gst:
                gst_snippet = m_gst.group(0).replace("\n", " ").strip()
            rules.append(RequirementRule(
                tender_id=self.tender_id,
                clause_id="Clause 3.2",
                metric="gst_registration_active",
                operator="==",
                threshold=True,
                unit="BOOLEAN",
                severity="CRITICAL",
                clause_text=gst_snippet,
                evidence_type="GST_CERTIFICATE",
                verification_source="GSTN",
            ))

        # (b) PAN Validity
        if "pan" in lower_text or "permanent account number" in lower_text:
            pan_snippet = "Valid Permanent Account Number (PAN) required."
            m_pan = re.search(r"(?:permanent\s+account\s+number|\bpan\b)[\s\S]{1,100}?(?:valid|income\s+tax|department)", text, re.IGNORECASE)
            if m_pan:
                pan_snippet = m_pan.group(0).replace("\n", " ").strip()
            rules.append(RequirementRule(
                tender_id=self.tender_id,
                clause_id="Clause 3.5",
                metric="pan_card_valid",
                operator="==",
                threshold=True,
                unit="BOOLEAN",
                severity="CRITICAL",
                clause_text=pan_snippet,
                evidence_type="PAN_CARD",
                verification_source="INCOME_TAX_PAN",
            ))

        # (c) MSME / Udyam Registration
        if "udyam" in lower_text or "msme" in lower_text or "micro, small" in lower_text:
            udyam_snippet = "Valid Udyam Registration Certificate for MSME bidders."
            m_udyam = re.search(r"(?:udyam|msme)[\s\S]{1,120}?(?:registration|active|urn)", text, re.IGNORECASE)
            if m_udyam:
                udyam_snippet = m_udyam.group(0).replace("\n", " ").strip()
            rules.append(RequirementRule(
                tender_id=self.tender_id,
                clause_id="Clause 3.3",
                metric="udyam_registration_active",
                operator="==",
                threshold=True,
                unit="BOOLEAN",
                severity="MEDIUM",
                clause_text=udyam_snippet,
                evidence_type="UDYAM_CERTIFICATE",
                verification_source="UDYAM",
            ))

        # (d) Earnest Money Deposit (EMD) (If present)
        m_emd = re.search(r"(?:earnest\s+money\s+deposit|emd)[\s\S]{1,50}?(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]+)?)\s*(Crore|Cr|Lakh|L)?", text, re.IGNORECASE)
        if m_emd:
            rules.append(RequirementRule(
                tender_id=self.tender_id,
                clause_id="Clause EMD",
                metric="emd_submitted",
                operator="==",
                threshold=True,
                unit="BOOLEAN",
                severity="HIGH",
                clause_text=f"Mandatory submission of Earnest Money Deposit ({m_emd.group(0).replace(chr(10), ' ').strip()})",
                evidence_type="EMD_RECEIPT",
                verification_source="BANK_GATEWAY",
            ))

        return rules


class TenderCompiler:
    """
    Main Orchestrator for Tender Ingestion & Compilation:
    1. Ingests PDF bytes or path
    2. Runs PyMuPDF parser with table capture & domain verification
    3. Executes structured rule extraction engine (LLM with deterministic fallback)
    4. Produces validated Tender metadata and RequirementRule models
    """

    @classmethod
    def compile_pdf(
        cls,
        pdf_input: Union[str, Path, bytes],
        tender_id: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], List[RequirementRule], Dict[str, Any]]:
        """
        Parse tender PDF and extract compliance rules.

        Returns:
            (tender_metadata, extracted_rules, extraction_diagnostics)
        """
        parsed_pdf = TenderPDFParser.parse_pdf(pdf_input)
        engine = RuleExtractionEngine(tender_id=tender_id)
        rules = engine.extract_rules(parsed_pdf)

        diagnostics = {
            "total_pages": parsed_pdf.total_pages,
            "tables_extracted": len(parsed_pdf.tables),
            "total_chars": len(parsed_pdf.full_text),
            "is_tender": parsed_pdf.is_tender,
            "detection_reason": parsed_pdf.detection_reason,
            "detected_indicators": parsed_pdf.detected_indicators,
            "rules_count": len(rules),
            "table_summaries": [
                {"page": t.page_number, "headers": t.headers, "rows_count": len(t.rows)}
                for t in parsed_pdf.tables
            ],
        }

        return parsed_pdf.metadata, rules, diagnostics
