/**
 * Stage 6 + 7 + 8 — Compliance Dashboard
 * Officer workspace: compliance summary, evidence trace, override controls, audit timeline.
 * GeM-Guard is decision support. Officers are the accountable authority.
 */

import { useState, useEffect, useCallback } from 'react';
import ComplianceTraceView from '../components/ComplianceTraceView';
import AuditTimelineView from '../components/AuditTimelineView';
import OverrideModal from '../components/OverrideModal';
import { listBids, getBid, evaluateBid, submitOfficerAction } from '../api/client';

// ── Styles ────────────────────────────────────────────────────────────────────

const RS = {
  PASS:           { color: '#166534', bg: '#dcfce7', border: '#86efac', icon: '✓' },
  FAIL:           { color: '#991b1b', bg: '#fee2e2', border: '#fca5a5', icon: '✗' },
  REVIEW:         { color: '#92400e', bg: '#fef3c7', border: '#fcd34d', icon: '⚠' },
  PENDING:        { color: '#1e40af', bg: '#dbeafe', border: '#93c5fd', icon: '⏳' },
  MISSING:        { color: '#6b21a8', bg: '#f3e8ff', border: '#c4b5fd', icon: '?' },
  EXPIRED:        { color: '#7f1d1d', bg: '#fef2f2', border: '#fca5a5', icon: '⏰' },
  NOT_APPLICABLE: { color: '#374151', bg: '#f3f4f6', border: '#d1d5db', icon: '—' },
};

const RISK_S = {
  LOW:      { color: '#166534', bg: '#dcfce7', dot: '#16a34a' },
  MEDIUM:   { color: '#92400e', bg: '#fef3c7', dot: '#d97706' },
  HIGH:     { color: '#991b1b', bg: '#fee2e2', dot: '#dc2626' },
  CRITICAL: { color: '#4a044e', bg: '#fdf4ff', dot: '#a21caf' },
};

const RULE_LABELS = {
  TURNOVER:      'Annual Turnover',
  GST_STATUS:    'GST Registration',
  UDYAM:         'Udyam / MSME',
  CERT_VALIDITY: 'Certificate Validity',
  NAME_MATCH:    'Entity Name Consistency',
};

// ── Mini badges ───────────────────────────────────────────────────────────────

function ResultBadge({ result }) {
  const s = RS[result] ?? RS.REVIEW;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>
      {s.icon} {result}
    </span>
  );
}

function RiskBadge({ level }) {
  const s = RISK_S[level] ?? RISK_S.LOW;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {level}
    </span>
  );
}

// ── Officer Action Panel ──────────────────────────────────────────────────────

function OfficerActionPanel({ bidId, onSuccess }) {
  const [action, setAction] = useState('ACCEPT');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  const ACTIONS = ['ACCEPT', 'REJECT', 'SEEK_CLARIFICATION', 'MARK_PENDING'];
  const actionStyle = {
    ACCEPT:             { bg: '#dcfce7', color: '#166534' },
    REJECT:             { bg: '#fee2e2', color: '#991b1b' },
    SEEK_CLARIFICATION: { bg: '#fef3c7', color: '#92400e' },
    MARK_PENDING:       { bg: '#dbeafe', color: '#1e40af' },
  };

  async function submit() {
    setLoading(true); setErr(null); setOk(false);
    try {
      const backendAction = action === 'ACCEPT' ? 'APPROVE' : (action === 'MARK_PENDING' ? 'SEEK_CLARIFICATION' : action);
      const justification = comment.trim().length >= 10 
        ? comment.trim() 
        : `Officer recorded compliance evaluation decision: ${backendAction}.`;
      await submitOfficerAction(bidId, {
        action: backendAction,
        comment: justification,
      });
      setOk(true);
      setComment('');
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px', border: '1px solid #e2e8f0', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f', marginBottom: 10 }}>
        👤 Record Officer Decision
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {ACTIONS.map(a => {
          const s = actionStyle[a] ?? { bg: '#f3f4f6', color: '#374151' };
          return (
            <button
              key={a}
              id={`btn-action-${a.toLowerCase()}`}
              onClick={() => setAction(a)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: action === a ? `2px solid ${s.color}` : '2px solid #e2e8f0',
                background: action === a ? s.bg : '#fff',
                color: action === a ? s.color : '#64748b', cursor: 'pointer',
              }}
            >
              {a.replace(/_/g, ' ')}
            </button>
          );
        })}
      </div>
      <textarea
        id="officer-comment"
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Optional: add comments for the record…"
        rows={2}
        style={{
          width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0',
          borderRadius: 8, fontSize: 11, resize: 'vertical', fontFamily: 'inherit',
          boxSizing: 'border-box', outline: 'none',
        }}
      />
      {err && <div style={{ color: '#991b1b', fontSize: 11, marginTop: 6 }}>⛔ {err}</div>}
      {ok  && <div style={{ color: '#166534', fontSize: 11, marginTop: 6 }}>✓ Action recorded in audit log.</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button
          id="btn-officer-submit"
          onClick={submit}
          disabled={loading}
          style={{
            padding: '7px 18px', borderRadius: 8, border: 'none',
            background: loading ? '#94a3b8' : '#1e3a5f', color: '#fff',
            fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '⏳ …' : 'Record Decision'}
        </button>
      </div>
    </div>
  );
}

// ── Summary Table ─────────────────────────────────────────────────────────────

function SummaryTable({ results, onOverride }) {
  const ORDER = { FAIL: 0, EXPIRED: 1, MISSING: 2, REVIEW: 3, PENDING: 4, PASS: 5, NOT_APPLICABLE: 6 };
  const sorted = [...results].sort((a, b) => (ORDER[a.result] ?? 9) - (ORDER[b.result] ?? 9));
  const applicable = results.filter(r => r.result !== 'NOT_APPLICABLE');
  const counts = {
    pass: applicable.filter(r => r.result === 'PASS').length,
    fail: applicable.filter(r => ['FAIL','MISSING','EXPIRED'].includes(r.result)).length,
    review: applicable.filter(r => r.result === 'REVIEW').length,
    pending: applicable.filter(r => r.result === 'PENDING').length,
  };

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { label: 'Rules', value: applicable.length, color: '#1e3a5f', bg: '#f0f4ff' },
          { label: 'Passed', value: counts.pass, color: '#166534', bg: '#dcfce7' },
          { label: 'Failed', value: counts.fail, color: '#991b1b', bg: '#fee2e2' },
          { label: 'Review', value: counts.review, color: '#92400e', bg: '#fef3c7' },
          { label: 'Pending', value: counts.pending, color: '#1e40af', bg: '#dbeafe' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: 8, padding: '7px 14px', textAlign: 'center', minWidth: 64 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Requirement', 'Result', 'Explanation', 'Mandatory', 'Action'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left', fontWeight: 700,
                  fontSize: 10, color: '#64748b', textTransform: 'uppercase',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const rule = r.requirement_rule;
              const rowBg = ['FAIL','MISSING','EXPIRED'].includes(r.result) ? '#fff5f5'
                : r.result === 'REVIEW' ? '#fffbeb'
                : r.result === 'PENDING' ? '#f0f9ff' : '#fff';
              const canOverride = ['FAIL','REVIEW','PENDING','MISSING','EXPIRED'].includes(r.result);
              return (
                <tr key={r.id} style={{ background: rowBg, borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 12 }}>
                      {RULE_LABELS[rule?.rule_type ?? ''] ?? rule?.rule_type ?? '—'}
                    </div>
                    {rule?.clause && (
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>Clause {rule.clause.clause_number}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}><ResultBadge result={r.result} /></td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: '#475569', maxWidth: 240 }}>
                    {r.explanation ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {rule?.is_mandatory
                      ? <span style={{ color: '#dc2626', fontWeight: 800, fontSize: 11 }}>YES</span>
                      : <span style={{ color: '#94a3b8', fontSize: 11 }}>No</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {canOverride && (
                      <button
                        id={`btn-override-${r.id}`}
                        onClick={() => onOverride(r)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                          border: '1.5px solid #f59e0b', background: '#fffbeb', color: '#92400e',
                          cursor: 'pointer',
                        }}
                      >
                        ⚖️ Override
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Bidder Detail Panel ────────────────────────────────────────────────────────

function BidderDetail({ bid, onRefresh }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [evaluating, setEvaluating] = useState(false);
  const [overrideProps, setOverrideProps] = useState(null);

  const results = bid.rule_results ?? [];
  const ra = bid.risk_assessment;
  const hasFail    = results.some(r => ['FAIL','MISSING','EXPIRED'].includes(r.result));
  const hasReview  = results.some(r => r.result === 'REVIEW');
  const hasPending = results.some(r => r.result === 'PENDING');
  const lastAction = bid.officer_actions?.[bid.officer_actions.length - 1];

  async function handleEvaluate() {
    setEvaluating(true);
    try {
      await evaluateBid(bid.id);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  }

  function openOverride(r) {
    setOverrideProps({
      bidId: bid.id,
      bidderName: bid.bidder?.name ?? 'Bidder',
      ruleType: RULE_LABELS[r.requirement_rule?.rule_type ?? ''] ?? (r.requirement_rule?.rule_type ?? 'Rule'),
      currentResult: r.result,
      ruleResultId: r.id,
    });
  }

  return (
    <div>
      {/* Bidder header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e3a5f' }}>
            {bid.bidder?.name ?? 'Unknown'}
          </h2>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            GSTIN: {bid.bidder?.gstin ?? '—'} · ₹{bid.bidder?.turnover_cr} Cr · {bid.bidder?.category}
          </div>
          {lastAction && (
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
              Last officer action: <strong>{lastAction.action}</strong> by {lastAction.officer_id}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {ra && <RiskBadge level={ra.risk_level} />}
          <ResultBadge result={bid.overall_status} />
          {bid.officer_status && bid.officer_status !== bid.overall_status && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: '#e0e7ff', color: '#3730a3', border: '1px solid #a5b4fc',
            }}>
              Officer: {bid.officer_status}
            </span>
          )}
          <button
            id={`btn-evaluate-${bid.id}`}
            onClick={handleEvaluate}
            disabled={evaluating}
            style={{
              background: evaluating ? '#94a3b8' : '#1e3a5f', color: '#fff',
              border: 'none', borderRadius: 8, padding: '6px 12px',
              fontSize: 11, fontWeight: 700, cursor: evaluating ? 'not-allowed' : 'pointer',
            }}
          >
            {evaluating ? '⏳ …' : '⟳ Re-evaluate'}
          </button>
        </div>
      </div>

      {/* Exception banners */}
      {hasFail && (
        <div style={{
          background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10,
          padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⛔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#991b1b', fontSize: 12 }}>Mandatory Requirement Failed</div>
            <div style={{ fontSize: 11, color: '#7f1d1d' }}>Use Override to record officer decision with justification.</div>
          </div>
          <button onClick={() => setActiveTab('trace')} style={{ background: '#991b1b', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            View Trace →
          </button>
        </div>
      )}
      {hasReview && !hasFail && (
        <div style={{
          background: '#fef3c7', border: '1.5px solid #fcd34d', borderRadius: 10,
          padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#92400e', fontSize: 12 }}>Manual Review Required</div>
          </div>
        </div>
      )}
      {hasPending && !hasFail && !hasReview && (
        <div style={{
          background: '#dbeafe', border: '1.5px solid #93c5fd', borderRadius: 10,
          padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <div style={{ fontWeight: 800, color: '#1e40af', fontSize: 12 }}>Verification Pending — Officer review required</div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '2px solid #f1f5f9' }}>
        {[
          ['summary', '📊 Summary'],
          ['trace', '🔗 Evidence Trace'],
          ['audit', '🗂 Audit Log']
        ].map(([tab, label]) => (
          <button
            key={tab}
            id={`tab-${tab}-${bid.id}`}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 700,
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: activeTab === tab ? '#1e3a5f' : '#94a3b8',
              borderBottom: activeTab === tab ? '2px solid #1e3a5f' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'summary' && (
        <>
          <OfficerActionPanel bidId={bid.id} onSuccess={() => { onRefresh(); setActiveTab('audit'); }} />
          <SummaryTable results={results} onOverride={openOverride} />
          {ra && (
            <div style={{
              marginTop: 12, padding: '8px 14px', background: '#f8fafc',
              borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: 700, color: '#475569' }}>Risk Indicator</span>
              <span style={{ color: '#94a3b8' }}>— Not a qualification score. Officer decision required.</span>
              <RiskBadge level={ra.risk_level} />
            </div>
          )}
        </>
      )}
      {activeTab === 'trace' && (
        <ComplianceTraceView bidId={bid.id} bidderName={bid.bidder?.name ?? 'Bidder'} />
      )}
      {activeTab === 'audit' && (
        <AuditTimelineView bidId={bid.id} bidderName={bid.bidder?.name ?? 'Bidder'} />
      )}

      {/* Override modal */}
      {overrideProps && (
        <OverrideModal
          {...overrideProps}
          onClose={() => setOverrideProps(null)}
          onSuccess={() => { onRefresh(); setActiveTab('audit'); }}
        />
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function ComplianceDashboard() {
  const [bids, setBids] = useState([]);
  const [selectedBid, setSelectedBid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState(null);

  const loadBids = useCallback(async () => {
    setError(null);
    try {
      const data = await listBids();
      setBids(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bids');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBids(); }, [loadBids]);

  async function selectBid(bid) {
    setDetailLoading(true);
    try {
      const data = await getBid(bid.id);
      setSelectedBid(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bid');
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshSelected() {
    if (!selectedBid) return;
    try {
      const data = await getBid(selectedBid.id);
      setSelectedBid(data);
    } catch {
      // ignore
    }
    await loadBids();
  }

  const filteredBids = bids.filter(bid => {
    const risk = bid.risk_level ?? 'LOW';
    if (filter === 'ALL') return true;
    if (filter === 'FAIL') return bid.overall_status === 'FAIL';
    if (filter === 'REVIEW') return bid.overall_status === 'REVIEW';
    if (filter === 'PENDING') return bid.overall_status === 'PENDING';
    if (filter === 'HIGH_RISK') return risk === 'HIGH' || risk === 'CRITICAL';
    return true;
  });

  const FILTERS = [
    { key: 'ALL', label: 'All' },
    { key: 'FAIL', label: '⛔ Fail' },
    { key: 'REVIEW', label: '⚠ Review' },
    { key: 'PENDING', label: '⏳ Pending' },
    { key: 'HIGH_RISK', label: '🔴 High Risk' },
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 10, color: '#94a3b8' }}>
      <div style={{ fontSize: 32 }}>⏳</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Loading compliance data…</div>
    </div>
  );

  if (error && bids.length === 0) return (
    <div style={{ padding: 32 }}>
      <div style={{ background: '#fee2e2', borderRadius: 12, padding: '20px 24px', border: '1px solid #fca5a5', maxWidth: 480 }}>
        <div style={{ fontWeight: 800, color: '#991b1b', fontSize: 14, marginBottom: 6 }}>⚠ Backend Connection Error</div>
        <div style={{ color: '#7f1d1d', fontSize: 13, marginBottom: 12 }}>{error}</div>
        <button
          onClick={() => { setLoading(true); loadBids(); }}
          style={{ background: '#991b1b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          ⟳ Retry
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      {/* Left: Bidder list */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#1e3a5f' }}>Compliance Overview</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>GEM/2026/B/4521001</div>
        </div>
        <div style={{ padding: '6px 12px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              id={`filter-${f.key.toLowerCase()}`}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                border: filter === f.key ? '1.5px solid #1e3a5f' : '1.5px solid #e2e8f0',
                background: filter === f.key ? '#1e3a5f' : '#fff',
                color: filter === f.key ? '#fff' : '#64748b', cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredBids.map(bid => {
            const risk = bid.risk_level ?? 'LOW';
            const riskS = RISK_S[risk] ?? RISK_S.LOW;
            const statusS = RS[bid.overall_status] ?? RS.PENDING;
            const isSelected = selectedBid?.id === bid.id;
            return (
              <div
                key={bid.id}
                id={`bid-row-${bid.id}`}
                onClick={() => selectBid(bid)}
                style={{
                  padding: '11px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  background: isSelected ? '#f0f4ff' : '#fff',
                  borderLeft: isSelected ? '3px solid #1e3a5f' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {bid.bidder?.name ?? `Bid #${bid.id}`}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                      ₹{bid.bidder?.turnover_cr} Cr · {bid.bidder?.category}
                    </div>
                    {bid.officer_status && (
                      <div style={{ fontSize: 9, color: '#7c3aed', marginTop: 2, fontWeight: 700 }}>
                        Officer: {bid.officer_status}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, color: riskS.color, background: riskS.bg }}>
                      ● {risk}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, color: statusS.color, background: statusS.bg }}>
                      {statusS.icon} {bid.overall_status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredBids.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>No bids match this filter.</div>
          )}
        </div>
      </div>

      {/* Right: Detail panel */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f8fafc' }}>
        {detailLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: '#94a3b8', fontSize: 13 }}>
            ⏳ Loading bidder detail…
          </div>
        ) : selectedBid ? (
          <BidderDetail bid={selectedBid} onRefresh={refreshSelected} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', color: '#94a3b8', gap: 10 }}>
            <span style={{ fontSize: 40 }}>📋</span>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Select a bidder to view compliance details</div>
            <div style={{ fontSize: 12 }}>Click any bidder in the list to view their compliance chain and audit log</div>
          </div>
        )}
      </div>
    </div>
  );
}
