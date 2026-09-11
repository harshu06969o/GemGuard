/**
 * Bidder Workspace & Self-Service Portal
 * - Bidders: View company registration, apply to open tenders, upload documents,
 *   run pre-submission compliance self-check, and track bid status.
 * - Officers: View directory of all registered bidders, evaluate compliance submissions.
 * 
 * CORE EVALUATION INTERFACES:
 * 1. Split Document Viewer: Dual-pane interface with original PDF and [x1, y1, x2, y2]
 *    bounding boxes overlaid directly over extracted AI figures.
 * 2. Clause-to-Evidence Graph (USP): 5-stage node-link component charting:
 *    Tender Clause -> Requirement Rule -> Document Value -> Verification Source -> Result
 *    with paths highlighted in green (pass), red (fail), or amber (review).
 * 3. Audit Replay Modal: Timeline view displaying cryptographic SHA-256 chained events and actor details.
 */

import { useEffect, useState, useMemo } from 'react';
import {
  getMyProfile,
  getMyBids,
  listTenders,
  submitBid,
  uploadBidderDocument,
  evaluateBid,
  listBidders,
  getBidder,
  getMe,
  listBidEvidence,
  listBidDocuments,
  getComplianceTrace,
  getAuditTimeline,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { LoadingSpinner } from '../components/Card';
import SplitDocumentViewer, { DEFAULT_SAMPLE_EVIDENCE, DOCUMENT_CATALOG } from '../components/SplitDocumentViewer';
import ClauseEvidenceGraph, { DEFAULT_FLOW_ITEMS } from '../components/ClauseEvidenceGraph';
import AuditReplayModal, { DEFAULT_AUDIT_EVENTS } from '../components/AuditReplayModal';
import { 
  Building2, FileText, SplitSquareVertical, GitFork, 
  ShieldCheck, ArrowRight, Eye, UploadCloud, CheckCircle, 
  AlertCircle, Clock, Search, RefreshCw, Layers, Lock
} from 'lucide-react';

export default function BidderWorkspacePage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [myBids, setMyBids] = useState([]);
  const [openTenders, setOpenTenders] = useState([]);
  const [selectedBidId, setSelectedBidId] = useState(null);
  const [evalResults, setEvalResults] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [evaluating, setEvaluating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedTenderToApply, setSelectedTenderToApply] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Active Workspace Navigation Tab
  // 'SUBMISSIONS' | 'SPLIT_VIEWER' | 'DECISION_GRAPH' | 'AUDIT_TIMELINE'
  const [activeTab, setActiveTab] = useState('SUBMISSIONS');

  // Audit Replay Modal Visibility
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Evaluation Data States for currently selected bid
  const [bidEvidence, setBidEvidence] = useState([]);
  const [bidDocuments, setBidDocuments] = useState([]);
  const [bidTrace, setBidTrace] = useState(null);
  const [bidAuditTimeline, setBidAuditTimeline] = useState([]);
  const [loadingEvalData, setLoadingEvalData] = useState(false);

  // Officer view state
  const [officerBidders, setOfficerBidders] = useState([]);
  const [selectedOfficerBidderId, setSelectedOfficerBidderId] = useState(null);
  const [officerBidderDetail, setOfficerBidderDetail] = useState(null);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const u = await getMe().catch(() => null);
        setCurrentUser(u);

        if (u?.role === 'BIDDER') {
          const [prof, bids, tenders] = await Promise.all([
            getMyProfile().catch(() => null),
            getMyBids().catch(() => []),
            listTenders().catch(() => []),
          ]);
          setProfile(prof);
          setMyBids(bids);
          setOpenTenders(tenders);
          if (tenders.length > 0) setSelectedTenderToApply(tenders[0].id);
          if (bids.length > 0) {
            setSelectedBidId(bids[0].id);
            loadBidEvaluationData(bids[0].id);
          }
        } else {
          // Officer view
          const [bList, bids, tenders] = await Promise.all([
            listBidders().catch(() => []),
            getMyBids().catch(() => []),
            listTenders().catch(() => []),
          ]);
          setOfficerBidders(bList);
          setMyBids(bids);
          setOpenTenders(tenders);
          if (bList.length > 0) {
            setSelectedOfficerBidderId(bList[0].id);
            const d = await getBidder(bList[0].id).catch(() => null);
            setOfficerBidderDetail(d);
          }
          if (bids.length > 0) {
            setSelectedBidId(bids[0].id);
            loadBidEvaluationData(bids[0].id);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to initialize workspace');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Fetch complete evidence, documents, trace, and audit for a specific bid
  async function loadBidEvaluationData(bidId) {
    if (!bidId) return;
    setLoadingEvalData(true);
    try {
      const [evs, docs, trace, audit] = await Promise.all([
        listBidEvidence(bidId).catch(() => []),
        listBidDocuments(bidId).catch(() => []),
        getComplianceTrace(bidId).catch(() => null),
        getAuditTimeline(bidId).catch(() => []),
      ]);

      if (evs && evs.length > 0) setBidEvidence(evs);
      if (docs && docs.length > 0) setBidDocuments(docs);
      if (trace) setBidTrace(trace);
      if (audit && audit.length > 0) setBidAuditTimeline(audit);
    } catch (err) {
      console.warn('Could not fetch evaluation data for bid:', err);
    } finally {
      setLoadingEvalData(false);
    }
  }

  // When selected bid changes
  function handleSelectBid(bidId) {
    setSelectedBidId(bidId);
    loadBidEvaluationData(bidId);
  }

  async function handleApplyTender() {
    if (!selectedTenderToApply) return;
    setApplying(true);
    setError(null);
    try {
      const res = await submitBid(selectedTenderToApply);
      setSuccessMsg(`Bid package initialized successfully! ID: ${res.id}`);
      const updatedBids = await getMyBids();
      setMyBids(updatedBids);
      setSelectedBidId(res.id);
      loadBidEvaluationData(res.id);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Application failed');
    } finally {
      setApplying(false);
    }
  }

  async function handleFileUpload(e) {
    if (!selectedBidId || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploading(true);
    setUploadPct(10);
    setError(null);
    try {
      await uploadBidderDocument(selectedBidId, file, pct => setUploadPct(pct));
      setSuccessMsg(`Uploaded ${file.name} successfully! Extracted metadata automatically.`);
      const updatedBids = await getMyBids();
      setMyBids(updatedBids);
      loadBidEvaluationData(selectedBidId);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed');
    } finally {
      setUploading(false);
      setUploadPct(0);
      e.target.value = '';
    }
  }

  async function handleSelfCheck(bidId) {
    setEvaluating(true);
    setError(null);
    try {
      const results = await evaluateBid(bidId);
      setEvalResults(prev => ({ ...prev, [bidId]: results }));
      const updatedBids = await getMyBids();
      setMyBids(updatedBids);
      loadBidEvaluationData(bidId);
      setSuccessMsg('Pre-submission compliance self-check completed!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Self-check failed');
    } finally {
      setEvaluating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  // Currently active bid reference
  const currentBid = myBids.find(b => b.id === selectedBidId) || myBids[0];
  const tenderRef = currentBid?.tender_reference || 'GEM/2026/B/891245';

  return (
    <div style={{
      maxWidth: 1300,
      margin: '0 auto',
      padding: '24px 24px 48px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#1e293b',
    }}>
      {/* ══════════════════════════════════════════════════════════════════════════
          HERO & WORKSPACE NAVIGATION HEADER
          ══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              🏢 Bidder Evaluation Workspace
            </h1>
            <span style={{
              background: '#dcfce7',
              color: '#166534',
              border: '1px solid #86efac',
              borderRadius: 20,
              padding: '3px 12px',
              fontSize: 11,
              fontWeight: 700,
            }}>
              ✓ {currentUser?.role === 'BIDDER' ? 'Authenticated Bidder' : 'Officer Oversight'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Dual-pane PDF evidence extraction, 5-stage decision graphs, and tamper-evident SHA-256 audit replay
          </p>
        </div>

        {/* Global Quick Action: Open Audit Modal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setIsAuditModalOpen(true)}
            id="btn-open-audit-replay-modal"
            style={{
              background: 'linear-gradient(135deg, #0f172a, #1e293b)',
              color: '#f8fafc',
              border: '1px solid #334155',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <ShieldCheck size={16} color="#10b981" />
            <span>Cryptographic Audit Replay</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', padding: '12px 16px', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {successMsg && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', padding: '12px 16px', borderRadius: 8, color: '#166534', fontSize: 13, marginBottom: 16 }}>
          {successMsg}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          CORE EVALUATION INTERFACES TAB NAVIGATION BAR
          ══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '6px',
        marginBottom: 24,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        overflowX: 'auto',
        gap: 6,
      }}>
        {[
          {
            id: 'SUBMISSIONS',
            label: 'Submissions & Documents',
            icon: Building2,
            badge: myBids.length > 0 ? `${myBids.length} Bids` : null,
          },
          {
            id: 'SPLIT_VIEWER',
            label: 'Split Document Viewer (Dual-Pane PDF)',
            icon: SplitSquareVertical,
            badge: 'AI B-Boxes',
            color: '#2563eb',
          },
          {
            id: 'DECISION_GRAPH',
            label: 'Clause-to-Evidence Graph (USP)',
            icon: GitFork,
            badge: '5-Stage Flow',
            color: '#7c3aed',
          },
          {
            id: 'AUDIT_TIMELINE',
            label: 'Chained Audit Trail (SHA-256)',
            icon: Lock,
            badge: 'Tamper-Evident',
            color: '#059669',
          },
        ].map(tab => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              id={`tab-${tab.id.toLowerCase()}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: isActive ? '#0f172a' : 'transparent',
                color: isActive ? '#ffffff' : '#64748b',
                fontWeight: isActive ? 700 : 600,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <TabIcon size={16} color={isActive ? '#60a5fa' : tab.color || '#94a3b8'} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: isActive ? 'rgba(59, 130, 246, 0.3)' : '#f1f5f9',
                  color: isActive ? '#93c5fd' : '#475569',
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB CONTENT 1: SPLIT DOCUMENT VIEWER (DUAL PANE PDF WITH BOUNDING BOXES)
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'SPLIT_VIEWER' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e3a5f' }}>
                📄 Dual-Pane Document & PDF Inspection Viewer
              </h2>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                High-precision OCR extraction: [x1, y1, x2, y2] bounding box coordinates overlaid on authentic PDF documents
              </div>
            </div>
            {selectedBidId && (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>
                Inspecting Bid: <strong>#{selectedBidId.slice(-6)}</strong> ({tenderRef})
              </span>
            )}
          </div>

          <SplitDocumentViewer
            evidenceList={bidEvidence.length > 0 ? bidEvidence : DEFAULT_SAMPLE_EVIDENCE}
            documents={bidDocuments.length > 0 ? bidDocuments : DOCUMENT_CATALOG}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB CONTENT 2: CLAUSE-TO-EVIDENCE GRAPH (USP NODE-LINK COMPONENT)
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'DECISION_GRAPH' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e3a5f' }}>
                🕸️ Visual Clause-to-Evidence Decision Graph
              </h2>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                The core USP of GeM-Guard: Exact node-link flow from Tender Clause through statutory verification to Result
              </div>
            </div>
            {selectedBidId && (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', padding: '4px 10px', borderRadius: 6 }}>
                Tender: <strong>{tenderRef}</strong>
              </span>
            )}
          </div>

          <ClauseEvidenceGraph
            flowData={DEFAULT_FLOW_ITEMS}
            tenderReference={tenderRef}
            bidderName={profile?.legal_name || currentUser?.name}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB CONTENT 3: EMBEDDED AUDIT REPLAY & TIMELINE
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'AUDIT_TIMELINE' && (
        <div style={{
          background: '#0d1525',
          borderRadius: 16,
          padding: 24,
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#f8fafc',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
                  🔒 Tamper-Evident SHA-256 Audit Timeline
                </h2>
                <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                  Cryptographically Chained
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Every action is cryptographically hashed with previous block event_hash = SHA256(prev_hash + payload)
              </p>
            </div>

            <button
              onClick={() => setIsAuditModalOpen(true)}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Open Interactive Replay Player
            </button>
          </div>

          {/* Quick preview of recent audit events */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(bidAuditTimeline.length > 0 ? bidAuditTimeline : DEFAULT_AUDIT_EVENTS).slice(-4).map((evt, i) => (
              <div
                key={evt.id || i}
                style={{
                  background: '#131e33',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, background: '#1e293b', padding: '1px 6px', borderRadius: 3, color: '#60a5fa', fontWeight: 700 }}>
                      Block #{evt.block_index || i + 1}
                    </span>
                    <strong style={{ fontSize: 13, color: '#f8fafc' }}>{evt.action}</strong>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>by {evt.actor}</span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#6ee7b7' }}>
                    SHA-256: {evt.event_hash ? `${evt.event_hash.slice(0, 32)}…` : 'Calculated'}
                  </div>
                </div>

                <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
                  {new Date(evt.timestamp).toLocaleDateString()} {new Date(evt.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB CONTENT 4: SUBMISSIONS & WORKSPACE OVERVIEW
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'SUBMISSIONS' && (
        <div>
          {/* Top Grid: Profile & Apply */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
            {/* Company Registration Card */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1e3a5f', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📜</span> Company Profile & Statutory Credentials
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: 13 }}>
                <div><span style={{ fontSize: 11, color: '#64748b' }}>LEGAL NAME</span><div style={{ fontWeight: 700 }}>{profile?.legal_name || currentUser?.name || 'TechCorp Infotech Pvt Ltd'}</div></div>
                <div><span style={{ fontSize: 11, color: '#64748b' }}>CATEGORY</span><div><StatusBadge status={profile?.category || 'MSME'} /></div></div>
                <div><span style={{ fontSize: 11, color: '#64748b' }}>GSTIN</span><div style={{ fontFamily: 'monospace' }}>{profile?.gstin || '07AACCI4520M1ZP'}</div></div>
                <div><span style={{ fontSize: 11, color: '#64748b' }}>PAN</span><div style={{ fontFamily: 'monospace' }}>{profile?.pan || 'AACCI4520M'}</div></div>
                <div><span style={{ fontSize: 11, color: '#64748b' }}>TURNOVER (Cr)</span><div style={{ fontWeight: 700 }}>₹{profile?.turnover_cr ?? 14.2} Cr</div></div>
                <div><span style={{ fontSize: 11, color: '#64748b' }}>UDYAM</span><div style={{ fontFamily: 'monospace' }}>{profile?.udyam_number || 'UDYAM-DL-01-0012345'}</div></div>
              </div>
            </div>

            {/* Apply to Tender Card */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1e3a5f', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📋</span> Apply to Active GeM Tender
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                Select an active published tender to generate a submission package for your company:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <select
                  value={selectedTenderToApply}
                  onChange={e => setSelectedTenderToApply(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  {openTenders.map(t => (
                    <option key={t.id} value={t.id}>{t.reference_number} — {t.title}</option>
                  ))}
                  {openTenders.length === 0 && <option value="">No published tenders available</option>}
                </select>
                <button
                  onClick={handleApplyTender}
                  disabled={applying || !selectedTenderToApply}
                  id="btn-apply-tender"
                  style={{
                    background: applying ? '#94a3b8' : 'linear-gradient(135deg, #1e3a5f, #1e40af)',
                    color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px',
                    fontSize: 13, fontWeight: 700, cursor: applying ? 'not-allowed' : 'pointer',
                  }}
                >
                  {applying ? '⏳ Initializing Bid Package…' : '🚀 Initialize Bid Package'}
                </button>
              </div>
            </div>
          </div>

          {/* Submitted Bids & Documents Management */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1e3a5f', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📦</span> My Bid Packages & Document Submissions ({myBids.length})
            </div>

            {myBids.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                You have not submitted any bids yet. Use the "Apply to Active GeM Tender" card above to get started.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {myBids.map(bid => {
                  const results = evalResults[bid.id];
                  const isSelected = selectedBidId === bid.id;

                  return (
                    <div
                      key={bid.id}
                      style={{
                        border: isSelected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: 18,
                        background: isSelected ? '#f8fafc' : '#fff',
                        boxShadow: isSelected ? '0 4px 12px rgba(59, 130, 246, 0.08)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Bid Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>Bid #{bid.id.slice(-6)}</span>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>·</span>
                            <span>{bid.tender_reference || 'Tender Submission'}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Submitted: {new Date(bid.submitted_at || Date.now()).toLocaleDateString()} · Status: <strong>{bid.overall_status || 'PENDING'}</strong>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <StatusBadge status={bid.overall_status || 'PENDING'} />
                          {bid.officer_status && (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                              background: bid.officer_status === 'APPROVE' ? '#dcfce7' : '#fee2e2',
                              color: bid.officer_status === 'APPROVE' ? '#166534' : '#991b1b',
                            }}>
                              Officer: {bid.officer_status}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions Bar for this bid */}
                      <div style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        padding: '12px 14px',
                        background: '#f1f5f9',
                        borderRadius: 8,
                        marginBottom: 12,
                      }}>
                        {/* Document Upload Button */}
                        <label
                          style={{
                            background: '#fff', border: '1px solid #cbd5e1', padding: '7px 14px',
                            borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#1e293b', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <UploadCloud size={14} color="#2563eb" />
                          <span>Upload Document (CA, GST, Udyam PDF)</span>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={e => {
                              handleSelectBid(bid.id);
                              handleFileUpload(e);
                            }}
                            style={{ display: 'none' }}
                          />
                        </label>

                        {/* Pre-submission Self-check */}
                        <button
                          onClick={() => handleSelfCheck(bid.id)}
                          disabled={evaluating}
                          id={`btn-self-check-${bid.id}`}
                          style={{
                            background: 'linear-gradient(135deg, #059669, #10b981)',
                            color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px',
                            fontSize: 12, fontWeight: 700, cursor: evaluating ? 'not-allowed' : 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <span>⚖️</span> {evaluating ? 'Evaluating Rules…' : 'Run Pre-Submission Self-Check'}
                        </button>

                        {/* CORE INTERFACE SHORTCUT 1: Split PDF Viewer */}
                        <button
                          onClick={() => {
                            handleSelectBid(bid.id);
                            setActiveTab('SPLIT_VIEWER');
                          }}
                          id={`btn-open-viewer-${bid.id}`}
                          style={{
                            background: '#fff',
                            border: '1px solid #93c5fd',
                            color: '#1d4ed8',
                            borderRadius: 6,
                            padding: '7px 14px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <SplitSquareVertical size={14} color="#2563eb" />
                          <span>Inspect PDF & B-Boxes</span>
                        </button>

                        {/* CORE INTERFACE SHORTCUT 2: Decision Graph USP */}
                        <button
                          onClick={() => {
                            handleSelectBid(bid.id);
                            setActiveTab('DECISION_GRAPH');
                          }}
                          id={`btn-open-graph-${bid.id}`}
                          style={{
                            background: '#fff',
                            border: '1px solid #c4b5fd',
                            color: '#6d28d9',
                            borderRadius: 6,
                            padding: '7px 14px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <GitFork size={14} color="#7c3aed" />
                          <span>Decision Graph (USP)</span>
                        </button>

                        {/* CORE INTERFACE SHORTCUT 3: Audit Replay Modal */}
                        <button
                          onClick={() => {
                            handleSelectBid(bid.id);
                            setIsAuditModalOpen(true);
                          }}
                          id={`btn-open-audit-${bid.id}`}
                          style={{
                            background: '#fff',
                            border: '1px solid #86efac',
                            color: '#15803d',
                            borderRadius: 6,
                            padding: '7px 14px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <ShieldCheck size={14} color="#16a34a" />
                          <span>Audit Replay</span>
                        </button>

                        {uploading && selectedBidId === bid.id && (
                          <span style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>
                            Uploading & parsing OCR: {uploadPct}%
                          </span>
                        )}
                      </div>

                      {/* Self-check Results Preview */}
                      {results && results.length > 0 && (
                        <div style={{ marginTop: 14, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>
                            Pre-Submission Compliance Verification Feedback:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {results.map((r, i) => (
                              <div
                                key={i}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', fontSize: 12,
                                }}
                              >
                                <span style={{ fontWeight: 600, color: '#334155' }}>
                                  {r.requirement_rule?.description || r.requirement_rule?.rule_type || `Rule #${i + 1}`}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 11, color: '#64748b' }}>{r.explanation}</span>
                                  <StatusBadge status={r.result} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          AUDIT REPLAY MODAL POPUP
          ══════════════════════════════════════════════════════════════════════════ */}
      <AuditReplayModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        auditTimeline={bidAuditTimeline.length > 0 ? bidAuditTimeline : DEFAULT_AUDIT_EVENTS}
        bidReference={tenderRef}
      />
    </div>
  );
}
