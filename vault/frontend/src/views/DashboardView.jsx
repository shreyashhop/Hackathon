import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardDrive,
  Activity,
  Server,
  Zap,
  Radio,
  ExternalLink,
  ChevronRight,
  Database,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
  Copy,
  Wrench,
  ShieldCheck,
  Cpu,
  ArrowUpRight,
} from 'lucide-react';

function getStatusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s === 'healthy') return { className: 'healthy', label: 'HEALTHY', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' };
  if (s === 'suspect' || s === 'warning' || s === 'degraded') return { className: 'warning', label: s.toUpperCase(), color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' };
  if (s === 'down' || s === 'offline' || s === 'critical') return { className: 'failure', label: s.toUpperCase(), color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' };
  if (s === 'partitioned') return { className: 'warning', label: 'PARTITIONED', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' };
  if (s === 'recovering') return { className: 'recovering', label: 'RECOVERING', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' };
  return { className: 'warning', label: (status || 'UNKNOWN').toUpperCase(), color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' };
}

export default function DashboardView({
  nodes = [],
  coordinatorData = null,
  recentEvents = [],
  loading = false,
  error = null,
  wsConnected = true,
}) {
  const [selectedNodeId, setSelectedNodeId] = useState(nodes.length > 0 ? nodes[0].node_id : 'node-1');
  const [replicationSummary, setReplicationSummary] = useState(null);
  const [repairSummary, setRepairSummary] = useState(null);
  const [integritySummary, setIntegritySummary] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // Fetch summaries
  useEffect(() => {
    let active = true;
    async function fetchAllSummaries() {
      try {
        const [repRes, repaRes, intRes] = await Promise.all([
          fetch('/replication/summary').catch(() => fetch('http://localhost:8000/replication/summary')),
          fetch('/repair/summary').catch(() => fetch('http://localhost:8000/repair/summary')),
          fetch('/integrity/summary').catch(() => fetch('http://localhost:8000/integrity/summary')),
        ]);

        if (active) {
          if (repRes && repRes.ok) {
            const data = await repRes.json();
            setReplicationSummary(data);
          }
          if (repaRes && repaRes.ok) {
            const data = await repaRes.json();
            setRepairSummary(data);
          }
          if (intRes && intRes.ok) {
            const data = await intRes.json();
            setIntegritySummary(data);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    fetchAllSummaries();
    const interval = setInterval(fetchAllSummaries, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const healthyCount = nodes.filter((n) => (n.status || '').toLowerCase() === 'healthy').length;
  const totalCount = nodes.length || 5;

  // Real cluster capacity aggregation from backend
  const hasCapacityData = nodes.some((n) => n.capacity && typeof n.capacity.total_gb === 'number');
  const totalStorageGb = hasCapacityData
    ? nodes.reduce((acc, n) => acc + (n.capacity?.total_gb || 0), 0)
    : null;
  const usedStorageGb = hasCapacityData
    ? nodes.reduce((acc, n) => acc + (n.capacity?.used_gb || 0), 0)
    : null;
  const freeStorageGb = hasCapacityData
    ? nodes.reduce((acc, n) => acc + (n.capacity?.free_gb || 0), 0)
    : null;

  // Average ping latency from real node health check responses
  const activeNodesWithLatency = nodes.filter(
    (n) => typeof n.latency_ms === 'number' && (n.status || '').toLowerCase() === 'healthy'
  );
  const avgLatency =
    activeNodesWithLatency.length > 0
      ? (
          activeNodesWithLatency.reduce((acc, n) => acc + n.latency_ms, 0) /
          activeNodesWithLatency.length
        ).toFixed(1)
      : null;

  // Selected node details
  const selectedNode = nodes.find((n) => n.node_id === selectedNodeId) || nodes[0] || null;

  // Node position map for SVG topology
  // Coordinator: (400, 45)
  // Node 1: (180, 150)
  // Node 2: (400, 150)
  // Node 3: (620, 150)
  // Node 4: (400, 245)
  // Node 5: (400, 335)
  const TOPOLOGY_COORDS = {
    coordinator: { x: 400, y: 45, label: 'COORDINATOR', port: 8000 },
    'node-1': { x: 180, y: 155, label: 'NODE-1', port: 8001 },
    'node-2': { x: 400, y: 155, label: 'NODE-2', port: 8002 },
    'node-3': { x: 620, y: 155, label: 'NODE-3', port: 8003 },
    'node-4': { x: 400, y: 245, label: 'NODE-4', port: 8004 },
    'node-5': { x: 400, y: 335, label: 'NODE-5', port: 8005 },
  };

  const getNodeData = (nodeId) => {
    return nodes.find((n) => n.node_id === nodeId) || {
      node_id: nodeId,
      status: 'healthy',
      port: TOPOLOGY_COORDS[nodeId]?.port || 8000,
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Hero Card: Presentation Showcase */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="panel"
        style={{
          padding: '28px 32px',
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
          border: '1px solid #E2E8F0',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle decorative gradient top bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #2563EB 0%, #7C3AED 50%, #06B6D4 100%)',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#172033',
                }}
              >
                Vault Distributed Storage
              </h2>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#2563EB',
                  background: '#EFF6FF',
                  border: '1px solid #DBEAFE',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 700,
                }}
              >
                HA CLUSTER v1.0
              </span>
            </div>

            <p
              style={{
                fontSize: '0.92rem',
                color: '#64748B',
                marginTop: '6px',
                maxWidth: '680px',
                lineHeight: 1.5,
              }}
            >
              Fault-tolerant object storage with replication, integrity verification and automatic self-healing.
            </p>
          </div>

          {/* Cluster Status Quick Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: '#FFFFFF',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #E2E8F0',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
                CLUSTER HEALTH
              </div>
              <div style={{ fontSize: '0.90rem', fontWeight: 800, color: healthyCount === totalCount ? '#10B981' : '#F59E0B' }}>
                {coordinatorData?.cluster_state || (healthyCount === totalCount ? 'HEALTHY' : 'DEGRADED')}
              </div>
            </div>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: healthyCount === totalCount ? '#10B981' : '#F59E0B',
                boxShadow: healthyCount === totalCount ? '0 0 10px rgba(16, 185, 129, 0.4)' : '0 0 10px rgba(245, 158, 11, 0.4)',
              }}
              className="pulse-dot"
            />
          </div>
        </div>

        {/* Large Cluster Visualization: Topology Canvas */}
        <div
          style={{
            marginTop: '28px',
            padding: '20px',
            background: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #E2E8F0',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={16} color="#2563EB" />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#172033', letterSpacing: '0.02em' }}>
                LIVE CLUSTER TOPOLOGY & REPLICATION TRAFFIC
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
              Click any node to inspect telemetry
            </div>
          </div>

          <svg
            viewBox="0 0 800 380"
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '380px',
              background: '#F8FAFC',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #F1F5F9',
              overflow: 'visible',
            }}
          >
            <defs>
              <linearGradient id="gradCoord" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>

              {/* Glowing filters for healthy/degraded */}
              <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#10B981" floodOpacity="0.25" />
              </filter>
              <filter id="glowBlue" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#2563EB" floodOpacity="0.25" />
              </filter>
              <filter id="glowRed" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#EF4444" floodOpacity="0.25" />
              </filter>

              {/* Topology Connection Paths */}
              <path id="path-coord-node1" d="M 400 65 L 180 155" />
              <path id="path-coord-node2" d="M 400 65 L 400 155" />
              <path id="path-coord-node3" d="M 400 65 L 620 155" />
              <path id="path-node1-node5" d="M 180 155 L 400 335" />
              <path id="path-node2-node4" d="M 400 155 L 400 245" />
              <path id="path-node4-node5" d="M 400 245 L 400 335" />
              <path id="path-node3-node5" d="M 620 155 L 400 335" />
              <path id="path-node1-node4" d="M 180 155 L 400 245" />
              <path id="path-node3-node4" d="M 620 155 L 400 245" />
            </defs>

            {/* Static Background Connection Mesh & Dynamic Broken Links */}
            <g>
              {/* Coordinator to Node-1 */}
              <use
                href="#path-coord-node1"
                stroke={getNodeData('node-1').status?.toLowerCase() === 'partitioned' ? '#EA580C' : '#CBD5E1'}
                strokeWidth={getNodeData('node-1').status?.toLowerCase() === 'partitioned' ? '2.5' : '1.5'}
                strokeDasharray={getNodeData('node-1').status?.toLowerCase() === 'partitioned' ? '3 3' : '4 4'}
              />
              {/* Coordinator to Node-2 */}
              <use
                href="#path-coord-node2"
                stroke={getNodeData('node-2').status?.toLowerCase() === 'partitioned' ? '#EA580C' : '#CBD5E1'}
                strokeWidth={getNodeData('node-2').status?.toLowerCase() === 'partitioned' ? '2.5' : '1.5'}
                strokeDasharray={getNodeData('node-2').status?.toLowerCase() === 'partitioned' ? '3 3' : '4 4'}
              />
              {/* Coordinator to Node-3 */}
              <use
                href="#path-coord-node3"
                stroke={getNodeData('node-3').status?.toLowerCase() === 'partitioned' ? '#EA580C' : '#CBD5E1'}
                strokeWidth={getNodeData('node-3').status?.toLowerCase() === 'partitioned' ? '2.5' : '1.5'}
                strokeDasharray={getNodeData('node-3').status?.toLowerCase() === 'partitioned' ? '3 3' : '4 4'}
              />
              {/* Peer mesh */}
              <use href="#path-node1-node5" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="4 4" />
              <use href="#path-node2-node4" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="4 4" />
              <use href="#path-node4-node5" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="4 4" />
              <use href="#path-node3-node5" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="4 4" />
              <use href="#path-node1-node4" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="4 4" />
              <use href="#path-node3-node4" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="4 4" />
            </g>

            {/* Partition Disconnect Markers on Coordinator Links */}
            {['node-1', 'node-2', 'node-3'].map((nid) => {
              if (getNodeData(nid).status?.toLowerCase() !== 'partitioned') return null;
              const coords = {
                'node-1': { x: 290, y: 110 },
                'node-2': { x: 400, y: 110 },
                'node-3': { x: 510, y: 110 },
              }[nid];
              return (
                <g key={`cut-${nid}`} transform={`translate(${coords.x}, ${coords.y})`}>
                  <circle r="9" fill="#FFF7ED" stroke="#EA580C" strokeWidth="2" />
                  <line x1="-5" y1="-5" x2="5" y2="5" stroke="#EA580C" strokeWidth="2.5" />
                </g>
              );
            })}

            {/* Animated Traffic Particles along Active Connections (Only when node is reachable) */}
            {coordinatorData && (
              <g fill="#2563EB">
                {getNodeData('node-1').status?.toLowerCase() === 'healthy' && (
                  <circle r="3.5" fill="#2563EB" opacity="0.85">
                    <animateMotion dur="3s" repeatCount="indefinite" href="#path-coord-node1" />
                  </circle>
                )}
                {getNodeData('node-2').status?.toLowerCase() === 'healthy' && (
                  <circle r="3.5" fill="#06B6D4" opacity="0.85">
                    <animateMotion dur="2.4s" repeatCount="indefinite" href="#path-coord-node2" />
                  </circle>
                )}
                {getNodeData('node-3').status?.toLowerCase() === 'healthy' && (
                  <circle r="3.5" fill="#7C3AED" opacity="0.85">
                    <animateMotion dur="3.2s" repeatCount="indefinite" href="#path-coord-node3" />
                  </circle>
                )}
                {getNodeData('node-2').status?.toLowerCase() === 'healthy' && getNodeData('node-4').status?.toLowerCase() === 'healthy' && (
                  <circle r="3" fill="#10B981" opacity="0.8">
                    <animateMotion dur="3.5s" repeatCount="indefinite" href="#path-node2-node4" />
                  </circle>
                )}
                {getNodeData('node-4').status?.toLowerCase() === 'healthy' && getNodeData('node-5').status?.toLowerCase() === 'healthy' && (
                  <circle r="3" fill="#10B981" opacity="0.8">
                    <animateMotion dur="3.8s" repeatCount="indefinite" href="#path-node4-node5" />
                  </circle>
                )}
                {getNodeData('node-1').status?.toLowerCase() === 'healthy' && getNodeData('node-5').status?.toLowerCase() === 'healthy' && (
                  <circle r="3" fill="#2563EB" opacity="0.8">
                    <animateMotion dur="4.2s" repeatCount="indefinite" href="#path-node1-node5" />
                  </circle>
                )}
                {getNodeData('node-3').status?.toLowerCase() === 'healthy' && getNodeData('node-5').status?.toLowerCase() === 'healthy' && (
                  <circle r="3" fill="#7C3AED" opacity="0.8">
                    <animateMotion dur="4s" repeatCount="indefinite" href="#path-node3-node5" />
                  </circle>
                )}
              </g>
            )}

            {/* COORDINATOR NODE */}
            <g transform="translate(400, 45)" style={{ cursor: 'pointer' }}>
              <rect
                x="-85"
                y="-25"
                width="170"
                height="50"
                rx="10"
                fill="url(#gradCoord)"
                filter="url(#glowBlue)"
              />
              <text x="0" y="-3" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle" fontFamily="sans-serif" letterSpacing="0.05em">
                COORDINATOR
              </text>
              <text x="0" y="14" fill="#DBEAFE" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="monospace">
                PORT :8000 · ONLINE
              </text>
            </g>

            {/* 5 STORAGE NODES */}
            {['node-1', 'node-2', 'node-3', 'node-4', 'node-5'].map((nodeId) => {
              const node = getNodeData(nodeId);
              const pos = TOPOLOGY_COORDS[nodeId];
              const isSelected = selectedNodeId === nodeId;
              const isHovered = hoveredNodeId === nodeId;
              const badge = getStatusBadge(node.status);
              const isPart = (node.status || '').toLowerCase() === 'partitioned';
              const isRecov = (node.status || '').toLowerCase() === 'recovering';

              return (
                <g
                  key={nodeId}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => setSelectedNodeId(nodeId)}
                  onMouseEnter={() => setHoveredNodeId(nodeId)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Subtle pulsing background for healthy nodes */}
                  {node.status === 'healthy' && (
                    <circle r="38" fill="#10B981" opacity={isHovered ? '0.2' : '0.1'} className="pulse-dot" />
                  )}
                  {isRecov && (
                    <circle r="38" fill="#7C3AED" opacity={isHovered ? '0.25' : '0.15'} className="pulse-dot" />
                  )}

                  <rect
                    x="-65"
                    y="-22"
                    width="130"
                    height="44"
                    rx="8"
                    fill={isSelected ? '#EFF6FF' : isPart ? '#FFF7ED' : isRecov ? '#F5F3FF' : '#FFFFFF'}
                    stroke={isSelected ? '#2563EB' : isPart ? '#EA580C' : badge.color}
                    strokeWidth={isSelected ? '2.5' : isPart ? '2' : '1.5'}
                    strokeDasharray={isPart ? '4 2' : 'none'}
                    filter={node.status === 'healthy' ? 'url(#glowGreen)' : 'url(#glowRed)'}
                  />

                  {/* Node label */}
                  <text
                    x="-48"
                    y="-3"
                    fill="#172033"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {pos.label}
                  </text>

                  {/* Status chip */}
                  <circle cx="48" cy="-5" r="4.5" fill={badge.color} />

                  {/* Subtext info */}
                  <text
                    x="-48"
                    y="13"
                    fill={isPart ? '#EA580C' : '#64748B'}
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="monospace"
                  >
                    :{pos.port} · {badge.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </motion.div>

      {/* 8 Statistics Metric Cards */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Activity size={18} color="#2563EB" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#172033', letterSpacing: '-0.01em' }}>
            Cluster Telemetry & Health Metrics
          </h3>
        </div>

        <div className="grid-stats">
          {/* 1. Total Objects */}
          <motion.div whileHover={{ y: -3 }} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon-wrapper" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                <Database size={18} />
              </div>
              <span className="status-pill healthy" style={{ fontSize: '0.65rem' }}>AUTHORITATIVE</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#172033', fontFamily: 'var(--font-mono)' }}>
              {replicationSummary !== null ? replicationSummary.total_logical_objects : '—'}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
              Total Objects
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              {replicationSummary !== null ? `${replicationSummary.total_physical_replicas} physical replicas` : 'Catalog objects'}
            </div>
          </motion.div>

          {/* 2. Healthy Nodes */}
          <motion.div whileHover={{ y: -3 }} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon-wrapper" style={{ background: '#ECFDF5', color: '#10B981' }}>
                <HardDrive size={18} />
              </div>
              <span className={`status-pill ${healthyCount === totalCount ? 'healthy' : 'warning'}`} style={{ fontSize: '0.65rem' }}>
                {healthyCount === totalCount ? 'OPTIMAL' : 'DEGRADED'}
              </span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#172033', fontFamily: 'var(--font-mono)' }}>
              {healthyCount} <span style={{ fontSize: '1.1rem', color: '#94A3B8' }}>/ {totalCount}</span>
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
              Healthy Nodes
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              {healthyCount === totalCount ? 'All 5 nodes responding' : `${totalCount - healthyCount} nodes impaired`}
            </div>
          </motion.div>

          {/* 3. Replication Factor */}
          <motion.div whileHover={{ y: -3 }} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon-wrapper" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
                <Copy size={18} />
              </div>
              <span className="status-pill recovering" style={{ fontSize: '0.65rem' }}>POLICY</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#7C3AED', fontFamily: 'var(--font-mono)' }}>
              RF={replicationSummary?.replication_factor ?? 3}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
              Replication Factor
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              Write Quorum W={replicationSummary?.write_quorum ?? 2} (HRW)
            </div>
          </motion.div>

          {/* 4. Storage Used */}
          <motion.div whileHover={{ y: -3 }} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon-wrapper" style={{ background: '#ECFEFF', color: '#06B6D4' }}>
                <Layers size={18} />
              </div>
              <span className="status-pill healthy" style={{ fontSize: '0.65rem' }}>CAPACITY</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#172033', fontFamily: 'var(--font-mono)' }}>
              {usedStorageGb !== null ? usedStorageGb.toFixed(1) : '—'} <span style={{ fontSize: '1rem', color: '#64748B' }}>GB</span>
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
              Storage Used
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              {freeStorageGb !== null ? `${freeStorageGb.toFixed(1)} GB available` : 'Cluster node disks'}
            </div>
          </motion.div>

          {/* 5. Active Repairs */}
          <motion.div whileHover={{ y: -3 }} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon-wrapper" style={{ background: '#FFFBEB', color: '#F59E0B' }}>
                <Wrench size={18} />
              </div>
              <span className="status-pill warning" style={{ fontSize: '0.65rem' }}>PIPELINE</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#172033', fontFamily: 'var(--font-mono)' }}>
              {repairSummary !== null ? ((repairSummary.running || 0) + (repairSummary.queued || 0)) : '0'}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
              Active Repairs
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              {repairSummary ? `${repairSummary.running || 0} running · ${repairSummary.queued || 0} queued` : 'Real repair queue'}
            </div>
          </motion.div>

          {/* 6. Completed Repairs */}
          <motion.div whileHover={{ y: -3 }} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon-wrapper" style={{ background: '#ECFDF5', color: '#10B981' }}>
                <CheckCircle2 size={18} />
              </div>
              <span className="status-pill healthy" style={{ fontSize: '0.65rem' }}>RESOLVED</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>
              {repairSummary !== null ? (repairSummary.completed || 0) : '0'}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
              Completed Repairs
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              {repairSummary ? `${repairSummary.total || 0} total repair events` : 'Automated self-healing'}
            </div>
          </motion.div>

          {/* 7. Integrity Status */}
          <motion.div whileHover={{ y: -3 }} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon-wrapper" style={{ background: '#F0FDF4', color: '#16A34A' }}>
                <ShieldCheck size={18} />
              </div>
              <span className={`status-pill ${(integritySummary?.corrupted_detected ?? 0) === 0 ? 'healthy' : 'failure'}`} style={{ fontSize: '0.65rem' }}>
                {(integritySummary?.corrupted_detected ?? 0) === 0 ? 'CLEAN' : 'ALERT'}
              </span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: (integritySummary?.corrupted_detected ?? 0) === 0 ? '#10B981' : '#EF4444', fontFamily: 'var(--font-mono)' }}>
              {(integritySummary?.corrupted_detected ?? 0) === 0 ? 'VERIFIED' : `${integritySummary.corrupted_detected} CORRUPT`}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
              Integrity Status
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              {integritySummary?.verified_healthy !== undefined ? `${integritySummary.verified_healthy} SHA-256 verified` : 'Zero-trust validation'}
            </div>
          </motion.div>

          {/* 8. Cluster Health */}
          <motion.div whileHover={{ y: -3 }} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-icon-wrapper" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                <Activity size={18} />
              </div>
              <span className="status-pill recovering" style={{ fontSize: '0.65rem' }}>CONSENSUS</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
              {coordinatorData?.cluster_state || (healthyCount === totalCount ? 'HEALTHY' : 'DEGRADED')}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
              Cluster Health
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              {avgLatency !== null ? `Avg ping ${avgLatency}ms` : '5 independent nodes'}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="panel"
          style={{
            padding: '22px 26px',
            background: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  background: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563EB',
                }}
              >
                <Server size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#172033' }}>
                    {selectedNode.node_id.toUpperCase()} RUNTIME TELEMETRY
                  </h4>
                  <span className={`status-pill ${getStatusBadge(selectedNode.status).className}`}>
                    {selectedNode.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                  http://localhost:{selectedNode.port}
                </div>
              </div>
            </div>

            <a
              href={`http://localhost:${selectedNode.port}/health`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              <span>Inspect Health Endpoint</span>
              <ExternalLink size={12} />
            </a>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
            }}
          >
            <div className="tech-inset">
              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>PORT & BINDING</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#172033', marginTop: '2px' }}>
                :{selectedNode.port} (0.0.0.0)
              </div>
            </div>

            <div className="tech-inset">
              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>PING LATENCY</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: selectedNode.status === 'healthy' ? '#10B981' : '#EF4444', marginTop: '2px' }}>
                {selectedNode.latency_ms !== null && selectedNode.status === 'healthy' ? `${selectedNode.latency_ms} ms` : '—'}
              </div>
            </div>

            <div className="tech-inset">
              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>PROCESS UPTIME</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#172033', marginTop: '2px' }}>
                {selectedNode.uptime_seconds ? `${Math.floor(selectedNode.uptime_seconds)}s` : '—'}
              </div>
            </div>

            <div className="tech-inset">
              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>LOCAL DISK CAPACITY</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#2563EB', marginTop: '2px' }}>
                {selectedNode.capacity?.used_gb !== undefined ? `${selectedNode.capacity.used_gb} / ${selectedNode.capacity.total_gb} GB` : '—'}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
