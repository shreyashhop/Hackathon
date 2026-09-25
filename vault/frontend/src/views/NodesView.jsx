import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardDrive,
  Clock,
  Zap,
  Server,
  Activity,
  ExternalLink,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  PowerOff,
} from 'lucide-react';

function getStatusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s === 'healthy') return { className: 'healthy', label: 'HEALTHY', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' };
  if (s === 'suspect' || s === 'warning' || s === 'degraded') return { className: 'warning', label: s.toUpperCase(), color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' };
  if (s === 'down' || s === 'offline' || s === 'critical') return { className: 'failure', label: s.toUpperCase(), color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' };
  if (s === 'recovering') return { className: 'recovering', label: 'RECOVERING', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' };
  return { className: 'warning', label: (status || 'UNKNOWN').toUpperCase(), color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' };
}

export default function NodesView({ nodes = [], onRefresh, refreshing }) {
  const [filter, setFilter] = useState('ALL');
  const [inspectedNodeId, setInspectedNodeId] = useState(null);
  const [actionPending, setActionPending] = useState(null);

  const healthyCount = nodes.filter((n) => (n.status || '').toUpperCase() === 'HEALTHY').length;
  const totalCount = nodes.length;

  const handleStopNode = async (nodeId) => {
    try {
      setActionPending(nodeId);
      await fetch(`/faults/node/${nodeId}/stop`, { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Failed to stop node:', e);
    } finally {
      setActionPending(null);
    }
  };

  const handleRecoverNode = async (nodeId) => {
    try {
      setActionPending(nodeId);
      await fetch(`/faults/node/${nodeId}/recover`, { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Failed to recover node:', e);
    } finally {
      setActionPending(null);
    }
  };

  const filteredNodes = nodes.filter((n) => {
    const s = (n.status || '').toUpperCase();
    if (filter === 'ALL') return true;
    if (filter === 'HEALTHY') return s === 'HEALTHY';
    if (filter === 'DEGRADED') return s === 'SUSPECT' || s === 'RECOVERING' || s === 'DEGRADED';
    if (filter === 'OFFLINE') return s === 'DOWN' || s === 'OFFLINE';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* View Header with Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#172033', letterSpacing: '-0.02em' }}>
              Cluster Storage Nodes
            </h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: healthyCount === totalCount ? '#10B981' : '#F59E0B',
                background: healthyCount === totalCount ? '#ECFDF5' : '#FFFBEB',
                border: `1px solid ${healthyCount === totalCount ? '#A7F3D0' : '#FDE68A'}`,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
              }}
            >
              {healthyCount}/{totalCount} OPERATIONAL
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '4px' }}>
            5 independent Docker storage daemon processes with local persistent volumes and REST health endpoints.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {['ALL', 'HEALTHY', 'DEGRADED', 'OFFLINE'].map((statusKey) => (
            <button
              key={statusKey}
              onClick={() => setFilter(statusKey)}
              className="btn"
              style={{
                padding: '5px 12px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                background: filter === statusKey ? '#EFF6FF' : '#FFFFFF',
                borderColor: filter === statusKey ? '#BFDBFE' : '#E2E8F0',
                color: filter === statusKey ? '#2563EB' : '#64748B',
                fontWeight: filter === statusKey ? 700 : 500,
              }}
            >
              {statusKey}
            </button>
          ))}
        </div>
      </div>

      {/* Nodes Grid */}
      <div className="grid-nodes">
        <AnimatePresence>
          {filteredNodes.map((node) => {
            const badge = getStatusBadge(node.status);
            const isInspected = inspectedNodeId === node.node_id;
            const cap = node.capacity || {};
            const hasCap = typeof cap.used_gb === 'number';
            const usagePercent = cap.usage_percent || 0;
            const isDown = (node.status || '').toUpperCase() === 'DOWN';

            return (
              <motion.div
                key={node.node_id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                className="node-card"
                style={{
                  borderLeft: `4px solid ${badge.color}`,
                }}
              >
                {/* Node Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: 'var(--radius-sm)',
                        background: badge.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: badge.color,
                      }}
                    >
                      <HardDrive size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#172033' }}>
                        {node.node_id.toUpperCase()}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                        Port :{node.port} · HTTP
                      </div>
                    </div>
                  </div>

                  <span className={`status-pill ${badge.className}`}>
                    <span className="pulse-dot"></span>
                    {badge.label}
                  </span>
                </div>

                {/* Storage Capacity Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                    <span style={{ color: '#64748B' }}>VOLUME USAGE</span>
                    <span style={{ color: '#172033', fontWeight: 600 }}>
                      {hasCap ? `${cap.used_gb} / ${cap.total_gb} GB (${usagePercent}%)` : '—'}
                    </span>
                  </div>
                  <div className="progress-container">
                    <div
                      className={`progress-fill ${usagePercent > 85 ? 'failure' : usagePercent > 65 ? 'warning' : ''}`}
                      style={{ width: `${Math.min(usagePercent, 100)}%` }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: '#94A3B8', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                    <span>{hasCap ? `${cap.free_gb} GB free` : ''}</span>
                    <span>Replicas: {node.objects_count !== undefined ? node.objects_count : '—'}</span>
                  </div>
                </div>

                {/* Telemetry Metrics Inset */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '10px',
                    padding: '10px 12px',
                    background: '#F8FAFC',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div>
                    <span style={{ color: '#94A3B8' }}>LATENCY: </span>
                    <span style={{ fontWeight: 700, color: node.status === 'healthy' ? '#10B981' : '#EF4444' }}>
                      {node.latency_ms !== null && node.status === 'healthy' ? `${node.latency_ms} ms` : '—'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#94A3B8' }}>UPTIME: </span>
                    <span style={{ fontWeight: 600, color: '#172033' }}>
                      {node.uptime_seconds ? `${Math.floor(node.uptime_seconds)}s` : '—'}
                    </span>
                  </div>
                </div>

                {/* Node Controls / Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
                  {isDown ? (
                    <button
                      onClick={() => handleRecoverNode(node.node_id)}
                      disabled={actionPending === node.node_id}
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '6px 12px', fontSize: '0.76rem' }}
                    >
                      <RotateCcw size={13} />
                      <span>{actionPending === node.node_id ? 'Recovering...' : 'Recover Node'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStopNode(node.node_id)}
                      disabled={actionPending === node.node_id}
                      className="btn btn-danger"
                      style={{ flex: 1, padding: '6px 12px', fontSize: '0.76rem' }}
                    >
                      <PowerOff size={13} />
                      <span>{actionPending === node.node_id ? 'Stopping...' : 'Simulate Fail'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => setInspectedNodeId(isInspected ? null : node.node_id)}
                    className="btn"
                    style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                  >
                    {isInspected ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {/* Expandable Details Drawer */}
                <AnimatePresence>
                  {isInspected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{
                        paddingTop: '10px',
                        borderTop: '1px solid #E2E8F0',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        color: '#64748B',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div><strong>Process ID / Host:</strong> {node.host || 'localhost'}</div>
                      <div><strong>Direct Health Check:</strong> <a href={`http://localhost:${node.port}/health`} target="_blank" rel="noreferrer" style={{ color: '#2563EB' }}>/health</a></div>
                      <div><strong>Heartbeat Status:</strong> {node.status === 'healthy' ? 'Active WebSocket / HTTP' : 'Missed'}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
