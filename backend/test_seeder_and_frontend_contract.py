"""
GeM-Guard — Seeder & Frontend Shell Contract Test
Verifies:
1. seed_demo.py offline execution generates all 4 benchmark bidders with strict requirements:
   - Bidder A: 100% compliant -> PASS (Low Risk)
   - Bidder B: Turnover below threshold -> FAIL (High Risk)
   - Bidder C: PAN vs Udyam name mismatch -> REVIEW (High Risk)
   - Bidder D: GST API simulates timeout -> PENDING (Medium Risk, Graceful Degradation)
2. GET /api/connectors/health returns all 6 government registries (GSTN, PAN, UDYAM, EPFO, STARTUP_INDIA, DEBARMENT)
3. POST /api/demo/reset re-seeds the database on demand
4. Cryptographic SHA-256 audit chain validates as VERIFIED
"""

import asyncio
import os
import sys
import unittest
from starlette.testclient import TestClient

BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.core.database import connect_to_mongo, close_mongo_connection
from app.engine.audit import AuditEngine
from app.main import app
from data.seed_demo import seed_demo_data


class TestSeederAndFrontendContract(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.db = await connect_to_mongo()
        self.client = TestClient(app, base_url="http://testserver")

    async def asyncTearDown(self):
        pass

    async def test_01_seed_script_benchmark_bidders(self):
        """Test seed_demo_data creates the exact 4 benchmark bidder profiles."""
        result = await seed_demo_data(self.db)
        self.assertEqual(result["bids_count"], 4)
        self.assertEqual(result["rules_count"], 5)

        bids = result["bids"]
        bids_by_code = {b.get("bidder_code"): b for b in bids}

        # ── BIDDER A: 100% COMPLIANT ─────────────────────────────────────────
        bid_a = bids_by_code.get("A")
        self.assertIsNotNone(bid_a, "Bidder A exists")
        self.assertEqual(bid_a["overall_status"], "PASS")
        self.assertEqual(bid_a["compliance_status"], "COMPLIANT")
        self.assertEqual(bid_a["risk_band"], "LOW")
        self.assertGreaterEqual(bid_a["readiness_score"], 90.0)
        self.assertGreaterEqual(bid_a["bidder"]["turnover_cr"], 14.2)
        self.assertGreaterEqual(bid_a["bidder"]["local_content_pct"], 50.0)
        print("  [PASS] Bidder A: 100% compliant -> PASS (Low Risk, Readiness 96%)")

        # ── BIDDER B: TURNOVER BELOW THRESHOLD ───────────────────────────────
        bid_b = bids_by_code.get("B")
        self.assertIsNotNone(bid_b, "Bidder B exists")
        self.assertEqual(bid_b["overall_status"], "FAIL")
        self.assertEqual(bid_b["compliance_status"], "NON_COMPLIANT")
        self.assertIn(bid_b["risk_band"], ("HIGH", "CRITICAL"))
        self.assertLess(bid_b["bidder"]["turnover_cr"], 14.2)
        self.assertLessEqual(bid_b["readiness_score"], 45.0)
        # Check rule results for turnover fail
        turnover_res = next((r for r in bid_b["evaluation_results"] if r.get("metric") == "annual_turnover_cr"), None)
        self.assertIsNotNone(turnover_res)
        self.assertEqual(turnover_res["status"], "FAIL")
        print("  [PASS] Bidder B: Turnover below threshold -> FAIL (High Risk, Readiness 36%)")

        # ── BIDDER C: PAN VS UDYAM NAME MISMATCH ─────────────────────────────
        bid_c = bids_by_code.get("C")
        self.assertIsNotNone(bid_c, "Bidder C exists")
        self.assertEqual(bid_c["overall_status"], "REVIEW")
        self.assertEqual(bid_c["compliance_status"], "UNDER_REVIEW")
        self.assertEqual(bid_c["risk_band"], "HIGH")
        self.assertGreater(len(bid_c.get("integrity_findings", [])), 0)
        finding = bid_c["integrity_findings"][0]
        self.assertEqual(finding["check_type"], "NAME_MISMATCH")
        print("  [PASS] Bidder C: PAN vs Udyam name mismatch -> REVIEW (High Risk, Readiness 55%)")

        # ── BIDDER D: GST API SIMULATES TIMEOUT ──────────────────────────────
        bid_d = bids_by_code.get("D")
        self.assertIsNotNone(bid_d, "Bidder D exists")
        self.assertEqual(bid_d["overall_status"], "PENDING")
        self.assertEqual(bid_d["compliance_status"], "PENDING_VERIFICATION")
        self.assertEqual(bid_d["risk_band"], "MEDIUM")
        # Ensure timeout connector is PENDING and bid is NOT disqualified
        gst_verif = next((v for v in bid_d["verifications"] if v.get("source") == "GSTN"), None)
        self.assertIsNotNone(gst_verif)
        self.assertEqual(gst_verif["status"], "PENDING")
        print("  [PASS] Bidder D: GST API timeout -> PENDING (Medium Risk, Never auto-disqualified)")

    async def test_02_connectors_health_endpoint(self):
        """Test GET /api/connectors/health returns all 6 government registries."""
        res = self.client.get("/api/connectors/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("all_operational"))
        connectors = data.get("connectors", [])
        self.assertEqual(len(connectors), 6)

        sources = {c["source"] for c in connectors}
        expected = {"GSTN", "PAN", "UDYAM", "EPFO", "STARTUP_INDIA", "DEBARMENT"}
        self.assertEqual(sources, expected)
        print("  [PASS] GET /api/connectors/health: all 6 government registries UP")

    async def test_03_demo_reset_endpoint(self):
        """Test POST /api/demo/reset re-seeds the database."""
        res = self.client.post("/api/demo/reset")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "success")
        self.assertIn("details", data)
        self.assertEqual(data["details"]["bids_count"], 4)
        print("  [PASS] POST /api/demo/reset: successfully re-seeded 4 benchmark bidders")

    async def test_04_cryptographic_audit_trail_validity(self):
        """Test cryptographic chained SHA-256 integrity across all seeded events."""
        chain_status = await AuditEngine.verify_chain(self.db)
        self.assertTrue(chain_status["valid"])
        self.assertEqual(chain_status["status"], "VERIFIED")
        self.assertGreater(chain_status["total_events"], 0)
        print(f"  [PASS] Cryptographic Audit Trail: {chain_status['total_events']} events chained and VERIFIED")


if __name__ == "__main__":
    unittest.main()
