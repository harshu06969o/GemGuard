import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { loginSuccess } from '../store/slices/authSlice';
import { setToken } from '../api/client';
import {
  ShieldCheck, ArrowRight, CheckCircle2, FileText, Cpu, Database,
  Eye, UserCheck, Shield, ChevronRight, Sparkles, Scale, Lock,
  Layers, ExternalLink, Activity
} from 'lucide-react';

export const DEMO_PERSONAS = [
  {
    id: 'procurement',
    email: 'officer@cpcl.gov.in',
    username: 'officer@gem.gov.in',
    password: 'Admin@123',
    name: 'Shri R. Venkatraman',
    title: 'Chief Procurement Officer',
    department: 'CPCL Refinery Materials & Contracts Division',
    role: 'PROCUREMENT_OFFICER',
    badgeColor: '#10b981',
    badgeBg: 'rgba(16,185,129,0.14)',
    badgeBorder: 'rgba(16,185,129,0.3)',
    icon: '👔',
    tagline: 'Disqualification & Clearance Action Center',
    permissions: 'Administrative Overrides · Corrigendum Simulation · Statutory Show-Cause Notices',
    buttonText: 'Enter as Procurement Officer',
    accentGrad: 'from-emerald-500 to-teal-700',
    primaryColor: '#059669',
  },
  {
    id: 'evaluator',
    email: 'evaluator@cpcl.gov.in',
    username: 'evaluator@gem.gov.in',
    password: 'Eval@123',
    name: 'Dr. Ananya Sundaram',
    title: 'Senior Technical Evaluator',
    department: 'Technical Evaluation Committee (TEC) · CPCL Modernization',
    role: 'TECHNICAL_EVALUATOR',
    badgeColor: '#3b82f6',
    badgeBg: 'rgba(59,130,246,0.14)',
    badgeBorder: 'rgba(59,130,246,0.3)',
    icon: '🔬',
    tagline: 'Evidence & Technical Matrix Verification',
    permissions: 'Local Content % · CA UDIN Audits · Dual-Pane Bounding Box Verification',
    buttonText: 'Enter as Technical Evaluator',
    accentGrad: 'from-blue-500 to-indigo-700',
    primaryColor: '#2563eb',
  },
  {
    id: 'auditor',
    email: 'auditor@cpcl.gov.in',
    username: 'auditor@gem.gov.in',
    password: 'Audit@123',
    name: 'Smt. K. Meenakshi',
    title: 'Vigilance & Chief Audit Officer',
    department: 'Independent Vigilance & Oversight Wing · MoPNG',
    role: 'AUDIT_OFFICER',
    badgeColor: '#a855f7',
    badgeBg: 'rgba(168,85,247,0.14)',
    badgeBorder: 'rgba(168,85,247,0.3)',
    icon: '🛡️',
    tagline: 'Cryptographic Audit Trail & Replay Inspector',
    permissions: 'SHA-256 Hash Chain Integrity · Human Override Audit · Zero Discretion Logging',
    buttonText: 'Enter as Vigilance & Audit Officer',
    accentGrad: 'from-purple-500 to-violet-800',
    primaryColor: '#7c3aed',
  },
];

const ARCHITECTURE_STEPS = [
  {
    step: '01',
    title: 'Tender Intelligence',
    subtitle: 'Rule Compilation',
    tech: 'PyMuPDF Parser + Layout Analysis',
    desc: 'Compiles raw RFP clauses into deterministic mathematical constraints (Turnover ≥ ₹10 Cr, MII Class-I ≥ 50%).',
    icon: '📋',
    color: '#38bdf8',
  },
  {
    step: '02',
    title: 'Multi-Document Vision OCR',
    subtitle: 'Table & Figure Extraction',
    tech: 'Dual-Engine LayoutLM & Gemini 2.5',
    desc: 'Extracts numeric claims, UDIN numbers, and registration IDs with exact [x1, y1, x2, y2] bounding boxes.',
    icon: '👁️',
    color: '#818cf8',
  },
  {
    step: '03',
    title: '6-Registry Gov Connectors',
    subtitle: 'Cross-Portal Live Check',
    tech: 'GSTN · PAN · UDYAM · EPFO · MCA · DPIIT',
    desc: 'Real-time statutory verification with Graceful Degradation: zero wrongful disqualifications on registry latency.',
    icon: '🏛️',
    color: '#a78bfa',
  },
  {
    step: '04',
    title: 'Deterministic Rules Engine',
    subtitle: 'Pandas Integrity Checker',
    tech: 'Zero-Hallucination Boolean DAG',
    desc: 'Evaluates hard constraints against verified evidence. Flags cross-document inconsistencies (e.g., name mismatches).',
    icon: '⚖️',
    color: '#34d399',
  },
  {
    step: '05',
    title: 'Human Officer Decision',
    subtitle: 'SHA-256 Chained Audits',
    tech: 'Tamper-Evident Cryptographic Ledger',
    desc: 'Officers approve clearances or execute overrides with mandatory signed justifications immutably logged.',
    icon: '🛡️',
    color: '#f59e0b',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [authenticatingRole, setAuthenticatingRole] = useState(null);
  const [activeStepHover, setActiveStepHover] = useState(null);

  async function handleQuickEntry(persona) {
    setAuthenticatingRole(persona.id);
    try {
      // 1. Attempt official login via API Gateway
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: persona.username, password: persona.password }),
      }).catch(() => null);

      let token = 'mock_jwt_token_' + persona.role.toLowerCase() + '_' + Date.now();
      if (res && res.ok) {
        const data = await res.json();
        token = data.token;
      }

      // 2. Set token in API Client and Redux Store
      setToken(token);
      dispatch(loginSuccess({
        token,
        role: persona.role,
        name: persona.name,
        email: persona.email,
        department: persona.department,
      }));

      // 3. Dispatch global persona changed event for instant state synchronization
      window.dispatchEvent(new CustomEvent('gemguard:persona_changed', { detail: persona }));

      // 4. Navigate to tailored Dashboard
      navigate('/dashboard');
    } catch {
      // Fallback
      const token = 'fallback_token_' + persona.role;
      setToken(token);
      dispatch(loginSuccess({
        token,
        role: persona.role,
        name: persona.name,
        email: persona.email,
        department: persona.department,
      }));
      navigate('/dashboard');
    } finally {
      setAuthenticatingRole(null);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #0d1e38 0%, #080f1e 60%, #030712 100%)',
      color: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      position: 'relative',
      overflowX: 'hidden',
    }}>
      {/* Top Subtle Grid Background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 600,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      {/* ── GOV EMBLEM & HEADER BAR ────────────────────────────────────────── */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(8, 15, 30, 0.8)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1320,
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          {/* Government of India / CPCL / GeM Emblem Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Emblem Crest */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              paddingRight: 16,
              borderRight: '1px solid rgba(255,255,255,0.12)',
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                boxShadow: '0 4px 12px rgba(2,132,199,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                🏛️
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#f59e0b' }}>
                  Government of India
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', lineHeight: 1.2 }}>
                  Ministry of Petroleum & Natural Gas
                </div>
              </div>
            </div>

            {/* CPCL & GeM Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 6,
                background: 'rgba(37,99,235,0.2)',
                color: '#93c5fd',
                border: '1px solid rgba(147,197,253,0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <span>⚙️</span> CPCL Manali Refinery
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 6,
                background: 'rgba(16,185,129,0.15)',
                color: '#6ee7b7',
                border: '1px solid rgba(110,231,183,0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <span>🛡️</span> GeM Smart Automation
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: 6,
                background: 'rgba(245,158,11,0.15)',
                color: '#fcd34d',
                border: '1px solid rgba(252,211,77,0.3)',
              }}>
                SIH26100
              </span>
            </div>
          </div>

          {/* Header Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                border: 'none',
                color: '#ffffff',
                padding: '8px 20px',
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseOut={e => e.currentTarget.style.transform = 'none'}
            >
              <span>Sign In / Login</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ─────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '56px 24px 80px' }}>
        
        {/* Title & Brand Identity */}
        <div style={{ textAlign: 'center', maxWidth: 940, margin: '0 auto 40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 99,
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(96,165,250,0.3)',
            marginBottom: 20,
          }}>
            <Sparkles size={14} color="#60a5fa" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', letterSpacing: '0.04em' }}>
              NEXT-GEN STATUTORY PROCUREMENT COMPLIANCE COPILOT
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 4.5vw, 54px)',
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            margin: '0 0 18px',
            background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            GeM-Guard: Integrated Bid Compliance & Eligibility Intelligence Copilot
          </h1>

          <p style={{
            fontSize: 'clamp(15px, 1.4vw, 19px)',
            color: '#94a3b8',
            lineHeight: 1.6,
            margin: '0 auto',
            maxWidth: 820,
          }}>
            Transforming multi-document, multi-portal CPCL procurement evaluations into an evidence-linked workspace.
            Cross-verifies tenders, financial CA UDINs, MII local content affidavits, and statutory registries with zero hallucination.
          </p>
        </div>

        {/* ── CORE OPERATING AXIOM BANNER (Prominent Banner) ──────────────── */}
        <div
          id="operating-axiom-banner"
          style={{
            margin: '0 auto 52px',
            maxWidth: 1040,
            background: 'linear-gradient(90deg, rgba(30,58,138,0.35) 0%, rgba(15,23,42,0.65) 50%, rgba(30,58,138,0.35) 100%)',
            border: '1px solid rgba(96,165,250,0.35)',
            borderRadius: 14,
            padding: '22px 32px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0,
            left: '20%',
            right: '20%',
            height: 1,
            background: 'linear-gradient(90deg, transparent, #60a5fa, transparent)',
          }} />

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(59,130,246,0.18)',
                border: '1px solid rgba(96,165,250,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                flexShrink: 0,
              }}>
                ⚖️
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Platform Operating Axiom
                </div>
                <div style={{
                  fontSize: 'clamp(16px, 1.8vw, 22px)',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                  marginTop: 2,
                }}>
                  <span style={{ color: '#93c5fd' }}>AI reads.</span>{' '}
                  <span style={{ color: '#6ee7b7' }}>Rules verify.</span>{' '}
                  <span style={{ color: '#fcd34d' }}>Evidence explains.</span>{' '}
                  <span style={{ color: '#f472b6' }}>Officers decide.</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Cryptographic Proof</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>SHA-256 Chained</div>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Decision Logic</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>100% Deterministic</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── QUICK PERSONA ENTRY BAR (One-Click Instant Access for Demo) ─── */}
        <div style={{ marginBottom: 64 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                One-Click Instant Access for Demonstration
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', margin: '4px 0 0' }}>
                Select Officer Persona Workspace
              </h2>
            </div>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Instantly provisions Redux auth state & navigates to persona view
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 20,
          }}>
            {DEMO_PERSONAS.map(p => {
              const isBusy = authenticatingRole === p.id;
              return (
                <div
                  key={p.id}
                  id={`persona-card-${p.id}`}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${p.badgeBorder}`,
                    borderRadius: 16,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    backdropFilter: 'blur(10px)',
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = p.badgeColor;
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.borderColor = p.badgeBorder;
                  }}
                >
                  {/* Persona Header */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          fontSize: 28,
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          background: p.badgeBg,
                          border: `1px solid ${p.badgeBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {p.icon}
                        </span>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            {p.title}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: p.badgeBg,
                        color: p.badgeColor,
                        border: `1px solid ${p.badgeBorder}`,
                        letterSpacing: '0.04em',
                      }}>
                        {p.role}
                      </span>
                    </div>

                    <div style={{
                      fontSize: 11,
                      color: '#cbd5e1',
                      fontFamily: 'monospace',
                      marginBottom: 14,
                      background: 'rgba(0,0,0,0.25)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      display: 'inline-block',
                    }}>
                      📧 {p.email}
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
                      {p.tagline}
                    </div>

                    <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 20px' }}>
                      {p.permissions}
                    </p>
                  </div>

                  {/* Persona Quick Launch Button */}
                  <button
                    id={`btn-enter-${p.id}`}
                    onClick={() => handleQuickEntry(p)}
                    disabled={isBusy}
                    style={{
                      width: '100%',
                      padding: '12px 18px',
                      borderRadius: 8,
                      border: 'none',
                      background: p.primaryColor,
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: isBusy ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'filter 0.15s ease',
                      boxShadow: `0 4px 16px ${p.badgeBg}`,
                    }}
                    onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                    onMouseOut={e => e.currentTarget.style.filter = 'brightness(1.0)'}
                  >
                    <span>{isBusy ? 'Authenticating…' : p.buttonText}</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── LIVE ARCHITECTURE FLOW (Interactive Visual Cards) ───────────── */}
        <div style={{ marginBottom: 64 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Deterministic Pipeline Architecture
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#ffffff', margin: '4px 0 8px' }}>
              End-to-End Procurement Verification Engine
            </h2>
            <p style={{ fontSize: 13, color: '#94a3b8', maxWidth: 640, margin: '0 auto' }}>
              Hover over each pipeline stage to inspect data models, OCR engines, and statutory connectors.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            position: 'relative',
          }}>
            {ARCHITECTURE_STEPS.map((item, index) => {
              const isHovered = activeStepHover === index;
              return (
                <div
                  key={item.step}
                  id={`arch-step-${item.step}`}
                  onMouseEnter={() => setActiveStepHover(index)}
                  onMouseLeave={() => setActiveStepHover(null)}
                  style={{
                    background: isHovered ? 'rgba(30, 58, 138, 0.25)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${isHovered ? item.color : 'rgba(255, 255, 255, 0.08)'}`,
                    borderRadius: 14,
                    padding: '20px 18px',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 24 }}>{item.icon}</span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 900,
                        fontFamily: 'monospace',
                        color: item.color,
                        background: `${item.color}15`,
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}>
                        STAGE {item.step}
                      </span>
                    </div>

                    <div style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', marginBottom: 2 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: item.color, marginBottom: 8 }}>
                      {item.subtitle}
                    </div>

                    <div style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#cbd5e1',
                      background: 'rgba(0,0,0,0.3)',
                      padding: '4px 6px',
                      borderRadius: 4,
                      marginBottom: 10,
                      fontFamily: 'monospace',
                    }}>
                      {item.tech}
                    </div>

                    <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                      {item.desc}
                    </p>
                  </div>

                  {index < ARCHITECTURE_STEPS.length - 1 && (
                    <div style={{
                      position: 'absolute',
                      right: -10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 10,
                      fontSize: 12,
                      color: '#475569',
                      display: 'none', // Shown on large desktop grid via responsive css if needed
                    }}>
                      ➔
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── LIVE BENCHMARK BIDDER HIGHLIGHTS & STATS ───────────────────── */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '28px 32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 24,
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Active Benchmark Tender</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>GEM/2026/B/4521001</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>CPCL Manali Refinery Modernization</div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Seeded Bidders</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>4 Test Organizations</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Pass · Fail · Review · Pending</div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Statutory Registries</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 4 }}>6 Verified Adapters</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>GSTN, PAN, UDYAM, EPFO, MCA, DPIIT</div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Audit Chaining</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#a855f7', marginTop: 4 }}>SHA-256 Blockchain</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Immutable cryptographic ledger</div>
          </div>
        </div>

      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(3, 7, 18, 0.95)',
        padding: '24px',
        textAlign: 'center',
        fontSize: 12,
        color: '#64748b',
      }}>
        <div>
          <strong>GeM-Guard Platform</strong> · Smart India Hackathon 2026 (SIH26100)
        </div>
        <div style={{ marginTop: 4 }}>
          Chennai Petroleum Corporation Limited (CPCL) · Ministry of Petroleum & Natural Gas (MoPNG) · Government of India
        </div>
      </footer>
    </div>
  );
}
