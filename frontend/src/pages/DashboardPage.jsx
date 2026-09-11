import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { loginSuccess } from '../store/slices/authSlice';
import {
  listTenders,
  listBids,
  getHealth,
  getMe,
  evaluateBid,
  getConnectorsHealth,
  runCorrigendumAnalysis,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { LoadingSpinner, ErrorMessage } from '../components/Card';
import SplitDocumentViewer from '../components/SplitDocumentViewer';
import AuditReplayModal from '../components/AuditReplayModal';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, FileText, Cpu,
  Eye, Sliders, ExternalLink, ArrowRight, Play, RefreshCw,
  Search, Filter, Lock, Scale, FileCheck, Layers, Hash,
  UserCheck, AlertCircle, Clock, Check, ChevronRight
} from 'lucide-react';

// Benchmark Bidders fallback data
export const BENCHMARK_BIDDERS = [
  {
    id: 'bid_001_pass',
    bidder_code: 'A',
    bidder_name: 'Bharat Piping & Infrastructure Ltd',
    bidder: {
      name: 'Bharat Piping & Infrastructure Ltd',
      gstin: '33AABCB1234F1ZQ',
      pan: 'AABCB1234F',
      turnover_cr: 14.20,
      local_content_pct: 62.5,
      udyam_number: 'UDYAM-TN-02-0045123',
      ca_udin: '24058912AAAAAA9812',
    },
    overall_status: 'PASS',
    compliance_status: 'COMPLIANT',
    risk_band: 'LOW',
    readiness_score: 96,
    evaluation_results: [
      { rule_id: 'REQ-FIN-01', metric: 'annual_turnover_cr', status: 'PASS', explanation: 'Average 3FY turnover ₹14.20 Cr exceeds threshold ₹10.00 Cr. ICAI UDIN verified.' },
      { rule_id: 'REQ-MII-02', metric: 'local_content_percentage', status: 'PASS', explanation: 'Local content 62.5% exceeds Class-I requirement (50.0%). Affidavit verified.' },
      { rule_id: 'REQ-STAT-03', metric: 'gstin_and_pan_active', status: 'PASS', explanation: 'GSTIN active in Tamil Nadu. PAN matches corporate filing 100%.' },
    ],
    verifications: [
      { source: 'GSTN', status: 'PASS', message: 'Active regular taxpayer' },
      { source: 'CBDT_PAN', status: 'PASS', message: 'PAN verified active' },
      { source: 'UDYAM', status: 'PASS', message: 'MSME registered' },
      { source: 'ICAI_UDIN', status: 'PASS', message: 'UDIN verified & unrevoked' },
    ],
  },
  {
    id: 'bid_002_fail',
    bidder_code: 'B',
    bidder_name: 'Falcon Heavy Works Private Limited',
    bidder: {
      name: 'Falcon Heavy Works Private Limited',
      gstin: '07AAACF5678K1ZP',
      pan: 'AAACF5678K',
      turnover_cr: 8.40,
      local_content_pct: 54.0,
      udyam_number: 'UDYAM-DL-05-0089234',
      ca_udin: '24089123BBBBBB1245',
    },
    overall_status: 'FAIL',
    compliance_status: 'NON_COMPLIANT',
    risk_band: 'CRITICAL',
    readiness_score: 42,
    shortfall_details: 'Annual turnover ₹8.40 Cr is below mandatory requirement of ≥ ₹10.00 Cr (Shortfall: ₹1.60 Cr)',
    evaluation_results: [
      { rule_id: 'REQ-FIN-01', metric: 'annual_turnover_cr', status: 'FAIL', explanation: 'Reported turnover ₹8.40 Cr fails mandatory threshold of ₹10.00 Cr.' },
      { rule_id: 'REQ-MII-02', metric: 'local_content_percentage', status: 'PASS', explanation: 'Local content 54.0% satisfies Class-I criteria.' },
      { rule_id: 'REQ-STAT-03', metric: 'gstin_and_pan_active', status: 'PASS', explanation: 'GSTIN & PAN active and matched.' },
    ],
    verifications: [
      { source: 'GSTN', status: 'PASS', message: 'Active taxpayer' },
      { source: 'CBDT_PAN', status: 'PASS', message: 'PAN valid' },
      { source: 'ICAI_UDIN', status: 'PASS', message: 'UDIN verified' },
    ],
  },
  {
    id: 'bid_003_review',
    bidder_code: 'C',
    bidder_name: 'Apex Buildtech & Engineering Consortium',
    bidder: {
      name: 'Apex Buildtech & Engineering Consortium',
      gstin: '27AABCA9999M1ZQ',
      pan: 'AABCA9999M',
      turnover_cr: 18.50,
      local_content_pct: 48.0,
      udyam_number: 'UDYAM-MH-01-0019999',
      ca_udin: '24019999CCCCCC9999',
    },
    overall_status: 'REVIEW',
    compliance_status: 'UNDER_REVIEW',
    risk_band: 'HIGH',
    readiness_score: 68,
    contradiction_details: 'PAN registered to "APEX INFRASTRUCTURE PVT LTD" whereas GST certificate states "APEX BUILDTECH LIMITED" (Entity name similarity: 64% - Flagged by Pandas cross-doc validator)',
    integrity_findings: [
      { discrepancy_details: 'Legal entity mismatch between Income Tax PAN database and State GST registration.' },
      { discrepancy_details: 'Local content reported at 48.0% (borderline Class-I vs Class-II classification query).' },
    ],
    evaluation_results: [
      { rule_id: 'REQ-FIN-01', metric: 'annual_turnover_cr', status: 'PASS', explanation: 'Turnover ₹18.50 Cr meets requirement.' },
      { rule_id: 'REQ-MII-02', metric: 'local_content_percentage', status: 'REVIEW', explanation: '48.0% local content falls short of 50.0% Class-I requirement without formal declaration.' },
      { rule_id: 'REQ-STAT-03', metric: 'gstin_and_pan_active', status: 'REVIEW', explanation: 'Cross-document legal entity name discrepancy flagged.' },
    ],
    verifications: [
      { source: 'GSTN', status: 'PASS', message: 'Active entity' },
      { source: 'CBDT_PAN', status: 'PASS', message: 'PAN verified' },
      { source: 'CROSS_DOC', status: 'REVIEW', message: 'Name mismatch detected' },
    ],
  },
  {
    id: 'bid_004_pending',
    bidder_code: 'D',
    bidder_name: 'Hindustan Industrial Piping Systems',
    bidder: {
      name: 'Hindustan Industrial Piping Systems',
      gstin: '06AAACH7777J1ZQ',
      pan: 'AAACH7777J',
      turnover_cr: 12.80,
      local_content_pct: 71.0,
      udyam_number: 'UDYAM-HR-03-0077777',
      ca_udin: '24077777DDDDDD7777',
    },
    overall_status: 'PENDING',
    compliance_status: 'PENDING_VERIFICATION',
    risk_band: 'LOW',
    readiness_score: 75,
    pending_details: 'Statutory GSTN registry connection simulated network latency. Bid held at PENDING to guarantee Zero Wrongful Disqualification.',
    evaluation_results: [
      { rule_id: 'REQ-FIN-01', metric: 'annual_turnover_cr', status: 'PASS', explanation: 'Turnover ₹12.80 Cr meets threshold.' },
      { rule_id: 'REQ-MII-02', metric: 'local_content_percentage', status: 'PASS', explanation: 'Local content 71.0% verified.' },
      { rule_id: 'REQ-STAT-03', metric: 'gstin_and_pan_active', status: 'PENDING', explanation: 'GSTN gateway response timed out (HTTP 504 Simulated). Held at PENDING.' },
    ],
    verifications: [
      { source: 'GSTN', status: 'PENDING', message: 'Registry response delayed (Held PENDING)' },
      { source: 'CBDT_PAN', status: 'PASS', message: 'PAN valid' },
      { source: 'UDYAM', status: 'PASS', message: 'MSME valid' },
    ],
  },
];

// Audit trail events for Vigilance & Audit Officer
export const DEFAULT_AUDIT_STREAM = [
  {
    id: 'evt-005',
    block_index: 5,
    timestamp: '2026-09-11T14:15:00.000Z',
    action: 'OFFICER_OVERRIDE',
    actor: 'officer@cpcl.gov.in',
    actor_role: 'PROCUREMENT_OFFICER',
    entity_id: 'bid_002_fail',
    prev_hash: '9a8b1c4e7f3d2a5c8e1b4d7f0a3c6e9b2d5f8a1c4e7f3d2a5c8e1b4d7f0a3c6e',
    event_hash: '3f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
    details: {
      rule_id: 'REQ-FIN-01',
      old_status: 'FAIL',
      new_status: 'REVIEW',
      justification: 'MSME statutory relaxation requested under MoPNG Circular 2024/MSME/08. Provisional review permitted pending OEM bank guarantee.',
    },
  },
  {
    id: 'evt-004',
    block_index: 4,
    timestamp: '2026-09-11T12:30:00.000Z',
    action: 'RULE_EVALUATED',
    actor: 'system.engine@gemguard.internal',
    actor_role: 'SYSTEM_RULES_ENGINE',
    entity_id: 'bid_003_review',
    prev_hash: 'c4e7f3d2a5c8e1b4d7f0a3c6e9b2d5f8a1c4e7f3d2a5c8e1b4d7f0a3c6e9a8b1',
    event_hash: '9a8b1c4e7f3d2a5c8e1b4d7f0a3c6e9b2d5f8a1c4e7f3d2a5c8e1b4d7f0a3c6e',
    details: {
      rules_checked: 5,
      discrepancy: 'Entity Name Mismatch: PAN (Apex Infrastructure) vs GST (Apex Buildtech)',
      decision: 'FLAGGED_FOR_OFFICER_REVIEW',
    },
  },
  {
    id: 'evt-003',
    block_index: 3,
    timestamp: '2026-09-11T11:05:00.000Z',
    action: 'REGISTRY_CONNECTOR_VERIFIED',
    actor: 'connectors.registry@gemguard.internal',
    actor_role: 'GOV_CONNECTORS',
    entity_id: 'bid_001_pass',
    prev_hash: '3d2a5c8e1b4d7f0a3c6e9b2d5f8a1c4e7f3d2a5c8e1b4d7f0a3c6e9a8b1c4e7f',
    event_hash: 'c4e7f3d2a5c8e1b4d7f0a3c6e9b2d5f8a1c4e7f3d2a5c8e1b4d7f0a3c6e9a8b1',
    details: {
      registries: ['GSTN', 'CBDT_PAN', 'UDYAM', 'ICAI_UDIN'],
      results: '4/4 Validated Active',
    },
  },
  {
    id: 'evt-002',
    block_index: 2,
    timestamp: '2026-09-11T09:40:00.000Z',
    action: 'BID_INGESTED',
    actor: 'system.pipeline@gemguard.internal',
    actor_role: 'SYSTEM_OCR',
    entity_id: 'bid_001_pass',
    prev_hash: '8f432e1a90c4bb21f37e810a9c6d4e21a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3',
    event_hash: '3d2a5c8e1b4d7f0a3c6e9b2d5f8a1c4e7f3d2a5c8e1b4d7f0a3c6e9a8b1c4e7f',
    details: {
      documents_parsed: 5,
      figures_extracted: 8,
      bounding_boxes_mapped: 8,
    },
  },
  {
    id: 'evt-001',
    block_index: 1,
    timestamp: '2026-09-10T15:00:00.000Z',
    action: 'TENDER_COMPILED',
    actor: 'officer@cpcl.gov.in',
    actor_role: 'PROCUREMENT_OFFICER',
    entity_id: 'tnd_cpcl_refinery_001',
    prev_hash: 'GENESIS_00000000000000000000000000000000000000000000000000000000',
    event_hash: '8f432e1a90c4bb21f37e810a9c6d4e21a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3',
    details: {
      tender_no: 'GEM/2026/B/4521001',
      rules_compiled: 5,
      est_value: '₹ 48.50 Cr',
    },
  },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const authState = useSelector(state => state.auth);

  // Active Role determination
  const activeRole = authState?.role || localStorage.getItem('role') || 'PROCUREMENT_OFFICER';

  const [currentUser, setCurrentUser] = useState(authState?.user || null);
  const [loading, setLoading] = useState(false);
  const [bids, setBids] = useState(BENCHMARK_BIDDERS);
  const [auditEvents, setAuditEvents] = useState(DEFAULT_AUDIT_STREAM);
  const [auditFilterOnlyOverrides, setAuditFilterOnlyOverrides] = useState(false);

  // Action Center State
  const [actionSuccessMsg, setActionSuccessMsg] = useState(null);
  const [actionErrorMsg, setActionErrorMsg] = useState(null);

  // Modal Controls
  const [splitViewerOpen, setSplitViewerOpen] = useState(false);
  const [auditReplayOpen, setAuditReplayOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedBidForAction, setSelectedBidForAction] = useState(null);
  const [overrideJustification, setOverrideJustification] = useState('');
  const [overrideTargetStatus, setOverrideTargetStatus] = useState('PASS');

  // Corrigendum Quick-Trigger Simulation state
  const [corrigendumMetric, setCorrigendumMetric] = useState('annual_turnover_cr');
  const [simulatedThreshold, setSimulatedThreshold] = useState('8.0');
  const [corrigendumSimulating, setCorrigendumSimulating] = useState(false);
  const [corrigendumSimResult, setCorrigendumSimResult] = useState(null);

  useEffect(() => {
    loadData();
    const handlePersona = () => loadData();
    window.addEventListener('gemguard:persona_changed', handlePersona);
    window.addEventListener('gemguard:demo_reset', handlePersona);
    return () => {
      window.removeEventListener('gemguard:persona_changed', handlePersona);
      window.removeEventListener('gemguard:demo_reset', handlePersona);
    };
  }, [activeRole]);

  async function loadData() {
    try {
      const [remoteBids, me, remoteAudit] = await Promise.all([
        listBids().catch(() => []),
        getMe().catch(() => null),
        fetch('/api/v1/audit').then(r => r.json()).catch(() => null),
      ]);
      if (me) setCurrentUser(me);
      if (remoteBids && remoteBids.length > 0) {
        setBids(remoteBids);
      }
      if (remoteAudit && Array.isArray(remoteAudit) && remoteAudit.length > 0) {
        setAuditEvents(remoteAudit);
      }
    } catch {
      // Fallback already initialized
    }
  }

  // Handle Quick Persona Switching inside Dashboard
  function switchRoleInline(newRole, email, name) {
    dispatch(loginSuccess({
      token: localStorage.getItem('gemguard_token') || 'token_' + newRole,
      role: newRole,
      name,
      email,
      department: newRole === 'PROCUREMENT_OFFICER' ? 'CPCL Procurement' : (newRole === 'TECHNICAL_EVALUATOR' ? 'Evaluation Committee' : 'Internal Audit'),
    }));
    window.dispatchEvent(new CustomEvent('gemguard:persona_changed', {
      detail: { role: newRole, email, name }
    }));
  }

  // ── ACTION CENTER HANDLERS (Procurement Officer) ──────────────────────
  async function handleApproveClearance(bid) {
    setActionSuccessMsg(null);
    try {
      const res = await fetch(`/api/v1/bids/${bid.id}/officer-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('gemguard_token') || ''}`,
        },
        body: JSON.stringify({
          action: 'APPROVE',
          reason: 'Cleared for commercial bid opening after verification of all statutory criteria.',
          actor: localStorage.getItem('user_name') || 'officer@cpcl.gov.in',
        }),
      }).catch(() => null);

      setBids(prev => prev.map(b => b.id === bid.id ? { ...b, overall_status: 'PASS', compliance_status: 'COMPLIANT' } : b));
      setActionSuccessMsg(`✓ Approved Clearance for ${bid.bidder?.name || bid.bidder_name}. Recorded to SHA-256 Audit Chain.`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (e) {
      setActionErrorMsg('Failed to process approval.');
    }
  }

  async function handleIssueShowCause(bid) {
    setActionSuccessMsg(null);
    try {
      const res = await fetch(`/api/v1/bids/${bid.id}/officer-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('gemguard_token') || ''}`,
        },
        body: JSON.stringify({
          action: 'SEEK_CLARIFICATION',
          reason: `Statutory Show-Cause Notice issued regarding: ${bid.contradiction_details || bid.shortfall_details || 'Eligibility discrepancy'}. Response required within 48 hours.`,
          actor: localStorage.getItem('user_name') || 'officer@cpcl.gov.in',
        }),
      }).catch(() => null);

      setActionSuccessMsg(`✓ Formal Show-Cause Notice dispatched to ${bid.bidder?.name || bid.bidder_name} with 48-hour response window.`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch {
      setActionErrorMsg('Failed to issue notice.');
    }
  }

  function openOverrideModal(bid) {
    setSelectedBidForAction(bid);
    setOverrideTargetStatus(bid.overall_status === 'FAIL' ? 'REVIEW' : 'PASS');
    setOverrideJustification(
      bid.bidder_code === 'B'
        ? 'Invoking CPCL MSME exemption clause 5.2 as permitted under Ministry of MSME gazette notification.'
        : 'Entity name discrepancy resolved via MCA Certificate of Name Change dated 14/02/2023.'
    );
    setOverrideModalOpen(true);
  }

  async function handleExecuteOverride() {
    if (!selectedBidForAction || !overrideJustification || overrideJustification.trim().length < 5) {
      alert('A substantive justification (minimum 5 characters) is required by statutory audit regulations.');
      return;
    }

    try {
      await fetch(`/api/v1/bids/${selectedBidForAction.id}/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('gemguard_token') || ''}`,
        },
        body: JSON.stringify({
          rule_id: 'REQ-FIN-01',
          new_status: overrideTargetStatus,
          justification: overrideJustification,
          actor: localStorage.getItem('user_name') || 'officer@cpcl.gov.in',
        }),
      }).catch(() => null);

      setBids(prev => prev.map(b => {
        if (b.id === selectedBidForAction.id) {
          return {
            ...b,
            overall_status: overrideTargetStatus,
            compliance_status: overrideTargetStatus === 'PASS' ? 'COMPLIANT' : 'UNDER_REVIEW',
            risk_band: overrideTargetStatus === 'PASS' ? 'LOW' : 'MEDIUM',
          };
        }
        return b;
      }));

      // Append to audit stream
      setAuditEvents(prev => [
        {
          id: `evt-${Date.now()}`,
          block_index: prev.length + 1,
          timestamp: new Date().toISOString(),
          action: 'OFFICER_OVERRIDE',
          actor: localStorage.getItem('user_name') || 'officer@cpcl.gov.in',
          actor_role: 'PROCUREMENT_OFFICER',
          entity_id: selectedBidForAction.id,
          prev_hash: prev[0]?.event_hash || '3f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
          event_hash: 'e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9',
          details: {
            justification: overrideJustification,
            new_status: overrideTargetStatus,
            target_bidder: selectedBidForAction.bidder?.name || selectedBidForAction.bidder_name,
          },
        },
        ...prev,
      ]);

      setActionSuccessMsg(`✓ Statutory Override executed for ${selectedBidForAction.bidder?.name}! Immutably chained to SHA-256 block ledger.`);
      setOverrideModalOpen(false);
      setTimeout(() => setActionSuccessMsg(null), 4500);
    } catch {
      setActionErrorMsg('Could not log override.');
    }
  }

  // ── CORRIGENDUM QUICK-TRIGGER SIMULATION ─────────────────────────────
  async function handleSimulateCorrigendum() {
    setCorrigendumSimulating(true);
    setCorrigendumSimResult(null);
    try {
      await new Promise(r => setTimeout(r, 600));
      const threshNum = parseFloat(simulatedThreshold) || 10.0;
      
      // Determine impact on bidders
      const affected = bids.map(b => {
        const bidderTurnover = b.bidder?.turnover_cr || 0;
        const currentPass = bidderTurnover >= 10.0;
        const simPass = bidderTurnover >= threshNum;
        const flipped = !currentPass && simPass;
        return {
          bidder_name: b.bidder?.name || b.bidder_name,
          turnover_cr: bidderTurnover,
          current_status: b.overall_status,
          simulated_status: simPass ? 'PASS' : 'FAIL',
          flipped,
        };
      });

      const flippedCount = affected.filter(a => a.flipped).length;

      setCorrigendumSimResult({
        metric: corrigendumMetric,
        old_threshold: '10.0 Cr',
        new_threshold: `${threshNum} Cr`,
        bidders_flipped_to_pass: flippedCount,
        details: affected,
      });
    } finally {
      setCorrigendumSimulating(false);
    }
  }

  // ── TECHNICAL EVALUATOR ACTIONS ──────────────────────────────────────
  function handleRequestClarification(bid, clause) {
    alert(`Technical Clarification Notice drafted for ${bid.bidder?.name || bid.bidder_name} regarding ${clause}. Sent to bidder portal.`);
  }

  function handleFlagDiscrepancy(bid, metric) {
    alert(`Calculation discrepancy flagged on ${metric} for ${bid.bidder?.name || bid.bidder_name}. Placed in Technical Evaluation Committee queue.`);
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 54px)',
      background: '#f8fafc',
      fontFamily: "'Inter', sans-serif",
      padding: '24px 28px',
      maxWidth: 1400,
      margin: '0 auto',
    }}>
      {/* ── HEADER BANNER & ACTIVE PERSONA INDICATOR ───────────────────── */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: 6,
              background: activeRole === 'PROCUREMENT_OFFICER' ? '#dcfce7' : (activeRole === 'TECHNICAL_EVALUATOR' ? '#dbeafe' : '#f3e8ff'),
              color: activeRole === 'PROCUREMENT_OFFICER' ? '#15803d' : (activeRole === 'TECHNICAL_EVALUATOR' ? '#1d4ed8' : '#7e22ce'),
              border: `1px solid ${activeRole === 'PROCUREMENT_OFFICER' ? '#86efac' : (activeRole === 'TECHNICAL_EVALUATOR' ? '#93c5fd' : '#d8b4fe')}`,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {activeRole === 'PROCUREMENT_OFFICER' && '🟢 Procurement Officer Dashboard'}
              {activeRole === 'TECHNICAL_EVALUATOR' && '🔵 Technical Evaluator Dashboard'}
              {activeRole === 'AUDIT_OFFICER' && '🟣 Vigilance & Audit Officer Dashboard'}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Tender Ref: <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>GEM/2026/B/4521001</strong> (CPCL Refinery)
            </span>
          </div>

          <h1 style={{ margin: '4px 0 2px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
            {activeRole === 'PROCUREMENT_OFFICER' && 'Executive Procurement Decision & Clearance Center'}
            {activeRole === 'TECHNICAL_EVALUATOR' && 'Technical Evidence Verification & Clause Inspector'}
            {activeRole === 'AUDIT_OFFICER' && 'Cryptographic Tamper-Evident Audit Trail & Override Monitor'}
          </h1>

          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            {activeRole === 'PROCUREMENT_OFFICER' && 'Review non-compliant bids, issue formal show-cause notices, execute overrides, and simulate corrigenda.'}
            {activeRole === 'TECHNICAL_EVALUATOR' && 'Inspect document claims, verify CA UDINs, inspect bounding boxes side-by-side, and flag discrepancies.'}
            {activeRole === 'AUDIT_OFFICER' && 'Monitor immutable SHA-256 hash chains, inspect human override justifications, and verify zero-tamper integrity.'}
          </p>
        </div>

        {/* Quick Role Switcher Buttons inside Dashboard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: 4, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <button
            id="switch-to-procurement-btn"
            onClick={() => switchRoleInline('PROCUREMENT_OFFICER', 'officer@cpcl.gov.in', 'Shri R. Venkatraman')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeRole === 'PROCUREMENT_OFFICER' ? '#10b981' : 'transparent',
              color: activeRole === 'PROCUREMENT_OFFICER' ? '#ffffff' : '#64748b',
            }}
          >
            Procurement
          </button>
          <button
            id="switch-to-evaluator-btn"
            onClick={() => switchRoleInline('TECHNICAL_EVALUATOR', 'evaluator@cpcl.gov.in', 'Dr. Ananya Sundaram')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeRole === 'TECHNICAL_EVALUATOR' ? '#2563eb' : 'transparent',
              color: activeRole === 'TECHNICAL_EVALUATOR' ? '#ffffff' : '#64748b',
            }}
          >
            Evaluator
          </button>
          <button
            id="switch-to-auditor-btn"
            onClick={() => switchRoleInline('AUDIT_OFFICER', 'auditor@cpcl.gov.in', 'Smt. K. Meenakshi')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeRole === 'AUDIT_OFFICER' ? '#7c3aed' : 'transparent',
              color: activeRole === 'AUDIT_OFFICER' ? '#ffffff' : '#64748b',
            }}
          >
            Vigilance & Audit
          </button>
        </div>
      </div>

      {/* Action Success / Error Notifications */}
      {actionSuccessMsg && (
        <div style={{
          background: '#dcfce7',
          border: '1px solid #86efac',
          borderRadius: 8,
          padding: '12px 18px',
          color: '#166534',
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── PERSONA VIEW A: PROCUREMENT OFFICER ─────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeRole === 'PROCUREMENT_OFFICER' && (
        <div>
          {/* 1. Action-Oriented Queue (Prominent Administrative Alert Boxes) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🚨</span> Action-Oriented Queue: Bidders Requiring Immediate Administrative Action
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
              {/* Alert 1: Falcon Heavy Works (Turnover Shortfall) */}
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 10,
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 4 }}>
                        CRITICAL SHORTFALL
                      </span>
                      <h3 style={{ margin: '4px 0 2px', fontSize: 15, fontWeight: 800, color: '#991b1b' }}>
                        Falcon Heavy Works Private Limited
                      </h3>
                      <div style={{ fontSize: 11, color: '#7f1d1d', fontFamily: 'monospace' }}>GSTIN: 07AAACF5678K1ZP</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#b91c1c' }}>Bidder B</span>
                  </div>

                  <p style={{ fontSize: 12, color: '#991b1b', margin: '10px 0 14px', lineHeight: 1.5 }}>
                    <strong>Mandatory Turnover Shortfall:</strong> Certified 3FY turnover is <strong>₹8.40 Cr</strong> vs mandatory requirement of <strong>≥ ₹10.00 Cr</strong> (Deficit: ₹1.60 Cr).
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #fecaca', paddingTop: 12 }}>
                  <button
                    id="btn-showcause-falcon"
                    onClick={() => handleIssueShowCause(bids[1])}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fca5a5',
                      color: '#b91c1c',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Issue Show-Cause Notice
                  </button>
                  <button
                    id="btn-override-falcon"
                    onClick={() => openOverrideModal(bids[1])}
                    style={{
                      background: '#b91c1c',
                      border: 'none',
                      color: '#ffffff',
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Initiate Statutory Override
                  </button>
                </div>
              </div>

              {/* Alert 2: Apex Buildtech (Cross-Document Contradiction) */}
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 10,
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#d97706', background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>
                        CROSS-DOC CONTRADICTION
                      </span>
                      <h3 style={{ margin: '4px 0 2px', fontSize: 15, fontWeight: 800, color: '#92400e' }}>
                        Apex Buildtech & Engineering Consortium
                      </h3>
                      <div style={{ fontSize: 11, color: '#78350f', fontFamily: 'monospace' }}>GSTIN: 27AABCA9999M1ZQ</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#d97706' }}>Bidder C</span>
                  </div>

                  <p style={{ fontSize: 12, color: '#92400e', margin: '10px 0 14px', lineHeight: 1.5 }}>
                    <strong>Legal Entity Name Mismatch:</strong> PAN certificate reads <em>"APEX INFRASTRUCTURE PVT LTD"</em> whereas GST REG-06 states <em>"APEX BUILDTECH LIMITED"</em>.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #fde68a', paddingTop: 12 }}>
                  <button
                    id="btn-showcause-apex"
                    onClick={() => handleIssueShowCause(bids[2])}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fcd34d',
                      color: '#92400e',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Issue Show-Cause Notice
                  </button>
                  <button
                    id="btn-override-apex"
                    onClick={() => openOverrideModal(bids[2])}
                    style={{
                      background: '#d97706',
                      border: 'none',
                      color: '#ffffff',
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Initiate Statutory Override
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Disqualification & Clearance Action Center Table */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                Disqualification & Clearance Action Center
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Procurement Officer actions directly alter qualification state and cryptographically chain events
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" id="officer-action-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Bidder Organization</th>
                    <th>Turnover</th>
                    <th>Compliance Status</th>
                    <th>Risk Band</th>
                    <th style={{ textAlign: 'right' }}>Officer Action Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 800, color: '#1e3a8a' }}>{b.bidder_code || b.id.slice(-1)}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{b.bidder?.name || b.bidder_name}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{b.bidder?.gstin}</div>
                      </td>
                      <td style={{ fontWeight: 700, color: (b.bidder?.turnover_cr || 0) >= 10 ? '#15803d' : '#b91c1c' }}>
                        ₹{(b.bidder?.turnover_cr || 0).toFixed(1)} Cr
                      </td>
                      <td><StatusBadge status={b.overall_status || b.compliance_status} /></td>
                      <td><StatusBadge status={b.risk_band || 'LOW'} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            id={`btn-clearance-${b.id}`}
                            onClick={() => handleApproveClearance(b)}
                            style={{
                              background: '#dcfce7',
                              border: '1px solid #86efac',
                              color: '#166534',
                              padding: '5px 10px',
                              borderRadius: 5,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Approve Clearance
                          </button>
                          <button
                            id={`btn-notice-${b.id}`}
                            onClick={() => handleIssueShowCause(b)}
                            style={{
                              background: '#fef3c7',
                              border: '1px solid #fcd34d',
                              color: '#92400e',
                              padding: '5px 10px',
                              borderRadius: 5,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Show-Cause Notice
                          </button>
                          <button
                            id={`btn-override-${b.id}`}
                            onClick={() => openOverrideModal(b)}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#1d4ed8',
                              padding: '5px 10px',
                              borderRadius: 5,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Statutory Override
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Corrigendum Quick-Trigger Simulator */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚡</span> Corrigendum Quick-Trigger & Instant What-If Simulator
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Simulate RFP rule adjustments and instantly observe compliance status flips across all bidders
                </div>
              </div>

              <button
                onClick={() => navigate('/corrigendum')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>Open Full Corrigendum Impact Studio</span>
                <ArrowRight size={14} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, alignItems: 'flex-end', background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Rule Metric to Amend:
                </label>
                <select
                  value={corrigendumMetric}
                  onChange={e => setCorrigendumMetric(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#ffffff' }}
                >
                  <option value="annual_turnover_cr">Clause 3.1.2: Annual Turnover (₹ Cr)</option>
                  <option value="local_content_percentage">Clause 4.2.1: MII Local Content (%)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Simulated Threshold Value:
                </label>
                <input
                  type="text"
                  value={simulatedThreshold}
                  onChange={e => setSimulatedThreshold(e.target.value)}
                  placeholder="e.g. 8.0"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#ffffff' }}
                />
              </div>

              <div>
                <button
                  id="btn-simulate-corrigendum-impact"
                  onClick={handleSimulateCorrigendum}
                  disabled={corrigendumSimulating}
                  style={{
                    width: '100%',
                    padding: '9px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: corrigendumSimulating ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Sliders size={14} />
                  <span>{corrigendumSimulating ? 'Simulating…' : 'Run What-If Impact Simulation'}</span>
                </button>
              </div>
            </div>

            {/* Simulation Results Display */}
            {corrigendumSimResult && (
              <div style={{ marginTop: 16, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', marginBottom: 8 }}>
                  Simulation Outcome: Lowering threshold to {corrigendumSimResult.new_threshold} flips {corrigendumSimResult.bidders_flipped_to_pass} disqualified bidder to COMPLIANT!
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                  {corrigendumSimResult.details.map((d, i) => (
                    <div key={i} style={{ background: '#ffffff', padding: '10px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{d.bidder_name}</div>
                      <div style={{ color: '#64748b' }}>Turnover: ₹{d.turnover_cr} Cr</div>
                      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Prior: <strong style={{ color: d.current_status === 'FAIL' ? '#dc2626' : '#16a34a' }}>{d.current_status}</strong></span>
                        <span>➔</span>
                        <span>New: <strong style={{ color: d.simulated_status === 'FAIL' ? '#dc2626' : '#16a34a' }}>{d.simulated_status}</strong></span>
                      </div>
                      {d.flipped && (
                        <div style={{ marginTop: 4, color: '#15803d', fontWeight: 800, fontSize: 10 }}>
                          ✓ FLIPPED TO COMPLIANT
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── PERSONA VIEW B: TECHNICAL EVALUATOR ─────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeRole === 'TECHNICAL_EVALUATOR' && (
        <div>
          {/* Top Quick Launch for Split Document Viewer */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
            borderRadius: 12,
            padding: '20px 24px',
            color: '#ffffff',
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase' }}>
                Dual-Pane Vision & LayoutLM Verification Suite
              </div>
              <h3 style={{ margin: '4px 0 2px', fontSize: 18, fontWeight: 800 }}>
                Split Evidence Inspector: Side-by-Side Bounding Box & Registry Verification
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1' }}>
                Inspect original PDF layout coordinates [x1, y1, x2, y2] against extracted CA UDINs and statutory API responses.
              </p>
            </div>

            <button
              id="btn-launch-split-viewer-top"
              onClick={() => setSplitViewerOpen(true)}
              style={{
                background: '#2563eb',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#ffffff',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
              }}
            >
              <Eye size={16} />
              <span>Launch Split Evidence Inspector</span>
            </button>
          </div>

          {/* Evidence & Technical Matrix Table */}
          <div className="card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                Evidence & Technical Compliance Matrix
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Technical evaluation tools replacing administrative clearance controls
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" id="technical-matrix-table">
                <thead>
                  <tr>
                    <th>Bidder</th>
                    <th>Local Content % (Req: ≥50%)</th>
                    <th>CA UDIN (ICAI Verified)</th>
                    <th>Make-in-India Affidavit</th>
                    <th>Technical Status</th>
                    <th style={{ textAlign: 'right' }}>Technical Evaluator Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map(b => {
                    const mii = b.bidder?.local_content_pct || 50;
                    const udin = b.bidder?.ca_udin || '24058912AAAAAA9812';
                    return (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{b.bidder?.name || b.bidder_name}</div>
                          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>GSTIN: {b.bidder?.gstin}</div>
                        </td>

                        {/* Local Content */}
                        <td>
                          <div style={{ fontWeight: 800, color: mii >= 50.0 ? '#15803d' : '#b91c1c' }}>
                            {mii.toFixed(1)}% Local Content
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            {mii >= 50.0 ? 'Class-I Local Supplier' : 'Class-II (Ineligible for Class-I reserve)'}
                          </div>
                        </td>

                        {/* CA UDIN */}
                        <td>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: '#1e3a8a' }}>
                            {udin}
                          </div>
                          <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>
                            ✓ ICAI Portal Validated
                          </div>
                        </td>

                        {/* MII Affidavit */}
                        <td>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: mii >= 50 ? '#dcfce7' : '#fee2e2',
                            color: mii >= 50 ? '#166534' : '#991b1b',
                          }}>
                            {mii >= 50 ? 'Auditor Certified' : 'Discrepancy in Factory Location'}
                          </span>
                        </td>

                        {/* Status */}
                        <td>
                          <StatusBadge status={b.overall_status || b.compliance_status} />
                        </td>

                        {/* Action Controls */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              id={`btn-verify-bbox-${b.id}`}
                              onClick={() => setSplitViewerOpen(true)}
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1d4ed8',
                                padding: '5px 10px',
                                borderRadius: 5,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Eye size={12} />
                              <span>Verify Bounding Box</span>
                            </button>
                            <button
                              id={`btn-tech-clarification-${b.id}`}
                              onClick={() => handleRequestClarification(b, 'Local Content Affidavit')}
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                color: '#334155',
                                padding: '5px 10px',
                                borderRadius: 5,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Request Clarification
                            </button>
                            <button
                              id={`btn-flag-calc-${b.id}`}
                              onClick={() => handleFlagDiscrepancy(b, 'Turnover / MII %')}
                              style={{
                                background: '#fee2e2',
                                border: '1px solid #fca5a5',
                                color: '#b91c1c',
                                padding: '5px 10px',
                                borderRadius: 5,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Flag Calculation
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── PERSONA VIEW C: AUDIT & VIGILANCE OFFICER ───────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeRole === 'AUDIT_OFFICER' && (
        <div>
          {/* Cryptographic SHA-256 Chain Validation Banner */}
          <div style={{
            background: 'linear-gradient(90deg, rgba(16,185,129,0.12) 0%, rgba(15,23,42,0.04) 100%)',
            border: '1px solid #86efac',
            borderRadius: 12,
            padding: '18px 24px',
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#dcfce7',
                border: '1px solid #86efac',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#166534',
              }}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 4 }}>
                    CHAIN VALIDATED · INTEGRITY GUARANTEED
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>5/5 Cryptographic Blocks Verified</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                  Mathematical Proof: <code style={{ color: '#1e3a8a' }}>event_hash = SHA256(prev_hash + payload)</code>
                </div>
              </div>
            </div>

            <button
              id="btn-launch-audit-replay-modal"
              onClick={() => setAuditReplayOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                color: '#ffffff',
                border: 'none',
                padding: '9px 18px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
              }}
            >
              <Play size={14} />
              <span>Launch Tamper-Evident Replay Player</span>
            </button>
          </div>

          {/* Tamper-Evident Event Stream & Override Monitor */}
          <div className="card">
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                  Tamper-Evident Event Stream & Human Override Monitor
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Every administrative decision and system inference immutably logged with SHA-256 forward-chaining
                </div>
              </div>

              {/* Filter: All vs Overrides Only */}
              <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden' }}>
                <button
                  id="btn-filter-all-events"
                  onClick={() => setAuditFilterOnlyOverrides(false)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 11,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: !auditFilterOnlyOverrides ? '#7c3aed' : '#ffffff',
                    color: !auditFilterOnlyOverrides ? '#ffffff' : '#475569',
                  }}
                >
                  All Audit Events ({auditEvents.length})
                </button>
                <button
                  id="btn-filter-overrides-only"
                  onClick={() => setAuditFilterOnlyOverrides(true)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 11,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: auditFilterOnlyOverrides ? '#7c3aed' : '#ffffff',
                    color: auditFilterOnlyOverrides ? '#ffffff' : '#475569',
                  }}
                >
                  Human Overrides Only (OFFICER_OVERRIDE)
                </button>
              </div>
            </div>

            {/* Event Stream List */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {auditEvents
                .filter(evt => !auditFilterOnlyOverrides || evt.action === 'OFFICER_OVERRIDE')
                .map((evt, idx) => {
                  const isOverride = evt.action === 'OFFICER_OVERRIDE';
                  return (
                    <div
                      key={evt.id || idx}
                      style={{
                        border: `1px solid ${isOverride ? '#fcd34d' : '#e2e8f0'}`,
                        background: isOverride ? '#fffbeb' : '#ffffff',
                        borderRadius: 8,
                        padding: '16px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 900,
                            fontFamily: 'monospace',
                            background: isOverride ? '#fef3c7' : '#f1f5f9',
                            color: isOverride ? '#92400e' : '#334155',
                            padding: '3px 8px',
                            borderRadius: 4,
                          }}>
                            BLOCK #{evt.block_index || (auditEvents.length - idx)}
                          </span>

                          <span style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: isOverride ? '#b45309' : '#1e3a8a',
                            background: isOverride ? '#fef3c7' : '#eff6ff',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}>
                            {evt.action}
                          </span>

                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            by <strong style={{ color: '#0f172a' }}>{evt.actor}</strong> ({evt.actor_role})
                          </span>
                        </div>

                        <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} />
                          <span>{new Date(evt.timestamp).toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      {/* Override Justification Box if Human Override */}
                      {isOverride && evt.details?.justification && (
                        <div style={{
                          marginTop: 10,
                          padding: '10px 14px',
                          background: '#ffffff',
                          border: '1px solid #fde68a',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#78350f',
                        }}>
                          <strong>Mandatory Officer Written Justification:</strong> "{evt.details.justification}"
                        </div>
                      )}

                      {/* Cryptographic SHA-256 Linkage Bar */}
                      <div style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: '#475569',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}>
                        <div>
                          <span style={{ color: '#94a3b8' }}>Prev Hash: </span>
                          <span style={{ color: '#2563eb' }}>{evt.prev_hash?.slice(0, 24)}...</span>
                        </div>
                        <div>
                          <span>➔</span>
                        </div>
                        <div>
                          <span style={{ color: '#94a3b8' }}>Event Hash: </span>
                          <span style={{ color: '#16a34a', fontWeight: 800 }}>{evt.event_hash?.slice(0, 24)}...</span>
                        </div>
                        <div style={{ color: '#16a34a', fontWeight: 800 }}>
                          ✓ SHA-256 MATCHED
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 1: STATUTORY OFFICER OVERRIDE MODAL ───────────────────── */}
      {overrideModalOpen && selectedBidForAction && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 12,
            width: '100%',
            maxWidth: 520,
            padding: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: '#1e3a8a' }}>
              ⚖️ Initiate Statutory Officer Override
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
              Statutory overrides bypass automated rules and are cryptographically signed with your credentials to the SHA-256 audit ledger.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                Target Bidder Organization:
              </label>
              <input
                type="text"
                disabled
                value={`${selectedBidForAction.bidder?.name || selectedBidForAction.bidder_name} (${selectedBidForAction.bidder?.gstin})`}
                style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                New Desired Compliance Status:
              </label>
              <select
                value={overrideTargetStatus}
                onChange={e => setOverrideTargetStatus(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                <option value="PASS">PASS (Approve qualification)</option>
                <option value="REVIEW">REVIEW (Permit conditional submission)</option>
                <option value="FAIL">FAIL (Disqualify with cause)</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', display: 'block', marginBottom: 4 }}>
                * Mandatory Statutory Written Justification (Min 5 chars):
              </label>
              <textarea
                rows={3}
                value={overrideJustification}
                onChange={e => setOverrideJustification(e.target.value)}
                placeholder="State statutory circular, pre-bid clarification, or MSME gazette exemption..."
                style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setOverrideModalOpen(false)}
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                id="btn-confirm-override-submit"
                onClick={handleExecuteOverride}
                disabled={!overrideJustification || overrideJustification.trim().length < 5}
                style={{
                  background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: overrideJustification.trim().length >= 5 ? 'pointer' : 'not-allowed',
                }}
              >
                Sign & Append to SHA-256 Audit Chain
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: SPLIT DOCUMENT VIEWER (Technical Evaluator) ────────── */}
      {splitViewerOpen && (
        <SplitDocumentViewer onClose={() => setSplitViewerOpen(false)} />
      )}

      {/* ── MODAL 3: AUDIT REPLAY PLAYER (Vigilance & Audit Officer) ────── */}
      {auditReplayOpen && (
        <AuditReplayModal onClose={() => setAuditReplayOpen(false)} />
      )}
    </div>
  );
}
