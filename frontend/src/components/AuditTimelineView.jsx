/**
 * Stage 8 — Audit Timeline (Pure JavaScript)
 * SHA-256 chained event log viewer + chain integrity badge.
 */

import { useState, useEffect } from 'react';
import { getAuditTimeline } from '../api/client';

const EVENT_META = {
  BID_SUBMITTED:        { icon: '📦', label: 'Bid Package Uploaded',      color: '#1e40af', bg: '#dbeafe' },
  DOCUMENT_UPLOADED:    { icon: '📄', label: 'Document Uploaded',          color: '#1e40af', bg: '#dbeafe' },
  EVIDENCE_EXTRACTED:   { icon: '🔬', label: 'Evidence Extracted',         color: '#7e22ce', bg: '#f3e8ff' },
  VERIFICATION_RUN:     { icon: '🔍', label: 'Verification Completed',      color: '#0f766e', bg: '#ccfbf1' },
  RULE_EVALUATED:       { icon: '⚖️',  label: 'Rules Evaluated',            color: '#92400e', bg: '#fef3c7' },
  OFFICER_ACTION:       { icon: '👤', label: 'Officer Action Recorded',    color: '#1e3a5f', bg: '#e0e7ff' },
  TENDER_COMPILED:      { icon: '📋', label: 'Requirements Compiled',      color: '#166534', bg: '#dcfce7' },
  TENDER_UPLOADED:      { icon: '🏛️',  label: 'Tender Uploaded',           color: '#166534', bg: '#dcfce7' },
  SEED:                 { icon: '🌱', label: 'Demo Data Seeded',           color: '#374151', bg: '#f3f4f6' },
};

function getEventMeta(event_type) {
  return EVENT_META[event_type] ?? { icon: '📌', label: event_type.replace(/_/g, ' '), color: '#64748b', bg: '#f8fafc' };
}

function shortHash(h) {
  return h ? h.slice(0, 12) + '…' : '—';
}

function formatTs(ts) {
  try {
    return new Date(ts + 'Z').toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function EventRow({ ev, index: _index, expanded, onToggle }) {
  const meta = getEventMeta(ev.event_type);
  const isOfficer = ev.event_type === 'OFFICER_ACTION';
  const isOverride = isOfficer && ev.details?.action === 'OVERRIDE';

  return (
    <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
      {/* Timeline spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: isOverride ? '#fef3c7' : meta.bg,
          border: `2px solid ${isOverride ? '#f59e0b' : meta.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, zIndex: 1,
          boxShadow: isOverride ? '0 0 0 3px #fef08a' : undefined,
        }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1, width: 1.5, background: '#e2e8f0', minHeight: 8 }} />
      </div>

      {/* Event card */}
      <div
        id={`audit-event-${ev.id}`}
        onClick={onToggle}
        style={{
          flex: 1, marginBottom: 8, cursor: 'pointer',
          border: `1.5px solid ${expanded ? meta.color + '40' : '#f1f5f9'}`,
          borderRadius: 10, overflow: 'hidden',
          background: expanded ? '#fafbff' : '#fff',
          transition: 'border-color 0.15s',
        }}
      >
        {/* Row header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: isOverride ? '#fffbeb' : 'transparent',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f' }}>
                {meta.label}
              </span>
              {isOverride && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                  background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                }}>
                  OVERRIDE
                </span>
              )}
              {Boolean(ev.details?.action) && !isOverride && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                  background: meta.bg, color: meta.color,
                }}>
                  {String(ev.details?.action ?? '')}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
              {formatTs(ev.created_at)}
              {ev.actor && ` · ${ev.actor}`}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>
              #{shortHash(ev.event_hash)}
            </div>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 14px', background: '#f8fafc' }}>
            {isOverride && (
              <div style={{
                background: '#fff', borderRadius: 8, padding: '10px 12px',
                border: '1.5px solid #fcd34d', marginBottom: 10,
              }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#92400e', marginBottom: 6 }}>
                  Officer Override Record
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                  <span style={{ padding: '2px 10px', borderRadius: 20, background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>
                    {String(ev.details?.override_from ?? '—')}
                  </span>
                  <span style={{ color: '#94a3b8' }}>→</span>
                  <span style={{ padding: '2px 10px', borderRadius: 20, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                    {String(ev.details?.override_to ?? '—')}
                  </span>
                </div>
                {Boolean(ev.details?.override_reason) && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#374151', fontStyle: 'italic', lineHeight: 1.5 }}>
                    "{String(ev.details?.override_reason ?? '')}"
                  </div>
                )}
              </div>
            )}

            {ev.details && Object.keys(ev.details).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, marginBottom: 10 }}>
                {Object.entries(ev.details)
                  .filter(([k]) => !['override_from','override_to','override_reason'].includes(k) || !isOverride)
                  .map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: '#94a3b8', minWidth: 120 }}>{k.replace(/_/g, ' ')}:</span>
                      <span style={{ color: '#374151', fontWeight: 600 }}>{String(v)}</span>
                    </div>
                  ))}
              </div>
            )}

            <div style={{
              background: '#1e293b', borderRadius: 8, padding: '8px 12px', fontSize: 10,
              fontFamily: 'monospace', color: '#94a3b8',
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                <span style={{ color: '#64748b', minWidth: 72 }}>prev_hash:</span>
                <span style={{ color: '#86efac' }}>{ev.prev_hash ?? 'genesis (first event)'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: '#64748b', minWidth: 72 }}>event_hash:</span>
                <span style={{ color: '#60a5fa' }}>{ev.event_hash ?? '—'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuditTimelineView({ bidId, bidderName }) {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    getAuditTimeline(String(bidId))
      .then((data) => {
        const tl = Array.isArray(data)
          ? {
              bid_package_id: bidId,
              bidder_name: bidderName,
              tender_reference: '',
              events: data,
              chain_valid: true,
              total_events: data.length,
            }
          : data;
        setTimeline(tl);
        if (tl.events?.length > 0) setExpandedId(tl.events[tl.events.length - 1].id);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [bidId]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#94a3b8', fontSize: 13 }}>
      ⏳ Loading audit timeline…
    </div>
  );

  if (error) return (
    <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 12 }}>
      Failed to load audit: {error}
    </div>
  );

  if (!timeline) return null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e3a5f' }}>
            🗂 Audit Timeline — {bidderName}
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>
            {timeline.tender_reference} · {timeline.total_events} events
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Chain validity badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
            borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: timeline.chain_valid ? '#dcfce7' : '#fee2e2',
            color: timeline.chain_valid ? '#166534' : '#991b1b',
            border: `1.5px solid ${timeline.chain_valid ? '#86efac' : '#fca5a5'}`,
          }}>
            <span>{timeline.chain_valid ? '🔒' : '⚠️'}</span>
            {timeline.chain_valid ? 'Chain Intact' : 'Chain Broken!'}
          </div>
          <button
            id="btn-audit-refresh"
            onClick={load}
            style={{
              padding: '5px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0',
              background: '#fff', color: '#64748b', fontSize: 11, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* No events */}
      {timeline.events.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13,
          background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0',
        }}>
          No audit events yet. Evaluate the bid to generate events.
        </div>
      )}

      {/* Events */}
      <div style={{ paddingLeft: 4 }}>
        {timeline.events.map((ev, i) => (
          <EventRow
            key={ev.id}
            ev={ev}
            index={i}
            expanded={expandedId === ev.id}
            onToggle={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 10, padding: '8px 12px', background: '#f8fafc',
        borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b',
      }}>
        🔐 All events are SHA-256 chained server-side. No frontend-only audit events.
        Each event hash covers: event_type + actor + details + timestamp + prev_hash.
      </div>
    </div>
  );
}
