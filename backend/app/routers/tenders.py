"""
GeM-Guard — Tenders Router
Strict Specifications:
1. PDF Ingestion: POST /api/v1/tenders/upload utilizing PyMuPDF to parse text and table structures.
2. Rule Extraction: Integrates TenderCompiler to extract financial turnover, MII %, and statutory registrations.
3. Manual Override: PUT /api/v1/tenders/{id}/rules allowing Procurement Officer to modify/add rules.
"""

import logging
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.database import doc_to_dict, get_db, to_oid, utcnow_str
from app.core.storage import storage
from app.schemas.domain import AuditEvent, RequirementRule, Tender
from app.pipeline.tender_compiler import TenderCompiler

logger = logging.getLogger("gemguard.routers.tenders")

router = APIRouter(tags=["tenders"])


class TenderCreateRequest(BaseModel):
    tender_no: str
    title: str
    organization: Optional[str] = "CPCL"
    buyer: Optional[str] = "CPCL"
    description: Optional[str] = None
    closing_date: Optional[str] = None
    turnover_threshold_cr: Optional[float] = None


class CompileRulesRequest(BaseModel):
    source: Optional[str] = "pattern"  # "ai" or "pattern"


class RuleOverrideItem(BaseModel):
    id: Optional[str] = None
    clause_id: Optional[str] = None
    metric: str
    operator: str
    threshold: Any
    unit: Optional[str] = ""
    severity: Optional[str] = "CRITICAL"
    conditions: Optional[Dict[str, Any]] = None
    evidence_type: Optional[str] = None
    verification_source: Optional[str] = None


class ManualRulesOverrideRequest(BaseModel):
    rules: List[RuleOverrideItem]
    actor: Optional[str] = "officer@gem.gov.in"
    reason: Optional[str] = "Manual rule adjustment by Procurement Officer"


# ── Tenders CRUD ─────────────────────────────────────────────────────────────

@router.get("/api/v1/tenders")
@router.get("/api/tenders")
@router.get("/tenders")
async def list_tenders(db=Depends(get_db)):
    """List all tenders ordered by creation time."""
    cursor = db["tenders"].find().sort("created_at", -1)
    docs = await cursor.to_list(100)
    return [doc_to_dict(d) for d in docs]


@router.get("/api/v1/tenders/{tender_id}")
@router.get("/api/tenders/{tender_id}")
@router.get("/tenders/{tender_id}")
async def get_tender(tender_id: str, db=Depends(get_db)):
    """Get single tender details by ID."""
    t = await db["tenders"].find_one({"_id": to_oid(tender_id)})
    if not t:
        raise HTTPException(status_code=404, detail=f"Tender not found: {tender_id}")
    res = doc_to_dict(t)
    # Include requirement rules
    rules_cursor = db["rules"].find({"tender_id": tender_id})
    res["rules"] = [doc_to_dict(r) for r in await rules_cursor.to_list(100)]
    return res


@router.post("/api/v1/tenders", status_code=status.HTTP_201_CREATED)
@router.post("/api/tenders", status_code=status.HTTP_201_CREATED)
@router.post("/tenders", status_code=status.HTTP_201_CREATED)
async def create_tender(body: TenderCreateRequest, db=Depends(get_db)):
    """Create a new tender."""
    org = body.organization or body.buyer or "CPCL"
    payload = {
        "tender_no": body.tender_no.strip(),
        "title": body.title.strip(),
        "organization": org,
        "buyer": org,
        "description": body.description,
        "closing_date": body.closing_date,
        "turnover_threshold_cr": body.turnover_threshold_cr,
        "status": "ACTIVE",
        "created_at": utcnow_str(),
        "updated_at": utcnow_str(),
        "version": 1,
    }
    tender_domain = Tender(**payload)
    doc_data = tender_domain.model_dump(by_alias=True, exclude_none=True)
    doc_data.pop("id", None)
    doc_data.pop("_id", None)

    existing = await db["tenders"].find_one({"tender_no": body.tender_no.strip()})
    if existing:
        raise HTTPException(status_code=409, detail=f"Tender '{body.tender_no}' already exists.")

    result = await db["tenders"].insert_one(doc_data)
    created = await db["tenders"].find_one({"_id": result.inserted_id})

    # Audit log
    await db["audit"].insert_one({
        "timestamp": utcnow_str(),
        "actor": "officer@gem.gov.in",
        "action": "TENDER_CREATED",
        "entity_id": str(result.inserted_id),
        "details": {"tender_no": body.tender_no},
    })

    return doc_to_dict(created)


@router.put("/api/v1/tenders/{tender_id}")
@router.put("/api/tenders/{tender_id}")
@router.put("/tenders/{tender_id}")
async def update_tender(tender_id: str, body: Dict[str, Any], db=Depends(get_db)):
    """Update tender metadata."""
    oid = to_oid(tender_id)
    body.pop("_id", None)
    body.pop("id", None)
    body["updated_at"] = utcnow_str()
    res = await db["tenders"].update_one({"_id": oid}, {"$set": body})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Tender not found: {tender_id}")
    updated = await db["tenders"].find_one({"_id": oid})
    return doc_to_dict(updated)


@router.get("/api/v1/tenders/{tender_id}/bids")
@router.get("/api/tenders/{tender_id}/bids")
@router.get("/tenders/{tender_id}/bids")
async def get_tender_bids(tender_id: str, db=Depends(get_db)):
    """Get all submitted bids for a specific tender."""
    cursor = db["bids"].find({"tender_id": tender_id})
    bids = await cursor.to_list(100)
    return [doc_to_dict(b) for b in bids]


# ── Specification 1 & 2: PDF Ingestion & Rule Compilation ────────────────────

@router.post("/api/v1/tenders/upload")
@router.post("/api/tenders/upload")
@router.post("/tenders/upload")
async def upload_and_compile_tender(
    file: UploadFile = File(...),
    tender_id: Optional[str] = Form(None),
    db=Depends(get_db),
):
    """
    STRICT SPECIFICATION 1 & 2:
    1. Ingest tender PDF via PyMuPDF (capturing text and table structures).
    2. Extract executable RequirementRule records (Turnover, MII %, Statutory: GST/PAN/Udyam).
    3. Persist Tender & Rules in MongoDB with audit trace.
    """
    # 1. Read file bytes and save to hybrid storage
    file_bytes = await file.read()
    stored = await storage.save_file(
        file_input=file_bytes,
        filename=file.filename,
        subfolder="tenders",
        content_type=file.content_type,
    )

    # 2. Run Tender AI Compiler (PyMuPDF parser with tables + Rule Extraction Engine)
    metadata, extracted_rules, diagnostics = TenderCompiler.compile_pdf(
        pdf_input=file_bytes,
        tender_id=tender_id,
    )

    target_tender_id = tender_id
    tender_doc = None

    # 3. Create or update Tender record
    if target_tender_id:
        try:
            oid = to_oid(target_tender_id)
            await db["tenders"].update_one(
                {"_id": oid},
                {"$set": {
                    "file_hash": stored.file_hash,
                    "document_path": str(stored.file_path),
                    "filename": stored.filename,
                    "updated_at": utcnow_str(),
                }},
            )
            tender_doc = await db["tenders"].find_one({"_id": oid})
        except Exception:
            target_tender_id = None

    if not tender_doc:
        # Determine unique tender number
        detected_no = metadata.get("tender_no") or f"GEM/2026/B/{stored.file_hash[:7].upper()}"
        existing = await db["tenders"].find_one({"tender_no": detected_no})
        if existing:
            target_tender_id = str(existing["_id"])
            tender_doc = existing
        else:
            new_tender = {
                "tender_no": detected_no,
                "title": metadata.get("title") or Path(file.filename).stem.replace("_", " ").title(),
                "organization": metadata.get("organization") or "CPCL",
                "buyer": metadata.get("organization") or "CPCL",
                "closing_date": metadata.get("closing_date"),
                "file_hash": stored.file_hash,
                "document_path": str(stored.file_path),
                "filename": stored.filename,
                "status": "ACTIVE",
                "version": 1,
                "created_at": utcnow_str(),
                "updated_at": utcnow_str(),
            }
            res = await db["tenders"].insert_one(new_tender)
            target_tender_id = str(res.inserted_id)
            tender_doc = await db["tenders"].find_one({"_id": res.inserted_id})

    # 4. Save extracted RequirementRule records
    # First clear any existing auto-compiled rules for this tender
    await db["rules"].delete_many({"tender_id": target_tender_id, "is_manual": {"$ne": True}})

    saved_rules = []
    for r in extracted_rules:
        r.tender_id = target_tender_id
        r_dict = r.model_dump(by_alias=True, exclude_none=True)
        r_dict.pop("id", None)
        r_dict.pop("_id", None)
        r_dict["created_at"] = utcnow_str()
        r_dict["source"] = "AI_COMPILER"
        insert_res = await db["rules"].insert_one(r_dict)
        r_dict["id"] = str(insert_res.inserted_id)
        saved_rules.append(r_dict)

    # 5. Log audit event
    await db["audit"].insert_one({
        "timestamp": utcnow_str(),
        "actor": "officer@gem.gov.in",
        "action": "TENDER_PDF_INGESTED",
        "entity_id": target_tender_id,
        "details": {
            "filename": stored.filename,
            "file_hash": stored.file_hash,
            "rules_count": len(saved_rules),
            "diagnostics": diagnostics,
        },
    })

    return {
        "status": "success",
        "message": f"Successfully parsed tender PDF and compiled {len(saved_rules)} compliance rules.",
        "tender": doc_to_dict(tender_doc),
        "rules": [doc_to_dict(r) for r in saved_rules],
        "diagnostics": diagnostics,
    }


# Also maintain tender_id-scoped upload for backwards compatibility
@router.post("/api/v1/tenders/{tender_id}/upload")
@router.post("/api/tenders/{tender_id}/upload")
@router.post("/tenders/{tender_id}/upload")
async def upload_tender_document_scoped(
    tender_id: str,
    file: UploadFile = File(...),
    db=Depends(get_db),
):
    """Scoped tender upload routing directly to upload_and_compile_tender."""
    return await upload_and_compile_tender(file=file, tender_id=tender_id, db=db)


# ── Specification 3: Manual Rule Override ────────────────────────────────────

@router.put("/api/v1/tenders/{tender_id}/rules")
@router.put("/api/tenders/{tender_id}/rules")
@router.put("/tenders/{tender_id}/rules")
async def manual_rule_override(
    tender_id: str,
    body: Union[ManualRulesOverrideRequest, List[Dict[str, Any]], Dict[str, Any]],
    db=Depends(get_db),
):
    """
    STRICT SPECIFICATION 3:
    Manual Override: Allows Procurement Officer to manually modify or add rules.
    - Validates inputs using RequirementRule domain model.
    - Updates/replaces rules for the tender.
    - Emits tamper-evident AuditEvent with SHA-256 hash.
    """
    oid = to_oid(tender_id)
    tender = await db["tenders"].find_one({"_id": oid})
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender not found: {tender_id}")

    # Normalize request structure
    raw_rules: List[Dict[str, Any]] = []
    actor = "officer@gem.gov.in"
    reason = "Procurement Officer manual rule override"

    if isinstance(body, ManualRulesOverrideRequest):
        raw_rules = [r.model_dump() for r in body.rules]
        actor = body.actor or actor
        reason = body.reason or reason
    elif isinstance(body, list):
        raw_rules = body
    elif isinstance(body, dict):
        raw_rules = body.get("rules", [])
        actor = body.get("actor", actor)
        reason = body.get("reason", reason)

    if not raw_rules:
        raise HTTPException(status_code=400, detail="Rules list cannot be empty.")

    # Validate each rule with RequirementRule domain model
    validated_rules: List[Dict[str, Any]] = []
    for idx, r_data in enumerate(raw_rules):
        try:
            r_data["tender_id"] = tender_id
            rule_obj = RequirementRule(**r_data)
            clean_dict = rule_obj.model_dump(by_alias=True, exclude_none=True)
            clean_dict.pop("id", None)
            clean_dict.pop("_id", None)
            clean_dict["tender_id"] = tender_id
            clean_dict["is_manual"] = True
            clean_dict["updated_at"] = utcnow_str()
            clean_dict["override_actor"] = actor
            validated_rules.append(clean_dict)
        except Exception as val_err:
            raise HTTPException(
                status_code=422,
                detail=f"Validation failed for rule at index {idx}: {val_err}",
            )

    # Replace existing rules for this tender
    await db["rules"].delete_many({"tender_id": tender_id})

    # Insert validated rules
    for r in validated_rules:
        await db["rules"].insert_one(r)

    updated_rules = await db["rules"].find({"tender_id": tender_id}).to_list(100)

    # Fetch previous hash for audit chain
    latest_audit = await db["audit"].find_one(sort=[("timestamp", -1)])
    prev_hash = latest_audit.get("event_hash") if latest_audit else "GENESIS"

    # Log cryptographic AuditEvent
    audit_event = AuditEvent(
        actor=actor,
        action="OFFICER_RULE_OVERRIDE",
        entity_id=tender_id,
        prev_hash=prev_hash,
        details={
            "reason": reason,
            "rules_count": len(updated_rules),
            "metrics": [r.get("metric") for r in updated_rules],
        },
    )
    audit_dict = audit_event.model_dump(by_alias=True, exclude_none=True)
    audit_dict.pop("id", None)
    audit_dict.pop("_id", None)
    await db["audit"].insert_one(audit_dict)

    logger.info(
        "Officer %s overridden rules for tender %s (%d rules updated). Audit hash: %s",
        actor,
        tender_id,
        len(updated_rules),
        audit_dict.get("event_hash", "")[:12],
    )

    return {
        "status": "success",
        "message": f"Successfully updated {len(updated_rules)} rules for tender {tender_id}.",
        "tender_id": tender_id,
        "rules": [doc_to_dict(r) for r in updated_rules],
        "audit_event_hash": audit_dict.get("event_hash"),
    }


# ── Legacy Compilation Endpoint ──────────────────────────────────────────────

@router.post("/api/v1/tenders/{tender_id}/compile")
@router.post("/api/tenders/{tender_id}/compile")
@router.post("/tenders/{tender_id}/compile")
async def compile_tender_rules(
    tender_id: str,
    body: Optional[CompileRulesRequest] = None,
    db=Depends(get_db),
):
    """Compile rules for an existing tender using TenderCompiler."""
    oid = to_oid(tender_id)
    tender = await db["tenders"].find_one({"_id": oid})
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender not found: {tender_id}")

    existing_rules = await db["rules"].find({"tender_id": tender_id}).to_list(100)
    if existing_rules:
        return {
            "status": "compiled",
            "tender_id": tender_id,
            "rules_count": len(existing_rules),
            "rules": [doc_to_dict(r) for r in existing_rules],
        }

    # If document path exists, compile from PDF
    doc_path = tender.get("document_path")
    if doc_path and Path(doc_path).exists():
        _, rules, diag = TenderCompiler.compile_pdf(doc_path, tender_id=tender_id)
        for r in rules:
            r_dict = r.model_dump(by_alias=True, exclude_none=True)
            r_dict.pop("id", None)
            r_dict.pop("_id", None)
            r_dict["created_at"] = utcnow_str()
            await db["rules"].insert_one(r_dict)
    else:
        # Generate baseline standard rules
        default_rules = [
            RequirementRule(
                tender_id=tender_id,
                clause_id="Clause 3.1",
                metric="annual_turnover_cr",
                operator=">=",
                threshold=tender.get("turnover_threshold_cr", 10.0) or 10.0,
                unit="INR_CR",
                severity="CRITICAL",
                evidence_type="CA_CERTIFICATE",
                verification_source="GSTN",
            ),
            RequirementRule(
                tender_id=tender_id,
                clause_id="Clause 3.4",
                metric="mii_local_content_percentage",
                operator=">=",
                threshold=50.0,
                unit="%",
                severity="HIGH",
                evidence_type="MII_DECLARATION",
                verification_source="DPIIT",
            ),
            RequirementRule(
                tender_id=tender_id,
                clause_id="Clause 3.2",
                metric="gst_registration_active",
                operator="==",
                threshold=True,
                unit="BOOLEAN",
                severity="CRITICAL",
                evidence_type="GST_CERTIFICATE",
                verification_source="GSTN",
            ),
            RequirementRule(
                tender_id=tender_id,
                clause_id="Clause 3.5",
                metric="pan_card_valid",
                operator="==",
                threshold=True,
                unit="BOOLEAN",
                severity="CRITICAL",
                evidence_type="PAN_CARD",
                verification_source="INCOME_TAX_PAN",
            ),
            RequirementRule(
                tender_id=tender_id,
                clause_id="Clause 3.3",
                metric="udyam_registration_active",
                operator="==",
                threshold=True,
                unit="BOOLEAN",
                severity="MEDIUM",
                evidence_type="UDYAM_CERTIFICATE",
                verification_source="UDYAM",
            ),
        ]
        for r in default_rules:
            r_dict = r.model_dump(by_alias=True, exclude_none=True)
            r_dict.pop("id", None)
            r_dict.pop("_id", None)
            r_dict["created_at"] = utcnow_str()
            await db["rules"].insert_one(r_dict)

    saved_rules = await db["rules"].find({"tender_id": tender_id}).to_list(100)
    return {
        "status": "compiled",
        "tender_id": tender_id,
        "rules_count": len(saved_rules),
        "rules": [doc_to_dict(r) for r in saved_rules],
    }
