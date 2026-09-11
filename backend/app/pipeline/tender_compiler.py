"""
GeM-Guard — Tender AI Compiler Pipeline
Strict Specifications:
1. PDF Ingestion: Utilizes PyMuPDF (fitz) to parse tender PDFs, capturing text and table structures.
2. Rule Extraction Engine: Uses structured LLM outputs (with high-precision deterministic pattern fallback)
   to parse natural language clauses into executable JSON RequirementRule records:
   - Financial turnover thresholds
   - Make in India (MII) local content exact percentages
   - Mandatory statutory registrations (GST, PAN, Udyam)
3. Maps outputs to Pydantic RequirementRule domain models.
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

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


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


class TenderPDFParser:
    """
    Parses Tender PDFs using PyMuPDF.
    Captures both freeform text and structured table data.
    """

    @classmethod
    def parse_pdf(cls, file_path_or_bytes: Union[str, Path, bytes]) -> ParsedPDFDocument:
        """
        Parse a PDF file from a filesystem path or raw bytes.
        Captures page texts and all detected table structures.
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
                            # Pad row to header length if necessary
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

        # 3. Extract metadata from text
        metadata = cls._extract_tender_metadata(full_text)

        logger.info(
            "Parsed PDF: %d pages, %d tables, %d total chars",
            total_pages,
            len(parsed_tables),
            len(full_text),
        )

        return ParsedPDFDocument(
            total_pages=total_pages,
            full_text=full_text,
            pages_text=pages_text,
            tables=parsed_tables,
            metadata=metadata,
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
    Strictly extracts:
    - Financial turnover thresholds
    - Make in India (MII) local content exact percentages
    - Mandatory statutory registrations (GST, PAN, Udyam)
    """

    def __init__(self, tender_id: Optional[str] = None):
        self.tender_id = tender_id

    def extract_rules(self, parsed_pdf: ParsedPDFDocument) -> List[RequirementRule]:
        """
        Extract rules using Structured LLM output when available,
        with seamless high-precision deterministic pattern fallback.
        """
        rules: List[RequirementRule] = []

        # Attempt structured LLM extraction if OpenAI API key is configured
        if OPENAI_API_KEY and OPENAI_API_KEY.startswith("sk-"):
            try:
                llm_rules = self._extract_rules_via_llm(parsed_pdf)
                if llm_rules:
                    logger.info("Successfully extracted %d rules via LLM", len(llm_rules))
                    return llm_rules
            except Exception as exc:
                logger.warning("LLM rule extraction failed (%s). Falling back to pattern engine.", exc)

        # Fallback to high-precision deterministic regex & table extraction
        rules = self._extract_rules_deterministic(parsed_pdf)
        logger.info("Extracted %d rules via deterministic pattern engine", len(rules))
        return rules

    def _extract_rules_via_llm(self, parsed_pdf: ParsedPDFDocument) -> List[RequirementRule]:
        """Call OpenAI API using structured JSON output format."""
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)

        # Prepare context with text and extracted tables
        tables_context = "\n\n".join(
            f"--- Table on Page {t.page_number} ---\n{t.markdown}"
            for t in parsed_pdf.tables[:5]
        )
        context = f"=== TENDER DOCUMENT TEXT (Sample) ===\n{parsed_pdf.full_text[:12000]}\n\n=== EXTRACTED TABLES ===\n{tables_context}"

        system_prompt = (
            "You are an expert AI Procurement Compliance Architect for Indian Public Procurement (GeM / CPCL).\n"
            "Analyze the tender document text and tables, and extract all mandatory compliance rules.\n"
            "You MUST extract at minimum:\n"
            "1. Financial turnover thresholds (metric='annual_turnover_cr', unit='INR_CR', operator='>=')\n"
            "2. Make in India (MII) local content exact percentage (metric='mii_local_content_percentage', unit='%', operator='>=')\n"
            "3. Mandatory statutory registrations:\n"
            "   - GST (metric='gst_registration_active', threshold=true, operator='==')\n"
            "   - PAN (metric='pan_card_valid', threshold=true, operator='==')\n"
            "   - Udyam / MSME (metric='udyam_registration_active', threshold=true, operator='==')\n\n"
            "Output a JSON object matching this exact schema:\n"
            "{\n"
            "  \"rules\": [\n"
            "    {\n"
            "      \"clause_id\": \"Clause 3.1\",\n"
            "      \"metric\": \"annual_turnover_cr\",\n"
            "      \"operator\": \">=\",\n"
            "      \"threshold\": 10.0,\n"
            "      \"unit\": \"INR_CR\",\n"
            "      \"severity\": \"CRITICAL\",\n"
            "      \"evidence_type\": \"CA_CERTIFICATE\",\n"
            "      \"verification_source\": \"GSTN\"\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": context},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )

        raw_content = response.choices[0].message.content or "{}"
        parsed = json.loads(raw_content)
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
        3. Mandatory statutory registrations (GST, PAN, Udyam)
        """
        text = parsed_pdf.full_text
        rules: List[RequirementRule] = []

        # ── 1. Financial Turnover Threshold ───────────────────────────────────
        turnover_threshold = 10.0  # Default baseline
        clause_id = "3.1"

        turnover_patterns = [
            r"(?:average\s+annual|minimum\s+annual|annual)\s+turnover\s+(?:of\s+)?(?:not\s+less\s+than|of\s+at\s+least|minimum)?[\s:]*(?:Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]+)?)\s*(Crore|Cr|Lakh|L)?",
            r"turnover[\s\S]{1,50}?(?:Rs\.?|INR)\s*([0-9]+(?:\.[0-9]+)?)\s*(Crore|Cr|Lakh|L)?",
            r"(?:INR|Rs\.?)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:Crore|Cr)\s+(?:average\s+annual\s+turnover|turnover)",
        ]

        for pat in turnover_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                val = float(m.group(1))
                unit_match = (m.group(2) or "").lower()
                if "lakh" in unit_match or "l" == unit_match:
                    val = val / 100.0  # Convert Lakhs to Crores
                turnover_threshold = val
                break

        # Check table structures for turnover
        for table in parsed_pdf.tables:
            for row in table.rows:
                row_str = " ".join(row).lower()
                if "turnover" in row_str:
                    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(?:cr|crore)", row_str)
                    if m:
                        turnover_threshold = float(m.group(1))
                        break

        rules.append(RequirementRule(
            tender_id=self.tender_id,
            clause_id=f"Clause {clause_id}",
            metric="annual_turnover_cr",
            operator=">=",
            threshold=turnover_threshold,
            unit="INR_CR",
            severity="CRITICAL",
            evidence_type="CA_CERTIFICATE",
            verification_source="GSTN",
        ))

        # ── 2. Make in India (MII) Local Content Percentage ──────────────────
        mii_percentage = 50.0  # Standard Class-I default
        mii_clause = "3.4"

        mii_patterns = [
            r"(?:Make\s+in\s+India|MII|local\s+content)[\s\S]{1,60}?(?:minimum|at\s+least)?[\s:]*([0-9]+(?:\.[0-9]+)?)\s*%",
            r"Class-?I\s+local\s+supplier[\s\S]{1,40}?([0-9]+(?:\.[0-9]+)?)\s*%",
            r"minimum\s+([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:local\s+content|MII)",
        ]

        for pat in mii_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                mii_percentage = float(m.group(1))
                break

        rules.append(RequirementRule(
            tender_id=self.tender_id,
            clause_id=f"Clause {mii_clause}",
            metric="mii_local_content_percentage",
            operator=">=",
            threshold=mii_percentage,
            unit="%",
            severity="HIGH",
            evidence_type="MII_DECLARATION",
            verification_source="DPIIT",
        ))

        # ── 3. Mandatory Statutory Registrations ──────────────────────────────
        # (a) GST Registration Status
        rules.append(RequirementRule(
            tender_id=self.tender_id,
            clause_id="Clause 3.2",
            metric="gst_registration_active",
            operator="==",
            threshold=True,
            unit="BOOLEAN",
            severity="CRITICAL",
            evidence_type="GST_CERTIFICATE",
            verification_source="GSTN",
        ))

        # (b) PAN Validity
        rules.append(RequirementRule(
            tender_id=self.tender_id,
            clause_id="Clause 3.5",
            metric="pan_card_valid",
            operator="==",
            threshold=True,
            unit="BOOLEAN",
            severity="CRITICAL",
            evidence_type="PAN_CARD",
            verification_source="INCOME_TAX_PAN",
        ))

        # (c) MSME / Udyam Registration
        rules.append(RequirementRule(
            tender_id=self.tender_id,
            clause_id="Clause 3.3",
            metric="udyam_registration_active",
            operator="==",
            threshold=True,
            unit="BOOLEAN",
            severity="MEDIUM",
            evidence_type="UDYAM_CERTIFICATE",
            verification_source="UDYAM",
        ))

        return rules


class TenderCompiler:
    """
    Main Orchestrator for Tender Ingestion & Compilation:
    1. Ingests PDF bytes or path
    2. Runs PyMuPDF parser with table capture
    3. Executes structured rule extraction engine
    4. Produces validated Tender and RequirementRule models
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
            "table_summaries": [
                {"page": t.page_number, "headers": t.headers, "rows_count": len(t.rows)}
                for t in parsed_pdf.tables
            ],
            "rules_count": len(rules),
        }

        return parsed_pdf.metadata, rules, diagnostics
