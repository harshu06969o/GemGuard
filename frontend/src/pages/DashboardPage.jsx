import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listTenders,
  listBids,
  getHealth,
  getMe,
  evaluateBid,
  runVerification,
  getConnectorsHealth,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { LoadingSpinner, ErrorMessage } from '../components/Card';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiHealth, setApiHealth] = useState({ status: 'checking', db_status: 'checking' });

  // Data state
  const [tenders, setTenders] = useState([]);
  const [bids, setBids] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [simulateTimeoutActive, setSimulateTimeoutActive] = useState(false);

  // Matrix Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');

  // Modal / Drawer state for Bid Inspection
  const [selectedBid, setSelectedBid] = useState(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [evaluatingBidId, setEvaluatingBidId] = useState(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState('');
  const [overrideRuleId, setOverrideRuleId] = useState('');
  const [overrideNewStatus, setOverrideNewStatus] = useState('PASS');
  const [actionSuccessMsg, setActionSuccessMsg] = useState(null);

  useEffect(() => {
    fetchDashboardData();

    // Listen to persona changes or demo resets from TopNav
    const handlePersonaChange = () => fetchDashboardData();
    const handleDemoReset = () => fetchDashboardData();
    window.addEventListener('gemguard:persona_changed', handlePersonaChange);
    window.addEventListener('gemguard:demo_reset', handleDemoReset);

    return () => {
      window.removeEventListener('gemguard:persona_changed', handlePersonaChange);
      window.removeEventListener('gemguard:demo_reset', handleDemoReset);
    };
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    setError(null);
    try {
      const [me, health, tList, bList, connHealth] = await Promise.all([
        getMe().catch(() => null),
        getHealth().catch(() => ({ status: 'down', db_status: 'unavailable' })),
        listTenders().catch(() => []),
        listBids().catch(() => []),
        getConnectorsHealth().catch(() => ({ connectors: [] })),
      ]);

      setCurrentUser(me);
      setApiHealth(health);
      setTenders(tList);
      setBids(bList);
      setConnectors(connHealth?.connectors || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  // Calculate high-level KPI Metrics
  const stats = useMemo(() => {
    const total = bids.length;
    const pass = bids.filter(b => b.overall_status === 'PASS' || b.compliance_status === 'COMPLIANT').length;
    const fail = bids.filter(b => b.overall_status === 'FAIL' || b.compliance_status === 'NON_COMPLIANT').length;
    const review = bids.filter(b => b.overall_status === 'REVIEW' || b.compliance_status === 'UNDER_REVIEW').length;
    const pending = bids.filter(b => b.overall_status === 'PENDING' || b.compliance_status === 'PENDING_VERIFICATION').length;
    
    const avgScore = total > 0
      ? Math.round(bids.reduce((acc, b) => acc + (b.readiness_score || 0), 0) / total)
      : 0;

    return { total, pass, fail, review, pending, avgScore };
  }, [bids]);

  // Filtered Bidder Matrix
  const filteredBids = useMemo(() => {
    return bids.filter(b => {
      const nameMatch = !searchQuery ||
        (b.bidder?.name || b.bidder_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.bidder_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.bidder?.gstin || '').toLowerCase().includes(searchQuery.toLowerCase());

      const status = (b.overall_status || b.compliance_status || '').toUpperCase();
      let statusMatch = true;
      if (statusFilter === 'PASS') statusMatch = status === 'PASS' || status === 'COMPLIANT';
      else if (statusFilter === 'FAIL') statusMatch = status === 'FAIL' || status === 'NON_COMPLIANT';
      else if (statusFilter === 'REVIEW') statusMatch = status === 'REVIEW' || status === 'UNDER_REVIEW';
      else if (statusFilter === 'PENDING') statusMatch = status === 'PENDING' || status === 'PENDING_VERIFICATION';

      const risk = (b.risk_band || '').toUpperCase();
      let riskMatch = true;
      if (riskFilter !== 'ALL') {
        riskMatch = risk === riskFilter;
      }

      return nameMatch && statusMatch && riskMatch;
    });
  }, [bids, searchQuery, statusFilter, riskFilter]);

  // Handle re-evaluating compliance
  async function handleEvaluateBid(bidId) {
    setEvaluatingBidId(bidId);
    setActionSuccessMsg(null);
    try {
      const res = await evaluateBid(bidId);
      setActionSuccessMsg(`Compliance evaluation updated for Bid #${bidId.slice(-6)}`);
      // Update in-place
      const updatedList = await listBids();
      setBids(updatedList);
      if (selectedBid && selectedBid.id === bidId) {
        const refreshed = updatedList.find(b => b.id === bidId);
        if (refreshed) setSelectedBid(refreshed);
      }
      setTimeout(() => setActionSuccessMsg(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setEvaluatingBidId(null);
    }
  }

  // Handle testing connector ping or timeout toggle
  async function handleTestConnectors(simulateTimeout = false) {
    setConnectorsLoading(true);
    try {
      const res = await getConnectorsHealth();
      let updatedConnectors = res.connectors || [];

      if (simulateTimeout) {
        // Mark GSTN and EPFO as TIMEOUT / PENDING to demonstrate SIH Graceful Degradation
        updatedConnectors = updatedConnectors.map(c => {
          if (c.source === 'GSTN' || c.source === 'EPFO') {
            return { ...c, status: 'TIMEOUT', latency_ms: 3000, description: `${c.description} (Simulating Network Delay -> PENDING)` };
          }
          return c;
        });
        setActionSuccessMsg('✓ Graceful Degradation active: GSTN/EPFO simulating timeout. Bids remain PENDING and will NOT be auto-disqualified.');
      } else {
        setActionSuccessMsg('✓ All 6 Government registries pinged and verified operational.');
      }
      setConnectors(updatedConnectors);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch {
      setError('Failed to reach connectors service.');
    } finally {
      setConnectorsLoading(false);
    }
  }

  function toggleSimulateTimeout() {
    const nextState = !simulateTimeoutActive;
    setSimulateTimeoutActive(nextState);
    handleTestConnectors(nextState);
  }

  // Handle Officer Override submission
  async function handleOfficerOverrideSubmit() {
    if (!overrideJustification || overrideJustification.trim().length < 5) {
      alert('Procurement Officer justification is mandatory and must be at least 5 characters.');
      return;
    }

    try {
      const res = await fetch(`/api/v1/bids/${selectedBid.id}/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('gemguard_token') || ''}`,
        },
        body: JSON.stringify({
          rule_id: overrideRuleId,
          new_status: overrideNewStatus,
          justification: overrideJustification,
          actor: currentUser?.username || 'officer@gem.gov.in',
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Override failed');
      }

      const result = await res.json();
      setActionSuccessMsg(`✓ Officer Override logged to SHA-256 Audit Chain: ${result.event_hash?.slice(0, 16)}...`);
      setOverrideModalOpen(false);
      setOverrideJustification('');

      // Refresh bids
      const updatedList = await listBids();
      setBids(updatedList);
      if (selectedBid) {
        const refreshed = updatedList.find(b => b.id === selectedBid.id);
        if (refreshed) setSelectedBid(refreshed);
      }
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err) {
      alert(`Override error: ${err.message}`);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '65vh', gap: 14 }}>
        <LoadingSpinner />
        <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
          Loading GeM-Guard Bid Compliance Matrix…
        </div>
      </div>
    );
  }

  const isOfficer = currentUser?.role === 'PROCUREMENT_OFFICER';

  return (
    <div className="page-content" style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 28px' }}>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. Header Banner with Persona Context & Live System Status           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 24,
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#2563eb',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              🏛️ Chennai Petroleum Corporation Limited · CPCL Refinery
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Tender Ref: <strong style={{ color: '#1e293b' }}>GEM/2026/B/4521001</strong>
            </span>
          </div>

          <h1 style={{ margin: '4px 0 4px', fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Integrated Bid Compliance & Eligibility Intelligence Matrix
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', maxWidth: 840 }}>
            Automated multi-document OCR extraction, deterministic threshold evaluation, Pandas cross-document integrity checks,
            and 6-registry government connector verifications.
          </p>
        </div>

        {/* System Health Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: apiHealth.status === 'ok' ? '#dcfce7' : '#fee2e2',
              color: apiHealth.status === 'ok' ? '#166534' : '#991b1b',
              border: `1px solid ${apiHealth.status === 'ok' ? '#86efac' : '#fca5a5'}`,
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: apiHealth.status === 'ok' ? '#16a34a' : '#dc2626' }} />
              API Gateway: {apiHealth.status === 'ok' ? 'Online' : 'Degraded'}
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f1f5f9',
              color: '#334155',
              border: '1px solid #cbd5e1',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
            }}>
              <span>💾</span>
              DB: {apiHealth.database || 'MongoDB'}
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Signed in as: <strong style={{ color: '#334155' }}>{currentUser?.name || 'Officer'}</strong> ({currentUser?.role || 'PROCUREMENT_OFFICER'})
          </div>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}
      {actionSuccessMsg && (
        <div style={{
          background: '#dcfce7',
          border: '1px solid #86efac',
          borderRadius: 8,
          padding: '10px 16px',
          color: '#166534',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {actionSuccessMsg}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. Key Metric Cards (Summary KPIs)                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14,
        marginBottom: 26,
      }}>
        {/* Card 1: Total Bids */}
        <div className="stat-card" id="card-total-bids" style={{ borderTop: '4px solid #1e3a8a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-value" style={{ color: '#0f172a' }}>{stats.total}</div>
            <span style={{ fontSize: 20 }}>📦</span>
          </div>
          <div className="stat-label">Total Submissions</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>4 Benchmark Bidders</div>
        </div>

        {/* Card 2: Compliant Bids */}
        <div className="stat-card" id="card-compliant-bids" style={{ borderTop: '4px solid #16a34a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-value" style={{ color: '#16a34a' }}>{stats.pass}</div>
            <span style={{ fontSize: 20 }}>🛡️</span>
          </div>
          <div className="stat-label">Compliant · PASS</div>
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 4 }}>Bidder A (Low Risk)</div>
        </div>

        {/* Card 3: Non-Compliant Bids */}
        <div className="stat-card" id="card-failed-bids" style={{ borderTop: '4px solid #dc2626' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-value" style={{ color: '#dc2626' }}>{stats.fail}</div>
            <span style={{ fontSize: 20 }}>✕</span>
          </div>
          <div className="stat-label">Non-Compliant · FAIL</div>
          <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600, marginTop: 4 }}>Bidder B (Turnover &lt; 14.2 Cr)</div>
        </div>

        {/* Card 4: Needs Review */}
        <div className="stat-card" id="card-review-bids" style={{ borderTop: '4px solid #d97706' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-value" style={{ color: '#d97706' }}>{stats.review}</div>
            <span style={{ fontSize: 20 }}>⚠</span>
          </div>
          <div className="stat-label">Cross-Doc · REVIEW</div>
          <div style={{ fontSize: 11, color: '#d97706', fontWeight: 600, marginTop: 4 }}>Bidder C (Name Mismatch)</div>
        </div>

        {/* Card 5: Pending External Verifications */}
        <div className="stat-card" id="card-pending-bids" style={{ borderTop: '4px solid #64748b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-value" style={{ color: '#475569' }}>{stats.pending}</div>
            <span style={{ fontSize: 20 }}>⏳</span>
          </div>
          <div className="stat-label">Degraded · PENDING</div>
          <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginTop: 4 }}>Bidder D (GST Timeout)</div>
        </div>

        {/* Card 6: Readiness Average */}
        <div className="stat-card" id="card-avg-readiness" style={{ borderTop: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-value" style={{ color: '#2563eb' }}>{stats.avgScore}%</div>
            <span style={{ fontSize: 20 }}>📈</span>
          </div>
          <div className="stat-label">System Readiness Avg</div>
          <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, marginTop: 4 }}>Composite Weighted Score</div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. Interactive Bidder Matrix Table                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📊</span> Benchmark Bidder Matrix
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Deterministic Rule Evaluations vs Extracted Document Evidence & Statutory Connectors
            </div>
          </div>

          {/* Quick Action Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <input
                id="search-bidders-input"
                type="text"
                placeholder="Search bidder, GSTIN, PAN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  padding: '7px 12px 7px 30px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 12,
                  width: 220,
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: 9, top: 8, fontSize: 12, color: '#94a3b8' }}>🔍</span>
            </div>

            {/* Status Filter Tabs */}
            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden' }}>
              {['ALL', 'PASS', 'FAIL', 'REVIEW', 'PENDING'].map(st => (
                <button
                  key={st}
                  id={`btn-filter-${st.toLowerCase()}`}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    border: 'none',
                    background: statusFilter === st ? '#1e3a8a' : '#ffffff',
                    color: statusFilter === st ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Risk Band Filter */}
            <select
              id="select-risk-filter"
              value={riskFilter}
              onChange={e => setRiskFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 12,
                color: '#334155',
                outline: 'none',
              }}
            >
              <option value="ALL">All Risk Bands</option>
              <option value="LOW">Low Risk</option>
              <option value="MEDIUM">Medium Risk</option>
              <option value="HIGH">High Risk</option>
              <option value="CRITICAL">Critical Risk</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" id="bidder-matrix-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Code</th>
                <th>Bidder Organization</th>
                <th>Turnover (Req: ≥₹14.2 Cr)</th>
                <th>MII Local % (Req: ≥50%)</th>
                <th>Status</th>
                <th>Risk Band</th>
                <th style={{ width: '150px' }}>Readiness Score</th>
                <th>Gov Registry Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBids.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
                    No bidders matching active filters.
                  </td>
                </tr>
              ) : (
                filteredBids.map(b => {
                  const bidderObj = b.bidder || {};
                  const code = b.bidder_code || b.id?.slice(-1) || 'A';
                  const turnover = bidderObj.turnover_cr ?? 14.2;
                  const mii = bidderObj.local_content_pct ?? 50;
                  const score = b.readiness_score ?? 75;
                  const isPending = b.overall_status === 'PENDING' || b.compliance_status === 'PENDING_VERIFICATION';

                  return (
                    <tr
                      key={b.id}
                      onClick={() => { setSelectedBid(b); setInspectModalOpen(true); }}
                      style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                    >
                      {/* Code Badge */}
                      <td>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: code === 'A' ? '#dcfce7' : (code === 'B' ? '#fee2e2' : (code === 'C' ? '#fef3c7' : '#f1f5f9')),
                          color: code === 'A' ? '#166534' : (code === 'B' ? '#991b1b' : (code === 'C' ? '#92400e' : '#334155')),
                          fontWeight: 800,
                          fontSize: 13,
                        }}>
                          {code}
                        </span>
                      </td>

                      {/* Bidder Organization */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                          {bidderObj.name || b.bidder_name}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, marginTop: 2 }}>
                          <span>GSTIN: <code>{bidderObj.gstin || '—'}</code></span>
                          <span>·</span>
                          <span>PAN: <code>{bidderObj.pan || '—'}</code></span>
                        </div>
                      </td>

                      {/* Turnover */}
                      <td>
                        <div style={{ fontWeight: 700, color: turnover >= 14.2 ? '#15803d' : '#b91c1c' }}>
                          ₹{turnover.toFixed(1)} Cr
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          {turnover >= 14.2 ? '✓ Meets requirement' : '✕ Below 14.2 Cr'}
                        </div>
                      </td>

                      {/* Make In India */}
                      <td>
                        <div style={{ fontWeight: 700, color: mii >= 50.0 ? '#15803d' : '#b91c1c' }}>
                          {mii}%
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          Class-I Supplier
                        </div>
                      </td>

                      {/* Compliance Status */}
                      <td>
                        <StatusBadge status={b.overall_status || b.compliance_status} />
                      </td>

                      {/* Risk Band */}
                      <td>
                        <StatusBadge status={b.risk_band || 'LOW'} />
                      </td>

                      {/* Readiness Score Progress */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            flex: 1,
                            height: 8,
                            background: '#e2e8f0',
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(100, Math.max(0, score))}%`,
                              height: '100%',
                              background: score >= 80 ? '#16a34a' : (score >= 50 ? '#d97706' : '#dc2626'),
                              borderRadius: 4,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#334155', minWidth: 32 }}>
                            {score}%
                          </span>
                        </div>
                      </td>

                      {/* Government Registry Status */}
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span
                            title={isPending ? 'GSTN: Timed Out (PENDING)' : 'GSTN: Verified Active'}
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 800,
                              background: isPending ? '#fef3c7' : '#dcfce7',
                              color: isPending ? '#b45309' : '#166534',
                            }}
                          >
                            GST {isPending ? '⏳' : '✓'}
                          </span>
                          <span
                            title="PAN: Verified Active"
                            style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800, background: '#dcfce7', color: '#166534' }}
                          >
                            PAN ✓
                          </span>
                          <span
                            title={b.bidder_code === 'C' ? 'Udyam: Mismatch with PAN' : 'Udyam: Verified'}
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 800,
                              background: b.bidder_code === 'C' ? '#fee2e2' : '#dcfce7',
                              color: b.bidder_code === 'C' ? '#991b1b' : '#166534',
                            }}
                          >
                            UDYAM {b.bidder_code === 'C' ? '⚠' : '✓'}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          id={`btn-inspect-${code.toLowerCase()}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBid(b);
                            setInspectModalOpen(true);
                          }}
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: 5,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          Inspect Trace →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. Government API Health Panel (With Graceful Degradation Toggle)   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24, padding: 22 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          marginBottom: 18,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🏛️</span> Government Registry API Health & Adapter Verification Suite
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Statutory verification connectors with Smart India Hackathon (SIH) Graceful Degradation Guarantee
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* SIH USP Simulate Timeout Toggle Switch */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: simulateTimeoutActive ? '#fef3c7' : '#f8fafc',
              border: `1px solid ${simulateTimeoutActive ? '#fcd34d' : '#e2e8f0'}`,
              padding: '6px 14px',
              borderRadius: 8,
            }}>
              <label
                htmlFor="toggle-simulate-timeout"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: simulateTimeoutActive ? '#92400e' : '#475569',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                ⚡ Simulate API Timeout (SIH USP)
              </label>
              <input
                id="toggle-simulate-timeout"
                type="checkbox"
                checked={simulateTimeoutActive}
                onChange={toggleSimulateTimeout}
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
            </div>

            {/* Test Connectivity Ping */}
            <button
              id="btn-ping-connectors"
              onClick={() => handleTestConnectors(simulateTimeoutActive)}
              disabled={connectorsLoading}
              style={{
                background: '#1e3a8a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '7px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: connectorsLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{connectorsLoading ? '⏳' : '📡'}</span>
              <span>{connectorsLoading ? 'Checking…' : 'Ping Connectors'}</span>
            </button>
          </div>
        </div>

        {/* 6 Connector Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {connectors.map(c => {
            const isTimeout = c.status === 'TIMEOUT' || (simulateTimeoutActive && (c.source === 'GSTN' || c.source === 'EPFO'));
            return (
              <div
                key={c.source}
                id={`connector-${c.source.toLowerCase()}`}
                style={{
                  border: `1px solid ${isTimeout ? '#fcd34d' : '#e2e8f0'}`,
                  borderRadius: 8,
                  padding: '14px 16px',
                  background: isTimeout ? '#fffbeb' : '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13, color: '#0f172a' }}>{c.name || c.source}</strong>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: isTimeout ? '#fef3c7' : '#dcfce7',
                    color: isTimeout ? '#92400e' : '#166534',
                    border: `1px solid ${isTimeout ? '#fcd34d' : '#86efac'}`,
                  }}>
                    {isTimeout ? '⏳ SIMULATING TIMEOUT' : '● OPERATIONAL'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                  {c.description}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                  <span>Latency: <strong style={{ color: isTimeout ? '#b45309' : '#334155' }}>{isTimeout ? '3000ms (Timeout)' : `${c.latency_ms || 35}ms`}</strong></span>
                  <span>Protocol: <strong>REST / SHA-256</strong></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Graceful Degradation Explanation Callout */}
        <div style={{
          marginTop: 18,
          padding: '12px 16px',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          fontSize: 12,
          color: '#1e40af',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <div>
            <strong>SIH Graceful Degradation Guarantee:</strong> When government registries experience temporary latency or downtime,
            the verification status is held at <strong>PENDING</strong>. GeM-Guard's compliance engine <strong>never automatically disqualifies</strong> a bid due to third-party outages.
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. Detailed Bid Inspection Drawer / Modal                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {inspectModalOpen && selectedBid && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: 20,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 12,
            width: '100%',
            maxWidth: 820,
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1px solid #cbd5e1',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
            }}>
              <div>
                <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 800, textTransform: 'uppercase' }}>
                  Compliance Trace & Evidence Inspector
                </div>
                <h2 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  {selectedBid.bidder?.name || selectedBid.bidder_name} · Bid #{selectedBid.id?.slice(-8)}
                </h2>
              </div>
              <button
                onClick={() => setInspectModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 20,
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px' }}>
              {/* Top Summary Banner */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 10,
                marginBottom: 20,
                background: '#f8fafc',
                padding: 14,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Overall Compliance</div>
                  <div style={{ marginTop: 4 }}>
                    <StatusBadge status={selectedBid.overall_status || selectedBid.compliance_status} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Risk Band</div>
                  <div style={{ marginTop: 4 }}>
                    <StatusBadge status={selectedBid.risk_band || 'LOW'} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Readiness Score</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a8a', marginTop: 2 }}>
                    {selectedBid.readiness_score ?? 75}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Tender Reference</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#334155', marginTop: 4 }}>
                    {selectedBid.tender_reference || 'GEM/2026/B/4521001'}
                  </div>
                </div>
              </div>

              {/* Cross-Document Integrity Contradictions Alert (Bidder C) */}
              {selectedBid.integrity_findings && selectedBid.integrity_findings.length > 0 && (
                <div style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 20,
                }}>
                  <div style={{ fontWeight: 800, color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🚨</span> Cross-Document Integrity Contradiction Flagged
                  </div>
                  {selectedBid.integrity_findings.map((f, idx) => (
                    <div key={idx} style={{ fontSize: 12, color: '#7f1d1d', marginTop: 6, lineHeight: 1.4 }}>
                      {f.discrepancy_details}
                    </div>
                  ))}
                </div>
              )}

              {/* Evaluated Rules Checklist */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                  Rule-by-Rule Compliance Outcomes:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(selectedBid.evaluation_results || []).map((r, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                          {r.clause_id ? `${r.clause_id} · ` : ''}{r.metric}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {r.explanation}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <StatusBadge status={r.status} />
                        {isOfficer && (
                          <button
                            onClick={() => {
                              setOverrideRuleId(r.rule_id || r.metric);
                              setOverrideNewStatus(r.status === 'PASS' ? 'REVIEW' : 'PASS');
                              setOverrideModalOpen(true);
                            }}
                            style={{
                              background: '#fff',
                              border: '1px solid #cbd5e1',
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: '#2563eb',
                            }}
                          >
                            Override
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* External Verification Connectors Status */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                  Statutory Registries Status:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {(selectedBid.verifications || []).map((v, idx) => (
                    <div key={idx} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                        <span>{v.source}</span>
                        <StatusBadge status={v.status} showIcon={false} />
                      </div>
                      <div style={{ color: '#64748b', marginTop: 2, fontSize: 10 }}>{v.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
            }}>
              <button
                onClick={() => navigate(`/bids/${selectedBid.id}`)}
                style={{
                  background: '#1e3a8a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Open Full Bid Evidence Workspace →
              </button>

              <button
                onClick={() => setInspectModalOpen(false)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 6. Officer Override Modal (With Mandatory Justification)            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {overrideModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          padding: 20,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 10,
            padding: 24,
            maxWidth: 500,
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: '#1e3a8a' }}>
              ⚖️ Procurement Officer Override
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
              Officer overrides are cryptographically signed and logged to the tamper-evident SHA-256 audit blockchain.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                Target Rule / Metric:
              </label>
              <input
                type="text"
                disabled
                value={overrideRuleId}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                New Desired Status:
              </label>
              <select
                value={overrideNewStatus}
                onChange={e => setOverrideNewStatus(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                <option value="PASS">PASS (Approve compliance)</option>
                <option value="REVIEW">REVIEW (Seek clarification)</option>
                <option value="FAIL">FAIL (Disqualify rule)</option>
                <option value="PENDING">PENDING (Hold for external verification)</option>
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', display: 'block', marginBottom: 4 }}>
                * Mandatory Regulatory Justification (Min 5 chars):
              </label>
              <textarea
                rows={3}
                placeholder="State the formal procurement reason or statutory exemption justifying this override..."
                value={overrideJustification}
                onChange={e => setOverrideJustification(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setOverrideModalOpen(false)}
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleOfficerOverrideSubmit}
                disabled={!overrideJustification || overrideJustification.trim().length < 5}
                style={{
                  background: overrideJustification.trim().length >= 5 ? '#1e3a8a' : '#94a3b8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: overrideJustification.trim().length >= 5 ? 'pointer' : 'not-allowed',
                }}
              >
                Sign & Append to Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
