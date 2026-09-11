"""
GeM-Guard — Audit Router
Modular routing for Tamper-Evident SHA-256 Audit Trail, Overrides, and Decision Tracing.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.database import doc_to_dict, get_db, to_oid, utcnow_str
from app.schemas.domain import AuditEvent

logger = logging.getLogger("gemguard.routers.audit")

router = APIRouter(tags=["audit"])


class RecordAuditEventRequest(BaseModel):
    actor: str
    action: str
    entity_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


@router.get("/api/audit/events")
@router.get("/api/audit")
@router.get("/audit")
async def get_global_audit_trail(
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    db=Depends(get_db),
):
    """Get global tamper-evident audit trail with SHA-256 hashes."""
    query = {"action": action} if action else {}
    cursor = db["audit"].find(query).sort("timestamp", -1).limit(limit)
    events = await cursor.to_list(limit)
    return [doc_to_dict(e) for e in events]


@router.get("/api/audit/overrides")
async def get_all_officer_overrides(db=Depends(get_db)):
    """List all officer override decisions across all bids."""
    cursor = db["audit"].find({"action": {"$regex": "^OFFICER_"}}).sort("timestamp", -1)
    overrides = await cursor.to_list(100)
    return [doc_to_dict(o) for o in overrides]


@router.get("/api/bids/{bid_id}/audit")
@router.get("/bids/{bid_id}/audit")
async def get_bid_audit_trail(bid_id: str, db=Depends(get_db)):
    """Get complete chronological audit trail for a specific bid."""
    cursor = db["audit"].find({"entity_id": bid_id}).sort("timestamp", 1)
    events = await cursor.to_list(100)
    if not events:
        # Check if bid exists
        bid = await db["bids"].find_one({"_id": to_oid(bid_id)})
        if not bid:
            raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")
        return []
    return [doc_to_dict(e) for e in events]


@router.get("/api/bids/{bid_id}/trace")
@router.get("/bids/{bid_id}/trace")
async def get_bid_compliance_trace(bid_id: str, db=Depends(get_db)):
    """
    Get full compliance trace for explaining AI extractions and rule evaluation.
    AI reads. Rules verify. Evidence explains. Officers decide.
    """
    bid = await db["bids"].find_one({"_id": to_oid(bid_id)})
    if not bid:
        raise HTTPException(status_code=404, detail=f"Bid not found: {bid_id}")

    # Gather evidence, rules, verifications, and audit history
    evidence_cursor = db["evidence"].find({"bid_id": bid_id})
    evidence = [doc_to_dict(e) for e in await evidence_cursor.to_list(100)]

    rules_cursor = db["rules"].find({"tender_id": bid.get("tender_id")})
    rules = [doc_to_dict(r) for r in await rules_cursor.to_list(100)]

    audit_cursor = db["audit"].find({"entity_id": bid_id}).sort("timestamp", 1)
    timeline = [doc_to_dict(a) for a in await audit_cursor.to_list(100)]

    return {
        "bid_id": bid_id,
        "compliance_status": bid.get("compliance_status", "PENDING"),
        "risk_score": bid.get("risk_score", 0.0),
        "officer_decision": bid.get("officer_decision"),
        "rules_evaluated": len(rules),
        "evidence_extracted": len(evidence),
        "evidence": evidence,
        "rules": rules,
        "timeline": timeline,
    }


@router.post("/api/audit/record", status_code=status.HTTP_201_CREATED)
async def record_audit_event(body: RecordAuditEventRequest, db=Depends(get_db)):
    """
    Record an audit event with SHA-256 cryptographic chain hashing
    using the AuditEvent domain model.
    """
    # Fetch latest event for hash chaining
    latest = await db["audit"].find_one(sort=[("timestamp", -1)])
    prev_hash = latest.get("event_hash") if latest else "GENESIS"

    # Instantiate AuditEvent domain model
    event = AuditEvent(
        actor=body.actor,
        action=body.action,
        entity_id=body.entity_id,
        details=body.details,
        prev_hash=prev_hash,
    )
    doc_data = event.model_dump(by_alias=True, exclude_none=True)
    doc_data.pop("id", None)
    doc_data.pop("_id", None)

    res = await db["audit"].insert_one(doc_data)
    created = await db["audit"].find_one({"_id": res.inserted_id})
    return doc_to_dict(created)


@router.get("/api/audit/verify-chain")
async def verify_audit_chain(db=Depends(get_db)):
    """Verify cryptographic integrity of the SHA-256 audit log hash chain."""
    cursor = db["audit"].find().sort("timestamp", 1)
    events = await cursor.to_list(500)

    if not events:
        return {"status": "valid", "total_events": 0, "message": "Audit trail is empty"}

    prev_hash = "GENESIS"
    for idx, e in enumerate(events):
        expected_prev = e.get("prev_hash")
        # Validate prev_hash link
        if idx > 0 and expected_prev != prev_hash:
            return {
                "status": "TAMPERED",
                "valid": False,
                "broken_at_index": idx,
                "event_id": str(e.get("_id")),
                "message": f"Hash chain broken at event {idx}: prev_hash mismatch",
            }
        prev_hash = e.get("event_hash", "")

    return {
        "status": "VERIFIED",
        "valid": True,
        "total_events": len(events),
        "chain_head_hash": prev_hash,
    }
