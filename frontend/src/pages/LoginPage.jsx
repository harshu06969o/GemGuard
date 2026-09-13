import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { login, registerBidder } from '../api/client';
import { loginSuccess } from '../store/slices/authSlice';

// Role → post-login destination
const ROLE_ROUTES = {
  PROCUREMENT_OFFICER: '/dashboard',
  TECHNICAL_EVALUATOR: '/bids',
  FINANCIAL_EVALUATOR: '/financial',
  AUDIT_OFFICER: '/audit',
  BIDDER: '/my-bids',
};

const PERSONA_CHIPS = [
  { label: 'Officer', email: 'officer@gem.gov.in', password: 'Admin@123', role: 'PROCUREMENT_OFFICER', color: '#10b981', icon: '👔' },
  { label: 'Evaluator', email: 'evaluator@gem.gov.in', password: 'Eval@123', role: 'TECHNICAL_EVALUATOR', color: '#3b82f6', icon: '🔬' },
  { label: 'Financial', email: 'financial@gem.gov.in', password: 'Finance@123', role: 'FINANCIAL_EVALUATOR', color: '#f59e0b', icon: '💰' },
  { label: 'Auditor', email: 'auditor@gem.gov.in', password: 'Audit@123', role: 'AUDIT_OFFICER', color: '#8b5cf6', icon: '🛡️' },
  { label: 'Bidder', email: 'bidder@vendor.com', password: 'Bidder@123', role: 'BIDDER', color: '#06b6d4', icon: '🏢' },
];

const INPUT_STYLE = {
  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
  color: '#f1f5f9', outline: 'none', boxSizing: 'border-box',
};

const SMALL_INPUT_STYLE = {
  width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
  color: '#f1f5f9', outline: 'none', boxSizing: 'border-box',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [tab, setTab] = useState('LOGIN');

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [category, setCategory] = useState('MSME');
  const [state, _setState] = useState('New Delhi');
  const [turnover, setTurnover] = useState('14.2');

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(username.trim(), password);
      // Dispatch to Redux so TopNav and all components pick up role immediately
      dispatch(loginSuccess({
        token: res.token,
        role: res.role,
        name: res.name || res.user?.name,
        email: res.username || username.trim(),
        department: res.user?.department || '',
      }));
      // Role-based routing — strict workspace isolation
      const dest = ROLE_ROUTES[res.role] || '/dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerBidder({
        username: regUsername.trim(),
        password: regPassword,
      });
      navigate('/my-bids', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #0f172a 100%)',
      fontFamily: "'Inter', sans-serif", padding: '24px',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 300, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)',
      }} />

      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, padding: '40px 36px', width: tab === 'REGISTER' ? 540 : 420,
        maxWidth: '100%', backdropFilter: 'blur(20px)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)', transition: 'all 0.3s ease',
        position: 'relative',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16,
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 26,
            boxShadow: '0 8px 32px rgba(59,130,246,0.45)',
          }}>🛡️</div>
          <h1 style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.5px' }}>
            GeM-Guard
          </h1>
          <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>
            AI-Powered Bid Compliance Verification · SIH26100
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 10,
          padding: 4, marginBottom: 24, border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {['LOGIN', 'REGISTER'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(null); }}
              style={{
                flex: 1, padding: '9px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                background: tab === t ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                color: tab === t ? '#fff' : '#64748b', cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: tab === t ? '0 4px 12px rgba(37,99,235,0.4)' : 'none',
              }}
            >
              {t === 'LOGIN' ? '🔐 Officer & Bidder Login' : '📝 Register Bidder'}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 20,
            color: '#fca5a5', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* LOGIN FORM */}
        {tab === 'LOGIN' ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em' }}>
                USERNAME / EMAIL
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="officer@gem.gov.in"
                required
                autoFocus
                style={INPUT_STYLE}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em' }}>
                PASSWORD
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={INPUT_STYLE}
              />
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#374151' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: '#fff', fontWeight: 700, fontSize: 15,
                boxShadow: loading ? 'none' : '0 4px 16px rgba(59,130,246,0.4)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? '⏳ Authenticating…' : '→ Sign In to GeM-Guard'}
            </button>

            {/* ─── 5-Persona Quick Fill ───────────────────────────────── */}
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ color: '#475569', fontSize: 11, fontWeight: 600, textAlign: 'center', margin: '0 0 12px', letterSpacing: '0.1em' }}>
                DEMO WORKSPACES
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {PERSONA_CHIPS.map(p => (
                  <button
                    key={p.role}
                    type="button"
                    id={`btn-persona-${p.role.toLowerCase()}`}
                    onClick={() => { setUsername(p.email); setPassword(p.password); }}
                    title={`${p.role}\n${p.email}`}
                    style={{
                      padding: '8px 4px', borderRadius: 8, border: `1px solid ${p.color}33`,
                      background: `${p.color}11`, color: p.color,
                      fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${p.color}22`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${p.color}11`; e.currentTarget.style.transform = 'none'; }}
                  >
                    <span style={{ fontSize: 18 }}>{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
              <p style={{ color: '#334155', fontSize: 10, textAlign: 'center', margin: '10px 0 0' }}>
                Click any role to auto-fill credentials
              </p>
            </div>
          </form>
        ) : (
          /* REGISTER FORM */
          <form onSubmit={handleRegister}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h3 style={{ color: '#fff', fontSize: 18, marginBottom: 8 }}>Create Bidder Account</h3>
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Enter your desired login credentials. Your company details will be automatically verified when you upload your compliance documents.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>LOGIN USERNAME</label>
                <input type="text" required placeholder="infralink_bidder"
                  value={regUsername} onChange={e => setRegUsername(e.target.value)} style={SMALL_INPUT_STYLE} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>PASSWORD</label>
                <input type="password" required placeholder="••••••••"
                  value={regPassword} onChange={e => setRegPassword(e.target.value)} style={SMALL_INPUT_STYLE} />
              </div>
            </div>

            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#374151' : 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff', fontWeight: 700, fontSize: 14,
                boxShadow: loading ? 'none' : '0 4px 16px rgba(16,185,129,0.4)',
              }}>
              {loading ? '⏳ Creating Organization Profile…' : '✓ Register Bidder & Enter Portal'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
