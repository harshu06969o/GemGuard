/**
 * GeM-Guard API Gateway
 * High-Performance Secure API Gateway & Reverse Proxy
 * 
 * Strict Specifications:
 * 1. Express initialized with helmet, cors, and morgan
 * 2. http-proxy-middleware forwarding /api/v1/* (and /api/*) to process.env.BACKEND_URL
 * 3. GET /health at root for Render keep-alive
 * 4. Stateless JWT Authentication with mock personas:
 *    - officer@gem.gov.in (Role: PROCUREMENT_OFFICER, full override rights)
 *    - evaluator@gem.gov.in (Role: TECHNICAL_EVALUATOR, read-only/review rights)
 *    - auditor@gem.gov.in (Role: AUDIT_OFFICER, audit log view only)
 * 5. Header Injection: Decodes JWT and injects x-user-id and x-user-role into proxy headers
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

import {
  authMiddleware,
  injectProxyHeaders,
  generateToken,
  MOCK_PERSONAS,
  JWT_SECRET,
} from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── 1. Security Headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// ── 2. CORS Configuration ───────────────────────────────────────────────────
const allowedOrigins = [
  FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server, curl, mobile apps with no origin
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || /^https:\/\/.*\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    // Allow development access
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-user-id',
    'x-user-role',
    'x-user-name',
    'x-user-permissions',
    'x-user-rights',
  ],
  exposedHeaders: ['x-user-id', 'x-user-role', 'x-user-name'],
}));

// ── 3. Request Logging (Morgan) ──────────────────────────────────────────────
app.use(morgan('dev'));

// ── 4. Health Check (Render Keep-Alive) ───────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'api-gateway',
    version: '3.0.0',
    backend_target: BACKEND_URL,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'GeM-Guard API Gateway',
    version: '3.0.0',
    status: 'active',
    health: '/health',
    api_base: '/api/v1',
    personas: Object.keys(MOCK_PERSONAS).map((email) => ({
      email,
      role: MOCK_PERSONAS[email].role,
      name: MOCK_PERSONAS[email].name,
      rights: MOCK_PERSONAS[email].rights,
    })),
  });
});

// ── 5. Persona Login Handler ────────────────────────────────────────────────
const parseAuthBody = [express.json(), express.urlencoded({ extended: true })];

async function handleLogin(req, res) {
  try {
    const { username, email, password } = req.body || {};
    const identifier = (username || email || '').trim().toLowerCase();

    if (!identifier) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Username or email is required',
      });
    }

    const persona = MOCK_PERSONAS[identifier];

    if (persona) {
      // Validate password if supplied
      if (password !== undefined && password !== null && password !== '') {
        const isValidPassword = persona.passwords.includes(password);
        if (!isValidPassword) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid credentials for mock persona',
          });
        }
      }

      // Generate stateless JWT token
      const token = generateToken(persona);

      return res.status(200).json({
        token,
        role: persona.role,
        name: persona.name,
        username: persona.username,
        rights: persona.rights,
        permissions: persona.permissions,
        user: {
          id: persona.id,
          username: persona.username,
          name: persona.name,
          role: persona.role,
          department: persona.department,
          rights: persona.rights,
        },
      });
    }

    // If identifier is not in mock personas, attempt fallback to FastAPI backend
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, password: password || '' }),
      });
      const data = await resp.json().catch(() => ({}));
      return res.status(resp.status).json(data);
    } catch {
      return res.status(401).json({
        error: 'Unauthorized',
        message: `User '${identifier}' not found in mock personas and backend authentication is unreachable.`,
        available_personas: Object.keys(MOCK_PERSONAS),
      });
    }
  } catch (err) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  }
}

// Register login route on all standard paths
app.post('/api/v1/auth/login', parseAuthBody, handleLogin);
app.post('/api/auth/login', parseAuthBody, handleLogin);
app.post('/auth/login', parseAuthBody, handleLogin);
app.post('/login', parseAuthBody, handleLogin);

// Persona catalog endpoint for UI/testers
app.get('/api/v1/auth/personas', (req, res) => {
  res.json({
    personas: Object.values(MOCK_PERSONAS).map(({ id, username, name, role, department, rights, permissions }) => ({
      id,
      username,
      name,
      role,
      department,
      rights,
      permissions,
    })),
  });
});
app.get('/auth/personas', (req, res) => {
  res.redirect('/api/v1/auth/personas');
});

// Current user inspection endpoint
app.get(['/api/v1/auth/me', '/api/auth/me', '/auth/me'], authMiddleware, (req, res) => {
  if (req.user) {
    return res.json({
      ...req.user,
      headers_injected: {
        'x-user-id': req.headers['x-user-id'],
        'x-user-role': req.headers['x-user-role'],
        'x-user-name': req.headers['x-user-name'],
      },
    });
  }
  return res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
});

// ── 6. Reverse Proxy with Header Injection to FastAPI Backend ───────────────
// Note: We do NOT use global express.json() so multipart form-data streams intact
const backendProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  ws: true,
  pathFilter: (pathname) => pathname.startsWith('/api') || pathname.startsWith('/auth'),
  on: {
    proxyReq: (proxyReq, req, res) => {
      injectProxyHeaders(proxyReq, req);
    },
    error: (err, req, res) => {
      console.error('[Gateway Proxy Error]', err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Unable to connect to GeM-Guard Backend service.',
          detail: err.message,
          backend_target: BACKEND_URL,
        });
      }
    },
  },
  // Legacy event hooks for backwards compatibility with various HPM configurations
  onProxyReq: (proxyReq, req, res) => {
    injectProxyHeaders(proxyReq, req);
  },
  onError: (err, req, res) => {
    console.error('[Gateway Proxy Error]', err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Unable to connect to GeM-Guard Backend service.',
        detail: err.message,
        backend_target: BACKEND_URL,
      });
    }
  },
});

// Apply authentication middleware and reverse proxy for all API traffic
app.use(authMiddleware);
app.use(backendProxy);

// ── 7. Server Listener ──────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🛡️  GeM-Guard API Gateway listening on port ${PORT}`);
  console.log(`🔗 Target Backend: ${BACKEND_URL}`);
  console.log(`🌐 Allowed Frontend: ${FRONTEND_URL}`);
  console.log(`💓 Health Check: http://localhost:${PORT}/health`);
  console.log(`🔑 Available Personas:`);
  Object.values(MOCK_PERSONAS).forEach((p) => {
    console.log(`   - ${p.username} [${p.role}] (${p.rights})`);
  });
  console.log(`====================================================`);
});

export { app, server };
export default app;
