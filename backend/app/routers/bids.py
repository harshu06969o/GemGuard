"""
GeM-Guard — Bids Router
Modular routing for Bids, Document Processing, Evidence, Evaluation, and Officer Actions.
"""

import logging
import os
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.database import doc_to_dict, get_db, to_oid, utcnow_str
from app.core.storage import storage
from app.schemas.domain import Evidence, RuleResult, RuleStatus

logger = logging.getLogger("gemguard.routers.bids")

router = APIRouter(tags=["bids"])


class SubmitBidRequest(BaseModel):
    tender_id: str
    bidder_id: Optional[str] = None
    bid_amount: Optional[float] = None
    remarks: Optional[str] = None


class OfficerActionRequest(BaseModel):
    action: str  # APPROVE, REJECT, SEEK_CLARIFICATION
    reason: str
    actor: Optional[str] = "officer@gem.gov.in"
    clause_overrides: Optional[List[Dict[str, Any]]] = None


class OfficerOverrideRequest(BaseModel):
    justification: str  # MANDATORY
    rule_id: Optional[str] = None
    metric: Optional[str] = None
    new_status: str = "PASS"  # PASS, FAIL, REVIEW
    actor: Optional[str] = "officer@gem.gov.in"
    clause_id: Optional[str] = None
    notes: Optional[str] = None


@router.get("/api/bids")
@router.get("/bids")
async def list_bids(db=Depends(get_db)):
    """List all bids across all tenders."""
    cursor = db["bids"].find().sort("created_at", -1)
    bids = await cursor.to_list(100)
    return [doc_to_dict(b) for b in bids]


@router.get("/api/bids/mine")
@router.get("/bids/mine")
async def list_my_bids(db=Depends(get_db)):
    """List bids submitted by current bidder."""
    # Return all or filter by session
    cursor = db["bids"].find().sort("created_at", -1)
    bids = await cursor.to_list(100)
    return [doc_to_dict(b) for b in bids]


@router.get("/api/bids/{bid_id}")
@router.get("/bids/{bid_id}")
async def get_bid(bid_id: str, db=Depends(get_db)):
    """Get full bid details, including documents and compliance status."""
    oid = to_oid(bid_id)
    bid = await db["bids"].find_one({"_id": oid})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")
    res = doc_to_dict(bid)

    # Attach tender details
    if bid.get("tender_id"):
        try:
            tender = await db["tenders"].find_one({"_id": to_oid(bid["tender_id"])})
            if tender:
                res["tender"] = doc_to_dict(tender)
        except Exception:
            pass

    # Attach documents
    docs_cursor = db["bid_documents"].find({"bid_id": bid_id})
    res["documents"] = [doc_to_dict(d) for d in await docs_cursor.to_list(100)]

    # Attach evidence
    ev_cursor = db["evidence"].find({"bid_id": bid_id})
    res["evidence"] = [doc_to_dict(e) for e in await ev_cursor.to_list(100)]

    return res


@router.post("/api/bids", status_code=status.HTTP_201_CREATED)
@router.post("/bids", status_code=status.HTTP_201_CREATED)
async def submit_bid(body: SubmitBidRequest, db=Depends(get_db)):
    """Submit a bid for a tender."""
    tender = await db["tenders"].find_one({"_id": to_oid(body.tender_id)})
    if not tender:
        raise HTTPException(status_code=404, detail=f"Tender not found: {body.tender_id}")

    payload = {
        "tender_id": body.tender_id,
        "bidder_id": body.bidder_id or "demo_bidder_001",
        "bidder_name": "Adani Total Gas Ltd" if not body.bidder_id else "Bidder Enterprise",
        "bid_amount": body.bid_amount or 14500000.0,
        "status": "SUBMITTED",
        "compliance_status": "PENDING",
        "risk_score": 0.0,
        "created_at": utcnow_str(),
        "updated_at": utcnow_str(),
    }
    result = await db["bids"].insert_one(payload)
    created = await db["bids"].find_one({"_id": result.inserted_id})

    # Record audit event
    await db["audit"].insert_one({
        "timestamp": utcnow_str(),
        "actor": payload["bidder_id"],
        "action": "BID_SUBMITTED",
        "entity_id": str(result.inserted_id),
        "details": {"tender_id": body.tender_id},
    })

    return doc_to_dict(created)


@router.get("/api/bids/{bid_id}/documents")
@router.get("/bids/{bid_id}/documents")
async def list_bid_documents(bid_id: str, db=Depends(get_db)):
    """List all documents uploaded for this bid."""
    cursor = db["bid_documents"].find({"bid_id": bid_id})
    docs = await cursor.to_list(100)
    return [doc_to_dict(d) for d in docs]


from app.pipeline.document_processor import BidDocumentProcessor

@router.post("/api/bids/{bid_id}/documents/upload")
@router.post("/bids/{bid_id}/documents/upload")
@router.post("/api/v1/bids/{bid_id}/documents/upload")
async def upload_bid_document(
    bid_id: str,
    file: UploadFile = File(...),
    db=Depends(get_db),
):
    """Upload bid verification document (CA Cert, GSTN, PAN, MSME) and run Vision Document Processor."""
    bid = await db["bids"].find_one({"_id": to_oid(bid_id)})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")

    stored = await storage.save_file(
        file_input=file,
        filename=f"bid_{bid_id}_{file.filename}",
        subfolder="bids",
        content_type=file.content_type,
    )

    doc_record = {
        "bid_id": bid_id,
        "filename": stored.filename,
        "original_filename": file.filename,
        "file_path": str(stored.file_path),
        "file_hash": stored.file_hash,
        "size_bytes": stored.size_bytes,
        "uploaded_at": utcnow_str(),
    }
    res = await db["bid_documents"].insert_one(doc_record)
    doc_id = str(res.inserted_id)

    # Execute Vision Intelligence Document Processor (Dual-Engine + Classifier + Evidence Extractor)
    proc_res = await BidDocumentProcessor.process_single_file(
        file_path_or_bytes=stored.file_path,
        filename=file.filename,
        document_id=doc_id,
        package_id=bid_id,
        bidder_id=bid.get("bidder_id") or bid_id,
        db=db,
    )

    return {
        "status": "uploaded_and_processed",
        "document_id": doc_id,
        "filename": stored.filename,
        "original_filename": file.filename,
        "file_hash": stored.file_hash,
        "size_bytes": stored.size_bytes,
        "document_type": proc_res.classified_type,
        "classification_confidence": proc_res.classification_confidence,
        "total_pages": proc_res.total_pages,
        "evidence_count": len(proc_res.extracted_evidence),
        "evidence": [e.model_dump() for e in proc_res.extracted_evidence],
    }


@router.post("/api/bids/{bid_id}/package/upload")
@router.post("/bids/{bid_id}/package/upload")
@router.post("/api/v1/bids/{bid_id}/package/upload")
async def upload_bid_package(
    bid_id: str,
    files: List[UploadFile] = File(...),
    db=Depends(get_db),
):
    """Upload multiple bid documents simultaneously and process the complete package."""
    bid = await db["bids"].find_one({"_id": to_oid(bid_id)})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")

    files_data: List[Tuple[str, bytes]] = []
    for f in files:
        content = await f.read()
        await f.seek(0)
        # Also store to disk for persistence
        await storage.save_file(
            file_input=content,
            filename=f"bid_{bid_id}_{f.filename}",
            subfolder="bids",
            content_type=f.content_type,
        )
        files_data.append((f.filename, content))

    package_result = await BidDocumentProcessor.process_bid_package(
        bid_id=bid_id,
        files_data=files_data,
        db=db,
    )
    return package_result


@router.post("/api/bids/{bid_id}/process")
@router.post("/bids/{bid_id}/process")
@router.post("/api/v1/bids/{bid_id}/process")
async def process_bid_documents(bid_id: str, db=Depends(get_db)):
    """Re-process all previously uploaded documents for a bid using the Vision Document Processor."""
    bid = await db["bids"].find_one({"_id": to_oid(bid_id)})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")

    docs_cursor = db["bid_documents"].find({"bid_id": bid_id})
    docs = await docs_cursor.to_list(100)
    if not docs:
        raise HTTPException(status_code=400, detail="No documents found for this bid to process.")

    results = []
    for doc in docs:
        file_path = doc.get("file_path")
        doc_id = str(doc["_id"])
        filename = doc.get("original_filename") or doc.get("filename")
        if file_path and os.path.exists(file_path):
            res = await BidDocumentProcessor.process_single_file(
                file_path_or_bytes=file_path,
                filename=filename,
                document_id=doc_id,
                package_id=bid_id,
                bidder_id=bid.get("bidder_id") or bid_id,
                db=db,
            )
            results.append({
                "document_id": doc_id,
                "filename": filename,
                "type": res.classified_type,
                "confidence": res.classification_confidence,
                "evidence_count": len(res.extracted_evidence),
            })

    return {
        "status": "success",
        "bid_id": bid_id,
        "processed_documents": results,
    }


@router.get("/api/bids/{bid_id}/evidence")
@router.get("/bids/{bid_id}/evidence")
@router.get("/api/v1/bids/{bid_id}/evidence")
async def list_bid_evidence(bid_id: str, db=Depends(get_db)):
    """List all extracted evidence entries with bounding boxes for this bid."""
    cursor = db["evidence"].find({"$or": [{"bid_id": bid_id}, {"package_id": bid_id}]})
    evidence_list = await cursor.to_list(200)
    return [doc_to_dict(e) for e in evidence_list]


from app.connectors import connector_manager, ConnectorStatus, ConnectorResult

class VerifyBidRequest(BaseModel):
    simulate_timeout: Optional[bool] = False
    timeout_connectors: Optional[List[str]] = None
    override_identifiers: Optional[Dict[str, Any]] = None


from app.engine.compliance import ComplianceEngine, ComplianceEvaluationReport, RiskBand


@router.post("/api/bids/{bid_id}/evaluate")
@router.post("/bids/{bid_id}/evaluate")
@router.post("/api/v1/bids/{bid_id}/evaluate")
async def evaluate_bid(bid_id: str, db=Depends(get_db)):
    """
    Run deterministic compliance evaluation and Pandas cross-document integrity checks against tender rules.
    Calculates Readiness Score (0-100) and assigns Risk Band (LOW, MEDIUM, HIGH, CRITICAL).
    SIH Graceful Degradation Guarantee: External connector timeouts NEVER auto-disqualify a bid.
    """
    oid = to_oid(bid_id)
    bid = await db["bids"].find_one({"_id": oid})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")

    tender_id = bid.get("tender_id")
    rules_cursor = db["rules"].find({"tender_id": tender_id})
    rules = await rules_cursor.to_list(100)

    # Gather extracted evidence for this bid
    evidence_cursor = db["evidence"].find({"$or": [{"bid_id": bid_id}, {"package_id": bid_id}]})
    evidence_list = await evidence_cursor.to_list(200)

    # Gather external verification results
    verifications = bid.get("verifications", [])

    # Execute Compliance Engine (Deterministic rule evaluation + Pandas cross-document integrity + scoring)
    report = ComplianceEngine.evaluate_bid(
        bid_id=bid_id,
        rules=rules,
        evidence_list=evidence_list,
        verifications=verifications,
        bidder_id=bid.get("bidder_id", "bidder_001"),
    )

    risk_score = round(100.0 - report.readiness_score, 1)

    await db["bids"].update_one(
        {"_id": oid},
        {"$set": {
            "compliance_status": report.overall_status,
            "readiness_score": report.readiness_score,
            "risk_band": report.risk_band.value,
            "risk_score": risk_score,
            "evaluation_results": report.rule_results,
            "integrity_findings": report.integrity_findings,
            "evidence_completeness_ratio": report.evidence_completeness_ratio,
            "mandatory_pass_ratio": report.mandatory_pass_ratio,
            "evaluation_summary": report.summary,
            "evaluated_at": utcnow_str(),
        }},
    )

    # Audit log
    await db["audit"].insert_one({
        "timestamp": utcnow_str(),
        "actor": "system",
        "action": "BID_EVALUATED",
        "entity_id": bid_id,
        "details": {
            "status": report.overall_status,
            "readiness_score": report.readiness_score,
            "risk_band": report.risk_band.value,
            "integrity_contradictions_count": len(report.integrity_findings),
        },
    })

    return {
        "bid_id": bid_id,
        "overall_status": report.overall_status,
        "readiness_score": report.readiness_score,
        "risk_band": report.risk_band.value,
        "risk_score": risk_score,
        "results": report.rule_results,
        "integrity_findings": report.integrity_findings,
        "evidence_completeness_ratio": report.evidence_completeness_ratio,
        "mandatory_pass_ratio": report.mandatory_pass_ratio,
        "summary": report.summary,
    }


@router.post("/api/bids/{bid_id}/verify")
@router.post("/bids/{bid_id}/verify")
@router.post("/api/v1/bids/{bid_id}/verify")
async def run_verification(
    bid_id: str,
    body: Optional[VerifyBidRequest] = None,
    db=Depends(get_db),
):
    """
    Trigger external government connector verifications across all 6 registries:
    GSTN, PAN, UDYAM, EPFO, STARTUP_INDIA, and DEBARMENT.
    Supports simulate_timeout for Graceful Degradation testing.
    """
    oid = to_oid(bid_id)
    bid = await db["bids"].find_one({"_id": oid})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")

    # Gather extracted evidence from bid documents
    ev_cursor = db["evidence"].find({"$or": [{"bid_id": bid_id}, {"package_id": bid_id}]})
    evidence_list = await ev_cursor.to_list(100)

    query: Dict[str, Any] = {
        "bidder_id": bid.get("bidder_id", "demo_bidder_001"),
        "bidder_name": bid.get("bidder_name", "Bharat Engineering Ltd"),
        "legal_name": bid.get("bidder_name", "Bharat Engineering Ltd"),
        "category": bid.get("bidder_category", "SMALL"),
        "employee_count": bid.get("employee_count", 48),
    }

    # Extract standard statutory fields from evidence
    for ev in evidence_list:
        field_name = ev.get("field_name")
        norm_val = ev.get("normalized_value") or ev.get("raw_value")
        if field_name and norm_val is not None:
            query[field_name] = norm_val

    if body and body.override_identifiers:
        query.update(body.override_identifiers)

    # Execute connectors with optional simulate_timeout
    simulate_timeout = body.simulate_timeout if body else False
    timeout_connectors = body.timeout_connectors if body else None

    connector_results = await connector_manager.verify_all(
        query=query,
        simulate_timeout=simulate_timeout,
        timeout_connectors=timeout_connectors,
    )

    verifications_data = [r.model_dump() for r in connector_results]
    impact = connector_manager.evaluate_connector_impact(connector_results)

    await db["bids"].update_one(
        {"_id": oid},
        {"$set": {
            "verifications": verifications_data,
            "verification_impact": impact,
            "last_verified_at": utcnow_str(),
        }},
    )

    # Record Audit Event
    await db["audit"].insert_one({
        "timestamp": utcnow_str(),
        "actor": "system",
        "action": "GOV_CONNECTORS_VERIFIED",
        "entity_id": bid_id,
        "details": {
            "simulate_timeout": simulate_timeout,
            "timeout_connectors": timeout_connectors,
            "impact": impact,
            "verifications_summary": {r.source: r.status for r in connector_results},
        },
    })

    return {
        "bid_id": bid_id,
        "verifications": verifications_data,
        "impact": impact,
    }


@router.get("/api/bids/{bid_id}/verifications")
@router.get("/bids/{bid_id}/verifications")
@router.get("/api/v1/bids/{bid_id}/verifications")
async def list_verifications(bid_id: str, db=Depends(get_db)):
    """List verification status for a bid."""
    bid = await db["bids"].find_one({"_id": to_oid(bid_id)})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")
    return bid.get("verifications", [])


@router.post("/api/bids/{bid_id}/officer-action")
@router.post("/bids/{bid_id}/officer-action")
async def officer_action(bid_id: str, body: OfficerActionRequest, db=Depends(get_db)):
    """Procurement Officer action (APPROVE, REJECT, SEEK_CLARIFICATION)."""
    oid = to_oid(bid_id)
    bid = await db["bids"].find_one({"_id": oid})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")

    update_fields = {
        "officer_decision": body.action,
        "officer_reason": body.reason,
        "officer_actor": body.actor,
        "officer_action_time": utcnow_str(),
        "status": "APPROVED" if body.action == "APPROVE" else "REJECTED" if body.action == "REJECT" else "CLARIFICATION_REQUESTED",
    }
    await db["bids"].update_one({"_id": oid}, {"$set": update_fields})

    # Log to audit trail
    await db["audit"].insert_one({
        "timestamp": utcnow_str(),
        "actor": body.actor or "officer@gem.gov.in",
        "action": f"OFFICER_{body.action}",
        "entity_id": bid_id,
        "details": {"reason": body.reason, "overrides": body.clause_overrides},
    })

    return {"status": "success", "bid_id": bid_id, "decision": body.action}


from app.engine.audit import AuditEngine


@router.post("/api/v1/bids/{bid_id}/override")
@router.post("/api/bids/{bid_id}/override")
@router.post("/bids/{bid_id}/override")
async def officer_override(
    bid_id: str,
    body: OfficerOverrideRequest,
    db=Depends(get_db),
):
    """
    Procurement Officer Override endpoint.
    Strictly enforces a mandatory justification string before altering a system result
    and logging to the cryptographic SHA-256 audit chain.
    """
    # 1. Enforce mandatory justification string
    justification = (body.justification or "").strip()
    if not justification or len(justification) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Procurement Officer justification is mandatory and must be a substantive explanation (minimum 5 characters).",
        )

    oid = to_oid(bid_id)
    bid = await db["bids"].find_one({"_id": oid})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")

    new_status_upper = body.new_status.strip().upper()
    if new_status_upper not in ("PASS", "FAIL", "REVIEW", "PENDING"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid override status '{body.new_status}'. Allowed: PASS, FAIL, REVIEW, PENDING.",
        )

    # 2. Update rule results in bid
    evaluation_results = bid.get("evaluation_results", [])
    updated = False
    old_status = "UNKNOWN"

    for r in evaluation_results:
        # Match by rule_id or metric
        if (body.rule_id and r.get("rule_id") == body.rule_id) or (body.metric and r.get("metric") == body.metric):
            old_status = r.get("status", "UNKNOWN")
            r["status"] = new_status_upper
            r["officer_override"] = True
            r["officer_justification"] = justification
            r["officer_actor"] = body.actor or "officer@gem.gov.in"
            r["override_time"] = utcnow_str()
            r["explanation"] = f"[OVERRIDDEN by {body.actor}]: {justification} (Prior status: {old_status})"
            updated = True
            break

    if not updated:
        if evaluation_results:
            first_r = evaluation_results[0]
            old_status = first_r.get("status", "UNKNOWN")
            first_r["status"] = new_status_upper
            first_r["officer_override"] = True
            first_r["officer_justification"] = justification
            first_r["explanation"] = f"[OVERRIDDEN by {body.actor}]: {justification}"
        else:
            # Create a synthetic rule result entry
            old_status = "PENDING"
            evaluation_results.append({
                "rule_id": body.rule_id or "RULE-MANUAL-OVERRIDE",
                "bidder_id": bid.get("bidder_id", "bidder_001"),
                "status": new_status_upper,
                "evidence_ids": [],
                "explanation": f"[OVERRIDDEN by {body.actor}]: {justification}",
                "officer_override": True,
                "officer_justification": justification,
            })

    # Recalculate overall status
    has_fail = any(r.get("status") == "FAIL" for r in evaluation_results)
    has_pending = any(r.get("status") == "PENDING" for r in evaluation_results)
    has_review = any(r.get("status") == "REVIEW" for r in evaluation_results)

    if has_fail:
        new_overall = "NON_COMPLIANT"
        new_risk = 85.0
    elif has_pending:
        new_overall = "PENDING_VERIFICATION"
        new_risk = 25.0
    elif has_review:
        new_overall = "UNDER_REVIEW"
        new_risk = 35.0
    else:
        new_overall = "COMPLIANT"
        new_risk = 15.0

    await db["bids"].update_one(
        {"_id": oid},
        {"$set": {
            "compliance_status": new_overall,
            "risk_score": new_risk,
            "evaluation_results": evaluation_results,
            "officer_override_active": True,
            "latest_override": {
                "actor": body.actor or "officer@gem.gov.in",
                "justification": justification,
                "rule_id": body.rule_id,
                "old_status": old_status,
                "new_status": new_status_upper,
                "timestamp": utcnow_str(),
            },
        }},
    )

    # 3. Log to Cryptographic Audit Chain
    audit_record = await AuditEngine.log_officer_override(
        db=db,
        bid_id=bid_id,
        actor=body.actor or "officer@gem.gov.in",
        justification=justification,
        rule_id=body.rule_id,
        old_status=old_status,
        new_status=new_status_upper,
        details={
            "metric": body.metric,
            "new_overall_status": new_overall,
            "new_risk_score": new_risk,
            "notes": body.notes,
        },
    )

    return {
        "status": "success",
        "bid_id": bid_id,
        "rule_id": body.rule_id,
        "previous_status": old_status,
        "overridden_status": new_status_upper,
        "new_compliance_status": new_overall,
        "new_risk_score": new_risk,
        "justification": justification,
        "actor": body.actor or "officer@gem.gov.in",
        "event_hash": audit_record.get("event_hash"),
        "prev_hash": audit_record.get("prev_hash"),
    }
