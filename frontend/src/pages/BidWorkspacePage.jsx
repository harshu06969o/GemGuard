/**
 * BidWorkspacePage — Stage 3 + Stage 4 (Pure JavaScript)
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  listBids,
  listBidDocuments,
  listBidEvidence,
  uploadBidderDocument,
  getBidDocument,
  runVerification,
  listVerifications,
} from '../api/client';

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const DOC_TYPE_COLOR = {
  CA_CERTIFICATE:    '#7c3aed',
  GST_CERTIFICATE:   '#0e7490',
  UDYAM_CERTIFICATE: '#16a34a',
  PAN:               '#b45309',
  OTHER:             '#475569',
  UNKNOWN:           '#94a3b8',
};

const FIELD_LABEL = {
  turnover_avg_3fy:         'Turnover (Avg. 3FY)',
  gst_registration_status:  'GST Status',
  udyam_registration_status:'Udyam Status',
  udyam_number:             'Udyam Number',
  legal_entity_name:        'Legal Entity Name',
  certificate_issue_date:   'Issue Date',
  certificate_expiry_date:  'Expiry Date',
  gstin:                    'GSTIN',
};

const STATUS_COLORS = {
  UNVERIFIED:       { bg: '#f1f5f9', color: '#475569' },
  VERIFIED:         { bg: '#dcfce7', color: '#16a34a' },
  REVIEW:           { bg: '#fef3c7', color: '#92400e' },
  MANUAL_REQUIRED:  { bg: '#fef2f2', color: '#dc2626' },
};

const PIPELINE_STATUS_COLORS = {
  PROCESSED: { bg: '#dcfce7', color: '#16a34a' },
  FAILED:    { bg: '#fef2f2', color: '#dc2626' },
  PENDING:   { bg: '#fef3c7', color: '#92400e' },
};

function StatusBadge2({ status }) {
  const c = STATUS_COLORS[status] ?? { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      background: c.bg, color: c.color,
      padding: '2px 7px', borderRadius: 3,
    }}>
      {status ? status.replace('_', ' ') : '—'}
    </span>
  );
}

function PipelineBadge({ status }) {
  const c = PIPELINE_STATUS_COLORS[status] ?? { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      background: c.bg, color: c.color,
      padding: '2px 8px', borderRadius: 3,
    }}>
      {status}
    </span>
  );
}

function DocTypeBadge({ value }) {
  if (!value) return <span style={{ color: '#94a3b8', fontSize: 10 }}>UNKNOWN</span>;
  const c = DOC_TYPE_COLOR[value] ?? '#475569';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      color: c, background: c + '15',
      padding: '2px 8px', borderRadius: 3,
      letterSpacing: '0.05em',
    }}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function ConfidenceBar({ value }) {
  if (value == null) return <span style={{ color: '#94a3b8', fontSize: 10 }}>—</span>;
  const pct = Math.round(value * 100);
  const color = value >= 0.8 ? '#16a34a' : value >= 0.6 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 99, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

function EvidenceDetailPanel({ ev, onClose }) {
  const fieldLabel = FIELD_LABEL[ev.field] ?? ev.field;

  return (
    <tr>
      <td colSpan={6} style={{ padding: 0, background: '#f8fafc', borderBottom: '2px solid #1e3a5f' }}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f' }}>
                Evidence Detail
              </span>
              <span style={{ marginLeft: 10, fontSize: 11, color: '#64748b' }}>
                ID #{ev.id}
              </span>
            </div>
            <button
              id="btn-close-evidence-detail"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <SectionHeader>Source Evidence</SectionHeader>
              <DetailGrid>
                <DetailRow label="Document" value={`Document #${ev.document_id}`} />
                <DetailRow label="Page" value={ev.source_page != null ? `Page ${ev.source_page}` : '—'} />
                <DetailRow label="Field" value={fieldLabel} />
                <DetailRow label="Extraction Method" value={ev.extraction_method ?? '—'} mono />
                <DetailRow label="Extracted" value={fmtDate(ev.extracted_at)} />
              </DetailGrid>

              {ev.source_snippet && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Source Text Snippet
                  </div>
                  <div style={{
                    background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '3px solid #f59e0b',
                    borderRadius: 4, padding: '10px 12px', fontSize: 11,
                    lineHeight: 1.7, color: '#1e293b', fontStyle: 'italic',
                    maxHeight: 120, overflowY: 'auto',
                  }}>
                    &ldquo;{ev.source_snippet}&rdquo;
                  </div>
                </div>
              )}
            </div>

            <div>
              <SectionHeader>Extracted Values</SectionHeader>
              <DetailGrid>
                <DetailRow label="Raw Value" value={ev.raw_value} />
                <DetailRow label="Normalized Value" value={ev.normalized_value} mono />
                <DetailRow label="Verification Status">
                  <StatusBadge2 status={ev.verification_status} />
                </DetailRow>
              </DetailGrid>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                  Extraction Confidence (quality of text read — NOT compliance result)
                </div>
                <ConfidenceBar value={ev.confidence} />
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
                  {ev.confidence != null && ev.confidence < 0.6
                    ? '⚠ Low confidence — officer should verify manually'
                    : ev.confidence != null && ev.confidence < 0.8
                    ? '⚡ Moderate confidence — cross-check recommended'
                    : '✓ High extraction confidence'}
                </div>
              </div>

              <div style={{
                marginTop: 14, padding: '8px 12px',
                background: '#eff6ff', border: '1px solid #bfdbfe',
                borderRadius: 4, fontSize: 11, color: '#1d4ed8',
                lineHeight: 1.5,
              }}>
                <strong>Note:</strong> This confidence score reflects how accurately the value was
                read from the document. Compliance status (PASS/FAIL/REVIEW) is determined
                separately by the rules engine, not by this score.
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function DetailGrid({ children }) {
  return <div style={{ display: 'grid', gap: 8 }}>{children}</div>;
}

function DetailRow({ label, value, children, mono = false }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ minWidth: 130, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', paddingTop: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontFamily: mono ? 'monospace' : undefined, color: '#1e293b', wordBreak: 'break-all' }}>
        {children ?? (value || '—')}
      </span>
    </div>
  );
}

function EvidenceInspector({
  bidId,
  documents,
}) {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filterField, setFilterField] = useState('ALL');
  const [filterDoc, setFilterDoc] = useState('ALL');

  useEffect(() => {
    setLoading(true);
    listBidEvidence(bidId)
      .then(setEvidence)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bidId]);

  const fields = ['ALL', ...Array.from(new Set(evidence.map(e => e.field)))];
  const filtered = evidence.filter(e => {
    if (filterField !== 'ALL' && e.field !== filterField) return false;
    if (filterDoc !== 'ALL' && e.document_id !== filterDoc) return false;
    return true;
  });

  const docMap = Object.fromEntries(documents.map(d => [d.id, d]));

  return (
    <div className="card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Evidence Inspector</span>
          <span style={{ marginLeft: 10, fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10 }}>
            {filtered.length} items
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            id="evidence-filter-field"
            value={filterField}
            onChange={e => setFilterField(e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, color: '#1e293b' }}
          >
            {fields.map(f => (
              <option key={f} value={f}>{f === 'ALL' ? 'All Fields' : (FIELD_LABEL[f] ?? f)}</option>
            ))}
          </select>
          <select
            id="evidence-filter-doc"
            value={String(filterDoc)}
            onChange={e => setFilterDoc(e.target.value === 'ALL' ? 'ALL' : e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, color: '#1e293b' }}
          >
            <option value="ALL">All Documents</option>
            {documents.map(d => (
              <option key={d.id} value={d.id}>{d.original_filename ?? d.filename}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Loading evidence…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
          {evidence.length === 0
            ? 'No evidence extracted yet. Upload bidder documents to extract evidence.'
            : 'No evidence matching current filters.'
          }
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Raw Value</th>
              <th>Normalized</th>
              <th>Page</th>
              <th>Extraction Confidence</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ev => (
              <Fragment key={ev.id}>
                <tr
                  id={`ev-row-${ev.id}`}
                  onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                  style={{
                    cursor: 'pointer',
                    background: expandedId === ev.id ? '#eff6ff' : undefined,
                    borderLeft: expandedId === ev.id ? '3px solid #1e3a5f' : '3px solid transparent',
                  }}
                  title="Click to view full evidence detail"
                >
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      {FIELD_LABEL[ev.field] ?? ev.field}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      {docMap[ev.document_id] ? (
                        <DocTypeBadge value={docMap[ev.document_id].doc_type} />
                      ) : `Doc #${ev.document_id}`}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.raw_value ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#1e3a5f' }}>
                    {ev.normalized_value ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
                    {ev.source_page != null ? `pg. ${ev.source_page}` : '—'}
                  </td>
                  <td><ConfidenceBar value={ev.confidence} /></td>
                  <td><StatusBadge2 status={ev.verification_status} /></td>
                </tr>
                {expandedId === ev.id && (
                  <EvidenceDetailPanel ev={ev} onClose={() => setExpandedId(null)} />
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {filtered.length > 0 && (
        <div style={{ padding: '10px 18px', fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
          Click any row for full detail including source text snippet.
          Confidence reflects text extraction quality — not compliance status.
        </div>
      )}
    </div>
  );
}

function DocumentUploadPanel({
  bidId,
  bidderName,
  onUploaded,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  async function doUpload(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted.');
      return;
    }
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const doc = await uploadBidderDocument(bidId, file, setProgress);
      setLastDoc(doc);
      onUploaded(doc);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) doUpload(f);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 13 }}>
        Upload Document — {bidderName}
      </div>
      <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: lastDoc ? '1fr 1fr' : '1fr', gap: 20 }}>
        <div
          id={`upload-zone-bid-${bidId}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#1e3a5f' : '#cbd5e1'}`,
            borderRadius: 6, padding: '24px 16px', textAlign: 'center',
            cursor: uploading ? 'wait' : 'pointer',
            background: dragOver ? '#eff6ff' : '#f8fafc',
            transition: 'all 0.15s ease',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = ''; }}
            id={`file-input-bid-${bidId}`}
          />
          {uploading ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f', marginBottom: 10 }}>
                Uploading & Extracting…
              </div>
              <div style={{ background: '#e2e8f0', borderRadius: 99, height: 6, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#1e3a5f', transition: 'width 0.2s' }} />
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{progress}% — running extraction pipeline</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 26, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f' }}>Upload Bidder Document</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                CA Certificate · GST Certificate · Udyam · PAN<br />
                Drag & drop or click · PDF only · Max 50 MB
              </div>
            </>
          )}
        </div>

        {lastDoc && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Processing Result
            </div>
            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              <Row label="Filename" value={lastDoc.original_filename ?? lastDoc.filename} mono />
              <Row label="Document Type"><DocTypeBadge value={lastDoc.doc_type} /></Row>
              <Row label="Pages" value={lastDoc.page_count ? String(lastDoc.page_count) : '—'} />
              <Row label="Method" value={lastDoc.extraction_method ?? '—'} mono />
              <Row label="Pipeline"><PipelineBadge status={lastDoc.pipeline_status} /></Row>
              <Row label="Evidence Items">
                <span style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 13 }}>
                  {lastDoc.bidder_evidence.length}
                </span>
                <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>fields extracted</span>
              </Row>
            </div>

            {lastDoc.pipeline_status === 'PROCESSED' && lastDoc.bidder_evidence.length > 0 && (
              <div style={{
                marginTop: 12, padding: '8px 12px',
                background: '#dcfce7', border: '1px solid #86efac', borderRadius: 4,
                fontSize: 12, color: '#15803d',
              }}>
                ✓ Pipeline complete. Click "Evidence Inspector" tab to inspect extracted fields.
              </div>
            )}

            {lastDoc.pipeline_error && (
              <div style={{
                marginTop: 10, padding: '8px 12px',
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4,
                fontSize: 12, color: '#dc2626',
              }}>
                ⚠ {lastDoc.pipeline_error}
              </div>
            )}
          </div>
        )}
      </div>
      {error && (
        <div style={{ margin: '0 18px 16px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, children, mono = false }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{ minWidth: 100, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: mono ? 'monospace' : undefined, color: '#1e293b' }}>
        {children ?? (value || '—')}
      </span>
    </div>
  );
}

function DocumentsList({ bidId, documents, onSelect }) {
  async function handleClick(doc) {
    try {
      const full = await getBidDocument(bidId, doc.id);
      onSelect(full);
    } catch (_) {}
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 13 }}>
        Uploaded Documents
        <span style={{ marginLeft: 8, fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10 }}>
          {documents.length}
        </span>
      </div>
      {documents.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
          No documents uploaded yet.
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Type</th>
              <th>Pages</th>
              <th>Method</th>
              <th>Evidence</th>
              <th>Pipeline</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {documents.map(d => (
              <tr
                key={d.id}
                id={`doc-row-${d.id}`}
                onClick={() => handleClick(d)}
                style={{ cursor: 'pointer' }}
                title="Click to view full extraction detail"
              >
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{d.original_filename ?? d.filename}</td>
                <td><DocTypeBadge value={d.doc_type} /></td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.page_count ?? '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{d.extraction_method ?? '—'}</td>
                <td>
                  <span style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 13 }}>{d.evidence_count}</span>
                  <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>fields</span>
                </td>
                <td><PipelineBadge status={d.pipeline_status} /></td>
                <td style={{ fontSize: 11, color: '#64748b' }}>{new Date(d.uploaded_at).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const CONNECTOR_STATUS_CONFIG = {
  VERIFIED:        { icon: '✓', color: '#16a34a', bg: '#dcfce7' },
  NOT_VERIFIED:    { icon: '✗', color: '#dc2626', bg: '#fef2f2' },
  UNAVAILABLE:     { icon: '⏳', color: '#92400e', bg: '#fef3c7' },
  STALE:           { icon: '⚠', color: '#d97706', bg: '#fffbeb' },
  UNAUTHORIZED:    { icon: '🔒', color: '#7c3aed', bg: '#f5f3ff' },
  MANUAL_REQUIRED: { icon: '👤', color: '#0e7490', bg: '#ecfeff' },
};

const HINT_CONFIG = {
  PASS_CANDIDATE: { label: 'PASS CANDIDATE', color: '#16a34a', bg: '#dcfce7' },
  REVIEW:         { label: 'REVIEW',         color: '#d97706', bg: '#fffbeb' },
  PENDING:        { label: 'PENDING',        color: '#475569', bg: '#f1f5f9' },
};

const SOURCE_NAMES = {
  GST_MOCK:   'GST Registration Portal',
  UDYAM_MOCK: 'Udyam Registration Portal',
  PAN_MOCK:   'Income Tax PAN Portal',
  EPFO_MOCK:  'EPFO Member Database',
};

function ConnectorStatusBadge({ status }) {
  const c = CONNECTOR_STATUS_CONFIG[status] ?? { icon: '?', color: '#64748b', bg: '#f1f5f9' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700,
      color: c.color, background: c.bg,
      padding: '3px 10px', borderRadius: 3,
    }}>
      {c.icon} {status ? status.replace('_', ' ') : '—'}
    </span>
  );
}

function ComplianceHintBadge({ hint }) {
  const c = HINT_CONFIG[hint] ?? { label: hint, color: '#64748b', bg: '#f1f5f9' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      color: c.color, background: c.bg,
      padding: '3px 10px', borderRadius: 3,
    }}>
      {c.label}
    </span>
  );
}

function VerificationPanel({ bidId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);

  const load = (id) => {
    setLoading(true);
    listVerifications(id)
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(bidId); }, [bidId]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const result = await runVerification(bidId);
      setRecords(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const unavailableCount = records.filter(r => r.connector_status === 'UNAVAILABLE').length;
  const verifiedCount = records.filter(r => r.connector_status === 'VERIFIED').length;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              Verification Connector Layer
            </div>
            <div style={{
              fontSize: 10, padding: '3px 8px', display: 'inline-block', borderRadius: 3,
              background: '#fef3c7', color: '#92400e', fontWeight: 700,
            }}>
              ⚡ Simulation / Authorized Adapter — NOT live government API
            </div>
            {records.length > 0 && (
              <div style={{ display: 'gap', gap: 12, marginTop: 10 }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>{verifiedCount}</span>
                  <span style={{ color: '#64748b', marginLeft: 4 }}>Verified</span>
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: '#92400e' }}>{unavailableCount}</span>
                  <span style={{ color: '#64748b', marginLeft: 4 }}>Unavailable → PENDING</span>
                </div>
              </div>
            )}
          </div>
          <button
            id="btn-run-verification"
            onClick={handleRun}
            disabled={running}
            style={{
              background: running ? '#94a3b8' : '#1e3a5f',
              color: 'white', border: 'none', borderRadius: 4,
              padding: '8px 18px', fontSize: 12, fontWeight: 700,
              cursor: running ? 'wait' : 'pointer',
            }}
          >
            {running ? '⟳ Running…' : '▶ Run Verification'}
          </button>
        </div>

        {unavailableCount > 0 && (
          <div style={{
            margin: '0 18px 16px',
            padding: '10px 14px',
            background: '#fef3c7', border: '1px solid #fcd34d',
            borderLeft: '4px solid #f59e0b', borderRadius: 4,
            fontSize: 12, color: '#78350f',
          }}>
            <strong>⚠ Source Unavailable:</strong> {unavailableCount} verification source(s) could not be reached.{' '}
            Compliance status for these checks is <strong>PENDING</strong> — not FAIL.{' '}
            The system does not reject a bidder because of source downtime.
            Officer should retry when the source is restored.
          </div>
        )}

        {error && (
          <div style={{ margin: '0 18px 16px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>
            {error}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 12 }}>
          Verification Results
          <span style={{ marginLeft: 8, fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10 }}>
            {records.length} sources
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            {records.length === 0 ? 'No verification run yet. Click "Run Verification" to start.' : 'Loading…'}
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
            No verification records. Click <strong>▶ Run Verification</strong> to check all sources.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Verification Source</th>
                <th>Source Label</th>
                <th>Connector Status</th>
                <th>Compliance State</th>
                <th>Checked At</th>
                <th>Retries</th>
                <th>Fresh</th>
              </tr>
            </thead>
            <tbody>
              {records.map(rec => (
                <Fragment key={rec.id}>
                  <tr
                    id={`vr-row-${rec.id}`}
                    onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                    style={{
                      cursor: 'pointer',
                      background: expandedId === rec.id ? '#eff6ff' : (rec.connector_status === 'UNAVAILABLE' ? '#fffbeb' : undefined),
                      borderLeft: expandedId === rec.id ? '3px solid #1e3a5f' : '3px solid transparent',
                    }}
                    title="Click to view detail"
                  >
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>
                        {SOURCE_NAMES[rec.source] ?? rec.source}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{rec.source}</div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: '#92400e', background: '#fef3c7',
                        padding: '2px 6px', borderRadius: 3,
                      }}>
                        {rec.source_label}
                      </span>
                    </td>
                    <td><ConnectorStatusBadge status={rec.connector_status} /></td>
                    <td><ComplianceHintBadge hint={rec.compliance_hint} /></td>
                    <td style={{ fontSize: 11, color: '#64748b' }}>
                      {new Date(rec.checked_at).toLocaleTimeString('en-IN')}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{rec.retry_count}</td>
                    <td>
                      {rec.is_fresh
                        ? <span style={{ color: '#16a34a', fontSize: 11 }}>✓</span>
                        : <span style={{ color: '#dc2626', fontSize: 11 }}>✗</span>}
                    </td>
                  </tr>

                  {expandedId === rec.id && (
                    <tr key={`${rec.id}-detail`}>
                      <td colSpan={7} style={{ padding: 0, background: '#f8fafc', borderBottom: '2px solid #1e3a5f' }}>
                        <div style={{ padding: '18px 24px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                                Request Metadata
                              </div>
                              <div style={{ display: 'grid', gap: 7, fontSize: 12 }}>
                                <VRow label="Request ID" value={rec.request_id} mono />
                                <VRow label="Source" value={`${SOURCE_NAMES[rec.source] ?? rec.source} (${rec.source})`} />
                                <VRow label="Source Label" value={rec.source_label} />
                                <VRow label="Checked At" value={new Date(rec.checked_at).toLocaleString('en-IN')} />
                                <VRow label="Retry Count" value={String(rec.retry_count)} />
                                <VRow label="Raw Hash" value={rec.raw_hash ?? '—'} mono />
                                <VRow label="Simulated">
                                  <span style={{ fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 3 }}>
                                    {rec.simulated ? 'YES — Simulation / Authorized Adapter' : 'NO'}
                                  </span>
                                </VRow>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                                Verification Result
                              </div>
                              <div style={{ display: 'grid', gap: 7, fontSize: 12, marginBottom: 14 }}>
                                <VRow label="Connector Status"><ConnectorStatusBadge status={rec.connector_status} /></VRow>
                                <VRow label="Compliance State"><ComplianceHintBadge hint={rec.compliance_hint} /></VRow>
                                <VRow label="Freshness" value={rec.is_fresh ? 'Fresh' : 'Stale'} />
                              </div>

                              {rec.message && (
                                <div style={{
                                  padding: '8px 12px', borderRadius: 4,
                                  background: rec.connector_status === 'UNAVAILABLE' ? '#fef3c7' : '#f0fdf4',
                                  border: `1px solid ${rec.connector_status === 'UNAVAILABLE' ? '#fcd34d' : '#86efac'}`,
                                  fontSize: 11, lineHeight: 1.6,
                                  color: rec.connector_status === 'UNAVAILABLE' ? '#78350f' : '#15803d',
                                }}>
                                  {rec.message}
                                </div>
                              )}

                              {rec.fields_verified && Object.keys(rec.fields_verified).length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                                    Fields Verified
                                  </div>
                                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                                    {Object.entries(rec.fields_verified).map(([k, v]) => (
                                      <div key={k} style={{ display: 'flex', padding: '5px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ minWidth: 160, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</span>
                                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#1e293b' }}>{String(v)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        {records.length > 0 && (
          <div style={{ padding: '10px 18px', fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
            Click any row to view detail including request ID and verified fields.
            Compliance State is a hint only — final status is set by the rules engine.
          </div>
        )}
      </div>
    </div>
  );
}

function VRow({ label, value, children, mono = false }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ minWidth: 110, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: mono ? 'monospace' : undefined, color: '#1e293b', wordBreak: 'break-all' }}>
        {children ?? (value || '—')}
      </span>
    </div>
  );
}

export default function BidWorkspacePage() {
  const [bids, setBids] = useState([]);
  const [selectedBid, setSelectedBid] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');

  useEffect(() => {
    listBids()
      .then(b => {
        setBids(b);
        if (b.length > 0) setSelectedBid(b[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBid) return;
    setDocsLoading(true);
    listBidDocuments(selectedBid.id)
      .then(setDocuments)
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  }, [selectedBid]);

  function handleUploaded(doc) {
    const listItem = {
      id: doc.id,
      bid_id: doc.bid_id,
      bid_package_id: doc.bid_package_id,
      filename: doc.filename,
      original_filename: doc.original_filename,
      doc_type: doc.doc_type,
      doc_type_confidence: doc.doc_type_confidence ?? null,
      page_count: doc.page_count,
      extraction_method: doc.extraction_method,
      pipeline_status: doc.pipeline_status,
      uploaded_at: doc.uploaded_at,
      processed_at: doc.processed_at ?? null,
      evidence_count: doc.bidder_evidence ? doc.bidder_evidence.length : 0,
    };
    setDocuments(prev => [listItem, ...prev]);
    if (doc.bidder_evidence && doc.bidder_evidence.length > 0) setActiveTab('inspector');
  }

  const bidderDisplayName = (bid) => {
    const name = bid.bidder?.name ?? `Bid #${bid.id}`;
    return name.split('—')[1]?.trim() ?? name;
  };

  if (loading) {
    return (
      <div className="page-layout">
        <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div style={{ color: '#64748b' }}>Loading bids…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-layout">
      <div className="sidebar">
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #2d4a6e' }}>
          <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Bid Workspace
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>Document &amp; Verification</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>GEM/2026/B/4521001</div>
        </div>

        <div style={{ padding: '8px 6px', borderBottom: '1px solid #2d4a6e' }}>
          <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', marginBottom: 2 }}>
            Bidders ({bids.length})
          </div>
          {bids.map(bid => (
            <button
              key={bid.id}
              id={`sidebar-bid-${bid.id}`}
              className={`sidebar-item${selectedBid?.id === bid.id ? ' active' : ''}`}
              style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'none' }}
              onClick={() => { setSelectedBid(bid); setActiveTab('upload'); }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>
                {bidderDisplayName(bid)}
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                {bid.bidder?.gstin ?? 'No GSTIN'}
              </div>
              {bid.bidder?.gstin === '33AABNE5678F1ZQ' && (
                <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 2 }}>⏳ Timeout Demo</div>
              )}
            </button>
          ))}
        </div>

        {selectedBid && (
          <div style={{ padding: '8px 6px' }}>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', marginBottom: 2 }}>
              View
            </div>
            <button
              id="tab-upload"
              className={`sidebar-item${activeTab === 'upload' ? ' active' : ''}`}
              style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'none' }}
              onClick={() => setActiveTab('upload')}
            >
              <span style={{ marginRight: 6 }}>📤</span> Upload Documents
            </button>
            <button
              id="tab-inspector"
              className={`sidebar-item${activeTab === 'inspector' ? ' active' : ''}`}
              style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'none' }}
              onClick={() => setActiveTab('inspector')}
            >
              <span style={{ marginRight: 6 }}>🔍</span>
              Evidence Inspector
              {documents.length > 0 && (
                <span style={{ float: 'right', fontSize: 10, background: '#2d4a6e', padding: '1px 5px', borderRadius: 8 }}>
                  {documents.reduce((s, d) => s + (d.evidence_count ?? 0), 0)}
                </span>
              )}
            </button>
            <button
              id="tab-verification"
              className={`sidebar-item${activeTab === 'verification' ? ' active' : ''}`}
              style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'none' }}
              onClick={() => setActiveTab('verification')}
            >
              <span style={{ marginRight: 6 }}>🔐</span>
              Verification
              {selectedBid.bidder?.gstin === '33AABNE5678F1ZQ' && (
                <span style={{ float: 'right', fontSize: 9, background: '#fcd34d', color: '#78350f', padding: '1px 5px', borderRadius: 8 }}>
                  TIMEOUT
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="page-content">
        {!selectedBid ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#94a3b8' }}>
            Select a bidder from the sidebar to begin.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <h1 className="page-title">{bidderDisplayName(selectedBid)}</h1>
              <p className="page-subtitle">
                {selectedBid.bidder?.gstin ?? ''} · Bid #{selectedBid.id} · Stage 3+4 — Document &amp; Verification
              </p>
            </div>

            {activeTab === 'upload' && (
              <>
                <DocumentUploadPanel
                  bidId={selectedBid.id}
                  bidderName={bidderDisplayName(selectedBid)}
                  onUploaded={handleUploaded}
                />
                {docsLoading ? (
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading documents…</div>
                ) : (
                  <DocumentsList
                    bidId={selectedBid.id}
                    documents={documents}
                    onSelect={() => setActiveTab('inspector')}
                  />
                )}
              </>
            )}

            {activeTab === 'inspector' && (
              <EvidenceInspector bidId={selectedBid.id} documents={documents} />
            )}

            {activeTab === 'verification' && (
              <VerificationPanel bidId={selectedBid.id} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
