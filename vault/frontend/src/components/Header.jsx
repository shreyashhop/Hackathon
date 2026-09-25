import React from 'react';
import { RefreshCw, Radio, Server, CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';

export default function Header({
  title,
  wsConnected,
  coordinatorHealthy,
  healthyCount,
  totalNodes,
  onRefresh,
  refreshing,
  lastUpdated,
}) {
  const isOptimal = healthyCount === totalNodes && totalNodes > 0;
  const isDegraded = healthyCount > 0 && healthyCount < totalNodes;

  return (
    <header className="top-header">
      {/* Title & Cluster Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
          {title}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isOptimal ? (
            <span className="status-pill healthy">
              <span className="pulse-dot"></span>
              CLUSTER HEALTHY ({healthyCount}/{totalNodes})
            </span>
          ) : isDegraded ? (
            <span className="status-pill warning">
              <span className="pulse-dot"></span>
              DEGRADED ({healthyCount}/{totalNodes})
            </span>
          ) : (
            <span className="status-pill failure">
              <span className="pulse-dot"></span>
              OFFLINE (0/{totalNodes})
            </span>
          )}
        </div>
      </div>

      {/* Telemetry Links & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Coordinator State */}
        <div
          className="tech-inset"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            fontSize: '0.76rem',
            background: coordinatorHealthy ? '#ECFDF5' : '#FEF2F2',
            borderColor: coordinatorHealthy ? '#A7F3D0' : '#FECACA',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Server size={14} style={{ color: coordinatorHealthy ? 'var(--status-healthy)' : 'var(--status-failure)' }} />
          <span style={{ color: 'var(--text-muted)' }}>COORDINATOR:</span>
          <span style={{ fontWeight: 700, color: coordinatorHealthy ? 'var(--status-healthy)' : 'var(--status-failure)' }}>
            {coordinatorHealthy ? 'ONLINE' : 'UNREACHABLE'}
          </span>
        </div>

        {/* WebSocket Stream State */}
        <div
          className="tech-inset"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            fontSize: '0.76rem',
            background: wsConnected ? '#EFF6FF' : '#F1F5F9',
            borderColor: wsConnected ? '#BFDBFE' : '#E2E8F0',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Radio size={14} style={{ color: wsConnected ? '#2563EB' : 'var(--text-dim)' }} />
          <span style={{ color: 'var(--text-muted)' }}>EVENT BUS:</span>
          <span style={{ fontWeight: 700, color: wsConnected ? '#2563EB' : 'var(--text-muted)' }}>
            {wsConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>

        {/* Last Sync Timestamp */}
        {lastUpdated && (
          <div
            style={{
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              display: 'none',
              marginRight: '4px',
            }}
            className="header-timestamp"
          >
            {new Date(lastUpdated).toLocaleTimeString()}
          </div>
        )}

        {/* Refresh Action */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="btn"
          style={{
            padding: '6px 14px',
            fontSize: '0.80rem',
            fontFamily: 'var(--font-mono)',
            gap: '8px',
          }}
          title={lastUpdated ? `Last synced: ${new Date(lastUpdated).toLocaleTimeString()}` : 'Refresh'}
        >
          <RefreshCw
            size={13}
            style={{
              animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
              color: refreshing ? '#2563EB' : 'inherit',
            }}
          />
          <span>SYNC</span>
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (min-width: 1024px) {
          .header-timestamp {
            display: block !important;
          }
        }
      `}</style>
    </header>
  );
}
