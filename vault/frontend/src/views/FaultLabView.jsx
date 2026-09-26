import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame,
  HardDrive,
  FileCode,
  Network,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  ShieldAlert,
  Server,
  Zap,
} from 'lucide-react';

export default function FaultLabView({ coordinatorBaseUrl = '', onRefreshCluster }) {
  const [nodes, setNodes] = useState([]);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(false);

  // Node Failure state
  const [selectedNodeId, setSelectedNodeId] = useState('node-1');
  const [nodeActionLoading, setNodeActionLoading] = useState(false);
  const [nodeActionFeedback, setNodeActionFeedback] = useState(null);

  // Corruption state
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [selectedReplicaNode, setSelectedReplicaNode] = useState('');
  const [corruptActionLoading, setCorruptActionLoading] = useState(false);
  const [corruptActionFeedback, setCorruptActionFeedback] = useState(null);

  // Network Partition state (Phase 5)
  const [selectedPartitionNodeId, setSelectedPartitionNodeId] = useState('node-2');
  const [partitionActionLoading, setPartitionActionLoading] = useState(false);
  const [partitionActionFeedback, setPartitionActionFeedback] = useState(null);

  const getBaseUrl = useCallback(() => {
    return coordinatorBaseUrl || (window.location.port === '8000' ? '' : 'http://localhost:8000');
  }, [coordinatorBaseUrl]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [nodesRes, objectsRes] = await Promise.all([
        fetch(`${getBaseUrl()}/nodes`).catch(() => fetch('/nodes')),
        fetch(`${getBaseUrl()}/objects`).catch(() => fetch('/objects')),
      ]);

      if (nodesRes && nodesRes.ok) {
        const nodesData = await nodesRes.json();
        setNodes(nodesData);
      }

      if (objectsRes && objectsRes.ok) {
        const objsData = await objectsRes.json();
        setObjects(objsData);
        if (objsData.length > 0 && !selectedObjectId) {
          setSelectedObjectId(objsData[0].object_id);
          if (objsData[0].replicas && objsData[0].replicas.length > 0) {
            setSelectedReplicaNode(objsData[0].replicas[0].node_id);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load Fault Lab data:', err);
    } finally {
      setLoading(false);
    }
  }, [getBaseUrl, selectedObjectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedObject = objects.find((o) => o.object_id === selectedObjectId);
  const availableReplicas = selectedObject?.replicas || [];

  useEffect(() => {
    if (availableReplicas.length > 0) {
      const exists = availableReplicas.some((r) => r.node_id === selectedReplicaNode);
      if (!exists) {
        setSelectedReplicaNode(availableReplicas[0].node_id);
      }
    } else {
      setSelectedReplicaNode('');
    }
  }, [selectedObjectId, availableReplicas, selectedReplicaNode]);

  const selectedNode = nodes.find((n) => n.node_id === selectedNodeId) || {
    node_id: selectedNodeId,
    status: 'UNKNOWN',
  };

  const selectedReplica = availableReplicas.find((r) => r.node_id === selectedReplicaNode);

  // Node Failure Actions
  const handleNodeAction = async (action) => {
    try {
      setNodeActionLoading(true);
      setNodeActionFeedback(null);
      const endpoint = `${getBaseUrl()}/faults/node/${selectedNodeId}/${action}`;
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || `Action ${action} failed`);
      }

      setNodeActionFeedback({
        type: 'success',
        message: `Node ${selectedNodeId} successfully transitioned to ${action === 'stop' ? 'DOWN' : 'HEALTHY'}.`,
      });

      await fetchData();
      if (onRefreshCluster) onRefreshCluster();
    } catch (err) {
      setNodeActionFeedback({
        type: 'error',
        message: err.message,
      });
    } finally {
      setNodeActionLoading(false);
    }
  };

  // Replica Corruption Action
  const handleCorruptReplica = async () => {
    if (!selectedObjectId || !selectedReplicaNode) {
      alert('Please select both an object and a target replica node.');
      return;
    }

    try {
      setCorruptActionLoading(true);
      setCorruptActionFeedback(null);

      const endpoint = `${getBaseUrl()}/faults/corruption/${selectedObjectId}/${selectedReplicaNode}`;
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Corruption injection failed');
      }

      setCorruptActionFeedback({
        type: 'warning',
        message: `Physical byte corruption injected into replica on ${selectedReplicaNode.toUpperCase()} for object "${selectedObject?.object_name}". Checksum mismatch triggered.`,
        data,
      });

      await fetchData();
      if (onRefreshCluster) onRefreshCluster();
    } catch (err) {
      setCorruptActionFeedback({
        type: 'error',
        message: err.message,
      });
    } finally {
      setCorruptActionLoading(false);
    }
  };

  const selectedPartitionNode = nodes.find((n) => n.node_id === selectedPartitionNodeId) || {
    node_id: selectedPartitionNodeId,
    status: 'UNKNOWN',
  };

  const isPartitioned = (selectedPartitionNode.status || '').toUpperCase() === 'PARTITIONED';

  // Network Partition Actions (Phase 5)
  const handlePartitionAction = async (action) => {
    try {
      setPartitionActionLoading(true);
      setPartitionActionFeedback(null);
      const endpoint = `${getBaseUrl()}/faults/node/${selectedPartitionNodeId}/${action}`;
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || `Action ${action} failed`);
      }

      setPartitionActionFeedback({
        type: action === 'partition' ? 'warning' : 'success',
        message: data.message || `Node ${selectedPartitionNodeId.toUpperCase()} network ${action === 'partition' ? 'isolated' : 'restored'}.`,
        data,
      });

      await fetchData();
      if (onRefreshCluster) onRefreshCluster();
    } catch (err) {
      setPartitionActionFeedback({
        type: 'error',
        message: err.message,
      });
    } finally {
      setPartitionActionLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
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
            background: 'linear-gradient(90deg, #F59E0B, #EF4444)',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#172033', letterSpacing: '-0.02em' }}>
                Fault Injection Simulator
              </h2>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#EF4444',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 700,
                }}
              >
                CHAOS TESTING
              </span>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#64748B', marginTop: '6px' }}>
              Test distributed resilience by intentionally halting node daemons or corrupting physical bytes on replica disks.
            </p>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="btn btn-secondary"
            aria-label="Refresh fault simulator cluster state"
            style={{ padding: '8px 16px', fontSize: '0.80rem' }}
          >
            <RefreshCw size={14} aria-hidden="true" className={loading ? 'spin' : ''} />
            <span>Refresh State</span>
          </button>
        </div>
      </motion.div>

      {/* Two Column Grid: Node Failure & Corruption Simulator */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Panel 1: Node Failure Simulator */}
        <div className="panel" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={20} color="#2563EB" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#172033' }}>
              Storage Node Failure Simulator
            </h3>
          </div>
          <p style={{ fontSize: '0.80rem', color: '#64748B' }}>
            Simulate an abrupt daemon crash or network drop on an individual storage node.
          </p>

          {/* Node Selector */}
          <div>
            <label htmlFor="target-fail-node-select" style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#172033', marginBottom: '6px' }}>
              SELECT TARGET NODE
            </label>
            <select
              id="target-fail-node-select"
              aria-label="Select target storage node to simulate failure"
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                fontSize: '0.84rem',
                fontFamily: 'var(--font-mono)',
                color: '#172033',
              }}
            >
              {['node-1', 'node-2', 'node-3', 'node-4', 'node-5'].map((id) => (
                <option key={id} value={id}>
                  {id.toUpperCase()} (Port :{id === 'node-1' ? 8001 : id === 'node-2' ? 8002 : id === 'node-3' ? 8003 : id === 'node-4' ? 8004 : 8005})
                </option>
              ))}
            </select>
          </div>

          {/* Node Current State Indicator */}
          <div
            style={{
              padding: '12px 16px',
              background: '#F8FAFC',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Current Node State:</span>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: selectedNode.status === 'healthy' ? '#10B981' : '#EF4444',
              }}
            >
              ● {selectedNode.status.toUpperCase()}
            </span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '8px' }}>
            <button
              onClick={() => handleNodeAction('stop')}
              disabled={nodeActionLoading || selectedNode.status === 'down'}
              className="btn btn-danger"
              aria-label={`Simulate failure on node ${selectedNodeId.toUpperCase()}`}
              style={{ flex: 1, padding: '10px 16px', fontSize: '0.82rem' }}
            >
              <Flame size={14} aria-hidden="true" />
              <span>SIMULATE FAIL</span>
            </button>

            <button
              onClick={() => handleNodeAction('recover')}
              disabled={nodeActionLoading || selectedNode.status === 'healthy'}
              className="btn btn-primary"
              aria-label={`Recover storage node ${selectedNodeId.toUpperCase()}`}
              style={{ flex: 1, padding: '10px 16px', fontSize: '0.82rem' }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>RECOVER NODE</span>
            </button>
          </div>

          {nodeActionFeedback && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                background: nodeActionFeedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
                color: nodeActionFeedback.type === 'success' ? '#10B981' : '#EF4444',
                border: `1px solid ${nodeActionFeedback.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
              }}
            >
              {nodeActionFeedback.message}
            </div>
          )}
        </div>

        {/* Panel 2: Physical Data Corruption Simulator */}
        <div className="panel" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileCode size={20} color="#F59E0B" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#172033' }}>
              Physical Byte Corruption Simulator
            </h3>
          </div>
          <p style={{ fontSize: '0.80rem', color: '#64748B' }}>
            Inject bit rot by flipping physical bytes inside an object's disk replica, triggering SHA-256 mismatch.
          </p>

          {/* Object Selector */}
          <div>
            <label htmlFor="target-corrupt-obj-select" style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#172033', marginBottom: '6px' }}>
              TARGET OBJECT
            </label>
            <select
              id="target-corrupt-obj-select"
              aria-label="Target object for physical byte corruption"
              value={selectedObjectId}
              onChange={(e) => setSelectedObjectId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                fontSize: '0.84rem',
                color: '#172033',
              }}
            >
              {objects.length === 0 ? (
                <option value="">No objects available to corrupt</option>
              ) : (
                objects.map((o) => (
                  <option key={o.object_id} value={o.object_id}>
                    {o.object_name} ({o.object_id})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Replica Selector */}
          <div>
            <label htmlFor="target-corrupt-rep-select" style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#172033', marginBottom: '6px' }}>
              TARGET REPLICA NODE
            </label>
            <select
              id="target-corrupt-rep-select"
              aria-label="Target replica node for physical byte corruption"
              value={selectedReplicaNode}
              onChange={(e) => setSelectedReplicaNode(e.target.value)}
              disabled={availableReplicas.length === 0}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                fontSize: '0.84rem',
                fontFamily: 'var(--font-mono)',
                color: '#172033',
              }}
            >
              {availableReplicas.map((r) => (
                <option key={r.node_id} value={r.node_id}>
                  {r.node_id.toUpperCase()} ({r.status})
                </option>
              ))}
            </select>
          </div>

          {/* Replica Info Display */}
          <div
            style={{
              padding: '12px 14px',
              background: '#F8FAFC',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #E2E8F0',
              fontSize: '0.76rem',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div><strong>Status:</strong> {selectedReplica?.status || 'STORED'}</div>
            <div style={{ wordBreak: 'break-all' }}>
              <strong>Expected SHA:</strong> {selectedObject?.sha256 ? `${selectedObject.sha256.slice(0, 20)}...` : '—'}
            </div>
          </div>

          {/* Corrupt Action Button */}
          <button
            onClick={handleCorruptReplica}
            disabled={corruptActionLoading || !selectedObjectId || !selectedReplicaNode}
            className="btn btn-danger"
            aria-label={`Corrupt replica on node ${selectedReplicaNode} for target object`}
            style={{ padding: '10px 16px', fontSize: '0.82rem', marginTop: 'auto' }}
          >
            <AlertTriangle size={14} aria-hidden="true" />
            <span>CORRUPT REPLICA DISK BYTES</span>
          </button>

          {corruptActionFeedback && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                background: '#FFFBEB',
                color: '#B45309',
                border: '1px solid #FDE68A',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} />
              <span>{corruptActionFeedback.message}</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Network Partition Panel (Phase 5 - Live Control Panel) */}
      <div
        className="panel"
        style={{
          padding: '24px 28px',
          background: '#FFFFFF',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
          borderLeft: isPartitioned ? '4px solid #EA580C' : '4px solid #F59E0B',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Panel Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                background: isPartitioned ? '#FFF7ED' : '#FFFBEB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isPartitioned ? '#EA580C' : '#D97706',
              }}
            >
              <Network size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#172033' }}>
                Network Partition & Split-Brain Simulator
              </h3>
              <p style={{ fontSize: '0.80rem', color: '#64748B', marginTop: '2px' }}>
                Simulate network isolation. The node process stays running and retains local disk, but coordinator communication fails.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: isPartitioned ? '#FFF7ED' : '#ECFDF5',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${isPartitioned ? '#FED7AA' : '#A7F3D0'}`,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: isPartitioned ? '#EA580C' : '#10B981',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {isPartitioned ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
            <span>PHASE 5 — {isPartitioned ? 'PARTITION ACTIVE' : 'SYSTEM HEALTHY'}</span>
          </div>
        </div>

        {/* Clear Warning Banner */}
        <div
          style={{
            padding: '12px 16px',
            background: isPartitioned ? '#FEF2F2' : '#FFFBEB',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${isPartitioned ? '#FECACA' : '#FDE68A'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.80rem',
            color: isPartitioned ? '#991B1B' : '#92400E',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>WARNING:</strong> Network partitioning intentionally isolates all communication to the target node.
            The storage node stays alive on disk, but coordinator requests fail with bounded timeout.
            Quorum writes (W=2) and reads continue through remaining healthy replicas.
          </span>
        </div>

        {/* Target Node Selection & Status */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            padding: '16px',
            background: '#F8FAFC',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid #E2E8F0',
          }}
        >
          <div>
            <label htmlFor="target-part-node-select" style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              TARGET STORAGE NODE
            </label>
            <select
              id="target-part-node-select"
              aria-label="Select target storage node to partition"
              value={selectedPartitionNodeId}
              onChange={(e) => setSelectedPartitionNodeId(e.target.value)}
              className="form-input"
              style={{ padding: '8px 12px', fontSize: '0.84rem', fontWeight: 600 }}
            >
              {nodes.map((n) => (
                <option key={n.node_id} value={n.node_id}>
                  {n.node_id.toUpperCase()} ({n.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              CURRENT STATE
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '38px' }}>
              <span
                aria-label={`Target node ${selectedPartitionNodeId.toUpperCase()}, current state: ${(selectedPartitionNode.status || 'UNKNOWN').toUpperCase()}`}
                style={{
                  fontSize: '0.80rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 800,
                  background: isPartitioned ? '#FFF7ED' : selectedPartitionNode.status === 'HEALTHY' ? '#ECFDF5' : '#EFF6FF',
                  color: isPartitioned ? '#EA580C' : selectedPartitionNode.status === 'HEALTHY' ? '#10B981' : '#2563EB',
                  border: `1px solid ${isPartitioned ? '#FED7AA' : selectedPartitionNode.status === 'HEALTHY' ? '#A7F3D0' : '#BFDBFE'}`,
                }}
              >
                ● {(selectedPartitionNode.status || 'UNKNOWN').toUpperCase()}
              </span>
              {isPartitioned && (
                <span style={{ fontSize: '0.74rem', color: '#EA580C', fontWeight: 700 }}>
                  NODE ALIVE · NETWORK UNREACHABLE
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {isPartitioned ? (
            <button
              onClick={() => handlePartitionAction('restore')}
              disabled={partitionActionLoading}
              className="btn btn-primary"
              aria-label={`Restore network communication to node ${selectedPartitionNodeId.toUpperCase()}`}
              style={{
                padding: '10px 20px',
                fontSize: '0.86rem',
                background: '#7C3AED',
                borderColor: '#6D28D9',
              }}
            >
              <RotateCcw size={15} aria-hidden="true" className={partitionActionLoading ? 'spin' : ''} />
              <span>{partitionActionLoading ? 'Restoring Network...' : 'RESTORE NETWORK'}</span>
            </button>
          ) : (
            <button
              onClick={() => handlePartitionAction('partition')}
              disabled={partitionActionLoading}
              className="btn"
              aria-label={`Partition node ${selectedPartitionNodeId.toUpperCase()}`}
              style={{
                padding: '10px 20px',
                fontSize: '0.86rem',
                background: '#EA580C',
                color: '#FFFFFF',
                border: '1px solid #C2410C',
                fontWeight: 700,
              }}
            >
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{partitionActionLoading ? 'Partitioning...' : 'PARTITION NODE'}</span>
            </button>
          )}

          <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
            {isPartitioned
              ? 'Clicking Restore Network returns communication and triggers autonomous reconciliation.'
              : 'Clicking Partition Node simulates communication failure while the node process remains alive.'}
          </div>
        </div>

        {/* Feedback Message */}
        {partitionActionFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.80rem',
              background: partitionActionFeedback.type === 'error' ? '#FEF2F2' : '#EFF6FF',
              color: partitionActionFeedback.type === 'error' ? '#DC2626' : '#1D4ED8',
              border: `1px solid ${partitionActionFeedback.type === 'error' ? '#FECACA' : '#BFDBFE'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {partitionActionFeedback.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{partitionActionFeedback.message}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
