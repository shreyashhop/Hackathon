import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Database,
  ShieldCheck,
  Server,
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  GitFork,
  Activity,
  Copy,
  ChevronRight,
} from 'lucide-react';

export default function ReplicationView({ coordinatorBaseUrl = '', nodes = [] }) {
  const [summary, setSummary] = useState(null);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredObject, setHoveredObject] = useState(null);

  const fetchMesh = useCallback(async () => {
    try {
      setLoading(true);
      const [sumRes, objsRes] = await Promise.all([
        fetch(`${coordinatorBaseUrl}/replication/summary`).catch(() => fetch('/replication/summary')),
        fetch(`${coordinatorBaseUrl}/objects`).catch(() => fetch('/objects')),
      ]);

      if (sumRes && sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }
      if (objsRes && objsRes.ok) {
        const objsData = await objsRes.json();
        setObjects(objsData);
      }
      setError(null);
    } catch (err) {
      console.warn('Failed to fetch replication mesh data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [coordinatorBaseUrl]);

  useEffect(() => {
    fetchMesh();
    const interval = setInterval(fetchMesh, 6000);
    return () => clearInterval(interval);
  }, [fetchMesh]);

  const rf = summary?.replication_factor ?? 3;
  const w = summary?.write_quorum ?? 2;
  const totalLogical = summary?.total_logical_objects ?? objects.length;
  const totalPhysical = summary?.total_physical_replicas ?? 0;
  const distribution = summary?.replica_distribution ?? {
    'node-1': 0,
    'node-2': 0,
    'node-3': 0,
    'node-4': 0,
    'node-5': 0,
  };

  const maxReplicas = Math.max(...Object.values(distribution), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner: Replication Architecture & Policy */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel"
        style={{
          padding: '28px 32px',
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
          borderRadius: 'var(--radius-lg)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #2563EB, #7C3AED, #06B6D4)',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#172033', letterSpacing: '-0.02em' }}>
                Replication Mesh
              </h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#7C3AED',
                  background: '#F5F3FF',
                  border: '1px solid #DDD6FE',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 700,
                }}
              >
                RF={rf} · QUORUM W={w}
              </span>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#64748B', marginTop: '6px' }}>
              Deterministic Rendezvous / Highest Random Weight (HRW) replica placement with concurrent write quorum.
            </p>
          </div>

          <button
            onClick={fetchMesh}
            disabled={loading}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.80rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh Mesh</span>
          </button>
        </div>

        {/* Prominent Policy Highlight Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid #E2E8F0',
          }}
        >
          <div className="tech-inset" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>REPLICATION FACTOR (RF)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563EB', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              RF = {rf}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
              3 independent node replicas
            </div>
          </div>

          <div className="tech-inset" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>WRITE QUORUM (W)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7C3AED', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              W = {w}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
              2 confirmations required
            </div>
          </div>

          <div className="tech-inset" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>LOGICAL OBJECTS</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#172033', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {totalLogical}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
              Unique catalog keys
            </div>
          </div>

          <div className="tech-inset" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>PHYSICAL REPLICAS</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {totalPhysical}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
              Distributed across volumes
            </div>
          </div>
        </div>
      </motion.div>

      {/* Cluster Node Distribution Load Bars */}
      <div className="panel" style={{ padding: '22px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <HardDrive size={18} color="#2563EB" />
          <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#172033' }}>
            Replica Distribution Across Nodes
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          {['node-1', 'node-2', 'node-3', 'node-4', 'node-5'].map((nodeId) => {
            const count = distribution[nodeId] || 0;
            const percent = Math.round((count / maxReplicas) * 100);
            const isHovered = hoveredNode === nodeId;

            return (
              <div
                key={nodeId}
                onMouseEnter={() => setHoveredNode(nodeId)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{
                  padding: '12px 14px',
                  background: isHovered ? '#EFF6FF' : '#F8FAFC',
                  border: `1px solid ${isHovered ? '#BFDBFE' : '#E2E8F0'}`,
                  borderRadius: 'var(--radius-sm)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#172033' }}>
                    {nodeId.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                    {count} replicas
                  </span>
                </div>
                <div className="progress-container">
                  <div
                    className="progress-fill"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Relationship Trees */}
      <div className="panel" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitFork size={18} color="#7C3AED" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#172033' }}>
              Visual Object-to-Node Replica Placement Tree
            </h3>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
            Hovering an object or node highlights its relationships
          </div>
        </div>

        {objects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
            No objects currently stored in cluster to visualize in replication mesh.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {objects.map((obj) => {
              const isObjHovered = hoveredObject === obj.object_id;
              const replicas = obj.replicas || [];
              const containsHoveredNode = hoveredNode && replicas.some((r) => r.node_id === hoveredNode);

              return (
                <div
                  key={obj.object_id}
                  onMouseEnter={() => setHoveredObject(obj.object_id)}
                  onMouseLeave={() => setHoveredObject(null)}
                  style={{
                    padding: '16px 20px',
                    borderRadius: 'var(--radius-sm)',
                    background: isObjHovered || containsHoveredNode ? '#F5F3FF' : '#FFFFFF',
                    border: `1px solid ${isObjHovered || containsHoveredNode ? '#DDD6FE' : '#E2E8F0'}`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Object root item */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div
                      style={{
                        padding: '4px 10px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        borderRadius: 'var(--radius-xs)',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      OBJECT
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#172033' }}>
                      {obj.object_name}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                      ({obj.object_id})
                    </span>
                  </div>

                  {/* Branches connecting to replica nodes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '14px', borderLeft: '2px solid #CBD5E1', paddingLeft: '16px' }}>
                    {replicas.map((rep, rIdx) => {
                      const isNodeMatch = hoveredNode === rep.node_id;
                      const isStored = rep.status === 'STORED';

                      return (
                        <div
                          key={rIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 12px',
                            background: isNodeMatch ? '#EFF6FF' : '#FFFFFF',
                            border: `1px solid ${isNodeMatch ? '#BFDBFE' : '#E2E8F0'}`,
                            borderRadius: 'var(--radius-xs)',
                            width: 'fit-content',
                            boxShadow: 'var(--shadow-xs)',
                          }}
                        >
                          <span style={{ color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                            {rIdx === replicas.length - 1 ? '└────' : '├────'}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '0.80rem', color: '#172033', fontFamily: 'var(--font-mono)' }}>
                            {rep.node_id.toUpperCase()}
                          </span>
                          <span className={`status-pill ${isStored ? 'healthy' : 'failure'}`} style={{ fontSize: '0.65rem' }}>
                            {rep.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
