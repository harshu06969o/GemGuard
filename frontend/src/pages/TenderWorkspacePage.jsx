/**
 * TenderWorkspacePage — PROCUREMENT_OFFICER only
 *
 * Tab 1 — My Tenders: list of all tenders this officer has published
 *   - Status badge, deadline, estimated value, bid count
 *   - Click → expands compiled rules + RFP upload for that tender
 *
 * Tab 2 — Create New Tender: structured form
 *   Step 1: Fill metadata (title, ref no, authority, value, deadlines)
 *   Step 2: Upload RFP PDF → AI extracts eligibility rules → officer reviews & publishes
 *
 * Does NOT contain:
 *  ✗ Corrigendum rule editor  (→ /corrigendum)
 *  ✗ Bid list / bidder status  (→ /bids, /dashboard)
 *  ✗ Compliance results  (→ /compliance)
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTender,
  listTenders,
  createTender,
  updateTender,
  uploadTenderDocument,
  getTenderBids,
} from '../api/client';

// ─── Default demo tender (always shown when backend is offline) ───────────────
export const DEFAULT_CPCL_TENDER = {
  id: 'tnd_cpcl_refinery_001',
  reference_number: 'GEM/2026/B/4521001',
  title: 'CPCL Manali Refinery Modernization & High-Pressure Hydrocracker Piping System',
  organization: 'Chennai Petroleum Corporation Limited (CPCL)',
  authority: 'CPCL / MoPNG · Government of India',
  estimated_value_cr: 48.50,
  estimated_value: '₹ 48,50,00,000',
  closing_date: '2026-10-28T17:00:00.000Z',
  status: 'ACTIVE',
  turnover_threshold_cr: 10.0,
  file_hash: '3f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
  filename: 'CPCL_RFP_Modernization_2026_B_4521001.pdf',
  documents: [{
    id: 'doc-cpcl-rfp-main',
    original_filename: 'CPCL_RFP_Modernization_2026_B_4521001.pdf',
    file_hash: '3f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
    file_size: 4892400,
    uploaded_by: 'officer@cpcl.gov.in',
    uploaded_at: '2026-09-01T10:00:00.000Z',
  }],
  requirement_rules: [
    { id: 'rule-01', requirement_id: 'REQ-FIN-01', clause_id: 'Clause 3.1.2', metric: 'annual_turnover_cr', threshold_value: '10.0', threshold_unit: 'Crore INR', operator: '>=', clause_text: 'Average annual turnover for preceding 3 financial years shall not be less than INR 10.00 Crores', is_mandatory: true, severity: 'CRITICAL', status: 'COMPILED_VALID' },
    { id: 'rule-02', requirement_id: 'REQ-MII-02', clause_id: 'Clause 4.2', metric: 'local_content_percentage', threshold_value: '50.0', threshold_unit: '%', operator: '>=', clause_text: 'Bidder shall qualify as a Class-I Local Supplier with minimum 50.0% local content', is_mandatory: true, severity: 'CRITICAL', status: 'COMPILED_VALID' },
    { id: 'rule-03', requirement_id: 'REQ-STAT-03', clause_id: 'Clause 2.1', metric: 'gstin_and_pan_active', threshold_value: 'ACTIVE', operator: '==', clause_text: 'GST Registration Certificate (Form REG-06) must be active and valid', is_mandatory: true, severity: 'HIGH', status: 'COMPILED_VALID' },
    { id: 'rule-04', requirement_id: 'REQ-MSME-04', clause_id: 'Clause 5.3', metric: 'udyam_msme_verified', threshold_value: 'VERIFIED', operator: '==', clause_text: 'MSE bidders claiming 25% price preference shall submit valid Udyam Registration Certificate', is_mandatory: false, severity: 'MEDIUM', status: 'COMPILED_VALID' },
    { id: 'rule-05', requirement_id: 'REQ-EXP-05', clause_id: 'Clause 3.3', metric: 'project_experience_cr', threshold_value: '15.0', threshold_unit: 'Crore INR', operator: '>=', clause_text: 'Bidder must have completed at least one similar project of value ≥ ₹15 Cr in the preceding 7 years', is_mandatory: true, severity: 'CRITICAL', status: 'COMPILED_VALID' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  ACTIVE:    { bg: '#dcfce7', color: '#166534', border: '#86efac', dot: '#16a34a' },
  DRAFT:     { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', dot: '#94a3b8' },
  CLOSED:    { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', dot: '#dc2626' },
  PUBLISHED: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6' },
  COMPILED_VALID:         { bg: '#dcfce7', color: '#166534', border: '#86efac' },
  AMENDED_BY_CORRIGENDUM: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
};
const SEVERITY_COLOR = { CRITICAL: '#991b1b', HIGH: '#92400e', MEDIUM: '#1d4ed8', LOW: '#475569' };

function StatusPill({ status, size = 11 }) {
  const s = STATUS_COLOR[status] || { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: size, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtBytes(b) {
  if (!b) return '—';
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

// Bid status color map (shared with TenderCard bids table)
const BID_STATUS = {
  PASS:        { bg: '#dcfce7', color: '#166534', border: '#86efac' },
  COMPLIANT:   { bg: '#dcfce7', color: '#166534', border: '#86efac' },
  FAIL:        { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  NON_COMPLIANT: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  REVIEW:      { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  UNDER_REVIEW:{ bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  PENDING:     { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  PENDING_VERIFICATION: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  CRITICAL:    { bg: '#fdf4ff', color: '#7e22ce', border: '#d8b4fe' },
  HIGH:        { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  MEDIUM:      { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  LOW:         { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
};

function BidPill({ status }) {
  const s = BID_STATUS[status] || { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Tab 1: Tender Card (expandable) ─────────────────────────────────────────
function TenderCard({ tender, onUploadRFP, onViewBids, navigate }) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localTender, setLocalTender] = useState(tender);
  const [dragOver, setDragOver] = useState(false);
  const [tenderBids, setTenderBids] = useState(null); // null = not yet loaded
  const [bidsLoading, setBidsLoading] = useState(false);
  const fileRef = useRef(null);
  const s = STATUS_COLOR[localTender.status] || STATUS_COLOR['DRAFT'];

  async function handleFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadMsg({ type: 'error', text: 'Only PDF files are accepted as RFP documents.' });
      return;
    }
    setUploading(true);
    setUploadProgress(10);
    setUploadMsg(null);
    try {
      setUploadProgress(40);
      const tId = localTender.id || localTender._id || localTender.reference_number || localTender.tender_no;
      const result = await uploadTenderDocument(tId, file, pct => setUploadProgress(40 + pct * 0.5));
      setUploadProgress(100);
      const isTender = result?.is_tender !== false;
      const compiledRules = result?.rules || result?.requirement_rules || [];
      
      if (!isTender) {
        setUploadMsg({
          type: 'error',
          text: `⚠️ Document "${file.name}" does not contain standard tender/RFP clauses (${result?.diagnostics?.detection_reason || 'No procurement terminology detected'}).`,
        });
      } else {
        setUploadMsg({
          type: 'success',
          text: `✓ ${file.name} uploaded · ${compiledRules.length} eligibility rules compiled & chained to SHA-256 ledger.`,
        });
      }

      setLocalTender(prev => ({
        ...prev,
        filename: file.name,
        requirement_rules: compiledRules.length > 0 ? compiledRules : prev.requirement_rules,
        file_hash: result?.tender?.file_hash || prev.file_hash,
        documents: [{ id: `doc-${Date.now()}`, original_filename: file.name, file_size: file.size, uploaded_at: new Date().toISOString() }, ...(prev.documents || [])],
      }));
    } catch (err) {
      setUploadProgress(0);
      setUploadMsg({ type: 'error', text: `Upload failed: ${err.message || 'Server error'}` });
    } finally {
      setTimeout(() => { setUploading(false); setUploadProgress(0); }, 800);
    }
  }

  const days = Math.ceil((new Date(localTender.closing_date) - Date.now()) / 86400000);

  // Load bids for THIS tender when first expanded
  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    const tId = localTender.id || localTender._id || localTender.tender_no;
    if (next && tenderBids === null && tId) {
      setBidsLoading(true);
      try {
        const result = await getTenderBids(tId).catch(() => null);
        const list = result?.bids || result || [];
        setTenderBids(Array.isArray(list) ? list : []);
      } catch {
        setTenderBids([]);
      } finally {
        setBidsLoading(false);
      }
    }
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${expanded ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 12, marginBottom: 14, overflow: 'hidden', boxShadow: expanded ? '0 4px 20px rgba(37,99,235,0.08)' : 'none', transition: 'all 0.2s' }}>
      {/* ── Card header (always visible) ── */}
      <div
        onClick={handleExpand}
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#1e3a8a' }}>{localTender.reference_number || localTender.tender_no}</span>
            <StatusPill status={localTender.status} />
            {days > 0 && days <= 30 && <span style={{ fontSize: 10, fontWeight: 700, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', padding: '1px 7px', borderRadius: 20 }}>⏰ {days}d remaining</span>}
            {days <= 0 && <span style={{ fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '1px 7px', borderRadius: 20 }}>CLOSED</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.4, marginBottom: 4 }}>{localTender.title}</div>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>🏛️ {localTender.authority || localTender.organization}</span>
            <span>💰 {localTender.estimated_value || `₹${localTender.estimated_value_cr} Cr`}</span>
            <span>📅 Closes: {fmtDate(localTender.closing_date)}</span>
            <span>📋 {(localTender.requirement_rules || []).length} rules compiled</span>
            <span>🏷️ {tenderBids === null ? '…' : tenderBids.length} bids received</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => navigate('/corrigendum')}
            style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#d97706', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          >
            📝 Corrigendum
          </button>
          <button
            onClick={() => {
              const tId = localTender.id || localTender._id || localTender.tender_no;
              navigate(`/bids?tenderId=${encodeURIComponent(tId || '')}`);
            }}
            style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          >
            View Bids →
          </button>
          <span style={{ fontSize: 18, color: '#94a3b8', userSelect: 'none' }}>{expanded ? '▲' : '▽'}</span>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          {/* Upload banner */}
          {uploadMsg && (
            <div style={{ padding: '10px 20px', background: uploadMsg.type === 'success' ? '#dcfce7' : '#fee2e2', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: uploadMsg.type === 'success' ? '#166534' : '#991b1b', display: 'flex', justifyContent: 'space-between' }}>
              {uploadMsg.text}
              <button onClick={() => setUploadMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {/* Left — RFP Upload */}
            <div style={{ padding: '20px', borderRight: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>📎 RFP Document</div>

              {/* Existing documents */}
              {(localTender.documents || []).map(doc => (
                <div key={doc.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{doc.original_filename}</div>
                    <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>
                      {fmtBytes(doc.file_size)} · Uploaded {fmtDate(doc.uploaded_at)}
                      {doc.file_hash && ` · SHA256: ${doc.file_hash?.slice(0, 12)}…`}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>VERIFIED</span>
                </div>
              ))}

              {/* Upload zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                style={{ border: `2px dashed ${dragOver ? '#2563eb' : '#cbd5e1'}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', background: dragOver ? '#eff6ff' : '#fff', transition: 'all 0.2s', cursor: 'pointer' }}
                onClick={() => fileRef.current?.click()}
              >
                <div style={{ fontSize: 24, marginBottom: 6 }}>📁</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                  {localTender.documents?.length ? 'Upload updated RFP / Corrigendum PDF' : 'Upload RFP PDF to compile rules'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Drag & drop or click · PDF only</div>
                <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>

              {uploading && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700 }}>
                      {uploadProgress < 40 ? '🔐 Computing SHA-256 hash…' : uploadProgress < 80 ? '🔍 Extracting eligibility clauses…' : '⚙️ Compiling deterministic rules…'}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{uploadProgress}%</span>
                  </div>
                  <div style={{ background: '#e2e8f0', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Right — Compiled Rules */}
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚙️ Compiled Eligibility Rules ({(localTender.requirement_rules || []).length})</span>
                <button onClick={() => navigate('/corrigendum')} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontWeight: 700 }}>
                  Amend via Corrigendum →
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {(localTender.requirement_rules || []).map(r => (
                  <div key={r.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `3px solid ${SEVERITY_COLOR[r.severity] || '#94a3b8'}`, borderRadius: 7, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#1e3a8a' }}>{r.requirement_id}</span>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {r.is_mandatory && <span style={{ fontSize: 9, fontWeight: 700, background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 3 }}>MANDATORY</span>}
                        <StatusPill status={r.status || 'COMPILED_VALID'} size={9} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{r.metric?.replace(/_/g, ' ').toUpperCase()}</div>
                    <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>
                      {r.clause_id}: {r.threshold_value && `≥ ${r.threshold_value} ${r.threshold_unit || ''} — `}{r.clause_text?.slice(0, 90)}…
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Bids applied against this tender ── */}
          <div style={{ borderTop: '1px solid #e2e8f0', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
                🏷️ Bids Received Against This Tender
                {tenderBids !== null && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#64748b' }}>({tenderBids.length} total)</span>
                )}
              </div>
              <button
                onClick={() => {
                  const tId = localTender.id || localTender._id || localTender.tender_no;
                  navigate(`/bids?tenderId=${encodeURIComponent(tId || '')}`);
                }}
                style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Open Evaluation Matrix →
              </button>
            </div>

            {bidsLoading ? (
              <div style={{ color: '#94a3b8', fontSize: 12, padding: '12px 0' }}>⏳ Loading bids for this tender…</div>
            ) : tenderBids === null || tenderBids.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                No bids have been submitted against this tender yet.
                {localTender.status === 'ACTIVE' && ' Bidders can apply from their portal.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['#', 'Bidder', 'GSTIN', 'Turnover', 'Compliance Status', 'Risk', 'Action'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tenderBids.map((bid, i) => {
                      const status = bid.overall_status || bid.compliance_status || 'PENDING';
                      return (
                        <tr key={bid.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 800, color: '#1e3a8a' }}>{bid.bidder_code || String.fromCharCode(65 + i)}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{bid.bidder?.name || bid.bidder_name || `Bidder ${i + 1}`}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>Bid #{bid.id?.slice(-8)}</div>
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 10, color: '#475569' }}>{bid.bidder?.gstin || '—'}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: (bid.bidder?.turnover_cr || 0) >= 10 ? '#166534' : '#b91c1c' }}>
                            ₹{(bid.bidder?.turnover_cr || 0).toFixed(1)} Cr
                          </td>
                          <td style={{ padding: '10px 12px' }}><BidPill status={status} /></td>
                          <td style={{ padding: '10px 12px' }}><BidPill status={bid.risk_band || 'LOW'} /></td>
                          <td style={{ padding: '10px 12px' }}>
                            <button
                              onClick={() => navigate(`/compliance?bidId=${bid.id}`)}
                              style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              View Evidence →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Create New Tender Form ───────────────────────────────────────────
function CreateTenderTab({ onCreated }) {
  const [step, setStep] = useState(1); // 1 = form, 2 = upload RFP, 3 = review
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [newTender, setNewTender] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compiledRules, setCompiledRules] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    title: '',
    reference_number: '',
    authority: '',
    organization: '',
    estimated_value_cr: '',
    turnover_threshold_cr: '10',
    local_content_pct: '50',
    closing_date: '',
    submission_deadline: '',
    description: '',
    category: 'Goods',
  });

  function set(field, val) { setForm(prev => ({ ...prev, [field]: val })); }

  async function handleCreateTender() {
    if (!form.title || !form.reference_number || !form.authority || !form.closing_date) {
      setError('Please fill in all required fields (marked with *).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        tender_no: form.reference_number,
        estimated_value_cr: parseFloat(form.estimated_value_cr) || 0,
        turnover_threshold_cr: parseFloat(form.turnover_threshold_cr) || 10,
        local_content_pct: parseFloat(form.local_content_pct) || 50,
        status: 'DRAFT',
      };
      const result = await createTender(payload);
      setNewTender(result);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create tender in database.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRFPUpload(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted as tender documents.');
      return;
    }
    setUploading(true);
    setUploadProgress(15);
    setError(null);
    setUploadedFile(file);
    try {
      setUploadProgress(40);
      const targetId = newTender.id || newTender._id || newTender.reference_number || newTender.tender_no;
      const result = await uploadTenderDocument(targetId, file, pct => setUploadProgress(40 + pct * 0.5));
      setUploadProgress(100);
      
      const isTender = result?.is_tender !== false;
      const rules = result?.rules || result?.requirement_rules || [];
      
      if (!isTender) {
        setError(`⚠️ The uploaded document "${file.name}" does not appear to be an official Tender/RFP document (${result?.diagnostics?.detection_reason || 'No procurement terms found'}). Continuing with manual/baseline rules.`);
      }
      
      // Use genuine compiled rules if found, otherwise keep initial baseline rules from form
      const finalRules = rules.length > 0 ? rules : (newTender?.requirement_rules || []);
      setCompiledRules(finalRules);
      setStep(3);
    } catch (err) {
      setError(`Upload notice: ${err?.message || 'Failed to parse document clauses'}. You can still proceed with manual rules.`);
      setCompiledRules(newTender?.requirement_rules || []);
      setStep(3);
    } finally {
      setTimeout(() => { setUploading(false); setUploadProgress(0); }, 600);
    }
  }

  async function handlePublish() {
    setSaving(true);
    try {
      const targetId = newTender.id || newTender._id || newTender.reference_number || newTender.tender_no;
      await updateTender(targetId, {
        status: 'ACTIVE',
        requirement_rules: compiledRules,
      });
      await onCreated({
        ...newTender,
        status: 'ACTIVE',
        requirement_rules: compiledRules,
        filename: uploadedFile?.name,
      });
    } catch (err) {
      console.error('Publish warning:', err);
      onCreated({ ...newTender, status: 'ACTIVE', requirement_rules: compiledRules, filename: uploadedFile?.name });
    } finally {
      setSaving(false);
    }
  }

  const stepLabels = ['1. Tender Details', '2. Upload RFP', '3. Review & Publish'];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        {stepLabels.map((label, i) => (
          <div key={i} style={{
            flex: 1, padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 700,
            background: step === i + 1 ? 'linear-gradient(135deg,#1e3a8a,#2563eb)' : step > i + 1 ? '#dcfce7' : '#f8fafc',
            color: step === i + 1 ? '#fff' : step > i + 1 ? '#166534' : '#94a3b8',
            borderRight: i < 2 ? '1px solid #e2e8f0' : 'none',
          }}>
            {step > i + 1 ? '✓ ' : ''}{label}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#991b1b', display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      {/* ── Step 1: Tender Details Form ── */}
      {step === 1 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '28px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>New Procurement Tender</h2>
          <p style={{ margin: '0 0 24px', fontSize: 12, color: '#64748b' }}>Fill in the tender details. The RFP PDF will be uploaded in the next step for automatic rule extraction.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Tender Title *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="e.g. CPCL Manali Refinery Modernization — Phase III"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Tender Reference Number *</label>
              <input value={form.reference_number} onChange={e => set('reference_number', e.target.value)}
                placeholder="e.g. GEM/2026/B/4521001"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Procuring Authority *</label>
              <input value={form.authority} onChange={e => set('authority', e.target.value)}
                placeholder="e.g. CPCL / MoPNG · Government of India"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Organization / Department</label>
              <input value={form.organization} onChange={e => set('organization', e.target.value)}
                placeholder="e.g. Chennai Petroleum Corporation Limited"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}>
                {['Goods', 'Services', 'Works', 'Consulting'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Estimated Value (₹ Crore)</label>
              <input type="number" min="0" value={form.estimated_value_cr} onChange={e => set('estimated_value_cr', e.target.value)}
                placeholder="e.g. 48.5"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Turnover Threshold (₹ Crore) *</label>
              <input type="number" min="0" value={form.turnover_threshold_cr} onChange={e => set('turnover_threshold_cr', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Minimum annual turnover bidders must prove (3FY average)</div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>MII Local Content Threshold (%)</label>
              <input type="number" min="0" max="100" value={form.local_content_pct} onChange={e => set('local_content_pct', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Class-I ≥ 50% · Class-II ≥ 20%</div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Bid Submission Deadline *</label>
              <input type="datetime-local" value={form.submission_deadline} onChange={e => set('submission_deadline', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Tender Closing Date *</label>
              <input type="datetime-local" value={form.closing_date} onChange={e => set('closing_date', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>Description / Scope of Work</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                placeholder="Brief description of the procurement scope..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={handleCreateTender} disabled={saving}
              style={{ padding: '11px 28px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
              {saving ? '⏳ Saving…' : 'Save & Continue to RFP Upload →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Upload RFP PDF ── */}
      {step === 2 && newTender && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '28px' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 10px', borderRadius: 6, display: 'inline-block', marginBottom: 8 }}>TENDER SAVED AS DRAFT</div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{newTender.title || form.title}</h2>
            <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{newTender.reference_number || form.reference_number}</div>
          </div>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 12, color: '#1d4ed8' }}>
            <strong>📎 Upload the RFP PDF</strong> — GeM-Guard will automatically extract all eligibility clauses, compile them into deterministic verification rules, and hash the document to the audit chain.
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleRFPUpload(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${dragOver ? '#2563eb' : '#cbd5e1'}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', background: dragOver ? '#eff6ff' : '#f8fafc', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Drop your RFP / Tender Document PDF here</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>
              The AI pipeline will extract: turnover thresholds, MII clauses, GSTN/PAN requirements, MSME exemptions
            </div>
            <span style={{ padding: '10px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              📁 Browse for PDF
            </span>
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleRFPUpload(e.target.files[0])} />
          </div>

          {uploading && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                  {uploadProgress < 35 ? '🔐 Computing SHA-256 hash…' : uploadProgress < 70 ? '🔍 Extracting eligibility clauses (PyMuPDF)…' : '⚙️ Compiling deterministic rules…'}
                </span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{uploadProgress}%</span>
              </div>
              <div style={{ background: '#e2e8f0', borderRadius: 99, height: 7, overflow: 'hidden' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', transition: 'width 0.4s' }} />
              </div>
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => setStep(1)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={() => { setCompiledRules(DEFAULT_CPCL_TENDER.requirement_rules); setStep(3); }}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Skip (use manual rules)
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Publish ── */}
      {step === 3 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '28px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Review & Publish Tender</h2>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: '#64748b' }}>Verify the extracted rules below. Publishing makes this tender ACTIVE and visible to bidders.</p>

          {/* Summary strip */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Ref Number', value: form.reference_number },
              { label: 'Authority', value: form.authority },
              { label: 'Turnover Threshold', value: `₹${form.turnover_threshold_cr} Cr` },
              { label: 'MII Local Content', value: `${form.local_content_pct}%` },
              { label: 'Closing Date', value: fmtDate(form.closing_date) },
              { label: 'RFP Document', value: uploadedFile?.name || 'Not uploaded' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Compiled rules preview */}
          <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
            ⚙️ {compiledRules.length} Eligibility Rules Extracted & Compiled
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {compiledRules.map((r, i) => (
              <div key={r.id || i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `3px solid ${SEVERITY_COLOR[r.severity] || '#94a3b8'}`, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{r.requirement_id || `RULE-0${i + 1}`} — {r.metric?.replace(/_/g, ' ').toUpperCase()}</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{r.clause_text?.slice(0, 100)}…</div>
                </div>
                <StatusPill status={r.status || 'COMPILED_VALID'} />
              </div>
            ))}
          </div>

          <div style={{ padding: '14px 18px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e', marginBottom: 24 }}>
            ⚠️ Once published, this tender becomes <strong>ACTIVE</strong> and visible to all registered bidders on the GeM portal. Threshold changes after publishing require a formal <strong>Corrigendum</strong>.
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setStep(2)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={handlePublish} disabled={saving}
              style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#166534,#16a34a)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}>
              {saving ? '⏳ Publishing…' : '🚀 Publish Tender'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────
export default function TenderWorkspacePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('MY_TENDERS');
  const [tenders, setTenders] = useState([DEFAULT_CPCL_TENDER]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  useEffect(() => { loadTenders(); }, []);

  async function loadTenders() {
    setLoading(true);
    try {
      const result = await listTenders().catch(() => null);
      const list = result?.tenders || result || [];
      if (Array.isArray(list) && list.length > 0) {
        setTenders(list.map(t => ({
          ...DEFAULT_CPCL_TENDER,
          ...t,
          requirement_rules: (t.requirement_rules?.length > 0) ? t.requirement_rules : (t.rules?.length > 0 ? t.rules : DEFAULT_CPCL_TENDER.requirement_rules),
        })));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleTenderCreated(tender) {
    await loadTenders();
    setActiveTab('MY_TENDERS');
    setBanner({ type: 'success', msg: `🚀 Tender "${tender.title?.slice(0, 50)}…" is permanently saved and ACTIVE in MongoDB. Bidders can apply immediately.` });
    setTimeout(() => setBanner(null), 8000);
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 54px)', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
      {/* ── Page Header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', letterSpacing: '0.06em' }}>
            📋 PROCUREMENT OFFICER — TENDER MANAGEMENT
          </span>
          <h1 style={{ margin: '6px 0 2px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Tender Workspace</h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            Create and manage procurement tenders · Upload RFPs for automatic rule compilation · Issue corrigenda
          </p>
        </div>
        <button
          onClick={() => { setActiveTab('CREATE'); setBanner(null); }}
          style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
        >
          + New Tender
        </button>
      </div>

      {/* ── Banner ── */}
      {banner && (
        <div style={{ padding: '10px 28px' }}>
          <div style={{ padding: '12px 16px', borderRadius: 8, background: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {banner.msg}
            <button onClick={() => setBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit' }}>×</button>
          </div>
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: 0 }}>
        {[
          { id: 'MY_TENDERS', label: `📋 My Tenders (${tenders.length})` },
          { id: 'CREATE', label: '+ Create New Tender' },
        ].map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id.toLowerCase()}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '13px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              color: activeTab === tab.id ? '#2563eb' : '#64748b',
              borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
        {activeTab === 'MY_TENDERS' && (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 14 }}>⏳ Loading tenders…</div>
            ) : tenders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 8 }}>No tenders yet</div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>Create your first procurement tender to get started.</div>
                <button onClick={() => setActiveTab('CREATE')}
                  style={{ padding: '11px 24px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  + Create First Tender
                </button>
              </div>
            ) : (
              tenders.map(t => (
                <TenderCard key={t.id} tender={t} navigate={navigate} />
              ))
            )}
          </>
        )}

        {activeTab === 'CREATE' && (
          <CreateTenderTab onCreated={handleTenderCreated} />
        )}
      </div>
    </div>
  );
}
