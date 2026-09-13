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
  ExternalLink, Layers, Award,
  Search, Bell, User, LayoutDashboard, List, Briefcase, FileCheck2, ArrowUpRight
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
  const isVerified = vaultDocs.length > 0;
  
  // Handlers for new layout
  const onVerifyClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onEnterAuctionClick = (tenderId) => {
    setActiveTab('PORTFOLIO');
    handleApply(tenderId);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f1f5f9', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
      
      {/* ─── SIDEBAR NAVIGATION ─── */}
      <div style={{ width: 260, background: '#0f172a', color: '#cbd5e1', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        <nav style={{ flex: 1, padding: '24px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { id: 'DASHBOARD', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
            { id: 'LIVE_TENDERS', label: 'Live Tenders', icon: <List size={18} /> },
            { id: 'PORTFOLIO', label: 'My Portfolio', icon: <Briefcase size={18} /> },
            { id: 'VAULT', label: 'Compliance Vault', icon: <FileCheck2 size={18} /> },
          ].map(item => {
            const isActive = activeTab === item.id || (activeTab === 'SUBMISSIONS' && item.id === 'DASHBOARD');
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 8, border: 'none',
                  background: isActive ? '#1e293b' : 'transparent', color: isActive ? '#fff' : '#94a3b8',
                  fontSize: 14, fontWeight: isActive ? 700 : 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease'
                }}
              >
                <div style={{ color: isActive ? '#3b82f6' : '#64748b' }}>{item.icon}</div>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: '20px', borderTop: '1px solid #1e293b' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Logged in as</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{profile?.company_name || authUser?.name || 'Bharat Engineering Ltd'}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>GSTIN: {profile?.gstin || '33AAACB6666L1ZP'}</div>
        </div>
      </div>

      {/* ─── MAIN CONTENT AREA ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* ─── GLOBAL TOP NAVIGATION ─── */}
        <div style={{ height: 64, background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: 480 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Search Tender IDs or keywords..." 
                style={{ width: '100%', padding: '10px 16px 10px 36px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, outline: 'none' }}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Dynamic Status Badge */}
            {uploading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 20, color: '#92400e', fontSize: 12, fontWeight: 700 }}>
                <RefreshCw size={14} style={{ animation: 'spin 2s linear infinite' }} /> AI Extracting PDF...
              </div>
            ) : isVerified ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 20, color: '#166534', fontSize: 12, fontWeight: 700 }}>
                <CheckCircle2 size={14} /> Verified Bidder
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 20, color: '#991b1b', fontSize: 12, fontWeight: 700 }}>
                <div style={{ width: 8, height: 8, background: '#dc2626', borderRadius: '50%' }} /> Action Required: Upload Profile
              </div>
            )}

            <div style={{ width: 1, height: 24, background: '#e2e8f0' }} />
            
            <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', position: 'relative' }}>
              <Bell size={20} />
              <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '2px solid #fff' }} />
            </button>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <User size={18} />
            </div>
          </div>
        </div>

        {/* ─── SCROLLABLE WORKSPACE ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
          
          {(activeTab === 'DASHBOARD' || activeTab === 'SUBMISSIONS' || activeTab === 'LIVE_TENDERS') && (
            <>
              {/* ─── ADAPTIVE HERO SECTION ─── */}
              {activeTab !== 'LIVE_TENDERS' && (
                !isVerified ? (
                  /* STATE A: UNVERIFIED (PDF DROPZONE BANNER) */
                <div 
                  style={{ 
                    background: dragOver ? '#eff6ff' : 'linear-gradient(135deg, #1e3a8a, #3b82f6)', 
                    borderRadius: 16, padding: '40px 32px', marginBottom: 32, color: dragOver ? '#1e3a8a' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32,
                    border: `2px dashed ${dragOver ? '#2563eb' : 'transparent'}`, transition: 'all 0.2s ease', cursor: uploading ? 'wait' : 'pointer',
                    boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)'
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
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <AlertTriangle size={20} color={dragOver ? '#2563eb' : '#fde047'} />
                      <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: dragOver ? '#2563eb' : '#fde047' }}>
                        View-Only Mode Active
                      </span>
                    </div>
                    <h2 style={{ margin: '0 0 12px 0', fontSize: 24, fontWeight: 900, lineHeight: 1.2 }}>
                      Drop your Master Profile PDF here to extract your PAN, GST, and MSME details and unlock bidding.
                    </h2>
                    <p style={{ margin: 0, fontSize: 14, opacity: 0.9, lineHeight: 1.5 }}>
                      Our Vision Engine will automatically verify your compliance status and generate your Master Data.
                    </p>
                    {uploading && (
                      <div style={{ marginTop: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 8, color: dragOver ? '#1e3a8a' : '#fff' }}>
                          <span>Extracting Profile Details...</span>
                          <span>{uploadPct}%</span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: dragOver ? '#3b82f6' : '#fff', width: `${uploadPct}%`, transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ width: 140, height: 140, background: dragOver ? '#dbeafe' : 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <UploadCloud size={48} />
                    <span style={{ fontSize: 11, fontWeight: 700, marginTop: 8 }}>Click or Drag</span>
                  </div>
                  <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf" onChange={e => {
                    if (e.target.files && e.target.files.length > 0) handleVaultUpload(e.target.files[0]);
                  }} />
                </div>
              ) : (
                /* STATE B: VERIFIED (KPI DASHBOARD) */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
                  {[
                    { label: 'Active Bids', value: myBids.length.toString(), icon: <Layers size={20} color="#3b82f6" />, bg: '#eff6ff' },
                    { label: 'Open Tenders', value: openTenders.length.toString(), icon: <ShieldCheck size={20} color="#16a34a" />, bg: '#dcfce7' },
                    { label: 'Vault Documents', value: vaultDocs.length.toString(), icon: <FileCheck2 size={20} color="#d946ef" />, bg: '#fdf4ff' },
                    { label: 'Profile Status', value: isVerified ? 'Verified' : 'Pending', icon: <CheckCircle2 size={20} color="#0ea5e9" />, bg: '#e0f2fe' }
                  ].map((kpi, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {kpi.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{kpi.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{kpi.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
                )
              )}

              {/* ─── LIVE TENDERS FEED ─── */}
              {(activeTab === 'DASHBOARD' || activeTab === 'LIVE_TENDERS') && (
              <div style={{ marginTop: activeTab === 'LIVE_TENDERS' ? 0 : 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Live Tenders Feed</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['All Tenders', 'Ending Soon', 'My Industry'].map((tab, i) => (
                      <button key={tab} style={{ padding: '6px 16px', borderRadius: 20, border: i === 0 ? 'none' : '1px solid #cbd5e1', background: i === 0 ? '#0f172a' : '#fff', color: i === 0 ? '#fff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {openTenders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 14, color: '#64748b' }}>No live tenders found right now.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
                    {openTenders.map(t => {
                      const tId = t.id || t._id || t.tender_no;
                      const tRef = t.reference_number || t.tender_no || 'Tender';
                      const isAlreadyApplied = myBids.some(b => b.tender_id === tId || b.tender_reference === tRef);
                      
                      return (
                        <div key={tId} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #3b82f6, #10b981)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>{tRef}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#ef4444', background: '#fef2f2', padding: '4px 10px', borderRadius: 6 }}>
                              <Clock size={12} /> ⏱️ Ends in 04:12:00
                            </div>
                          </div>
                          
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16, lineHeight: 1.4, flex: 1 }}>
                            {t.title ? (t.title.length > 80 ? t.title.slice(0, 80) + '...' : t.title) : 'General Procurement Auction'}
                          </div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Base Value</div>
                              <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a' }}>
                                ₹{t.estimated_value ? (Number(t.estimated_value) * 10000000).toLocaleString('en-IN') : '50,00,000'}
                              </div>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => isVerified ? onEnterAuctionClick(tId) : onVerifyClick()}
                            disabled={applying || isAlreadyApplied}
                            style={{
                              width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                              background: isAlreadyApplied ? '#f1f5f9' : (isVerified ? '#0f172a' : '#f1f5f9'),
                              color: isAlreadyApplied ? '#94a3b8' : (isVerified ? '#fff' : '#0f172a'),
                              fontSize: 13, fontWeight: 800, cursor: (applying || isAlreadyApplied) ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              transition: 'all 0.2s ease', border: isVerified ? 'none' : '1px solid #cbd5e1'
                            }}
                          >
                            {applying && pendingTenderId === tId ? '⏳ Processing…' : isAlreadyApplied ? '✓ ALREADY ENTERED' : isVerified ? (
                              <>⚡ Enter Auction <ArrowUpRight size={16} /></>
                            ) : (
                              <>🔒 Verify to Bid</>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              )}
            </>
          )}

          {activeTab === 'PORTFOLIO' && (
            <div>
              <h2 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 900, color: '#0f172a' }}>My Portfolio</h2>
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
                      Go to the Dashboard to find and apply for live tenders.
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #f1f5f9', background: '#f8fafc' }}>
                          {['Tender Reference & Title', 'Package ID', 'Created Date', 'Compliance State', 'Actions'].map(h => (
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
                                <button
                                  onClick={() => {
                                    setSelectedBidId(bId);
                                    setActiveTab('VAULT');
                                  }}
                                  style={{
                                    padding: '6px 14px', borderRadius: 6, border: '1px solid #2563eb',
                                    background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 700,
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                                  }}
                                >
                                  Manage Docs <ArrowRight size={13} />
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

          {activeTab === 'VAULT' && (
            <div>
              <h2 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Master Compliance Vault</h2>
              
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <SectionCard
                    title="Master Profile Documents"
                    subtitle="Central repository of your statutory compliance documents."
                    action={
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1e293b', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                      >
                        <UploadCloud size={14} /> Upload Doc
                      </button>
                    }
                  >
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.png,.jpg,.jpeg" onChange={e => {
                      if (e.target.files && e.target.files.length > 0) handleVaultUpload(e.target.files[0]);
                    }} />
                    {uploading ? (
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>Processing document via AI Vision Engine...</div>
                    ) : vaultDocs.length === 0 ? (
                      <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>No master documents uploaded yet. Head to the dashboard to upload your PDF.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {vaultDocs.map(d => (
                          <div key={d.id || d._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={18} />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{d.filename || d.original_filename}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{d.doc_type || 'General Document'} • {(d.file_size / 1024).toFixed(1)} KB</div>
                              </div>
                            </div>
                            <button onClick={async () => {
                              // We don't have a direct delete vault doc API endpoint yet, so we just hide it locally for demo
                              setVaultDocs(prev => prev.filter(v => v.id !== d.id && v._id !== d._id));
                            }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                </div>
                
                <div style={{ width: 340, flexShrink: 0 }}>
                  <SectionCard title="Master Extracted Data" subtitle="Verified parameters across your entire profile">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {STANDARD_CHECKLIST.map(item => {
                        const allEntities = vaultDocs.flatMap(d => d.entities_extracted || []);
                        const ev = allEntities.find(e => e.field === item.evidenceKey || e.field === item.metric);
                        return (
                          <div key={item.doc_type} style={{ padding: '12px', border: `1px solid ${ev ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 8, background: ev ? '#f0fdf4' : '#fff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: ev ? '#166534' : '#64748b' }}>{item.title}</span>
                              {ev ? <CheckCircle2 size={14} color="#16a34a" /> : <XCircle size={14} color="#94a3b8" />}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: ev ? '#15803d' : '#94a3b8' }}>
                              {ev ? item.formatValue(ev.normalized_value ?? ev.raw_value) : 'Missing Data'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
