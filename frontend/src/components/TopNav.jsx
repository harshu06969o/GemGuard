import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { logout, getToken, setToken, getMe } from '../api/client';

const PERSONAS = [
  {
    email: 'officer@gem.gov.in',
    label: 'Procurement Officer',
    shortRole: 'OFFICER',
    role: 'PROCUREMENT_OFFICER',
    badgeColor: '#fbbf24',
    badgeBg: 'rgba(251,191,36,0.15)',
    badgeBorder: 'rgba(251,191,36,0.35)',
    password: 'Admin@123',
    rights: 'Full Override Rights',
    department: 'CPCL Procurement',
    icon: '👔',
  },
  {
    email: 'evaluator@gem.gov.in',
    label: 'Technical Evaluator',
    shortRole: 'EVALUATOR',
    role: 'TECHNICAL_EVALUATOR',
    badgeColor: '#60a5fa',
    badgeBg: 'rgba(96,165,250,0.15)',
    badgeBorder: 'rgba(96,165,250,0.35)',
    password: 'Eval@123',
    rights: 'Review & Trace Rights',
    department: 'Evaluation Committee',
    icon: '🔬',
  },
  {
    email: 'auditor@gem.gov.in',
    label: 'Audit Officer',
    shortRole: 'AUDITOR',
    role: 'AUDIT_OFFICER',
    badgeColor: '#a78bfa',
    badgeBg: 'rgba(167,139,250,0.15)',
    badgeBorder: 'rgba(167,139,250,0.35)',
    password: 'Audit@123',
    rights: 'Cryptographic Audit Log Only',
    department: 'Internal Audit Oversight',
    icon: '🛡️',
  },
];

export default function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [bannerMsg, setBannerMsg] = useState(null);
  const [selectedPersonaEmail, setSelectedPersonaEmail] = useState('officer@gem.gov.in');

  useEffect(() => {
    loadCurrentUser();
    const handleStorage = () => loadCurrentUser();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  async function loadCurrentUser() {
    if (getToken()) {
      try {
        const me = await getMe();
        if (me) {
          setUser(me);
          if (me.email || me.username) {
            setSelectedPersonaEmail(me.email || me.username);
          }
        }
      } catch {
        // Fallback: decode JWT or default to officer
        setUser({ role: 'PROCUREMENT_OFFICER', name: 'Procurement Officer (CPCL)' });
      }
    } else {
      // Default to officer persona for immediate offline readiness
      handlePersonaSwitch('officer@gem.gov.in');
    }
  }

  async function handlePersonaSwitch(email) {
    const target = PERSONAS.find(p => p.email === email);
    if (!target) return;
    setSwitching(true);
    setSelectedPersonaEmail(email);

    try {
      // 1. Authenticate with Gateway/Backend
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: target.email, password: target.password }),
      });

      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setUser(data.user || { role: target.role, name: target.label, department: target.department });
      } else {
        // Direct mock fallback if proxy is in pass-through
        setUser({ role: target.role, name: target.label, department: target.department });
      }

      setBannerMsg({ type: 'success', text: `Switched active persona to ${target.label} (${target.rights})` });
      setTimeout(() => setBannerMsg(null), 3000);

      // Trigger global event so active pages refresh with new permissions
      window.dispatchEvent(new CustomEvent('gemguard:persona_changed', { detail: target }));
    } catch {
      setUser({ role: target.role, name: target.label, department: target.department });
    } finally {
      setSwitching(false);
    }
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (!res.ok) {
        // Fallback to /api/demo/reset
        await fetch('/api/demo/reset', { method: 'POST' });
      }
      setBannerMsg({ type: 'success', text: '✓ Benchmark demo re-seeded! 4 bidders (PASS, FAIL, REVIEW, PENDING) loaded.' });
      setTimeout(() => {
        setBannerMsg(null);
        window.dispatchEvent(new CustomEvent('gemguard:demo_reset'));
        if (location.pathname === '/') {
          window.location.reload();
        } else {
          navigate('/');
        }
      }, 1500);
    } catch (err) {
      setBannerMsg({ type: 'error', text: '⛔ Reset failed — verify backend connection.' });
    } finally {
      setResetting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const activePersona = PERSONAS.find(p => p.role === user?.role) || PERSONAS[0];

  const NAV_ITEMS = [
    { to: '/', label: 'Dashboard', exact: true, icon: '🏠', show: true },
    { to: '/tender', label: 'Tenders', icon: '📋', show: user?.role !== 'AUDIT_OFFICER' },
    { to: '/bids', label: 'Bid Matrix', icon: '📦', show: true },
    { to: '/my-bids', label: 'Bidder Workspace', icon: '🏢', show: true },
    { to: '/compliance', label: 'Compliance Trace', icon: '⚖️', show: true },
    { to: '/corrigendum', label: 'Corrigendum', icon: '📝', show: user?.role === 'PROCUREMENT_OFFICER' },
  ].filter(item => item.show);

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
        }}
      >
        {/* Brand */}
        <div
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            marginRight: 28,
            userSelect: 'none',
          }}
        >
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(59,130,246,0.35)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5z"
                fill="#ffffff"
              />
              <path
                d="M9 12l2 2 4-4"
                stroke="#1e3a8a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                <span style={{ color: '#60a5fa' }}>GeM</span>-Guard
              </span>
              <span style={{
                fontSize: 9,
                fontWeight: 800,
                color: '#93c5fd',
                background: 'rgba(59,130,246,0.2)',
                border: '1px solid rgba(147,197,253,0.3)',
                padding: '1px 5px',
                borderRadius: 4,
                letterSpacing: '0.04em',
              }}>
                SIH 2026
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
              AI Bid Compliance Platform · CPCL
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              style={({ isActive }) => ({
                color: isActive ? '#60a5fa' : '#94a3b8',
                borderBottom: isActive ? '2px solid #60a5fa' : '2px solid transparent',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                padding: '0 14px',
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
        </div>

        {/* Right Section: Persona Switcher & Controls */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Persona Switcher Component */}
          <div
            id="persona-switcher"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              padding: '3px 8px 3px 10px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Active Persona
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12 }}>{activePersona.icon}</span>
                <select
                  id="select-persona"
                  value={selectedPersonaEmail}
                  disabled={switching}
                  onChange={(e) => handlePersonaSwitch(e.target.value)}
                  style={{
                    background: 'transparent',
                    color: '#f8fafc',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: switching ? 'not-allowed' : 'pointer',
                    outline: 'none',
                    paddingRight: 6,
                  }}
                >
                  {PERSONAS.map(p => (
                    <option key={p.email} value={p.email} style={{ background: '#0f172a', color: '#fff' }}>
                      {p.label} ({p.shortRole})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Persona Rights Badge */}
            <span
              title={activePersona.rights}
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: activePersona.badgeColor,
                background: activePersona.badgeBg,
                border: `1px solid ${activePersona.badgeBorder}`,
                padding: '3px 8px',
                borderRadius: 5,
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
              }}
            >
              {activePersona.shortRole}
            </span>
          </div>

          {/* Re-Seed / Reset Demo Data Button */}
          <button
            id="btn-reset-demo"
            onClick={handleResetDemo}
            disabled={resetting}
            title="Reset and reload the 4 benchmark bidders (A: Pass, B: Fail, C: Review, D: Pending)"
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.18)',
              background: resetting ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
              color: resetting ? '#64748b' : '#e2e8f0',
              cursor: resetting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 0.15s ease',
            }}
          >
            <span>{resetting ? '⏳' : '⟳'}</span>
            <span>{resetting ? 'Seeding…' : 'Reset Demo'}</span>
          </button>

          {/* User Sign Out */}
          <button
            id="btn-logout"
            onClick={handleLogout}
            title="Sign out of current session"
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.12)',
              color: '#f87171',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'background 0.15s ease',
            }}
          >
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Dynamic Feedback Banner */}
      {bannerMsg && (
        <div
          role="alert"
          style={{
            background: bannerMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: bannerMsg.type === 'success' ? '#166534' : '#991b1b',
            borderBottom: `1px solid ${bannerMsg.type === 'success' ? '#86efac' : '#fca5a5'}`,
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 24px',
            textAlign: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {bannerMsg.text}
        </div>
      )}
    </>
  );
}
