import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { logout, getToken, getMe } from '../api/client';
import AuditReplayModal from './AuditReplayModal';

const ROLE_META = {
  PROCUREMENT_OFFICER: { label: 'Procurement Officer', icon: '👔', color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)', short: 'OFFICER' },
  TECHNICAL_EVALUATOR: { label: 'Technical Evaluator', icon: '🔬', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.35)', short: 'EVALUATOR' },
  FINANCIAL_EVALUATOR: { label: 'Financial Evaluator', icon: '💰', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)', short: 'FINANCIAL' },
  AUDIT_OFFICER:       { label: 'Audit Officer',       icon: '🛡️', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.35)', short: 'AUDITOR' },
  BIDDER:              { label: 'Bidder / Vendor',     icon: '🏢', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)',  border: 'rgba(6,182,212,0.35)',  short: 'BIDDER' },
};

export default function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const [user, setUser] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [bannerMsg, setBannerMsg] = useState(null);
  const [auditReplayOpen, setAuditReplayOpen] = useState(false);

  useEffect(() => {
    loadCurrentUser();
    const handleStorage = () => loadCurrentUser();
    const handlePersona = () => loadCurrentUser();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('gemguard:persona_changed', handlePersona);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('gemguard:persona_changed', handlePersona);
    };
  }, []);

  async function loadCurrentUser() {
    const currentRole = localStorage.getItem('role') || 'PROCUREMENT_OFFICER';
    if (getToken()) {
      try {
        const me = await getMe();
        if (me) { setUser(me); return; }
      } catch { /* fall through */ }
    }
    setUser({
      role: currentRole,
      name: localStorage.getItem('user_name') || ROLE_META[currentRole]?.label || 'Officer',
    });
  }

  async function handleResetDemo() {
    if (!window.confirm(
      'Reset benchmark demo data?\n\nThis will re-seed the 4 benchmark bidders (A: Pass, B: Fail, C: Review, D: Pending) and CPCL tender.',
    )) return;

    setResetting(true);
    setBannerMsg(null);
    try {
      const res = await fetch('/api/v1/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      }).catch(() => null);
      if (!res || !res.ok) {
        await fetch('/api/demo/reset', { method: 'POST' }).catch(() => null);
      }
      setBannerMsg({ type: 'success', text: '✓ Benchmark demo re-seeded! 4 bidders (PASS, FAIL, REVIEW, PENDING) loaded.' });
      setTimeout(() => {
        setBannerMsg(null);
        window.dispatchEvent(new CustomEvent('gemguard:demo_reset'));
        if (location.pathname === '/dashboard') window.location.reload();
        else navigate('/dashboard');
      }, 1200);
    } catch {
      setBannerMsg({ type: 'error', text: 'Reset completed locally.' });
    } finally {
      setResetting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  const role = user?.role || 'PROCUREMENT_OFFICER';
  const meta = ROLE_META[role] || ROLE_META['PROCUREMENT_OFFICER'];

  const NAV_ITEMS = [
    { to: '/dashboard',  label: 'Dashboard',        icon: '🏠', roles: ['PROCUREMENT_OFFICER'] },
    { to: '/tenders',    label: 'Tenders',           icon: '📋', roles: ['PROCUREMENT_OFFICER'] },
    { to: '/corrigendum',label: 'Corrigendum',       icon: '📝', roles: ['PROCUREMENT_OFFICER'] },
    { to: '/bids',       label: 'Bid Matrix',        icon: '📦', roles: ['TECHNICAL_EVALUATOR'] },
    { to: '/compliance', label: 'Compliance Trace',  icon: '⚖️', roles: ['TECHNICAL_EVALUATOR'] },
    { to: '/financial',  label: 'Financial Review',  icon: '💰', roles: ['FINANCIAL_EVALUATOR'] },
    { to: '/audit',      label: 'Audit Chain',       icon: '🛡️', roles: ['AUDIT_OFFICER'] },
    { to: '/my-bids',    label: 'My Bids',           icon: '🏢', roles: ['BIDDER'] },
  ].filter(item => item.roles.includes(role));

  return (
    <>
      <header
        className="topnav"
        role="navigation"
        aria-label="Main Navigation"
        style={{
          background: 'linear-gradient(90deg, #091322 0%, #0d1e38 50%, #0a172c 100%)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          height: 54,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* ── Left: Brand + Nav Links ─────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Brand */}
          <div
            onClick={() => navigate('/dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginRight: 24, userSelect: 'none' }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(59,130,246,0.35)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              <span style={{ fontSize: 16 }}>🛡️</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                  <span style={{ color: '#60a5fa' }}>GeM</span>-Guard
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 800, color: '#93c5fd',
                  background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(147,197,253,0.3)',
                  padding: '1px 5px', borderRadius: 4, letterSpacing: '0.04em',
                }}>
                  CPCL
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                Compliance Copilot · SIH26100
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                style={({ isActive }) => ({
                  color: isActive ? '#60a5fa' : '#94a3b8',
                  borderBottom: isActive ? '2px solid #60a5fa' : '2px solid transparent',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  padding: '0 12px',
                  height: 54,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                })}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}

            {/* Audit Replay — always visible */}
            <button
              id="nav-audit-replay"
              onClick={() => setAuditReplayOpen(true)}
              style={{
                background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
                color: '#c084fc', fontSize: 13, fontWeight: 600,
                padding: '0 12px', height: 54,
                display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
              onMouseOver={e => e.currentTarget.style.color = '#e9d5ff'}
              onMouseOut={e => e.currentTarget.style.color = '#c084fc'}
            >
              <span>🛡️</span>
              <span>Audit Replay</span>
            </button>
          </div>
        </div>

        {/* ── Right: Role badge + Reset + Sign Out ────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Read-only role badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: meta.bg,
            border: `1px solid ${meta.border}`,
            borderRadius: 8,
            padding: '5px 12px',
          }}>
            <span style={{ fontSize: 14 }}>{meta.icon}</span>
            <div>
              <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Signed in as
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: meta.color, lineHeight: 1.2 }}>
                {meta.label}
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
              padding: '2px 7px', borderRadius: 4, letterSpacing: '0.04em',
            }}>
              ● {meta.short}
            </span>
          </div>

          {/* Reset Demo */}
          <button
            id="btn-reset-demo"
            onClick={handleResetDemo}
            disabled={resetting}
            title="Reset and reload the 4 benchmark bidders (A: Pass, B: Fail, C: Review, D: Pending)"
            style={{
              fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.18)',
              background: resetting ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
              color: resetting ? '#64748b' : '#e2e8f0',
              cursor: resetting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>{resetting ? '⏳' : '⟳'}</span>
            <span>{resetting ? 'Seeding…' : 'Reset Demo'}</span>
          </button>

          {/* Sign Out */}
          <button
            id="btn-logout"
            onClick={handleLogout}
            style={{
              fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.12)',
              color: '#f87171', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Global Banner */}
      {bannerMsg && (
        <div style={{
          background: bannerMsg.type === 'error' ? '#7f1d1d' : '#1e3a8a',
          color: '#ffffff', fontSize: 12, fontWeight: 600,
          textAlign: 'center', padding: '6px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
        }}>
          {bannerMsg.text}
        </div>
      )}

      {/* Audit Replay Modal */}
      {auditReplayOpen && (
        <AuditReplayModal onClose={() => setAuditReplayOpen(false)} />
      )}
    </>
  );
}
