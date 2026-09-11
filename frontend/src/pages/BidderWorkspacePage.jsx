/**
 * BidderWorkspacePage — BIDDER only
 *
 * Owns:
 *  Tab 1 — My Submissions: list of tenders applied to, own bid status
 *  Tab 2 — Upload Documents: sealed technical/financial envelope upload
 *  Tab 3 — Dry-Run Checker: pre-submission self-compliance check
 *
 * Does NOT contain:
 *  ✗ Officer bidder directory  (→ /dashboard for officers)
 *  ✗ Split document viewer (officer evaluation tool)
 *  ✗ Clause-to-evidence graph (officer tool)
 *  ✗ Audit SHA-256 chain  (→ /audit)
 *  ✗ Other bidders' data (bidder sees ONLY their own)
 *  ✗ Override / officer action buttons
 */

import { useEffect, useState } from 'react';
import {
  getMyProfile, getMyBids, listTenders,
  submitBid, uploadBidderDocument, evaluateBid,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';

const TABS = ['SUBMISSIONS', 'UPLOAD', 'DRY_RUN'];
const TAB_LABELS = { SUBMISSIONS: '📋 My Submissions', UPLOAD: '📤 Upload Documents', DRY_RUN: '🔍 Dry-Run Check' };

const TURNOVER_REQ = 10.0;
const LOCAL_CONTENT_REQ = 50.0;

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    PASS: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    COMPLIANT: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    FAIL: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    NON_COMPLIANT: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    REVIEW: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    UNDER_REVIEW: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    PENDING: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
    PENDING_VERIFICATION: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
    ACTIVE: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  };
  const s = map[status] || map['PENDING'];
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Tab 1: My Submissions ────────────────────────────────────────────────────
function MySubmissionsTab({ bids, tenders, onApply, applying, selectedTender, setSelectedTender, loading }) {
  return (
    <div>
      {/* Apply to a new tender */}
      <SectionCard title="Apply to Open Tender" subtitle="Submit a bid package for an active procurement tender">
        {tenders.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>No open tenders available at this time.</div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Select Tender</label>
              <select
                value={selectedTender}
                onChange={e => setSelectedTender(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
              >
                {tenders.map(t => (
                  <option key={t.id} value={t.id}>{t.reference_number || t.title}</option>
                ))}
              </select>
            </div>
            <button
              onClick={onApply}
              disabled={applying || !selectedTender}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: applying ? 'wait' : 'pointer' }}
            >
              {applying ? '⏳ Submitting…' : '+ Apply to Tender'}
            </button>
          </div>
        )}
      </SectionCard>

      {/* My bid list */}
      <SectionCard
        title={`My Bid Submissions (${bids.length})`}
        subtitle="Your submitted bid packages and their current compliance status"
      >
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
        ) : bids.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            No submissions yet. Apply to an open tender above to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {['Tender / Bid ID', 'Submitted', 'Compliance Status', 'Risk'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bids.map((b, i) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '11px 12px' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', fontSize: 12 }}>{b.tender_id || b.id}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Bid #{b.id?.slice(-8)}</div>
                  </td>
                  <td style={{ padding: '11px 12px', fontSize: 11, color: '#64748b' }}>
                    {b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td style={{ padding: '11px 12px' }}><StatusPill status={b.overall_status || b.compliance_status || 'PENDING'} /></td>
                  <td style={{ padding: '11px 12px' }}><StatusPill status={b.risk_band || 'LOW'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Tab 2: Upload Documents ──────────────────────────────────────────────────
function UploadTab({ bids, selectedBidId, setSelectedBidId, uploading, uploadPct, onUpload }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useState(null);

  return (
    <div>
      {bids.length === 0 ? (
        <SectionCard title="No Active Bids">
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Apply to a tender first (My Submissions tab) before uploading documents.</div>
        </SectionCard>
      ) : (
        <SectionCard title="Upload Bid Documents" subtitle="Upload your sealed technical and financial envelopes for evaluation">
          {/* Bid selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Select Bid Package</label>
            <select
              value={selectedBidId || ''}
              onChange={e => setSelectedBidId(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, minWidth: 280 }}
            >
              {bids.map(b => (
                <option key={b.id} value={b.id}>Bid #{b.id?.slice(-8)} — {b.tender_id || 'Tender'}</option>
              ))}
            </select>
          </div>

          {/* Two-envelope guidance */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
            <strong>Two-Envelope System:</strong> Upload your Technical Bid (eligibility documents) and Financial Bid (price quote) separately.
            Financial envelope is sealed and will only be unsealed after technical compliance clearance.
          </div>

          {/* Drop zone */}
          {selectedBidId && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) onUpload(e.dataTransfer.files[0]); }}
              style={{
                border: `2px dashed ${dragOver ? '#2563eb' : '#cbd5e1'}`,
                borderRadius: 12,
                padding: '36px 24px',
                textAlign: 'center',
                background: dragOver ? '#eff6ff' : '#f8fafc',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                Drag & drop your document here, or click to browse
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                Accepted formats: PDF, JPEG, PNG · Max 50MB
              </div>
              <label style={{ padding: '9px 20px', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                📁 Browse Files
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
              </label>
            </div>
          )}

          {/* Upload progress */}
          {uploading && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>Uploading & encrypting…</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{uploadPct}%</span>
              </div>
              <div style={{ background: '#e2e8f0', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${uploadPct}%`, height: '100%', background: '#2563eb', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Document types guide */}
      <SectionCard title="Required Documents Checklist" subtitle="Ensure you have all mandatory documents before submission">
        {[
          { name: 'CA Turnover Certificate', requirement: 'Average Annual Turnover ≥ ₹10 Cr (3FY)', mandatory: true },
          { name: 'MII Local Content Affidavit', requirement: 'Local content ≥ 50% (Class-I Supplier)', mandatory: true },
          { name: 'GST Registration Certificate (REG-06)', requirement: 'Active GSTIN in operating state', mandatory: true },
          { name: 'PAN Card', requirement: 'Matching legal entity name', mandatory: true },
          { name: 'Udyam Registration Certificate', requirement: 'MSE exemption (if applicable)', mandatory: false },
          { name: 'Technical Completion Certificates', requirement: 'Comparable project experience', mandatory: true },
        ].map(doc => (
          <div key={doc.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 16 }}>{doc.mandatory ? '📌' : '📎'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{doc.name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{doc.requirement}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: doc.mandatory ? '#fee2e2' : '#f1f5f9', color: doc.mandatory ? '#991b1b' : '#475569' }}>
              {doc.mandatory ? 'MANDATORY' : 'OPTIONAL'}
            </span>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─── Tab 3: Dry-Run Checker ───────────────────────────────────────────────────
function DryRunTab() {
  const [turnover, setTurnover] = useState('');
  const [localContent, setLocalContent] = useState('');
  const [gstin, setGstin] = useState('');
  const [udyam, setUdyam] = useState('');
  const [result, setResult] = useState(null);

  function runCheck() {
    const tv = parseFloat(turnover);
    const lc = parseFloat(localContent);
    const gstinValid = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/.test(gstin);

    const checks = [
      { rule: 'REQ-FIN-01', label: 'Annual Turnover ≥ ₹10.00 Cr', status: tv >= TURNOVER_REQ ? 'PASS' : 'FAIL', detail: `You entered ₹${tv.toFixed(2)} Cr. ${tv >= TURNOVER_REQ ? 'Meets' : `Below`} the ₹${TURNOVER_REQ} Cr requirement.` },
      { rule: 'REQ-MII-02', label: 'Local Content ≥ 50% (Class-I)', status: lc >= LOCAL_CONTENT_REQ ? 'PASS' : (lc > 0 ? 'FAIL' : 'PENDING'), detail: `You entered ${lc.toFixed(1)}%. ${lc >= LOCAL_CONTENT_REQ ? 'Qualifies as Class-I Local Supplier.' : 'Below 50% Class-I threshold.'}` },
      { rule: 'REQ-STAT-03', label: 'GSTIN Format Valid', status: gstinValid ? 'PASS' : (gstin ? 'FAIL' : 'PENDING'), detail: gstinValid ? 'GSTIN format matches 15-character GSTINpattern.' : (gstin ? 'Invalid GSTIN format. Expected: 12XXXXX1234X1ZX' : 'GSTIN not entered.') },
      { rule: 'REQ-MSME-04', label: 'Udyam Number (if MSE)', status: udyam ? (udyam.startsWith('UDYAM-') ? 'PASS' : 'REVIEW') : 'NOT_APPLICABLE', detail: udyam ? (udyam.startsWith('UDYAM-') ? 'Valid Udyam prefix detected.' : 'Unexpected format. Expected: UDYAM-XX-00-0000000') : 'Not applicable — MSME exemption not claimed.' },
    ];

    const allPass = checks.every(c => ['PASS', 'NOT_APPLICABLE'].includes(c.status));
    const hasFail = checks.some(c => c.status === 'FAIL');
    setResult({ checks, verdict: hasFail ? 'LIKELY_FAIL' : allPass ? 'LIKELY_PASS' : 'REVIEW_REQUIRED' });
  }

  const statusColor = { PASS: '#166534', FAIL: '#991b1b', REVIEW: '#92400e', PENDING: '#475569', NOT_APPLICABLE: '#64748b' };
  const statusBg = { PASS: '#dcfce7', FAIL: '#fee2e2', REVIEW: '#fffbeb', PENDING: '#f1f5f9', NOT_APPLICABLE: '#f8fafc' };

  return (
    <div>
      <SectionCard title="Pre-Submission Dry-Run Checker" subtitle="Enter your company details to simulate a compliance check before submitting. This is indicative only — final determination is by the GeM-Guard rules engine.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Annual Turnover (₹ Cr)', placeholder: 'e.g. 12.5', value: turnover, set: setTurnover },
            { label: 'Local Content Percentage (%)', placeholder: 'e.g. 65.0', value: localContent, set: setLocalContent },
            { label: 'GSTIN', placeholder: 'e.g. 33AAACB6666L1ZP', value: gstin, set: setGstin },
            { label: 'Udyam Number (if MSME, optional)', placeholder: 'e.g. UDYAM-TN-01-0033333', value: udyam, set: setUdyam },
          ].map(f => (
            <div key={f.label}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input
                value={f.value}
                onChange={e => f.set(e.target.value)}
                placeholder={f.placeholder}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
        <button
          onClick={runCheck}
          style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          🔍 Run Dry-Run Compliance Check
        </button>
      </SectionCard>

      {result && (
        <SectionCard
          title="Dry-Run Result"
          subtitle="Indicative only. Final decisions are made by the deterministic rules engine after document upload."
        >
          {/* Verdict */}
          <div style={{
            padding: '14px 18px', borderRadius: 10, marginBottom: 16, fontWeight: 800, fontSize: 14,
            background: result.verdict === 'LIKELY_PASS' ? '#dcfce7' : result.verdict === 'LIKELY_FAIL' ? '#fee2e2' : '#fffbeb',
            color: result.verdict === 'LIKELY_PASS' ? '#166534' : result.verdict === 'LIKELY_FAIL' ? '#991b1b' : '#92400e',
            border: `1px solid ${result.verdict === 'LIKELY_PASS' ? '#86efac' : result.verdict === 'LIKELY_FAIL' ? '#fca5a5' : '#fde68a'}`,
          }}>
            {result.verdict === 'LIKELY_PASS' ? '✓ LIKELY ELIGIBLE — All checked rules indicate compliance.' :
             result.verdict === 'LIKELY_FAIL' ? '✗ LIKELY INELIGIBLE — One or more mandatory rules failed.' :
             '⚠ REVIEW REQUIRED — Some parameters need verification before submission.'}
          </div>

          {/* Per-rule results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.checks.map(c => (
              <div key={c.rule} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 8, border: `1px solid ${statusBg[c.status] === '#f8fafc' ? '#e2e8f0' : statusBg[c.status]}`, background: statusBg[c.status] || '#f8fafc', borderLeft: `3px solid ${statusColor[c.status] || '#94a3b8'}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>{c.rule}</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#475569' }}>{c.detail}</div>
                </div>
                <span style={{ fontWeight: 800, fontSize: 11, padding: '3px 10px', borderRadius: 20, background: statusBg[c.status] || '#f8fafc', color: statusColor[c.status] || '#64748b', border: `1px solid ${statusColor[c.status] || '#94a3b8'}`, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
            ⚠️ <strong>Disclaimer:</strong> This dry-run uses simplified rule checks. The actual GeM-Guard engine cross-references GSTN, CBDT PAN, ICAI UDIN, and UDYAM registries for final verification. Officers make all final qualification decisions.
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BidderWorkspacePage() {
  const [profile, setProfile] = useState(null);
  const [myBids, setMyBids] = useState([]);
  const [openTenders, setOpenTenders] = useState([]);
  const [selectedBidId, setSelectedBidId] = useState(null);
  const [selectedTender, setSelectedTender] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [activeTab, setActiveTab] = useState('SUBMISSIONS');

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [prof, bids, tenders] = await Promise.allSettled([
          getMyProfile(),
          getMyBids(),
          listTenders(),
        ]);
        if (prof.status === 'fulfilled') setProfile(prof.value);
        const bidList = bids.status === 'fulfilled' ? (bids.value?.bids || bids.value || []) : [];
        if (Array.isArray(bidList) && bidList.length > 0) {
          setMyBids(bidList);
          setSelectedBidId(bidList[0].id);
        }
        const tenderList = tenders.status === 'fulfilled' ? (tenders.value?.tenders || tenders.value || []) : [];
        if (Array.isArray(tenderList) && tenderList.length > 0) {
          setOpenTenders(tenderList);
          setSelectedTender(tenderList[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load workspace');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function handleApply() {
    if (!selectedTender) return;
    setApplying(true);
    setError(null);
    try {
      const res = await submitBid(selectedTender);
      setSuccessMsg(`Bid package created! ID: ${res.id}`);
      const updated = await getMyBids().catch(() => []);
      const list = updated?.bids || updated || [];
      setMyBids(Array.isArray(list) ? list : []);
      if (res.id) setSelectedBidId(res.id);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Application failed');
    } finally {
      setApplying(false);
    }
  }

  async function handleFileUpload(file) {
    if (!selectedBidId) return;
    setUploading(true);
    setUploadPct(10);
    setError(null);
    try {
      await uploadBidderDocument(selectedBidId, file, pct => setUploadPct(pct));
      setSuccessMsg(`${file.name} uploaded and encrypted successfully!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 54px)', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', letterSpacing: '0.06em' }}>
            🏢 BIDDER / VENDOR PORTAL
          </span>
          <h1 style={{ margin: '6px 0 2px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
            {profile?.company_name || 'My Bid Workspace'}
          </h1>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {profile?.gstin && `GSTIN: ${profile.gstin} · `}GeM Vendor Self-Service Portal
          </div>
        </div>
        {profile && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: '#166534' }}>
            <strong>Registration Status:</strong> {profile.status || 'Active Vendor'} ·
            Category: {profile.category || 'Local Supplier'}
          </div>
        )}
      </div>

      {/* ─── Banners ──────────────────────────────────────────────────────── */}
      {(successMsg || error) && (
        <div style={{ padding: '10px 28px' }}>
          {successMsg && (
            <div style={{ padding: '10px 16px', borderRadius: 8, background: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              ✓ {successMsg}
            </div>
          )}
          {error && (
            <div style={{ padding: '10px 16px', borderRadius: 8, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
              {error}
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab Bar ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 28px', display: 'flex', gap: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            id={`tab-${tab.toLowerCase()}`}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '14px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              color: activeTab === tab ? '#2563eb' : '#64748b',
              borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ──────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
        {activeTab === 'SUBMISSIONS' && (
          <MySubmissionsTab
            bids={myBids}
            tenders={openTenders}
            onApply={handleApply}
            applying={applying}
            selectedTender={selectedTender}
            setSelectedTender={setSelectedTender}
            loading={loading}
          />
        )}
        {activeTab === 'UPLOAD' && (
          <UploadTab
            bids={myBids}
            selectedBidId={selectedBidId}
            setSelectedBidId={setSelectedBidId}
            uploading={uploading}
            uploadPct={uploadPct}
            onUpload={handleFileUpload}
          />
        )}
        {activeTab === 'DRY_RUN' && <DryRunTab />}
      </div>
    </div>
  );
}
