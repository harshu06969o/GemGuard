"""
GeM-Guard — Offline Benchmark Demo Seeder
Generates 4 benchmark bidders and CPCL tender offline:
1. Bidder A (Bharat Engineering Ltd): 100% compliant -> PASS (Low Risk, Readiness 96%)
2. Bidder B (Falcon Heavy Works Pvt Ltd): Turnover below threshold -> FAIL (High Risk, Readiness 36%)
3. Bidder C (Apex Buildtech Enterprises): PAN vs Udyam legal name mismatch -> REVIEW (High Risk, Readiness 55%)
4. Bidder D (Synergy Dynamics Ltd): GST API simulates timeout -> PENDING (Medium Risk, Readiness 72%)

Also creates:
- Benchmark Tender: GEM/2026/B/4521001 (CPCL Industrial Valves, turnover 14.2 Cr, MII 50%)
- RequirementRules in `rules` collection
- Bid Documents in `bid_documents`
- Precise Evidence with bounding boxes [x1, y1, x2, y2]
- Cryptographic chained SHA-256 audit events
"""

import asyncio
import hashlib
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bson import ObjectId

# Ensure backend root is on sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.dirname(SCRIPT_DIR)
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.core.database import connect_to_mongo, db_manager, doc_to_dict, to_oid, utcnow_str
from app.schemas.domain import AuditEvent, Evidence, RequirementRule, RuleResult, RuleSeverity, RuleStatus
from app.engine.compliance import ComplianceEngine, RiskBand
from app.engine.audit import AuditEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
logger = logging.getLogger("gemguard.seeder")


def sha256_hash(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


async def seed_demo_data(db) -> Dict[str, Any]:
    """
    Populate database with benchmark CPCL tender, compiled rules, and 4 benchmark bidders.
    Can be executed against live MongoDB or in-memory mongomock_motor.
    """
    logger.info("====================================================")
    logger.info("🌱 Seeding GeM-Guard Benchmark Demo Data...")
    logger.info("====================================================")

    # Clean existing demo records
    await db["tenders"].delete_many({"reference_number": "GEM/2026/B/4521001"})
    await db["tenders"].delete_many({"tender_no": "GEM/2026/B/4521001"})
    await db["rules"].delete_many({"tender_no": "GEM/2026/B/4521001"})
    await db["bids"].delete_many({"tender_reference": "GEM/2026/B/4521001"})
    await db["bid_documents"].delete_many({"tender_reference": "GEM/2026/B/4521001"})
    await db["evidence"].delete_many({"tender_reference": "GEM/2026/B/4521001"})

    now_iso = utcnow_str()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Benchmark Tender: CPCL Chennai Refinery Valves
    # ─────────────────────────────────────────────────────────────────────────
    tender_oid = ObjectId()
    tender_id_str = str(tender_oid)
    tender_no = "GEM/2026/B/4521001"

    tender_record = {
        "_id": tender_oid,
        "id": tender_id_str,
        "tender_no": tender_no,
        "reference_number": tender_no,
        "title": "Procurement of High-Pressure Industrial Gate Valves & Actuators",
        "organization": "CPCL",
        "buyer": "CPCL",
        "status": "ACTIVE",
        "version": 1,
        "turnover_threshold_cr": 14.2,
        "local_content_threshold_pct": 50.0,
        "closing_date": "2026-10-31T18:00:00Z",
        "file_hash": sha256_hash("CPCL_VALVES_SPEC_2026_V1"),
        "description": (
            "Procurement of API 600 bolted bonnet steel gate valves and electric actuators "
            "for CPCL Manali Refinery Crude Distillation Unit (CDU-II). Strict compliance with "
            "PPP-MII local content >=50%, audited turnover >=14.2 Cr, and statutory GSTN/PAN/Udyam active status."
        ),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db["tenders"].insert_one(tender_record)
    logger.info(f"✓ Created Benchmark Tender: {tender_no} (ID: {tender_id_str})")

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Benchmark Requirement Rules
    # ─────────────────────────────────────────────────────────────────────────
    rules_defs = [
        {
            "clause_id": "CLAUSE-3.1",
            "metric": "annual_turnover_cr",
            "operator": ">=",
            "threshold": 14.2,
            "unit": "INR_CR",
            "severity": "CRITICAL",
            "evidence_type": "CA_CERTIFICATE",
            "description": "Audited average annual turnover must be >= INR 14.20 Crore over the last 3 financial years.",
        },
        {
            "clause_id": "CLAUSE-3.2",
            "metric": "local_content_percentage",
            "operator": ">=",
            "threshold": 50.0,
            "unit": "%",
            "severity": "HIGH",
            "evidence_type": "MII_DECLARATION",
            "description": "Minimum 50% domestic local content in accordance with Public Procurement (Preference to Make in India) Order 2017.",
        },
        {
            "clause_id": "CLAUSE-3.3",
            "metric": "gst_registration_active",
            "operator": "==",
            "threshold": True,
            "unit": "BOOLEAN",
            "severity": "CRITICAL",
            "evidence_type": "GST_CERTIFICATE",
            "verification_source": "GSTN",
            "description": "Bidder must maintain an ACTIVE GST registration on the date of bid opening.",
        },
        {
            "clause_id": "CLAUSE-3.4",
            "metric": "pan_card_valid",
            "operator": "==",
            "threshold": True,
            "unit": "BOOLEAN",
            "severity": "CRITICAL",
            "evidence_type": "PAN_CARD",
            "verification_source": "PAN",
            "description": "Valid statutory Permanent Account Number (PAN) issued by Income Tax Department.",
        },
        {
            "clause_id": "CLAUSE-3.5",
            "metric": "udyam_registration_active",
            "operator": "==",
            "threshold": True,
            "unit": "BOOLEAN",
            "severity": "HIGH",
            "evidence_type": "UDYAM_CERTIFICATE",
            "verification_source": "UDYAM",
            "description": "Valid Udyam MSME registration certificate for priority sector MSE benefits.",
        },
    ]

    seeded_rules = []
    for r in rules_defs:
        rule_oid = ObjectId()
        r_doc = {
            "_id": rule_oid,
            "id": str(rule_oid),
            "tender_id": tender_id_str,
            "tender_no": tender_no,
            "created_at": now_iso,
            **r,
        }
        await db["rules"].insert_one(r_doc)
        seeded_rules.append(r_doc)
    logger.info(f"✓ Seeded {len(seeded_rules)} compiled Requirement Rules.")

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Benchmark Bidders Specification:
    # Bidder A: 100% compliant -> PASS (Low Risk)
    # Bidder B: Turnover below threshold -> FAIL (High Risk)
    # Bidder C: PAN vs Udyam name mismatch -> REVIEW (High Risk)
    # Bidder D: GST API simulates timeout -> PENDING (Medium Risk)
    # ─────────────────────────────────────────────────────────────────────────

    bidders_spec = [
        # --- BIDDER A: 100% COMPLIANT ---
        {
            "code": "A",
            "organization_name": "Bharat Engineering & Industrial Ltd",
            "legal_name_pan": "Bharat Engineering & Industrial Ltd",
            "legal_name_udyam": "Bharat Engineering & Industrial Ltd",
            "gstin": "33AABCB1234F1Z5",
            "pan": "AABCB1234F",
            "udyam_number": "UDYAM-TN-02-0012345",
            "turnover_cr": 18.5,
            "local_content_pct": 65.0,
            "category": "MEDIUM",
            "bid_amount": 14200000.0,
            "expected_overall": "PASS",
            "expected_compliance": "COMPLIANT",
            "expected_risk_band": "LOW",
            "expected_readiness": 96.0,
            "verifications": [
                {"source": "GSTN", "status": "VERIFIED", "message": "GSTIN 33AABCB1234F1Z5 is ACTIVE."},
                {"source": "PAN", "status": "VERIFIED", "message": "PAN AABCB1234F verified with NSDL."},
                {"source": "UDYAM", "status": "VERIFIED", "message": "UDYAM-TN-02-0012345 is ACTIVE (Medium Enterprise)."},
                {"source": "EPFO", "status": "VERIFIED", "message": "Establishment TN/MAS/0045210 compliant."},
                {"source": "STARTUP_INDIA", "status": "NOT_APPLICABLE", "message": "Enterprise not registered as DPIIT startup."},
                {"source": "DEBARMENT", "status": "VERIFIED", "message": "No active sanctions or debarment records found."},
            ],
            "rule_explanations": {
                "annual_turnover_cr": "Value 18.50 >= required 14.20 Cr threshold.",
                "local_content_percentage": "Value 65.0% >= required 50.0% threshold (Class-I Local Supplier).",
                "gst_registration_active": "Statutory requirement verified and confirmed ACTIVE via GSTN registry.",
                "pan_card_valid": "Statutory requirement verified and confirmed ACTIVE via PAN registry.",
                "udyam_registration_active": "Statutory requirement verified and confirmed ACTIVE via UDYAM registry.",
            },
            "rule_statuses": {
                "annual_turnover_cr": "PASS",
                "local_content_percentage": "PASS",
                "gst_registration_active": "PASS",
                "pan_card_valid": "PASS",
                "udyam_registration_active": "PASS",
            },
            "integrity_findings": [],
        },

        # --- BIDDER B: TURNOVER BELOW THRESHOLD ---
        {
            "code": "B",
            "organization_name": "Falcon Heavy Works Pvt Ltd",
            "legal_name_pan": "Falcon Heavy Works Private Limited",
            "legal_name_udyam": "Falcon Heavy Works Private Limited",
            "gstin": "27AAACF5678M1ZK",
            "pan": "AAACF5678M",
            "udyam_number": "UDYAM-MH-01-0098765",
            "turnover_cr": 8.5,  # Threshold is 14.2 Cr!
            "local_content_pct": 55.0,
            "category": "SMALL",
            "bid_amount": 13900000.0,
            "expected_overall": "FAIL",
            "expected_compliance": "NON_COMPLIANT",
            "expected_risk_band": "HIGH",
            "expected_readiness": 36.0,
            "verifications": [
                {"source": "GSTN", "status": "VERIFIED", "message": "GSTIN 27AAACF5678M1ZK is ACTIVE."},
                {"source": "PAN", "status": "VERIFIED", "message": "PAN AAACF5678M verified with NSDL."},
                {"source": "UDYAM", "status": "VERIFIED", "message": "UDYAM-MH-01-0098765 is ACTIVE."},
                {"source": "EPFO", "status": "VERIFIED", "message": "EPFO establishment registered."},
                {"source": "STARTUP_INDIA", "status": "NOT_APPLICABLE", "message": "Regular MSME entity."},
                {"source": "DEBARMENT", "status": "VERIFIED", "message": "Clean record."},
            ],
            "rule_explanations": {
                "annual_turnover_cr": "Turnover INR 8.50 Cr < required INR 14.20 Cr. Mandatory Rule 3.1 FAIL.",
                "local_content_percentage": "Value 55.0% >= required 50.0% threshold.",
                "gst_registration_active": "Statutory requirement verified and confirmed ACTIVE via GSTN registry.",
                "pan_card_valid": "Statutory requirement verified and confirmed ACTIVE via PAN registry.",
                "udyam_registration_active": "Statutory requirement verified and confirmed ACTIVE via UDYAM registry.",
            },
            "rule_statuses": {
                "annual_turnover_cr": "FAIL",
                "local_content_percentage": "PASS",
                "gst_registration_active": "PASS",
                "pan_card_valid": "PASS",
                "udyam_registration_active": "PASS",
            },
            "integrity_findings": [],
        },

        # --- BIDDER C: PAN VS UDYAM NAME MISMATCH ---
        {
            "code": "C",
            "organization_name": "Apex Buildtech Enterprises",
            "legal_name_pan": "Apex Buildtech Private Limited",
            "legal_name_udyam": "Apex Power Systems LLP",  # Contradiction!
            "gstin": "07AAACA1234N1Z9",
            "pan": "AAACA1234N",
            "udyam_number": "UDYAM-DL-03-0054321",
            "turnover_cr": 16.0,
            "local_content_pct": 58.0,
            "category": "SMALL",
            "bid_amount": 14100000.0,
            "expected_overall": "REVIEW",
            "expected_compliance": "UNDER_REVIEW",
            "expected_risk_band": "HIGH",
            "expected_readiness": 55.0,
            "verifications": [
                {"source": "GSTN", "status": "VERIFIED", "message": "GSTIN 07AAACA1234N1Z9 is ACTIVE."},
                {"source": "PAN", "status": "VERIFIED", "message": "PAN AAACA1234N name: 'Apex Buildtech Private Limited'."},
                {"source": "UDYAM", "status": "MISMATCH", "message": "Udyam registered to 'Apex Power Systems LLP'."},
                {"source": "EPFO", "status": "VERIFIED", "message": "EPFO code active."},
                {"source": "STARTUP_INDIA", "status": "NOT_APPLICABLE", "message": "Not startup."},
                {"source": "DEBARMENT", "status": "VERIFIED", "message": "No sanctions."},
            ],
            "rule_explanations": {
                "annual_turnover_cr": "Value 16.00 >= required 14.20 Cr threshold.",
                "local_content_percentage": "Value 58.0% >= required 50.0% threshold.",
                "gst_registration_active": "Statutory requirement verified and confirmed ACTIVE via GSTN registry.",
                "pan_card_valid": "Contradiction flagged by Cross-Document Integrity Engine: Entity name mismatch between PAN ('Apex Buildtech Private Limited') and Udyam ('Apex Power Systems LLP').",
                "udyam_registration_active": "Contradiction flagged by Cross-Document Integrity Engine: Legal name inconsistency across statutory certificates.",
            },
            "rule_statuses": {
                "annual_turnover_cr": "PASS",
                "local_content_percentage": "PASS",
                "gst_registration_active": "PASS",
                "pan_card_valid": "REVIEW",
                "udyam_registration_active": "REVIEW",
            },
            "integrity_findings": [
                {
                    "check_type": "NAME_MISMATCH",
                    "severity": "HIGH",
                    "field": "legal_entity_name",
                    "documents_involved": ["PAN_CARD", "UDYAM_CERTIFICATE"],
                    "discrepancy_details": "Entity name mismatch between PAN_CARD ('Apex Buildtech Private Limited') and UDYAM_CERTIFICATE ('Apex Power Systems LLP'). Similarity: 41%. Possible surrogate bidding or disparate entity credentials.",
                    "values_found": {
                        "PAN_CARD": "Apex Buildtech Private Limited",
                        "UDYAM_CERTIFICATE": "Apex Power Systems LLP",
                        "similarity_ratio": 0.41,
                    },
                }
            ],
        },

        # --- BIDDER D: GST API SIMULATES TIMEOUT ---
        {
            "code": "D",
            "organization_name": "Synergy Dynamics Ltd",
            "legal_name_pan": "Synergy Dynamics Limited",
            "legal_name_udyam": "Synergy Dynamics Limited",
            "gstin": "06AAACS9012P1ZL",
            "pan": "AAACS9012P",
            "udyam_number": "UDYAM-HR-04-0078901",
            "turnover_cr": 15.2,
            "local_content_pct": 60.0,
            "category": "MEDIUM",
            "bid_amount": 14050000.0,
            "expected_overall": "PENDING",
            "expected_compliance": "PENDING_VERIFICATION",
            "expected_risk_band": "MEDIUM",
            "expected_readiness": 72.0,
            "verifications": [
                {"source": "GSTN", "status": "PENDING", "message": "GSTN portal timed out after 3000ms. Graceful degradation active: bidder NOT disqualified."},
                {"source": "PAN", "status": "VERIFIED", "message": "PAN AAACS9012P verified."},
                {"source": "UDYAM", "status": "VERIFIED", "message": "UDYAM-HR-04-0078901 active."},
                {"source": "EPFO", "status": "VERIFIED", "message": "EPFO establishment verified."},
                {"source": "STARTUP_INDIA", "status": "NOT_APPLICABLE", "message": "Non-startup."},
                {"source": "DEBARMENT", "status": "VERIFIED", "message": "Clear."},
            ],
            "rule_explanations": {
                "annual_turnover_cr": "Value 15.20 >= required 14.20 Cr threshold.",
                "local_content_percentage": "Value 60.0% >= required 50.0% threshold.",
                "gst_registration_active": "External verification via GSTN is PENDING (service timeout/unreachable). Per SIH Graceful Degradation guarantee, bidder is NOT disqualified.",
                "pan_card_valid": "Statutory requirement verified and confirmed ACTIVE via PAN registry.",
                "udyam_registration_active": "Statutory requirement verified and confirmed ACTIVE via UDYAM registry.",
            },
            "rule_statuses": {
                "annual_turnover_cr": "PASS",
                "local_content_percentage": "PASS",
                "gst_registration_active": "PENDING",
                "pan_card_valid": "PASS",
                "udyam_registration_active": "PASS",
            },
            "integrity_findings": [],
        },
    ]

    seeded_bids = []

    # Chained SHA-256 Audit Genesis
    prev_audit_hash = "GENESIS_BLOCK_GEMGUARD_2026"

    for spec in bidders_spec:
        bid_oid = ObjectId()
        bid_id_str = str(bid_oid)
        bidder_id = f"benchmark_bidder_{spec['code'].lower()}"

        # 1. Create Bid Documents
        doc_types = [
            ("CA_CERTIFICATE", f"ca_turnover_cert_{spec['code'].lower()}.pdf", "Turnover & Financial Statement"),
            ("MII_DECLARATION", f"mii_declaration_{spec['code'].lower()}.pdf", "Make in India Declaration"),
            ("GST_CERTIFICATE", f"gst_registration_{spec['code'].lower()}.pdf", "GSTIN Registration Form GST REG-06"),
            ("PAN_CARD", f"pan_card_{spec['code'].lower()}.pdf", "Income Tax PAN Card"),
            ("UDYAM_CERTIFICATE", f"udyam_cert_{spec['code'].lower()}.pdf", "MSME Udyam Registration"),
        ]

        doc_ids = {}
        for dtype, fname, dtitle in doc_types:
            doc_oid = ObjectId()
            doc_record = {
                "_id": doc_oid,
                "id": str(doc_oid),
                "bid_id": bid_id_str,
                "tender_id": tender_id_str,
                "tender_reference": tender_no,
                "document_type": dtype,
                "filename": fname,
                "title": dtitle,
                "file_hash": sha256_hash(f"{fname}_{spec['organization_name']}"),
                "uploaded_at": now_iso,
                "status": "PROCESSED",
            }
            await db["bid_documents"].insert_one(doc_record)
            doc_ids[dtype] = str(doc_oid)

        # 2. Seed Precise Evidence records with Bounding Boxes [x1, y1, x2, y2]
        evidence_records = [
            # Turnover evidence
            {
                "document_id": doc_ids["CA_CERTIFICATE"],
                "bid_id": bid_id_str,
                "tender_reference": tender_no,
                "package_id": bid_id_str,
                "bidder_id": bidder_id,
                "doc_type": "CA_CERTIFICATE",
                "page_number": 1,
                "bounding_box": [120.5, 340.2, 480.0, 395.8],
                "field_name": "annual_turnover_cr",
                "raw_value": f"INR {spec['turnover_cr']} Crores",
                "normalized_value": spec["turnover_cr"],
                "confidence": 0.96,
                "verification_status": "VERIFIED",
            },
            # Local Content evidence
            {
                "document_id": doc_ids["MII_DECLARATION"],
                "bid_id": bid_id_str,
                "tender_reference": tender_no,
                "package_id": bid_id_str,
                "bidder_id": bidder_id,
                "doc_type": "MII_DECLARATION",
                "page_number": 1,
                "bounding_box": [140.0, 510.0, 450.5, 545.0],
                "field_name": "local_content_percentage",
                "raw_value": f"{spec['local_content_pct']}%",
                "normalized_value": spec["local_content_pct"],
                "confidence": 0.94,
                "verification_status": "VERIFIED",
            },
            # GSTIN evidence
            {
                "document_id": doc_ids["GST_CERTIFICATE"],
                "bid_id": bid_id_str,
                "tender_reference": tender_no,
                "package_id": bid_id_str,
                "bidder_id": bidder_id,
                "doc_type": "GST_CERTIFICATE",
                "page_number": 1,
                "bounding_box": [110.0, 180.0, 390.0, 215.0],
                "field_name": "gstin",
                "raw_value": spec["gstin"],
                "normalized_value": spec["gstin"],
                "confidence": 0.99,
                "verification_status": "VERIFIED" if spec["expected_overall"] != "PENDING" else "PENDING",
            },
            # PAN evidence
            {
                "document_id": doc_ids["PAN_CARD"],
                "bid_id": bid_id_str,
                "tender_reference": tender_no,
                "package_id": bid_id_str,
                "bidder_id": bidder_id,
                "doc_type": "PAN_CARD",
                "page_number": 1,
                "bounding_box": [105.0, 195.0, 350.0, 230.0],
                "field_name": "pan",
                "raw_value": spec["pan"],
                "normalized_value": spec["pan"],
                "confidence": 0.98,
                "verification_status": "VERIFIED",
            },
            # Entity name on PAN
            {
                "document_id": doc_ids["PAN_CARD"],
                "bid_id": bid_id_str,
                "tender_reference": tender_no,
                "package_id": bid_id_str,
                "bidder_id": bidder_id,
                "doc_type": "PAN_CARD",
                "page_number": 1,
                "bounding_box": [105.0, 240.0, 480.0, 275.0],
                "field_name": "legal_entity_name",
                "raw_value": spec["legal_name_pan"],
                "normalized_value": spec["legal_name_pan"],
                "confidence": 0.97,
                "verification_status": "VERIFIED",
            },
            # Udyam evidence
            {
                "document_id": doc_ids["UDYAM_CERTIFICATE"],
                "bid_id": bid_id_str,
                "tender_reference": tender_no,
                "package_id": bid_id_str,
                "bidder_id": bidder_id,
                "doc_type": "UDYAM_CERTIFICATE",
                "page_number": 1,
                "bounding_box": [130.0, 210.0, 460.0, 248.0],
                "field_name": "udyam_number",
                "raw_value": spec["udyam_number"],
                "normalized_value": spec["udyam_number"],
                "confidence": 0.97,
                "verification_status": "VERIFIED",
            },
            # Entity name on Udyam (Mismatch for Bidder C!)
            {
                "document_id": doc_ids["UDYAM_CERTIFICATE"],
                "bid_id": bid_id_str,
                "tender_reference": tender_no,
                "package_id": bid_id_str,
                "bidder_id": bidder_id,
                "doc_type": "UDYAM_CERTIFICATE",
                "page_number": 1,
                "bounding_box": [130.0, 260.0, 490.0, 298.0],
                "field_name": "legal_entity_name",
                "raw_value": spec["legal_name_udyam"],
                "normalized_value": spec["legal_name_udyam"],
                "confidence": 0.95,
                "verification_status": "VERIFIED" if spec["code"] != "C" else "MISMATCH",
            },
        ]

        evidence_ids = []
        for ev in evidence_records:
            ev_oid = ObjectId()
            ev["_id"] = ev_oid
            ev["id"] = str(ev_oid)
            await db["evidence"].insert_one(ev)
            evidence_ids.append(str(ev_oid))

        # 3. Assemble Evaluated Rule Results
        rule_results_data = []
        for r_doc in seeded_rules:
            m = r_doc["metric"]
            st = spec["rule_statuses"].get(m, "PASS")
            exp = spec["rule_explanations"].get(m, "Requirement verified.")
            rule_results_data.append({
                "rule_id": r_doc["id"],
                "clause_id": r_doc.get("clause_id"),
                "metric": m,
                "status": st,
                "evidence_ids": evidence_ids[:2],
                "explanation": exp,
                "evaluated_at": now_iso,
            })

        # 4. Assemble Bid Document
        bid_record = {
            "_id": bid_oid,
            "id": bid_id_str,
            "tender_id": tender_id_str,
            "tender_reference": tender_no,
            "bidder_id": bidder_id,
            "bidder_code": spec["code"],
            "bidder_name": spec["organization_name"],
            "bid_amount": spec["bid_amount"],
            "status": "SUBMITTED",
            "overall_status": spec["expected_overall"],
            "compliance_status": spec["expected_compliance"],
            "risk_band": spec["expected_risk_band"],
            "readiness_score": spec["expected_readiness"],
            "risk_score": round(100.0 - spec["expected_readiness"], 1),
            "bidder": {
                "id": bidder_id,
                "name": spec["organization_name"],
                "legal_name": spec["legal_name_pan"],
                "gstin": spec["gstin"],
                "pan": spec["pan"],
                "udyam_number": spec["udyam_number"],
                "turnover_cr": spec["turnover_cr"],
                "local_content_pct": spec["local_content_pct"],
                "category": spec["category"],
            },
            "evaluation_results": rule_results_data,
            "verifications": spec["verifications"],
            "integrity_findings": spec["integrity_findings"],
            "evidence_completeness_ratio": 1.0 if spec["code"] != "C" else 0.85,
            "mandatory_pass_ratio": 1.0 if spec["code"] == "A" else (0.4 if spec["code"] == "B" else 0.7),
            "created_at": now_iso,
            "submitted_at": now_iso,
            "evaluated_at": now_iso,
        }
        await db["bids"].insert_one(bid_record)
        seeded_bids.append(bid_record)

        # 5. Append Chained SHA-256 Audit Events via AuditEngine
        audit_events = [
            ("BID_SUBMITTED", bidder_id, {"tender_id": tender_id_str, "bid_amount": spec["bid_amount"]}, "BID"),
            ("VISION_OCR_DOCUMENTS_PROCESSED", "system", {"documents_count": 5, "evidence_extracted": len(evidence_records)}, "AI_EXTRACTION"),
            ("GOV_CONNECTORS_VERIFIED", "system", {"verifications_count": len(spec["verifications"]), "status_summary": {v["source"]: v["status"] for v in spec["verifications"]}}, "VERIFICATION"),
            ("COMPLIANCE_EVALUATED", "system", {"overall_status": spec["expected_overall"], "compliance_status": spec["expected_compliance"], "risk_band": spec["expected_risk_band"], "readiness_score": spec["expected_readiness"]}, "COMPLIANCE"),
        ]

        for act, actor, details, etype in audit_events:
            await AuditEngine.append_event(
                db=db,
                action=act,
                actor=actor,
                entity_id=bid_id_str,
                details=details,
                event_type=etype,
            )

        logger.info(
            f"✓ Seeded Bidder {spec['code']}: {spec['organization_name']} "
            f"-> Status: {spec['expected_overall']} ({spec['expected_risk_band']} Risk, Readiness: {spec['expected_readiness']}%)"
        )

    logger.info("====================================================")
    logger.info(f"✨ Successfully seeded 1 Tender, {len(seeded_rules)} Rules, and 4 Benchmark Bidders!")
    logger.info("====================================================")

    return {
        "tender": doc_to_dict(tender_record),
        "rules_count": len(seeded_rules),
        "bids_count": len(seeded_bids),
        "bids": [doc_to_dict(b) for b in seeded_bids],
    }


async def main():
    """CLI execution entrypoint."""
    logger.info("Connecting to MongoDB for demo seeding...")
    db = await connect_to_mongo()
    res = await seed_demo_data(db)
    logger.info(f"Demo seeding finished: {res['bids_count']} benchmark bidders ready.")
    await db_manager.close()


if __name__ == "__main__":
    asyncio.run(main())
