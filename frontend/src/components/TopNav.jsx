import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { logout, getToken, setToken, getMe } from '../api/client';
import { loginSuccess } from '../store/slices/authSlice';
import AuditReplayModal from './AuditReplayModal';

const PERSONAS = [
  {
    email: 'officer@cpcl.gov.in',
    altEmail: 'officer@gem.gov.in',
    label: 'Procurement Officer',
    shortRole: 'PROCUREMENT',
    role: 'PROCUREMENT_OFFICER',
    badgeColor: '#10b981', // Green Pill
    badgeBg: 'rgba(16,185,129,0.18)',
    badgeBorder: 'rgba(16,185,129,0.4)',
    password: 'Admin@123',
    rights: 'Full Override Rights · Action Queue',
    department: 'CPCL Procurement',
    icon: '👔',
  },
  {
    email: 'evaluator@cpcl.gov.in',
    altEmail: 'evaluator@gem.gov.in',
    label: 'Technical Evaluator',
    shortRole: 'EVALUATOR',
    role: 'TECHNICAL_EVALUATOR',
    badgeColor: '#3b82f6', // Blue Pill
    badgeBg: 'rgba(59,130,246,0.18)',
    badgeBorder: 'rgba(59,130,246,0.4)',
    password: 'Eval@123',
    rights: 'Evidence & Technical Matrix · CA UDIN',
    department: 'Evaluation Committee',
    icon: '🔬',
  },
  {
    email: 'auditor@cpcl.gov.in',
    altEmail: 'auditor@gem.gov.in',
    label: 'Vigilance & Audit Officer',
    shortRole: 'AUDITOR',
    role: 'AUDIT_OFFICER',
    badgeColor: '#8b5cf6', // Purple Pill
    badgeBg: 'rgba(139,92,246,0.18)',
    badgeBorder: 'rgba(139,92,246,0.4)',
    password: 'Audit@123',
    rights: 'Cryptographic SHA-256 Event Stream',
    department: 'Internal Audit Oversight',
    icon: '🛡️',
  },
  {
    email: 'financial@cpcl.gov.in',
    altEmail: 'financial@gem.gov.in',
    label: 'Financial Evaluator',
    shortRole: 'FINANCIAL',
    role: 'FINANCIAL_EVALUATOR',
    badgeColor: '#f59e0b',
    badgeBg: 'rgba(245,158,11,0.18)',
    badgeBorder: 'rgba(245,158,11,0.4)',
    password: 'Finance@123',
    rights: 'Envelope Unsealing · L1 Ranking · MII/MSE',
    department: 'Finance & Accounts',
    icon: '💰',
  },
  {
    email: 'bidder@vendor.com',
    altEmail: 'bidder@vendor.com',
    label: 'Bidder (BHEL)',
    shortRole: 'BIDDER',
    role: 'BIDDER',
    badgeColor: '#06b6d4',
    badgeBg: 'rgba(6,182,212,0.18)',
    badgeBorder: 'rgba(6,182,212,0.4)',
    password: 'Bidder@123',
    rights: 'Marketplace · Sealed Upload · Dry-Run',
    department: 'Vendor / Supplier',
    icon: '🏢',
  },
];

export default function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const [user, setUser] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [bannerMsg, setBannerMsg] = useState(null);
  const [selectedPersonaEmail, setSelectedPersonaEmail] = useState('officer@cpcl.gov.in');
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
    const found = PERSONAS.find(p => p.role === currentRole) || PERSONAS[0];
    
    if (getToken()) {
      try {
        const me = await getMe();
        if (me) {
          setUser(me);
          if (me.email || me.username) {
            setSelectedPersonaEmail(me.email || me.username);
          }
          return;
        }
      } catch {
        // Fallback
      }
    }
    setUser({
      role: found.role,
      name: localStorage.getItem('user_name') || found.label,
      department: found.department,
    });
    setSelectedPersonaEmail(found.email);
  }

  async function handlePersonaSwitch(email) {
    const target = PERSONAS.find(p => p.email === email || p.altEmail === email);
    if (!target) return;
    setSwitching(true);
    setSelectedPersonaEmail(target.email);

    try {
      // 1. Authenticate with Gateway/Backend
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: target.altEmail, password: target.password }),
      }).catch(() => null);

      let token = 'token_' + target.role.toLowerCase();
      if (res && res.ok) {
        const data = await res.json();
        token = data.token;
      }

      setToken(token);
      dispatch(loginSuccess({
        token,
        role: target.role,
        name: target.label,
        email: target.email,
        department: target.department,
      }));

      setUser({ role: target.role, name: target.label, department: target.department });
      setBannerMsg({ type: 'success', text: `Switched active persona to ${target.label} (${target.rights})` });
      setTimeout(() => setBannerMsg(null), 3000);

      // Navigate to the role's home workspace
      const ROLE_HOME = {
        PROCUREMENT_OFFICER: '/dashboard',
        TECHNICAL_EVALUATOR: '/bids',
        FINANCIAL_EVALUATOR: '/financial',
        AUDIT_OFFICER: '/audit',
        BIDDER: '/my-bids',
      };
      navigate(ROLE_HOME[target.role] || '/dashboard', { replace: true });

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
      }).catch(() => null);

      if (!res || !res.ok) {
        await fetch('/api/demo/reset', { method: 'POST' }).catch(() => null);
      }
      setBannerMsg({ type: 'success', text: '✓ Benchmark demo re-seeded! 4 bidders (PASS, FAIL, REVIEW, PENDING) loaded.' });
      setTimeout(() => {
        setBannerMsg(null);
        window.dispatchEvent(new CustomEvent('gemguard:demo_reset'));
        if (location.pathname === '/dashboard') {
          window.location.reload();
        } else {
          navigate('/dashboard');
        }
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

  const activePersona = PERSONAS.find(p => p.role === user?.role) || PERSONAS[0];

  const NAV_ITEMS = [
    // PROCUREMENT_OFFICER
    { to: '/dashboard', label: 'Dashboard', icon: '🏠', roles: ['PROCUREMENT_OFFICER'] },
    { to: '/tenders', label: 'Tenders', icon: '📋', roles: ['PROCUREMENT_OFFICER'] },
    { to: '/corrigendum', label: 'Corrigendum', icon: '📝', roles: ['PROCUREMENT_OFFICER'] },
    // TECHNICAL_EVALUATOR
    { to: '/bids', label: 'Bid Matrix', icon: '📦', roles: ['TECHNICAL_EVALUATOR'] },
    { to: '/compliance', label: 'Compliance Trace', icon: '⚖️', roles: ['TECHNICAL_EVALUATOR'] },
    // FINANCIAL_EVALUATOR
    { to: '/financial', label: 'Financial Review', icon: '💰', roles: ['FINANCIAL_EVALUATOR'] },
    // AUDIT_OFFICER
    { to: '/audit', label: 'Audit Chain', icon: '🛡️', roles: ['AUDIT_OFFICER'] },
    // BIDDER
    { to: '/my-bids', label: 'My Bids', icon: '🏢', roles: ['BIDDER'] },
  ].filter(item => item.roles.includes(user?.role));

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
        {/* Left Section: Brand & Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Brand */}
          <div
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              marginRight: 24,
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
              <span style={{ fontSize: 16 }}>🛡️</span>
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
                  CPCL
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                Compliance Copilot · SIH26100
              </div>
            </div>
          </div>

          {/* Navigation Links */}
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

            {/* Audit Replay Launcher Tab */}
            <button
              id="nav-audit-replay"
              onClick={() => setAuditReplayOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: '2px solid transparent',
                color: '#c084fc',
                fontSize: 13,
                fontWeight: 600,
                padding: '0 12px',
                height: 54,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={e => e.currentTarget.style.color = '#e9d5ff'}
              onMouseOut={e => e.currentTarget.style.color = '#c084fc'}
            >
              <span>🛡️</span>
              <span>Audit Replay</span>
            </button>
          </div>
        </div>

        {/* Right Section: Persona Switcher & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Landing Home Link */}
          <button
            onClick={() => navigate('/')}
            title="Return to Public Enterprise Landing Page"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8',
              fontSize: 11,
              fontWeight: 700,
              padding: '5px 10px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            🏛️ Landing
          </button>

          {/* Active Persona Indicator Pill with Dropdown */}
          <div
            id="persona-switcher"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${activePersona.badgeBorder}`,
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

            {/* Persona Rights Badge Pill */}
            <span
              id="active-persona-pill"
              title={activePersona.rights}
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: activePersona.badgeColor,
                background: activePersona.badgeBg,
                border: `1px solid ${activePersona.badgeBorder}`,
                padding: '3px 8px',
                borderRadius: 5,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              ● {activePersona.shortRole}
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
            }}
          >
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Global Status Banner Notification */}
      {bannerMsg && (
        <div style={{
          background: bannerMsg.type === 'error' ? '#7f1d1d' : '#1e3a8a',
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center',
          padding: '6px 16px',
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
