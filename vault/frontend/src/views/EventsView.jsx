import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Radio,
  Trash2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';

function getEventBadge(eventType) {
  const t = (eventType || '').toUpperCase();
  if (t.includes('COMPLETED') || t.includes('STORED') || t.includes('PASSED') || t.includes('RECOVERED') || t.includes('HEALTHY')) {
    return { color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', icon: CheckCircle2 };
  }
  if (t.includes('PARTITION') || t.includes('RECONCIL')) {
    return { color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', icon: AlertTriangle };
  }
  if (t.includes('CORRUPT') || t.includes('DOWN') || t.includes('FAILED') || t.includes('DELETED')) {
    return { color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', icon: XCircle };
  }
  if (t.includes('SUSPECT') || t.includes('WARNING') || t.includes('QUEUED') || t.includes('SCAN')) {
    return { color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', icon: AlertTriangle };
  }
  if (t.includes('RECOVERING')) {
    return { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', icon: Activity };
  }
  return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: Activity };
}

export default function EventsView({ events = [], onClear, wsConnected }) {
  const [filter, setFilter] = useState('ALL');

  const filteredEvents = events.filter((e) => {
    if (filter === 'ALL') return true;
    return e.event_type === filter;
  });

  const eventTypes = ['ALL', ...new Set(events.map((e) => e.event_type))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#172033', letterSpacing: '-0.02em' }}>
              Cluster Live Events Bus
            </h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: wsConnected ? '#10B981' : '#EF4444',
                background: wsConnected ? '#ECFDF5' : '#FEF2F2',
                border: `1px solid ${wsConnected ? '#A7F3D0' : '#FECACA'}`,
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
              }}
            >
              ● {wsConnected ? 'WEBSOCKET ACTIVE' : 'DISCONNECTED'}
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '4px' }}>
            Real-time reactive broadcast stream emitted by Coordinator and Storage Nodes.
          </p>
        </div>

        <button
          onClick={onClear}
          className="btn"
          style={{ padding: '6px 14px', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}
        >
          <Trash2 size={13} />
          <span>Clear Buffer</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.74rem', color: '#94A3B8', fontFamily: 'var(--font-mono)', marginRight: '6px' }}>
          FILTER:
        </span>
        {eventTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className="btn"
            style={{
              padding: '4px 10px',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              background: filter === type ? '#EFF6FF' : '#FFFFFF',
              borderColor: filter === type ? '#BFDBFE' : '#E2E8F0',
              color: filter === type ? '#2563EB' : '#64748B',
              fontWeight: filter === type ? 700 : 500,
            }}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Event Stream Container */}
      <div
        className="panel"
        style={{
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxHeight: '680px',
          overflowY: 'auto',
        }}
      >
        {filteredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#94A3B8' }}>
            No matching events in the live buffer. Node heartbeats and cluster state events broadcast automatically.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredEvents.map((evt, idx) => {
              const badge = getEventBadge(evt.event_type);
              const Icon = badge.icon;
              const timeStr = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

              return (
                <motion.div
                  key={evt.id || idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="event-entry"
                  style={{
                    borderLeftColor: badge.color,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          fontWeight: 700,
                          fontSize: '0.74rem',
                        }}
                      >
                        <Icon size={12} />
                        <span>{evt.event_type}</span>
                      </span>

                      {evt.node_id && (
                        <span style={{ color: '#172033', fontWeight: 600, fontSize: '0.78rem' }}>
                          Node: {evt.node_id}
                        </span>
                      )}

                      {evt.source && evt.target && (
                        <span style={{ color: '#172033', fontWeight: 600, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {evt.source} <ArrowRight size={11} /> {evt.target}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                      {timeStr}
                    </div>
                  </div>

                  {/* Additional Payload Details */}
                  {evt.data && (
                    <div
                      style={{
                        marginTop: '4px',
                        fontSize: '0.72rem',
                        color: '#64748B',
                        fontFamily: 'var(--font-mono)',
                        background: '#F8FAFC',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid #F1F5F9',
                      }}
                    >
                      {typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data)}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
