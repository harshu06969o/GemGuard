import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getTender,
  getTenderBids,
  listTenders,
  uploadTenderDocument,
  compileRequirements,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { LoadingSpinner, ErrorMessage, EmptyState } from '../components/Card';

function fmt(n, unit) {
  if (n == null) return '—';
  return unit ? `${n} ${unit}` : String(n);
}

function fmtBytes(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

const OPERATOR_LABEL = {
  GTE: '≥ (at least)',
  LTE: '≤ (at most)',
  EQ: '= (exactly)',
  NEQ: '≠ (not equal)',
  ACTIVE: 'must be ACTIVE',
  VALID: 'must be VALID',
  MATCH: 'must MATCH',
  CONTAINS: 'contains',
};

const SEVERITY_COLOR = {
  CRITICAL: '#dc2626',
  HIGH: '#d97706',
  MEDIUM: '#2563eb',
  LOW: '#16a34a',
};

const CATEGORY_COLOR = {
  FINANCIAL: '#7c3aed',
  REGULATORY: '#0e7490',
  TECHNICAL: '#1d4ed8',
  LEGAL: '#b45309',
};

function SeverityBadge({ value }) {
  if (!value) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      color: SEVERITY_COLOR[value] ?? '#64748b',
      background: (SEVERITY_COLOR[value] ?? '#64748b') + '15',
      padding: '2px 7px', borderRadius: 3,
    }}>
      {value}
    </span>
  );
}

function CategoryBadge({ value }) {
  if (!value) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      color: CATEGORY_COLOR[value] ?? '#475569',
      background: (CATEGORY_COLOR[value] ?? '#475569') + '15',
      padding: '2px 7px', borderRadius: 3,
    }}>
      {value}
    </span>
  );
}

function SourceBadge({ value }) {
  if (!value) return <span style={{ color: '#94a3b8' }}>—</span>;
  const colors = {
    SEED: '#0e7490', DEMO: '#1d4ed8', PATTERN: '#7c3aed', LLM: '#16a34a',
  };
  const c = colors[value] ?? '#64748b';
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color: c,
      background: c + '15', padding: '2px 7px', borderRadius: 3,
    }}>
      {value}
    </span>
  );
}

function RequirementDetailPanel({ rule, onClose }) {
  return (
    <tr>
      <td colSpan={8} style={{ padding: 0, background: '#f8fafc', borderBottom: '2px solid #1e3a5f' }}>
        <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Left: Clause text */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Original Clause — {rule.clause?.clause_number ?? rule.requirement_id}
              {rule.clause?.source_page ? ` · Page ${rule.clause.source_page}` : ''}
            </div>
            <div style={{
              background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '3px solid #f59e0b',
              borderRadius: 4, padding: '12px 14px', fontSize: 12,
              lineHeight: 1.7, color: '#1e293b', fontStyle: 'italic',
            }}>
              &ldquo;{rule.clause?.clause_text ?? rule.description}&rdquo;
            </div>
            {rule.clause?.source_page && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                📄 Source: Tender document, page {rule.clause.source_page}
              </div>
            )}
          </div>

          {/* Right: Structured rule */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Structured Rule · {rule.requirement_id}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
              <RuleField label="Category" value={<CategoryBadge value={rule.category} />} />
              <RuleField label="Severity" value={<SeverityBadge value={rule.severity} />} />
              <RuleField label="Metric" mono value={rule.metric} />
              <RuleField label="Operator" value={rule.operator ? `${rule.operator} — ${OPERATOR_LABEL[rule.operator] ?? rule.operator}` : '—'} />
              <RuleField label="Threshold" mono value={rule.threshold_value ? `${rule.threshold_value} ${rule.threshold_unit ?? ''}`.trim() : '—'} />
              <RuleField label="Time Period" value={rule.time_period?.replace('_', ' ') ?? '—'} />
              <RuleField label="Evidence Type" mono value={rule.evidence_type} />
              <RuleField label="Applicability" value={rule.applicability} />
              <RuleField label="Mandatory" value={rule.is_mandatory ? 'YES — disqualifying' : 'No — conditional'} />
              <RuleField label="Compiled From" value={<SourceBadge value={rule.compilation_source} />} />
            </div>

            {rule.verification_sources && rule.verification_sources.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Verification Sources
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {rule.verification_sources.map(src => (
                    <span key={src} style={{
                      fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
                      background: '#eff6ff', color: '#1d4ed8',
                      border: '1px solid #bfdbfe', borderRadius: 3, padding: '2px 8px',
                    }}>
                      {src}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', padding: '0 24px 14px' }}>
          <button
            id="btn-close-rule-detail"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ fontSize: 11 }}
          >
            Collapse ▲
          </button>
        </div>
      </td>
    </tr>
  );
}

function RuleField({ label, value, mono = false }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontFamily: mono ? 'monospace' : undefined, color: '#1e293b' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function RequirementsTable({
  rules,
  onCompile,
  compiling,
  hasDocument,
}) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="card">
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Compiled Requirements</span>
          <span style={{
            marginLeft: 10, fontSize: 11, background: '#eff6ff',
            color: '#1d4ed8', padding: '2px 8px', borderRadius: 10,
          }}>
            {rules.length} rules
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasDocument && (
            <button
              id="btn-compile-pattern"
              className="btn btn-secondary"
              style={{ fontSize: 11 }}
              onClick={() => onCompile('PATTERN')}
              disabled={compiling}
            >
              {compiling ? 'Compiling…' : '⟳ Recompile from Document'}
            </button>
          )}
          <button
            id="btn-compile-demo"
            className="btn btn-primary"
            style={{ fontSize: 11 }}
            onClick={() => onCompile('DEMO')}
            disabled={compiling}
          >
            {compiling ? 'Compiling…' : '▶ Compile Requirements'}
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <EmptyState text="No requirements compiled yet. Click 'Compile Requirements' to generate rules from the demo tender." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Clause</th>
              <th>Rule Type</th>
              <th>Category</th>
              <th>Evidence</th>
              <th>Mandatory</th>
              <th>Severity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <Fragment key={rule.id}>
                <tr
                  id={`req-row-${rule.id}`}
                  onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                  style={{
                    cursor: 'pointer',
                    background: expandedId === rule.id ? '#eff6ff' : undefined,
                    borderLeft: expandedId === rule.id ? '3px solid #1e3a5f' : '3px solid transparent',
                  }}
                  title="Click to view clause text and rule detail"
                >
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 700 }}>
                    {rule.requirement_id ?? `R-${rule.id}`}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      {rule.clause?.clause_title ?? rule.rule_type}
                    </div>
                    {rule.clause?.clause_number && (
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        Clause {rule.clause.clause_number}
                        {rule.clause.source_page ? ` · pg ${rule.clause.source_page}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
                    {rule.rule_type}
                  </td>
                  <td><CategoryBadge value={rule.category} /></td>
                  <td style={{ fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rule.evidence_type?.replace(/_/g, ' ') ?? '—'}
                  </td>
                  <td>
                    {rule.is_mandatory
                      ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 11 }}>MANDATORY</span>
                      : <span style={{ color: '#64748b', fontSize: 11 }}>Conditional</span>
                    }
                  </td>
                  <td><SeverityBadge value={rule.severity} /></td>
                  <td><SourceBadge value={rule.compilation_source} /></td>
                </tr>
                {expandedId === rule.id && (
                  <RequirementDetailPanel
                    rule={rule}
                    onClose={() => setExpandedId(null)}
                  />
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {rules.length > 0 && (
        <div style={{ padding: '10px 18px', fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
          Click any row to view the original clause and structured rule detail. No compliance results are generated at this stage.
        </div>
      )}
    </div>
  );
}

function DocumentsPanel({
  tenderId,
  documents,
  onUploaded,
  onCompile,
  compiling,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  async function doUpload(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are accepted.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setProgress(0);
    try {
      const result = await uploadTenderDocument(tenderId, file, setProgress);
      const doc = {
        id: result.id,
        tender_id: tenderId,
        filename: file.name,
        original_filename: file.name,
        file_hash: null,
        file_size: file.size,
        page_count: null,
        extraction_method: result.extraction_method ?? null,
        compiler_status: 'COMPILED',
        compiled_at: new Date().toISOString(),
        rules_compiled: result.rules_compiled,
        uploaded_by: 'officer',
        uploaded_at: new Date().toISOString(),
      };
      onUploaded(doc);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (f) doUpload(f);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) doUpload(f);
  }

  const latestDoc = documents[0];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 13 }}>
        Tender Document
      </div>

      <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: latestDoc ? '1fr 1fr' : '1fr', gap: 20 }}>
        <div>
          <div
            id="upload-drop-zone"
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#1e3a5f' : '#cbd5e1'}`,
              borderRadius: 6,
              padding: '28px 20px',
              textAlign: 'center',
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
              onChange={handleFile}
              id="file-upload-input"
            />
            {uploading ? (
              <div>
                <div style={{ fontSize: 13, color: '#1e3a5f', fontWeight: 600, marginBottom: 10 }}>Uploading…</div>
                <div style={{ background: '#e2e8f0', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: '#1e3a5f',
                    width: `${progress}%`, transition: 'width 0.2s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{progress}%</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 13, color: '#1e3a5f', fontWeight: 600 }}>
                  Upload Tender PDF
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Drag & drop or click to browse · PDF only · Max 50 MB
                </div>
                {latestDoc && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                    Replace existing: <strong>{latestDoc.original_filename}</strong>
                  </div>
                )}
              </>
            )}
          </div>
          {uploadError && (
            <div style={{
              marginTop: 8, padding: '8px 12px', background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, color: '#dc2626',
            }}>
              {uploadError}
            </div>
          )}
        </div>

        {latestDoc && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Uploaded Document
            </div>
            <div style={{ display: 'grid', gap: '8px', fontSize: 12 }}>
              <DocField label="Filename" value={latestDoc.original_filename} mono />
              <DocField label="MD5 Hash" value={latestDoc.file_hash} mono small />
              <DocField label="Size" value={fmtBytes(latestDoc.file_size)} />
              <DocField label="Pages" value={fmt(latestDoc.page_count)} />
              <DocField label="Extraction" value={latestDoc.extraction_method} />
              <DocField label="Compiler Status">
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
                  background: latestDoc.compiler_status === 'COMPILED' ? '#dcfce7' : '#fef3c7',
                  color: latestDoc.compiler_status === 'COMPILED' ? '#16a34a' : '#92400e',
                }}>
                  {latestDoc.compiler_status}
                </span>
              </DocField>
              <DocField label="Uploaded" value={fmtDate(latestDoc.uploaded_at)} />
            </div>

            {latestDoc.extraction_method === 'PYMUPDF' && latestDoc.compiler_status !== 'COMPILED' && (
              <div style={{ marginTop: 14 }}>
                <button
                  id="btn-compile-from-doc"
                  className="btn btn-primary"
                  style={{ width: '100%', fontSize: 12 }}
                  onClick={() => onCompile('PATTERN')}
                  disabled={compiling}
                >
                  {compiling ? 'Compiling…' : '▶ Compile from Document (Pattern Extraction)'}
                </button>
              </div>
            )}
            {latestDoc.compiler_status === 'COMPILED' && (
              <div style={{
                marginTop: 12, padding: '8px 12px',
                background: '#dcfce7', border: '1px solid #86efac',
                borderRadius: 4, fontSize: 12, color: '#15803d',
              }}>
                ✓ Requirements compiled from this document on {fmtDate(latestDoc.compiled_at)}
              </div>
            )}
          </div>
        )}
      </div>

      {documents.length > 1 && (
        <div style={{ padding: '0 18px 16px' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Previous uploads</div>
          <table className="data-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Pages</th>
                <th>Status</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.slice(1).map(d => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'monospace' }}>{d.original_filename}</td>
                  <td>{fmtBytes(d.file_size)}</td>
                  <td>{fmt(d.page_count)}</td>
                  <td>{d.compiler_status}</td>
                  <td>{fmtDate(d.uploaded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DocField({ label, value, children, mono = false, small = false }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ minWidth: 100, color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', paddingTop: 1 }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? 'monospace' : undefined,
        fontSize: small ? 10 : 12,
        color: '#1e293b',
        wordBreak: 'break-all',
      }}>
        {children ?? (value || '—')}
      </span>
    </div>
  );
}

function BidSummaryTable({ bids }) {
  return (
    <div className="card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 13 }}>
        Submitted Bids
        <span style={{ marginLeft: 8, fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10 }}>
          {bids.length}
        </span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Bidder</th>
            <th>GSTIN</th>
            <th>Turnover</th>
            <th>Submitted</th>
            <th>Status</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {bids.map(bid => (
            <tr key={bid.id} id={`bid-row-${bid.id}`}>
              <td style={{ fontWeight: 600, fontSize: 12 }}>
                {bid.bidder?.name?.split('—')[1]?.trim() ?? bid.bidder?.name ?? `Bid #${bid.id}`}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{bid.bidder?.gstin ?? '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {bid.bidder?.turnover_cr != null ? `₹${bid.bidder.turnover_cr} Cr` : '—'}
              </td>
              <td style={{ fontSize: 11, color: '#64748b' }}>
                {new Date(bid.submitted_at).toLocaleDateString('en-IN')}
              </td>
              <td><StatusBadge status={bid.overall_status} /></td>
              <td>
                {bid.risk_level
                  ? <StatusBadge status={bid.risk_level} />
                  : <span style={{ color: '#94a3b8', fontSize: 11 }}>Not assessed</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TenderWorkspacePage() {
  const [tender, setTender] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [compiling, setCompiling] = useState(false);
  const [compileMsg, setCompileMsg] = useState(null);
  const [activeTab, setActiveTab] = useState('requirements');

  const { tenderId: paramId } = useParams();

  useEffect(() => {
    const load = async () => {
      try {
        let id = paramId;
        if (!id) {
          const tenders = await listTenders();
          if (tenders.length === 0) throw new Error('No tenders found. Create a tender first.');
          id = tenders[0].id;
        }
        const [t, b] = await Promise.all([getTender(id), getTenderBids(id)]);
        setTender(t);
        setBids(b);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load tender');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [paramId]);

  async function handleCompile(source) {
    if (!tender) return;
    setCompiling(true);
    setCompileMsg(null);
    try {
      const rules = await compileRequirements(tender.id, source);
      setTender(prev => prev ? { ...prev, requirement_rules: rules } : prev);
      setCompileMsg(`${rules.length} requirements compiled (source: ${source})`);
    } catch (e) {
      setCompileMsg(`Error: ${e.message}`);
    } finally {
      setCompiling(false);
    }
  }

  function handleUploaded(doc) {
    setTender(prev => prev ? {
      ...prev,
      documents: [doc, ...prev.documents],
    } : prev);
    setActiveTab('documents');
  }

  if (loading) return (
    <div className="page-layout">
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
        <LoadingSpinner text="Loading tender…" />
      </div>
    </div>
  );

  if (error) return (
    <div className="page-layout">
      <div className="page-content"><ErrorMessage message={error} /></div>
    </div>
  );

  if (!tender) return null;

  const hasDocument = tender.documents.length > 0;

  return (
    <div className="page-layout">
      <div className="sidebar">
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #2d4a6e' }}>
          <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Active Tender
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.4 }}>
            {tender.title}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginTop: 4 }}>
            {tender.reference_number}
          </div>
        </div>

        <div style={{ padding: '10px 14px', borderBottom: '1px solid #2d4a6e', display: 'grid', gap: 6 }}>
          <SidebarMeta label="Threshold" value={tender.turnover_threshold_cr ? `₹${tender.turnover_threshold_cr} Cr` : '—'} />
          <SidebarMeta label="Deadline" value={tender.submission_deadline ? new Date(tender.submission_deadline).toLocaleDateString('en-IN') : '—'} />
          <SidebarMeta label="Status" value={tender.status} />
          <SidebarMeta label="Documents" value={`${tender.documents.length} uploaded`} />
        </div>

        <div style={{ padding: '8px 6px' }}>
          <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', marginBottom: 4 }}>
            Workspace
          </div>
          <button
            id="tab-requirements"
            className={`sidebar-item${activeTab === 'requirements' ? ' active' : ''}`}
            style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'none' }}
            onClick={() => setActiveTab('requirements')}
          >
            <span style={{ marginRight: 6 }}>📋</span>
            Compliance Requirements
            <span style={{ float: 'right', fontSize: 10, background: '#2d4a6e', padding: '1px 5px', borderRadius: 8 }}>
              {tender.requirement_rules.length}
            </span>
          </button>
          <button
            id="tab-documents"
            className={`sidebar-item${activeTab === 'documents' ? ' active' : ''}`}
            style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'none' }}
            onClick={() => setActiveTab('documents')}
          >
            <span style={{ marginRight: 6 }}>📄</span>
            Tender Document
            {hasDocument && (
              <span style={{ float: 'right', fontSize: 10, background: '#16a34a', padding: '1px 5px', borderRadius: 8 }}>
                ✓
              </span>
            )}
          </button>
          <button
            id="tab-bids"
            className="sidebar-item"
            style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'none' }}
            onClick={() => setActiveTab('requirements')}
          >
            <span style={{ marginRight: 6 }}>📁</span>
            Bid Packages
            <span style={{ float: 'right', fontSize: 10, background: '#2d4a6e', padding: '1px 5px', borderRadius: 8 }}>
              {bids.length}
            </span>
          </button>
        </div>

        {tender.clauses.length > 0 && (
          <div style={{ padding: '8px 6px', borderTop: '1px solid #2d4a6e' }}>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', marginBottom: 2 }}>
              Clauses
            </div>
            {tender.clauses.map(c => (
              <div
                key={c.clause_number}
                id={`sidebar-clause-${c.clause_number}`}
                style={{ padding: '5px 10px', fontSize: 11, color: '#cbd5e1', display: 'flex', gap: 8, alignItems: 'baseline' }}
              >
                <span style={{ fontFamily: 'monospace', color: '#94a3b8', minWidth: 24 }}>{c.clause_number}</span>
                <span style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.3 }}>{c.clause_title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 className="page-title">Tender Intelligence</h1>
            <p className="page-subtitle">
              {tender.reference_number} · {tender.organization ?? 'Government of India'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 3,
              background: tender.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
              color: tender.status === 'ACTIVE' ? '#15803d' : '#64748b',
              fontWeight: 600,
            }}>
              {tender.status}
            </span>
          </div>
        </div>

        {compileMsg && (
          <div style={{
            marginBottom: 16, padding: '10px 16px',
            background: compileMsg.startsWith('Error') ? '#fef2f2' : '#eff6ff',
            border: `1px solid ${compileMsg.startsWith('Error') ? '#fecaca' : '#bfdbfe'}`,
            borderRadius: 4, fontSize: 12,
            color: compileMsg.startsWith('Error') ? '#dc2626' : '#1d4ed8',
          }}>
            {compileMsg}
            <button
              onClick={() => setCompileMsg(null)}
              style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        )}

        {activeTab === 'documents' && (
          <DocumentsPanel
            tenderId={tender.id}
            documents={tender.documents}
            onUploaded={handleUploaded}
            onCompile={handleCompile}
            compiling={compiling}
          />
        )}

        {activeTab === 'requirements' && (
          <RequirementsTable
            rules={tender.requirement_rules}
            onCompile={handleCompile}
            compiling={compiling}
            hasDocument={hasDocument}
          />
        )}

        {bids.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <BidSummaryTable bids={bids} />
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarMeta({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
