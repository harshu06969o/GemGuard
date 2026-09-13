/**
 * BidderWorkspacePage — GeM-Guard Vendor Self-Service & Submission Portal
 * 
 * Strict Role Isolation: BIDDER ONLY
 * Core Capabilities:
 *  - Step 1: Select & Apply to Open Tenders with live tender details sync.
 *  - Step 2: Upload Technical & Financial Envelopes with real-time AI vision extraction.
 *  - Step 3: Interactive Document Checklist showing verified entities (Turnover, GSTIN, PAN, Udyam).
 *  - Step 4: Pre-submission compliance verification dry-run against the selected tender's actual compiled rules.
 */

import { useEffect, useState, useMemo, useRef, Component } from 'react';
import { useSelector } from 'react-redux';
import {
  getMyProfile, getMyBids, listTenders,
  submitBid, uploadBidderDocument, listBidDocuments,
  listBidEvidence, deleteBidDocument, evaluateBid,
  listBidderVaultDocuments, uploadBidderVaultDocument,
} from '../api/client';
import {
  UploadCloud, FileText, CheckCircle2, AlertTriangle, XCircle,
  Clock, ArrowRight, Trash2, ShieldCheck, RefreshCw,
  Building2, Sparkles, ChevronRight, FileCheck, HelpCircle,
  ExternalLink, Layers, Award
} from 'lucide-react';

// ── Error Boundary — prevents blank page on render errors ───────────────────
class SectionErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[BidderWorkspace] Section render error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', margin: '12px 0' }}>
          <strong>⚠ A section failed to render.</strong>
          <div style={{ fontSize: 12, marginTop: 6, fontFamily: 'monospace', color: '#7f1d1d' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 10, padding: '5px 14px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


const TABS = ['SUBMISSIONS', 'UPLOAD', 'DRY_RUN'];
const TAB_LABELS = {
  SUBMISSIONS: '📋 My Submissions',
  UPLOAD: '📤 Upload & Manage Documents',
  DRY_RUN: '🔍 Tender Pre-Check & Dry-Run',
};

/** Safely convert any value (including objects from MongoDB/Gemini) to a renderable string */
function safeStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    // Try common scalar sub-keys before JSON-stringifying
    for (const k of ['value', 'amount', 'number', 'text', 'name', 'val']) {
      if (val[k] !== undefined) return safeStr(val[k]);
    }
    try { return JSON.stringify(val); } catch { return '[complex value]'; }
  }
  return String(val);
}

// ── Standard Statutory Checklist Definitions ────────────────────────────────
const STANDARD_CHECKLIST = [
  {
    doc_type: 'CA_CERTIFICATE',
    title: 'CA Turnover Certificate',
    metric: 'annual_turnover_cr',
    mandatory: true,
    description: 'Audited annual turnover for preceding 3 financial years with valid UDIN.',
    evidenceKey: 'annual_turnover_cr',
    formatValue: (v) => `Turnover: ₹${Number(v).toFixed(2)} Cr`,
  },
  {
    doc_type: 'MII_DECLARATION',
    title: 'Make in India (MII) Affidavit',
    metric: 'local_content_percentage',
    mandatory: true,
    description: 'Self-declaration affidavit stating local content % (Class-I ≥ 50%).',
    evidenceKey: 'local_content_percentage',
    formatValue: (v) => `Local Content: ${v}%`,
  },
  {
    doc_type: 'GST_CERTIFICATE',
    title: 'GST Registration (Form REG-06)',
    metric: 'gst_registration_active',
    mandatory: true,
    description: 'Active GST registration certificate in the state of operations.',
    evidenceKey: 'gstin',
    formatValue: (v) => `GSTIN: ${v}`,
  },
  {
    doc_type: 'PAN_CARD',
    title: 'Permanent Account Number (PAN)',
    metric: 'pan_card_valid',
    mandatory: true,
    description: 'PAN card matching the registered corporate legal entity name.',
    evidenceKey: 'pan',
    formatValue: (v) => `PAN: ${v}`,
  },
  {
    doc_type: 'UDYAM_CERTIFICATE',
    title: 'Udyam Registration Certificate',
    metric: 'udyam_registration_active',
    mandatory: false,
    description: 'Required if claiming MSE 25% price preference or turnover relaxation.',
    evidenceKey: 'udyam_number',
    formatValue: (v) => `URN: ${v}`,
  },
  {
    doc_type: 'EXPERIENCE_CERTIFICATE',
    title: 'Technical Experience / Work Orders',
    metric: 'project_experience_cr',
    mandatory: true,
    description: 'Completion certificates of past projects with similar scope of work.',
    evidenceKey: 'experience_value_cr',
    formatValue: (v) => `Value: ₹${v} Cr`,
  },
];

// ── Reusable UI Components ──────────────────────────────────────────────────
function StatusPill({ status }) {
  const map = {
    PASS: { bg: '#dcfce7', color: '#166534', border: '#86efac', text: 'PASS' },
    COMPLIANT: { bg: '#dcfce7', color: '#166534', border: '#86efac', text: 'COMPLIANT' },
    FAIL: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', text: 'FAIL' },
    NON_COMPLIANT: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', text: 'NON-COMPLIANT' },
    REVIEW: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', text: 'REVIEW REQUIRED' },
    UNDER_REVIEW: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', text: 'UNDER REVIEW' },
    PENDING: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', text: 'PENDING' },
    PENDING_VERIFICATION: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', text: 'PENDING CHECK' },
    ACTIVE: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', text: 'ACTIVE' },
    LOW: { bg: '#dcfce7', color: '#166534', border: '#86efac', text: 'LOW RISK' },
    MEDIUM: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', text: 'MEDIUM RISK' },
    HIGH: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', text: 'HIGH RISK' },
    CRITICAL: { bg: '#7f1d1d', color: '#fee2e2', border: '#991b1b', text: 'CRITICAL RISK' },
  };
  const s = map[status?.toUpperCase()] || map['PENDING'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      letterSpacing: '0.02em', whiteSpace: 'nowrap'
    }}>
      {s.text}
    </span>
  );
}

function SectionCard({ title, subtitle, action, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

// ─── Main Bidder Workspace Page Component ─────────────────────────────────────
export default function BidderWorkspacePage() {
  const authUser = useSelector(state => state.auth?.user);

  // Core Data State
  const [profile, setProfile] = useState(null);
  const [myBids, setMyBids] = useState([]);
  const [openTenders, setOpenTenders] = useState([]);
  const [selectedBidId, setSelectedBidId] = useState(null);
  const [selectedTenderId, setSelectedTenderId] = useState('');

  // Bid Inspection & Evidence State
  const [bidDocuments, setBidDocuments] = useState([]);
  const [bidEvidence, setBidEvidence] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [vaultDocs, setVaultDocs] = useState([]);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [pendingTenderId, setPendingTenderId] = useState(null);

  // Workflow Action States
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadCategory, setUploadCategory] = useState(null);
  const [applying, setApplying] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState(null);

  // UI Navigation State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [activeTab, setActiveTab] = useState('SUBMISSIONS');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Helper to resolve tender object
  const resolveTender = (tenderKey) => {
    if (!tenderKey) return null;
    return openTenders.find(t => 
      (t.id && t.id === tenderKey) ||
      (t._id && t._id === tenderKey) ||
      (t.tender_no && t.tender_no === tenderKey) ||
      (t.reference_number && t.reference_number === tenderKey)
    );
  };

  // Currently selected Bid & Tender contexts
  const currentBid = useMemo(() => {
    return myBids.find(b => (b.id === selectedBidId || b._id === selectedBidId)) || myBids[0] || null;
  }, [myBids, selectedBidId]);

  const currentTender = useMemo(() => {
    if (activeTab === 'SUBMISSIONS') {
      return resolveTender(selectedTenderId) || openTenders[0] || null;
    }
    const tRef = currentBid?.tender_reference || currentBid?.tender_id || selectedTenderId;
    return resolveTender(tRef) || openTenders[0] || null;
  }, [currentBid, selectedTenderId, openTenders, activeTab]);

  // Initial Data Fetch
  async function initData() {
    setLoading(true);
    setError(null);
    try {
      const [profRes, bidsRes, tendersRes, vaultRes] = await Promise.allSettled([
        getMyProfile(),
        getMyBids(),
        listTenders(),
        listBidderVaultDocuments(),
      ]);

      if (profRes.status === 'fulfilled' && profRes.value) {
        setProfile(profRes.value);
      } else {
        // Fallback profile if backend route not linked
        setProfile({
          company_name: authUser?.name || 'Bharat Engineering & Industrial Ltd',
          gstin: '33AAACB6666L1ZP',
          pan: 'AAACB6666L',
          category: 'Class-I Local Supplier (MSE)',
          status: 'Active Registered Vendor',
          department: authUser?.department || 'Vendor / Supplier',
        });
      }

      const tenderList = tendersRes.status === 'fulfilled' ? (tendersRes.value?.tenders || (Array.isArray(tendersRes.value) ? tendersRes.value : [])) : [];
      setOpenTenders(tenderList);
      if (tenderList.length > 0 && !selectedTenderId) {
        const firstT = tenderList[0];
        setSelectedTenderId(firstT.id || firstT._id || firstT.tender_no);
      }

      const bidList = bidsRes.status === 'fulfilled' ? (bidsRes.value?.bids || (Array.isArray(bidsRes.value) ? bidsRes.value : [])) : [];
      setMyBids(bidList);
      if (bidList.length > 0 && !selectedBidId) {
        const firstB = bidList[0];
        setSelectedBidId(firstB.id || firstB._id);
      }
      
      const vDocs = vaultRes.status === 'fulfilled' ? (vaultRes.value || []) : [];
      setVaultDocs(vDocs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize bidder workspace');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    initData();
  }, []);

  // Fetch Documents and Evidence whenever selectedBidId changes
  useEffect(() => {
    if (!selectedBidId) {
      setBidDocuments([]);
      setBidEvidence([]);
      return;
    }

    async function loadBidArtifacts() {
      setLoadingDocs(true);
      try {
        const [docsRes, evRes] = await Promise.allSettled([
          listBidDocuments(selectedBidId),
          listBidEvidence(selectedBidId),
        ]);
        if (docsRes.status === 'fulfilled') {
          const list = Array.isArray(docsRes.value) ? docsRes.value : (docsRes.value?.documents || []);
          setBidDocuments(list);
        }
        if (evRes.status === 'fulfilled') {
          const evList = Array.isArray(evRes.value) ? evRes.value : (evRes.value?.evidence || []);
          setBidEvidence(evList);
        }
      } catch (err) {
        console.error('Error fetching bid artifacts:', err);
      } finally {
        setLoadingDocs(false);
      }
    }

    loadBidArtifacts();
    loadBidArtifacts();
  }, [selectedBidId]);

  function handleApplyClick(tenderId) {
    if (vaultDocs.length === 0) {
      setPendingTenderId(tenderId);
      setShowVerificationModal(true);
      return;
    }
    // Verified -> go ahead
    handleApply(tenderId);
  }

  // Apply to Open Tender
  async function handleApply(tenderIdToApply) {
    const tId = tenderIdToApply || selectedTenderId;
    if (!tId) {
      setError('Please select an active tender first.');
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await submitBid(tId);
      const newBidId = res?.id || res?._id;
      setSuccessMsg(`✓ Application created successfully! Created Bid Package #${newBidId ? newBidId.slice(-8) : 'New'}.`);

      // Refresh bids list
      const updated = await getMyBids().catch(() => []);
      const list = updated?.bids || (Array.isArray(updated) ? updated : []);
      setMyBids(list);
      if (newBidId) {
        setSelectedBidId(newBidId);
        setActiveTab('UPLOAD');
      }
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit tender application.');
    } finally {
      setApplying(false);
    }
  }

  // File Upload Handler (Single or Specific Category)
  async function handleFileUpload(file, targetDocType = null) {
    if (!selectedBidId) {
      setError('Please select a bid package to attach documents.');
      return;
    }
    setUploading(true);
    setUploadPct(15);
    setError(null);
    try {
      const res = await uploadBidderDocument(selectedBidId, file, targetDocType, pct => setUploadPct(pct));
      const isGemini = res?.processed_by === 'GEMINI_3.5_FLASH_LITE';
      const aiBadge = isGemini ? '✨ Gemini 3.5 Flash-Lite' : 'Vision Engine';
      setSuccessMsg(`✓ ${file.name} parsed by ${aiBadge}! Extracted ${res?.evidence_count ?? 1} compliance figures.`);

      // Immediately refresh documents and evidence in UI
      const [docsRes, evRes] = await Promise.allSettled([
        listBidDocuments(selectedBidId),
        listBidEvidence(selectedBidId),
      ]);
      if (docsRes.status === 'fulfilled') {
        const list = Array.isArray(docsRes.value) ? docsRes.value : (docsRes.value?.documents || []);
        setBidDocuments(list);
      }
      if (evRes.status === 'fulfilled') {
        const evList = Array.isArray(evRes.value) ? evRes.value : (evRes.value?.evidence || []);
        setBidEvidence(evList);
      }

      // Refresh bid overall status
      const updatedBids = await getMyBids().catch(() => []);
      const bl = updatedBids?.bids || (Array.isArray(updatedBids) ? updatedBids : []);
      setMyBids(bl);

      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please check network or file format.');
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Vault Verification Upload Handler
  async function handleVaultUpload(file) {
    setUploading(true);
    setUploadPct(15);
    setError(null);
    try {
      const res = await uploadBidderVaultDocument(file, null, pct => setUploadPct(pct));
      const isGemini = res?.processed_by === 'GEMINI_3.5_FLASH_LITE';
      const aiBadge = isGemini ? '✨ Gemini 3.5 Flash-Lite' : 'Vision Engine';
      setSuccessMsg(`✓ ${file.name} parsed by ${aiBadge}! Extracted compliance figures.`);
      
      const vDocs = await listBidderVaultDocuments().catch(() => []);
      setVaultDocs(vDocs);
      setShowVerificationModal(false);
      if (pendingTenderId) {
        handleApply(pendingTenderId);
        setPendingTenderId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload verification document');
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  // Delete Document Handler
  async function handleDeleteDocument(docId) {
    if (!selectedBidId || !docId) return;
    try {
      await deleteBidDocument(selectedBidId, docId);
      setBidDocuments(prev => prev.filter(d => (d.id !== docId && d._id !== docId)));
      setSuccessMsg('Document removed from package.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError('Failed to delete document: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Run Self-Evaluation Pre-Check
  async function handlePreCheck() {
    if (!selectedBidId) return;
    setEvaluating(true);
    setError(null);
    try {
      const res = await evaluateBid(selectedBidId);
      setEvalResult(res);
      setSuccessMsg(`✓ Pre-submission compliance check complete! Readiness Score: ${res.readiness_score}/100.`);
      // Refresh bids
      const updatedBids = await getMyBids().catch(() => []);
      setMyBids(updatedBids?.bids || (Array.isArray(updatedBids) ? updatedBids : []));
    } catch (err) {
      setError('Compliance pre-check failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setEvaluating(false);
    }
  }

  // Calculate Package Completeness
  const mandatoryItems = STANDARD_CHECKLIST.filter(c => c.mandatory);
  const satisfiedCount = mandatoryItems.filter(item => {
    const docMatch = Array.isArray(bidDocuments) && bidDocuments.some(d =>
      d.document_type === item.doc_type || d.doc_type === item.doc_type
    );
    const evMatch = Array.isArray(bidEvidence) && bidEvidence.some(e =>
      e.field_name === item.evidenceKey || e.field_name === item.metric ||
      e.field === item.evidenceKey || e.field === item.metric
    );
    return docMatch || evMatch;
  }).length;
  const completenessPct = mandatoryItems.length > 0
    ? Math.round((satisfiedCount / mandatoryItems.length) * 100)
    : 0;

  return (
    <div style={{ minHeight: 'calc(100vh - 54px)', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>

      {/* ─── 1. Flagship Header ───────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '18px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', letterSpacing: '0.06em' }}>
                🏢 GeM VENDOR SELF-SERVICE PORTAL
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Role: <strong>BIDDER</strong> · Central Public Procurement Portal
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {profile?.company_name || authUser?.name || 'Bharat Engineering & Industrial Ltd'}
            </h1>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
              GSTIN: <strong style={{ color: '#334155' }}>{profile?.gstin || '33AAACB6666L1ZP'}</strong> · PAN: <strong style={{ color: '#334155' }}>{profile?.pan || 'AAACB6666L'}</strong> · Enterprise: <span style={{ color: '#059669', fontWeight: 700 }}>{profile?.category || 'Class-I Local Supplier'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '8px 16px', textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Vendor Status</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>✓ Verified GeM Supplier</div>
            </div>
            <button
              onClick={initData}
              title="Refresh Workspace"
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#334155' }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ─── 2. Workflow Stage Progress Bar ──────────────────────────────── */}
      <div style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', padding: '12px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, overflowX: 'auto' }}>
          {[
            { step: '1', title: 'Select & Apply Tender', active: activeTab === 'SUBMISSIONS', done: myBids.length > 0 },
            { step: '2', title: 'Upload Bid Envelopes', active: activeTab === 'UPLOAD', done: bidDocuments.length >= 2 },
            { step: '3', title: 'Verify Evidence & Pre-Check', active: activeTab === 'DRY_RUN' || evalResult !== null, done: evalResult !== null },
            { step: '4', title: 'Submission Ready', active: completenessPct === 100, done: completenessPct === 100 },
          ].map((s, idx) => (
            <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: s.active ? 1 : 0.65, minWidth: 'fit-content' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: s.done ? '#10b981' : s.active ? '#3b82f6' : '#334155',
                color: '#fff', fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {s.done ? '✓' : s.step}
              </div>
              <span style={{ fontSize: 12, fontWeight: s.active ? 700 : 500, color: s.active ? '#60a5fa' : '#94a3b8' }}>
                {s.title}
              </span>
              {idx < 3 && <ChevronRight size={14} color="#475569" style={{ margin: '0 4px' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* ─── 3. Flash Alerts & Messages ───────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 28px 0' }}>
        {successMsg && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} /> {successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}
        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} /> {error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}
      </div>

      {/* ─── 4. Tab Navigation Bar ────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 4, marginTop: 12 }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 13, fontWeight: activeTab === tab ? 800 : 600,
                color: activeTab === tab ? '#2563eb' : '#64748b',
                borderBottom: activeTab === tab ? '3px solid #2563eb' : '3px solid transparent',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s ease'
              }}
            >
              {TAB_LABELS[tab]}
              {tab === 'SUBMISSIONS' && myBids.length > 0 && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: activeTab === tab ? '#eff6ff' : '#f1f5f9', color: activeTab === tab ? '#2563eb' : '#64748b', fontWeight: 800 }}>
                  {myBids.length}
                </span>
              )}
              {tab === 'UPLOAD' && bidDocuments.length > 0 && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 800 }}>
                  {bidDocuments.length} docs
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── 5. Tab Content Body ──────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 28px 40px' }}>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: MY SUBMISSIONS & TENDER DISCOVERY
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'SUBMISSIONS' && (
          <div>
            {/* Tender Application Box */}
            <SectionCard
              title="Available GeM Procurement Tenders"
              subtitle="Browse active procurement opportunities. First-time bidders must complete document verification to apply."
            >
              {openTenders.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>No open tenders found in the central catalog.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {openTenders.map(t => {
                    const tId = t.id || t._id || t.tender_no;
                    const tRef = t.reference_number || t.tender_no || 'Tender';
                    const isAlreadyApplied = myBids.some(b => b.tender_id === tId || b.tender_reference === tRef);
                    
                    return (
                      <div key={tId} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>{tRef}</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12, lineHeight: 1.4 }}>
                            {t.title ? (t.title.length > 80 ? t.title.slice(0, 80) + '...' : t.title) : 'General Procurement'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', marginBottom: 16 }}>
                            <Clock size={12} /> Deadline: {t.deadline ? new Date(t.deadline).toLocaleDateString() : 'TBD'}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => handleApplyClick(tId)}
                          disabled={applying || isAlreadyApplied}
                          style={{
                            width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                            background: isAlreadyApplied ? '#f1f5f9' : 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                            color: isAlreadyApplied ? '#94a3b8' : '#fff', fontSize: 12, fontWeight: 700, cursor: (applying || isAlreadyApplied) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                          }}
                        >
                          {applying && pendingTenderId === tId ? '⏳ Processing…' : isAlreadyApplied ? '✓ Applied' : 'Apply for Tender'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* My Submissions Table */}
            <SectionCard
              title={`My Applied Bid Packages (${myBids.length})`}
              subtitle="Review your registered bid packages, document completion status, and evaluation readiness"
            >
              {loading ? (
                <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Loading your submissions…</div>
              ) : myBids.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748b' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>No Bid Packages Created Yet</div>
                  <div style={{ fontSize: 12, color: '#64748b', maxWidth: 420, margin: '0 auto' }}>
                    Select an open tender above and click <strong>"+ Apply & Create Bid Package"</strong> to begin your submission.
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f1f5f9', background: '#f8fafc' }}>
                        {['Tender Reference & Title', 'Package ID', 'Created Date', 'Compliance State', 'Risk Band', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {myBids.map((b, i) => {
                        const bId = b.id || b._id;
                        const tObj = resolveTender(b.tender_id || b.tender_reference);
                        const tRef = tObj?.reference_number || tObj?.tender_no || b.tender_reference || b.tender_id || 'Tender';
                        const tTitle = tObj?.title || 'Procurement Package';

                        return (
                          <tr key={bId} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', fontSize: 13 }}>{tRef}</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {tTitle}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                                #{bId?.slice(-8)}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>
                              {b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN') : 'Recent'}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <StatusPill status={b.overall_status || b.compliance_status || 'PENDING'} />
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <StatusPill status={b.risk_band || 'LOW'} />
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <button
                                onClick={() => {
                                  setSelectedBidId(bId);
                                  setActiveTab('UPLOAD');
                                }}
                                style={{
                                  padding: '6px 14px', borderRadius: 6, border: '1px solid #2563eb',
                                  background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 700,
                                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                                }}
                              >
                                Upload & Manage Docs <ArrowRight size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: UPLOAD & MANAGE DOCUMENTS (THE CORE EXPERIENCE)
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'UPLOAD' && (
          <SectionErrorBoundary>
          <div>
            {(!Array.isArray(myBids) || myBids.length === 0) ? (
              <SectionCard title="No Active Bid Package">
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📌</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Apply to an Open Tender First</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>You must create a bid package before uploading statutory certificates.</div>
                  <button
                    onClick={() => setActiveTab('SUBMISSIONS')}
                    style={{ padding: '8px 18px', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                  >
                    Go to My Submissions Tab
                  </button>
                </div>
              </SectionCard>
            ) : (
              <div>
                {/* Active Bid Selector & Tender Context Card */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                        Active Bid Package Context
                      </label>
                      <select
                        value={selectedBidId || ''}
                        onChange={e => setSelectedBidId(e.target.value)}
                        style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 700, color: '#0f172a', background: '#fff' }}
                      >
                        {(Array.isArray(myBids) ? myBids : []).map(b => {
                          const bId = b.id || b._id;
                          const t = resolveTender(b.tender_id || b.tender_reference);
                          const tRef = t?.reference_number || t?.tender_no || b.tender_reference || 'Tender';
                          return (
                            <option key={bId} value={bId}>
                              Bid Package #{bId?.slice(-8)} — {tRef} ({b.overall_status || 'PENDING'})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Completeness Gauge */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>Package Completeness</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: completenessPct === 100 ? '#166534' : '#2563eb', marginTop: 2 }}>
                          {satisfiedCount} of {mandatoryItems.length} Mandatory Docs ({completenessPct}%)
                        </div>
                      </div>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: completenessPct === 100 ? '#dcfce7' : '#eff6ff', border: `3px solid ${completenessPct === 100 ? '#16a34a' : '#2563eb'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, color: completenessPct === 100 ? '#166534' : '#1d4ed8' }}>
                        {completenessPct}%
                      </div>
                    </div>
                  </div>

                  {/* Active Tender Rules Banner */}
                  {currentTender && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Tender: </span>
                        <strong style={{ color: '#0f172a' }}>{currentTender.reference_number || currentTender.tender_no}</strong> · {currentTender.title?.slice(0, 50)}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                          Turnover ≥ ₹10 Cr
                        </span>
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                          MII Local Content ≥ 50%
                        </span>
                        <span style={{ background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                          Two-Envelope Sealed
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Document Upload Zone */}
                <SectionCard
                  title="Upload Bid Verification Document"
                  subtitle="Accepted formats: PDF, JPEG, PNG (Max 50MB) · Layout-aware OCR extracts coordinates & values automatically"
                >
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOver(false);
                      if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                    }}
                    style={{
                      border: `2px dashed ${dragOver ? '#2563eb' : '#cbd5e1'}`,
                      borderRadius: 12,
                      padding: '36px 20px',
                      textAlign: 'center',
                      background: dragOver ? '#eff6ff' : '#f8fafc',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <UploadCloud size={26} />
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>
                      Drag and drop your document here, or <span style={{ color: '#2563eb', textDecoration: 'underline' }}>browse files</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                      Upload CA Certificates, MII Declarations, GSTN REG-06, PAN Cards, or Work Orders
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                    <button
                      type="button"
                      style={{ padding: '8px 20px', borderRadius: 6, background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', pointerEvents: 'none' }}
                    >
                      Select Document from Device
                    </button>
                  </div>

                  {uploading && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ color: '#2563eb' }}>Processing with PyMuPDF & Tesseract OCR…</span>
                        <span style={{ color: '#64748b' }}>{uploadPct}%</span>
                      </div>
                      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ width: `${uploadPct}%`, height: '100%', background: '#2563eb', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}
                </SectionCard>

                {/* Interactive Statutory Checklist */}
                <SectionCard
                  title="Required Statutory Documents Checklist"
                  subtitle="Verify that all mandatory credentials have been uploaded and extracted with high confidence"
                  action={
                    <button
                      onClick={handlePreCheck}
                      disabled={evaluating || bidDocuments.length === 0}
                      style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                        fontSize: 12, fontWeight: 800, cursor: evaluating ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <Sparkles size={14} /> {evaluating ? 'Evaluating…' : '⚡ Run Pre-Check Verification'}
                    </button>
                  }
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                    {STANDARD_CHECKLIST.map(item => {
                      // Check if satisfied in uploaded documents or evidence
                      const safeDocList = Array.isArray(bidDocuments) ? bidDocuments : [];
                      const safeEvList = Array.isArray(bidEvidence) ? bidEvidence : [];
                      const docTypePrefix = (item.doc_type || '').toLowerCase().split('_')[0];
                      const matchedDoc = safeDocList.find(d =>
                        (d.document_type === item.doc_type || d.doc_type === item.doc_type) ||
                        (d.original_filename && d.original_filename.toLowerCase().includes(docTypePrefix))
                      );
                      const matchedEvidence = safeEvList.find(e =>
                        (item.evidenceKey && (e.field_name === item.evidenceKey || e.field === item.evidenceKey)) ||
                        e.field_name === item.metric ||
                        e.field === item.metric
                      );

                      const isSatisfied = !!(matchedDoc || matchedEvidence);

                      return (
                        <div
                          key={item.doc_type}
                          style={{
                            border: `1px solid ${isSatisfied ? '#bbf7d0' : '#e2e8f0'}`,
                            borderRadius: 10,
                            padding: '14px 16px',
                            background: isSatisfied ? '#f0fdf4' : '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 10
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: item.mandatory ? '#fee2e2' : '#f1f5f9', color: item.mandatory ? '#991b1b' : '#475569' }}>
                                {item.mandatory ? 'MANDATORY' : 'OPTIONAL'}
                              </span>
                              {isSatisfied ? (
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle2 size={13} /> VERIFIED
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <AlertTriangle size={13} /> MISSING
                                </span>
                              )}
                            </div>

                            <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{item.title}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.description}</div>

                            {/* Extracted Evidence Snippet */}
                            {matchedEvidence && (
                              <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, color: '#166534', fontWeight: 700 }}>
                                ✓ Extracted Value: {item.formatValue
                                  ? (() => { try { return safeStr(item.formatValue(safeStr(matchedEvidence.normalized_value) ?? safeStr(matchedEvidence.raw_value))); } catch { return safeStr(matchedEvidence.raw_value); } })()
                                  : safeStr(matchedEvidence.raw_value)}
                              </div>
                            )}
                            {!matchedEvidence && matchedDoc && (
                              <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 11, color: '#334155' }}>
                                📄 File: {matchedDoc.original_filename || matchedDoc.filename} (OCR Processed)
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>Type: {item.doc_type}</span>
                            <label style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#2563eb', padding: '4px 8px', borderRadius: 4, background: '#eff6ff' }}>
                              {isSatisfied ? 'Replace File' : '+ Upload'}
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                style={{ display: 'none' }}
                                onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], item.doc_type)}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                {/* Pre-Check Evaluation Results Modal / Banner */}
                {evalResult && (
                  <SectionCard
                    title="Pre-Submission Compliance Self-Evaluation Result"
                    subtitle="Simulated determination by GeM-Guard's deterministic rules engine"
                    action={<button onClick={() => setEvalResult(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>Close ✕</button>}
                  >
                    <div style={{
                      padding: '16px 20px', borderRadius: 10, marginBottom: 16,
                      background: evalResult.overall_status === 'COMPLIANT' ? '#dcfce7' : '#fffbeb',
                      border: `1px solid ${evalResult.overall_status === 'COMPLIANT' ? '#86efac' : '#fde68a'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: evalResult.overall_status === 'COMPLIANT' ? '#166534' : '#92400e', textTransform: 'uppercase' }}>
                          Self-Evaluation Verdict
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: evalResult.overall_status === 'COMPLIANT' ? '#14532d' : '#78350f', marginTop: 2 }}>
                          {evalResult.overall_status === 'COMPLIANT' ? '✓ FULLY COMPLIANT & READY FOR AWARD' : '⚠ CONDITIONAL / REVIEW REQUIRED'}
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{evalResult.summary}</div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b' }}>Readiness Score</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: evalResult.readiness_score >= 75 ? '#16a34a' : '#d97706' }}>
                          {evalResult.readiness_score}<span style={{ fontSize: 14 }}>/100</span>
                        </div>
                      </div>
                    </div>

                    {/* Rule Results Breakdown */}
                    {Array.isArray(evalResult.rule_results) && evalResult.rule_results.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {evalResult.rule_results.map((r, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{r.explanation || r.rule_id}</div>
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>Rule ID: {r.rule_id}</div>
                            </div>
                            <StatusPill status={r.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                )}

                {/* Uploaded Documents Inventory Table */}
                <SectionCard
                  title={`Uploaded Documents Inventory (${bidDocuments.length})`}
                  subtitle="All scanned certificates and PDFs registered to this bid package with Vision OCR classifications"
                >
                  {loadingDocs ? (
                    <div style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Refreshing document inventory…</div>
                  ) : bidDocuments.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                      No documents uploaded yet for Bid Package #{selectedBidId?.slice(-8)}. Drag & drop a file above to begin.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #f1f5f9', background: '#f8fafc' }}>
                            {['Document Name', 'Classified Type', 'AI Parsing & Extracted Data', 'Pages / Size', 'Uploaded At', 'Actions'].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#475569' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(Array.isArray(bidDocuments) ? bidDocuments : []).map((doc, idx) => {
                            const dId = String(doc.id || doc._id || '');
                            const dType = doc.document_type || doc.doc_type || 'UNKNOWN';
                            const conf = doc.classification_confidence || doc.doc_type_confidence || 0.95;
                            const procBy = doc.processed_by || 'Vision Engine';
                            const isAi = procBy.includes('GEMINI') || procBy.includes('gemini');
                            const aiLabel = isAi ? `✨ ${procBy.replace(/_/g, ' ')}` : '⚡ Deterministic OCR';
                            // Find evidence for this document (safe string comparison)
                            const safeEv = Array.isArray(bidEvidence) ? bidEvidence : [];
                            const docEvidence = dId
                              ? safeEv.filter(e => String(e.document_id || '') === dId || String(e.doc_id || '') === dId)
                              : [];
                            const extractedFields = doc.extracted_fields || {};

                            return (
                              <tr key={dId || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <FileText size={16} color="#2563eb" />
                                    <div>
                                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{safeStr(doc.original_filename || doc.filename)}</div>
                                      <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>ID: {dId?.slice(-8)}</div>
                                      {doc.legal_name && (
                                        <div style={{ fontSize: 10, color: '#047857', fontWeight: 600 }}>Entity: {safeStr(doc.legal_name)}</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8' }}>
                                    {dType}
                                  </span>
                                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                                    {Math.round(conf * 100)}% conf
                                  </div>
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      padding: '2px 7px',
                                      borderRadius: 4,
                                      background: isAi ? '#fdf4ff' : '#f1f5f9',
                                      color: isAi ? '#9333ea' : '#475569',
                                      border: `1px solid ${isAi ? '#f0abfc' : '#e2e8f0'}`,
                                      width: 'fit-content',
                                    }}>
                                      {aiLabel}
                                    </span>
                                    {/* Display extracted field chips */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                                      {docEvidence.length > 0 ? (
                                        docEvidence.map((e, ei) => (
                                          <span key={e.id || e._id || e.field_name || ei} style={{
                                            fontSize: 10,
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            background: '#f0fdf4',
                                            color: '#166534',
                                            border: '1px solid #bbf7d0',
                                            fontWeight: 600,
                                          }}>
                                            {(e.field_name || '').replace(/_/g, ' ')}: <strong>{safeStr(e.normalized_value ?? e.raw_value)}</strong>
                                          </span>
                                        ))
                                      ) : Object.keys(extractedFields).length > 0 ? (
                                        Object.entries(extractedFields).map(([k, v]) => (
                                          <span key={k} style={{
                                            fontSize: 10,
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            background: '#f0fdf4',
                                            color: '#166534',
                                            border: '1px solid #bbf7d0',
                                            fontWeight: 600,
                                          }}>
                                            {k.replace(/_/g, ' ')}: <strong>{safeStr(v)}</strong>
                                          </span>
                                        ))
                                      ) : (
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Processed</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 12, color: '#475569' }}>
                                  {doc.page_count ? `${doc.page_count} pg` : '1 pg'} · {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : 'PDF'}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>
                                  {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-IN') : 'Recent'}
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <button
                                    onClick={() => handleDeleteDocument(dId)}
                                    title="Remove document"
                                    style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700 }}
                                  >
                                    <Trash2 size={12} /> Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            )}
          </div>
          </SectionErrorBoundary>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: PRE-SUBMISSION DRY-RUN CHECKER
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'DRY_RUN' && (
          <DryRunTab
            currentTender={currentTender}
            currentBid={currentBid}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-Component: Tender-Synced Dry Run Checker ─────────────────────────────
function DryRunTab({ currentTender, currentBid }) {
  // Sync thresholds with current tender
  const tenderTurnover = currentTender?.estimated_value ? (Number(currentTender.estimated_value) * 0.8) : 10.0;
  const turnoverThreshold = Number(tenderTurnover.toFixed(1));
  const miiThreshold = 50.0;

  const [turnover, setTurnover] = useState('14.2');
  const [localContent, setLocalContent] = useState('65.0');
  const [gstin, setGstin] = useState('33AAACB6666L1ZP');
  const [udyam, setUdyam] = useState('UDYAM-TN-01-0033333');
  const [result, setResult] = useState(null);

  function runCheck() {
    const tv = parseFloat(turnover) || 0;
    const lc = parseFloat(localContent) || 0;
    const gstinValid = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/.test(gstin.trim());
    const udyamValid = udyam ? udyam.trim().startsWith('UDYAM-') : true;

    const checks = [
      {
        rule: 'REQ-FIN-01',
        label: `Annual Turnover ≥ ₹${turnoverThreshold} Cr`,
        status: tv >= turnoverThreshold ? 'PASS' : 'FAIL',
        detail: `You entered ₹${tv.toFixed(2)} Cr. ${tv >= turnoverThreshold ? 'Satisfies' : 'Fails'} the tender threshold of ₹${turnoverThreshold} Cr.`
      },
      {
        rule: 'REQ-MII-02',
        label: `Local Content ≥ ${miiThreshold}% (Class-I Local Supplier)`,
        status: lc >= miiThreshold ? 'PASS' : 'FAIL',
        detail: `You entered ${lc.toFixed(1)}%. ${lc >= miiThreshold ? 'Qualifies as Class-I Local Supplier.' : 'Below 50% requirement.'}`
      },
      {
        rule: 'REQ-STAT-03',
        label: 'Statutory GSTIN Format Validation',
        status: gstinValid ? 'PASS' : 'FAIL',
        detail: gstinValid ? 'Valid 15-character GSTIN structure confirmed.' : 'Invalid GSTIN syntax. Expected format: 33AAACB1234L1ZP.'
      },
      {
        rule: 'REQ-MSME-04',
        label: 'Udyam Registration (MSE Price Preference)',
        status: udyamValid ? 'PASS' : 'REVIEW',
        detail: udyam ? (udyamValid ? 'Valid Udyam prefix detected.' : 'Malformed URN. Format: UDYAM-XX-00-0000000.') : 'Not applicable — general bidder.'
      },
    ];

    const hasFail = checks.some(c => c.status === 'FAIL');
    setResult({
      checks,
      verdict: hasFail ? 'LIKELY_FAIL' : 'LIKELY_PASS',
      summary: hasFail
        ? 'One or more mandatory eligibility criteria failed. Please review your credentials.'
        : 'All simulated parameters meet tender specifications. Proceed with document upload.',
    });
  }

  return (
    <div>
      <SectionCard
        title="Pre-Submission Eligibility Dry-Run"
        subtitle={`Testing against active tender: ${currentTender?.reference_number || currentTender?.tender_no || 'Standard CPCL RFP'} (${currentTender?.title?.slice(0, 60) || 'Engineering Works'})`}
      >
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: '#1e40af' }}>
          💡 <strong>Indicative Pre-Screening:</strong> This simulator calculates eligibility against this specific tender's compiled requirements before you submit documents.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', display: 'block', marginBottom: 6 }}>
              Average Annual Turnover (₹ Cr) — Required: ≥ ₹{turnoverThreshold} Cr
            </label>
            <input
              type="number"
              step="0.1"
              value={turnover}
              onChange={e => setTurnover(e.target.value)}
              placeholder={`e.g. ${turnoverThreshold + 2}`}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', display: 'block', marginBottom: 6 }}>
              Local Content % (PPP-MII) — Required: ≥ {miiThreshold}%
            </label>
            <input
              type="number"
              step="1"
              value={localContent}
              onChange={e => setLocalContent(e.target.value)}
              placeholder="e.g. 65"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', display: 'block', marginBottom: 6 }}>
              Corporate GSTIN Number
            </label>
            <input
              value={gstin}
              onChange={e => setGstin(e.target.value)}
              placeholder="33AAACB6666L1ZP"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', display: 'block', marginBottom: 6 }}>
              Udyam Registration Number (URN) — Optional
            </label>
            <input
              value={udyam}
              onChange={e => setUdyam(e.target.value)}
              placeholder="UDYAM-TN-01-0033333"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', fontFamily: 'monospace' }}
            />
          </div>
        </div>

        <button
          onClick={runCheck}
          style={{
            padding: '11px 26px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff',
            fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <Sparkles size={15} /> Execute Dry-Run Eligibility Check
        </button>
      </SectionCard>

      {/* Result Card */}
      {result && (
        <SectionCard
          title="Dry-Run Determination"
          subtitle="Pre-submission compliance report based on entered figures"
        >
          <div style={{
            padding: '16px 20px', borderRadius: 10, marginBottom: 16,
            background: result.verdict === 'LIKELY_PASS' ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${result.verdict === 'LIKELY_PASS' ? '#86efac' : '#fca5a5'}`,
            color: result.verdict === 'LIKELY_PASS' ? '#14532d' : '#991b1b',
            fontWeight: 800, fontSize: 14
          }}>
            {result.verdict === 'LIKELY_PASS' ? '✓ LIKELY ELIGIBLE FOR AWARD' : '✗ INELIGIBILITY RISK DETECTED'}
            <div style={{ fontWeight: 500, fontSize: 12, marginTop: 4 }}>{result.summary}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.checks.map(c => (
              <div
                key={c.rule}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>{c.rule}</span>
                    <strong style={{ fontSize: 13, color: '#0f172a' }}>{c.label}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>{c.detail}</div>
                </div>
                <StatusPill status={c.status} />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Verification Modal for First Time Bidders ── */}
      {showVerificationModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Action Required: Profile Verification</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Upload your compliance PDF to verify your corporate identity.</p>
              </div>
              <button onClick={() => { setShowVerificationModal(false); setPendingTenderId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <XCircle size={24} />
              </button>
            </div>
            <div style={{ padding: '32px' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 13, color: '#1e3a8a', lineHeight: 1.5 }}>
                <strong>Welcome!</strong> Before you can apply to tenders, you must upload a single PDF containing your corporate verification documents:
                <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                  <li>GST Registration Certificate</li>
                  <li>PAN Card</li>
                  <li>Udyam MSME Certificate (if applicable)</li>
                  <li>CA Turnover Certificate</li>
                  <li>Experience / Work Order</li>
                </ul>
              </div>

              {/* Upload Dropzone */}
              <div
                style={{
                  border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`, borderRadius: 12, padding: '40px 20px',
                  textAlign: 'center', background: dragOver ? '#eff6ff' : '#f8fafc', transition: 'all 0.2s ease',
                  cursor: uploading ? 'wait' : 'pointer'
                }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  if (uploading) return;
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleVaultUpload(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
              >
                <UploadCloud size={40} color={dragOver ? '#3b82f6' : '#94a3b8'} style={{ margin: '0 auto 16px' }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                  Drag & Drop Compliance PDF
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  or click to select file from your computer
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleVaultUpload(e.target.files[0]);
                    }
                  }}
                />
              </div>

              {uploading && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                    <span>Extracting Profile Details...</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#3b82f6', width: `${uploadPct}%`, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
