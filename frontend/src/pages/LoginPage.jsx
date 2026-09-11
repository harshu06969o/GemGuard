import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, registerBidder } from '../api/client';

export default function LoginPage() {
  const navigate = useNavigate();
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
      if (res.role === 'BIDDER') {
        navigate('/my-bids', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
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
        name: regFullName.trim(),
        company_name: companyName.trim(),
        gstin: gstin.trim().toUpperCase(),
        pan: pan.trim().toUpperCase(),
        category,
        state,
        turnover_cr: parseFloat(turnover) || 0,
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
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
      fontFamily: "'Inter', sans-serif", padding: '24px',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '36px 32px', width: tab === 'REGISTER' ? 520 : 400,
        maxWidth: '100%', backdropFilter: 'blur(16px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)', transition: 'all 0.3s ease',
      }}>
        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
            fontSize: 24, boxShadow: '0 8px 24px rgba(59,130,246,0.4)',
          }}>🛡️</div>
          <h1 style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>GeM-Guard</h1>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>
            AI-Powered Bid Compliance Verification Platform · SIH26100
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8,
          padding: 4, marginBottom: 20, border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button
            type="button"
            onClick={() => { setTab('LOGIN'); setError(null); }}
            style={{
              flex: 1, padding: '8px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
              background: tab === 'LOGIN' ? '#2563eb' : 'transparent',
              color: tab === 'LOGIN' ? '#fff' : '#94a3b8', cursor: 'pointer',
            }}
          >
            Officer & Bidder Login
          </button>
          <button
            type="button"
            onClick={() => { setTab('REGISTER'); setError(null); }}
            style={{
              flex: 1, padding: '8px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
              background: tab === 'REGISTER' ? '#2563eb' : 'transparent',
              color: tab === 'REGISTER' ? '#fff' : '#94a3b8', cursor: 'pointer',
            }}
          >
            Register Bidder
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            color: '#fca5a5', fontSize: 13,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* LOGIN FORM */}
        {tab === 'LOGIN' ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
                Username / Email
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="officer@gem.gov.in"
                required
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#f1f5f9', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#f1f5f9', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#374151' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: '#fff', fontWeight: 700, fontSize: 14,
              }}
            >
              {loading ? 'Authenticating…' : 'Sign In'}
            </button>

            {/* Quick Demo Credentials */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ color: '#64748b', fontSize: 11, textAlign: 'center', margin: '0 0 10px' }}>
                Default Platform Roles
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  id="btn-persona-officer"
                  onClick={() => { setUsername('officer@gem.gov.in'); setPassword('Admin@123'); }}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 11, cursor: 'pointer',
                  }}
                  title="Role: PROCUREMENT_OFFICER (full override rights)"
                >
                  Procurement
                </button>
                <button
                  type="button"
                  id="btn-persona-evaluator"
                  onClick={() => { setUsername('evaluator@gem.gov.in'); setPassword('Eval@123'); }}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 11, cursor: 'pointer',
                  }}
                  title="Role: TECHNICAL_EVALUATOR (read-only/review rights)"
                >
                  Evaluator
                </button>
                <button
                  type="button"
                  id="btn-persona-auditor"
                  onClick={() => { setUsername('auditor@gem.gov.in'); setPassword('Audit@123'); }}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 11, cursor: 'pointer',
                  }}
                  title="Role: AUDIT_OFFICER (audit log view only)"
                >
                  Auditor
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* REGISTER FORM */
          <form onSubmit={handleRegister}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Company Legal Name</label>
                <input
                  type="text" required placeholder="Infralink Tech Ltd"
                  value={companyName} onChange={e => setCompanyName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Authorized Representative</label>
                <input
                  type="text" required placeholder="Rajesh Kumar"
                  value={regFullName} onChange={e => setRegFullName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>GSTIN (15 characters)</label>
                <input
                  type="text" required placeholder="07AACCI4520M1ZP" maxLength={15}
                  value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Company PAN (10 characters)</label>
                <input
                  type="text" required placeholder="AACCI4520M" maxLength={10}
                  value={pan} onChange={e => setPan(e.target.value.toUpperCase())}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Enterprise Category</label>
                <select
                  value={category} onChange={e => setCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', fontSize: 12, boxSizing: 'border-box' }}
                >
                  <option value="MSME">MSME (Udyam Verified)</option>
                  <option value="STARTUP">DPIIT Recognized Startup</option>
                  <option value="LARGE">Large Commercial Enterprise</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Annual Turnover (₹ Cr)</label>
                <input
                  type="number" step="0.1" required placeholder="14.2"
                  value={turnover} onChange={e => setTurnover(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Login Username</label>
                <input
                  type="text" required placeholder="infralink_bidder"
                  value={regUsername} onChange={e => setRegUsername(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Password</label>
                <input
                  type="password" required placeholder="••••••••"
                  value={regPassword} onChange={e => setRegPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#374151' : 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff', fontWeight: 700, fontSize: 14,
              }}
            >
              {loading ? 'Creating Organization Profile…' : 'Register Bidder & Enter Portal'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
