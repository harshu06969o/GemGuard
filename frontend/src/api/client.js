/**
 * GeM-Guard — API Client v3.0 (Pure JavaScript)
 */

const envUrl = import.meta.env.VITE_API_URL;
const BASE = envUrl ? envUrl.replace(/\/$/, '') : '/api';

// Auth token management
const TOKEN_KEY = 'gemguard_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, init) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = body.detail ?? body.error ?? res.statusText;
    if (res.status === 401) clearToken();
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined;
  return res.json();
}

async function uploadWithProgress(path, formData, onProgress) {
  const url = `${BASE}${path}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const body = JSON.parse(xhr.responseText || '{}');
        reject(new ApiError(xhr.status, body.detail ?? xhr.statusText));
      }
    });
    xhr.addEventListener('error', () => reject(new ApiError(0, 'Network error during upload')));
    xhr.send(formData);
  });
}

// ── Auth ────────────────────────────────────────────────────────────────────

export const login = async (username, password) => {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data;
};

export const logout = () => clearToken();

export const getMe = () => request('/auth/me');

export const registerBidder = async (payload) => {
  const data = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setToken(data.token);
  return data;
};

// ── Tenders ──────────────────────────────────────────────────────────────────

export const listTenders = () => request('/tenders');

export const getTender = (id) => request(`/tenders/${id}`);

export const getTenderDocuments = (tenderId) =>
  request(`/tenders/${tenderId}/documents`);

export const createTender = (payload) =>
  request('/tenders', { method: 'POST', body: JSON.stringify(payload) });

export const updateTender = (id, payload) =>
  request(`/tenders/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const uploadTenderDocument = (tenderId, file, onProgress) => {
  const fd = new FormData();
  fd.append('file', file);
  return uploadWithProgress(`/tenders/${tenderId}/upload`, fd, onProgress);
};

export const compileRequirements = (tenderId, source) =>
  request(`/tenders/${tenderId}/compile`, { method: 'POST', body: JSON.stringify({ source }) });

export const getTenderBids = (tenderId) =>
  request(`/tenders/${tenderId}/bids`);

// ── Bidders ──────────────────────────────────────────────────────────────────

export const listBidders = () => request('/bidders');

export const getBidder = (id) => request(`/bidders/${id}`);

export const getMyProfile = () => request('/bidders/me/profile');

// ── Bids ─────────────────────────────────────────────────────────────────────

export const listBids = () => request('/bids');

export const getMyBids = () => request('/bids/mine');

export const getBid = (id) => request(`/bids/${id}`);

export const submitBid = (tenderId) =>
  request('/bids', { method: 'POST', body: JSON.stringify({ tender_id: tenderId }) });

export const submitOfficerAction = (bidId, payload) =>
  request(`/bids/${bidId}/officer-action`, { method: 'POST', body: JSON.stringify(payload) });

// ── Bidder Documents ──────────────────────────────────────────────────────────

export const listBidDocuments = (bidId) =>
  request(`/bids/${bidId}/documents`);

export const listBidEvidence = (bidId) =>
  request(`/bids/${bidId}/evidence`);

export const getBidDocument = (bidId, docId) =>
  request(`/bids/${bidId}/documents/${docId}`);

export const uploadBidderDocument = (bidId, file, onProgress) => {
  const fd = new FormData();
  fd.append('file', file);
  return uploadWithProgress(`/bids/${bidId}/documents/upload`, fd, onProgress);
};

// ── Compliance Engine ────────────────────────────────────────────────────────

export const evaluateBid = (bidId) =>
  request(`/bids/${bidId}/evaluate`, { method: 'POST' });

// ── Verification Connectors ───────────────────────────────────────────────────

export const runVerification = (bidId) =>
  request(`/bids/${bidId}/verify`, { method: 'POST' });

export const listVerifications = (bidId) =>
  request(`/bids/${bidId}/verifications`);

export const getConnectorsHealth = () =>
  request('/connectors/health');

// ── Trace & Audit ────────────────────────────────────────────────────────────

export const getComplianceTrace = (bidId) =>
  request(`/bids/${bidId}/trace`);

export const getAuditTimeline = (bidId) =>
  request(`/bids/${bidId}/audit`);

export const getAuditTrail = (bidId) =>
  request(`/bids/${bidId}/audit`);

export const getAuditReport = (bidId) =>
  request(`/bids/${bidId}/report`);

// ── Corrigendum ───────────────────────────────────────────────────────────────

export const runCorrigendumAnalysis = (payload) =>
  request('/corrigendum/impact-analysis', { method: 'POST', body: JSON.stringify(payload) });

// ── Health ────────────────────────────────────────────────────────────────────

export const getHealth = () =>
  request('/health', { headers: {} });

// ── Users (Officer) ───────────────────────────────────────────────────────────

export const listUsers = () =>
  request('/users');
