import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Download,
  Trash2,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  Copy,
  Check,
  Server,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Activity,
  ExternalLink,
  Search,
  Hash,
} from 'lucide-react';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Convert ArrayBuffer to Hex string for SHA-256
async function computeSha256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getReplicaStatusStyle(status) {
  const s = (status || '').toUpperCase();
  if (s === 'STORED') return { color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' };
  if (s === 'PARTITIONED') return { color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' };
  if (s === 'RECOVERING') return { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' };
  if (s === 'CORRUPT') return { color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' };
  if (s === 'DOWN') return { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' };
  if (s === 'STALE' || s === 'MISSING') return { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
  return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' };
}

export default function ObjectsView({ coordinatorBaseUrl = '', onRefreshNodes }) {
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload pipeline state
  // stages: idle | hashing | placement | replicating | quorum | stored | error
  const [pipelineStep, setPipelineStep] = useState('idle');
  const [pipelineData, setPipelineData] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const [copiedHash, setCopiedHash] = useState(null);
  const [actionInProgress, setActionInProgress] = useState({});
  const [expandedObjectId, setExpandedObjectId] = useState(null);

  const fileInputRef = useRef(null);

  const getBaseUrl = useCallback(() => {
    return coordinatorBaseUrl || (window.location.port === '8000' ? '' : 'http://localhost:8000');
  }, [coordinatorBaseUrl]);

  const fetchObjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let res;
      try {
        res = await fetch(`${getBaseUrl()}/objects`);
      } catch {
        res = await fetch('/objects');
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setObjects(data);
    } catch (err) {
      console.warn('Failed to fetch /objects:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getBaseUrl]);

  useEffect(() => {
    fetchObjects();
  }, [fetchObjects]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      setPipelineStep('error');
      setUploadError('Cannot upload an empty (0 byte) file.');
      return;
    }

    try {
      setUploadError(null);
      setPipelineData({
        fileName: file.name,
        sizeBytes: file.size,
        calculatedSha: '',
        objectId: '',
        replicas: [],
      });

      // 1. SELECT FILE & SHA-256 HASHING
      setPipelineStep('hashing');
      const sha256 = await computeSha256(file);
      setPipelineData((prev) => ({ ...prev, calculatedSha: sha256 }));

      // 2. HRW PLACEMENT & REPLICATING
      setPipelineStep('replicating');

      const formData = new FormData();
      formData.append('file', file);

      let res;
      try {
        res = await fetch(`${getBaseUrl()}/objects`, {
          method: 'POST',
          body: formData,
        });
      } catch {
        res = await fetch('/objects', {
          method: 'POST',
          body: formData,
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Replication failed (HTTP ${res.status})`);
      }

      // 3. QUORUM SATISFACTION & STORED
      setPipelineStep('quorum');
      const uploadedObj = await res.json();

      setPipelineData({
        fileName: uploadedObj.object_name,
        sizeBytes: uploadedObj.size_bytes,
        calculatedSha: uploadedObj.sha256,
        objectId: uploadedObj.object_id,
        replicas: uploadedObj.replicas || [],
        quorum: uploadedObj.quorum_satisfied ?? true,
      });

      setPipelineStep('stored');

      // Refresh catalog and update storage node counts
      await fetchObjects();
      if (onRefreshNodes) onRefreshNodes();

      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setPipelineStep('error');
      setUploadError(err.message || 'File upload failed');
    }
  };

  const handleDownload = async (obj) => {
    try {
      setActionInProgress((prev) => ({ ...prev, [obj.object_id]: 'downloading' }));

      let res;
      try {
        res = await fetch(`${getBaseUrl()}/objects/${obj.object_id}/download`);
      } catch {
        res = await fetch(`/objects/${obj.object_id}/download`);
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Download failed (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = obj.object_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      a.remove();
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [obj.object_id]: null }));
    }
  };

  const handleDelete = async (obj) => {
    if (!window.confirm(`Are you sure you want to delete object "${obj.object_name}" across all replicas?`)) {
      return;
    }

    try {
      setActionInProgress((prev) => ({ ...prev, [obj.object_id]: 'deleting' }));

      let res;
      try {
        res = await fetch(`${getBaseUrl()}/objects/${obj.object_id}`, { method: 'DELETE' });
      } catch {
        res = await fetch(`/objects/${obj.object_id}`, { method: 'DELETE' });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Delete failed (HTTP ${res.status})`);
      }

      await fetchObjects();
      if (onRefreshNodes) onRefreshNodes();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [obj.object_id]: null }));
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const filteredObjects = objects.filter((o) =>
    o.object_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.object_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.sha256 && o.sha256.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* View Header with Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#172033', letterSpacing: '-0.02em' }}>
              Object Catalog
            </h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: '#2563EB',
                background: '#EFF6FF',
                border: '1px solid #DBEAFE',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
              }}
            >
              {objects.length} OBJECTS STORED
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '4px' }}>
            Replicated distributed object store with rendezvous hash placement and automatic corruption repair.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary"
            style={{ padding: '8px 18px', fontSize: '0.84rem' }}
          >
            <Upload size={16} />
            <span>Upload Object</span>
          </button>

          <button
            onClick={fetchObjects}
            disabled={loading}
            className="btn"
            style={{ padding: '8px 14px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Real-State Animated Upload Pipeline */}
      {pipelineStep !== 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel"
          style={{
            padding: '20px 24px',
            background: pipelineStep === 'error' ? '#FEF2F2' : '#FFFFFF',
            borderColor: pipelineStep === 'error' ? '#FECACA' : '#DBEAFE',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="#2563EB" />
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#172033' }}>
                DISTRIBUTED UPLOAD PIPELINE
              </span>
            </div>
            {pipelineStep === 'stored' && (
              <button
                onClick={() => setPipelineStep('idle')}
                className="btn"
                style={{ padding: '3px 10px', fontSize: '0.72rem' }}
              >
                Dismiss
              </button>
            )}
          </div>

          {/* Pipeline Stages */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '10px 0',
            }}
          >
            {[
              { id: 'select', label: 'SELECT FILE', done: true },
              { id: 'hashing', label: 'SHA-256 HASHING', done: ['replicating', 'quorum', 'stored'].includes(pipelineStep), active: pipelineStep === 'hashing' },
              { id: 'placement', label: 'HRW PLACEMENT', done: ['quorum', 'stored'].includes(pipelineStep), active: pipelineStep === 'replicating' },
              { id: 'replicating', label: 'REPLICATING', done: ['quorum', 'stored'].includes(pipelineStep), active: pipelineStep === 'replicating' },
              { id: 'quorum', label: 'QUORUM 2/3', done: pipelineStep === 'stored', active: pipelineStep === 'quorum' },
              { id: 'stored', label: 'STORED ✓', done: pipelineStep === 'stored', active: pipelineStep === 'stored' },
            ].map((step, sIdx) => {
              const isCurrent = step.active;
              const isDone = step.done;

              return (
                <div
                  key={sIdx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: isDone ? '#ECFDF5' : isCurrent ? '#EFF6FF' : '#F1F5F9',
                    border: `1px solid ${isDone ? '#A7F3D0' : isCurrent ? '#BFDBFE' : '#E2E8F0'}`,
                    color: isDone ? '#10B981' : isCurrent ? '#2563EB' : '#94A3B8',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                  }}
                >
                  {isDone ? (
                    <CheckCircle2 size={14} />
                  ) : isCurrent ? (
                    <RefreshCw size={14} className="spin" />
                  ) : (
                    <Clock size={14} />
                  )}
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>

          {/* Success Result Box */}
          {pipelineStep === 'stored' && pipelineData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                marginTop: '16px',
                padding: '14px 18px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16A34A', fontWeight: 700, fontSize: '0.88rem' }}>
                <CheckCircle2 size={18} />
                <span>Object replicated and quorum verified successfully!</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                <div><strong style={{ color: '#172033' }}>Object ID:</strong> {pipelineData.objectId}</div>
                <div><strong style={{ color: '#172033' }}>File:</strong> {pipelineData.fileName} ({formatBytes(pipelineData.sizeBytes)})</div>
                <div><strong style={{ color: '#172033' }}>Replicas:</strong> {pipelineData.replicas.map((r) => r.node_id).join(', ')}</div>
                <div style={{ wordBreak: 'break-all' }}><strong style={{ color: '#172033' }}>SHA-256:</strong> {pipelineData.calculatedSha?.slice(0, 16)}...</div>
              </div>
            </motion.div>
          )}

          {/* Error Message Box */}
          {pipelineStep === 'error' && (
            <div style={{ marginTop: '12px', color: '#DC2626', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{uploadError}</span>
            </div>
          )}
        </motion.div>
      )}

      {/* Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid #E2E8F0', boxShadow: 'var(--shadow-xs)' }}>
        <Search size={16} color="#94A3B8" />
        <input
          type="text"
          placeholder="Filter by object name, SHA-256, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            border: 'none',
            outline: 'none',
            width: '100%',
            fontSize: '0.86rem',
            fontFamily: 'var(--font-sans)',
            color: '#172033',
            background: 'transparent',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', fontSize: '0.8rem' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Objects Cards Grid */}
      {filteredObjects.length === 0 ? (
        <div className="panel" style={{ padding: '48px', textAlign: 'center' }}>
          <FileText size={36} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#172033' }}>
            {searchQuery ? 'No matching objects found' : 'No objects stored in cluster'}
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
            Upload a file above to test distributed hashing, HRW placement, and 3-way replication.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredObjects.map((obj) => {
            const isExpanded = expandedObjectId === obj.object_id;
            const replicas = obj.replicas || [];
            const healthyReplicas = replicas.filter((r) => r.status === 'STORED').length;
            const totalReplicas = replicas.length || 3;
            const isAllHealthy = healthyReplicas === totalReplicas && totalReplicas > 0;

            return (
              <motion.div
                key={obj.object_id}
                layout
                className="panel"
                style={{
                  padding: '20px 24px',
                  background: '#FFFFFF',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Object Top Summary Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: 'var(--radius-sm)',
                        background: '#EFF6FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#2563EB',
                      }}
                    >
                      <FileText size={20} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#172033' }}>
                          {obj.object_name}
                        </h4>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontFamily: 'var(--font-mono)',
                            color: '#64748B',
                            background: '#F1F5F9',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 600,
                          }}
                        >
                          {formatBytes(obj.size_bytes)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#94A3B8', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        ID: {obj.object_id}
                      </div>
                    </div>
                  </div>

                  {/* Right side actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleDownload(obj)}
                      disabled={actionInProgress[obj.object_id]}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      <Download size={13} />
                      <span>{actionInProgress[obj.object_id] === 'downloading' ? 'Fetching...' : 'Download'}</span>
                    </button>

                    <button
                      onClick={() => handleDelete(obj)}
                      disabled={actionInProgress[obj.object_id]}
                      className="btn btn-danger"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>

                    <button
                      onClick={() => setExpandedObjectId(isExpanded ? null : obj.object_id)}
                      className="btn"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      <span>Replicas ({replicas.length})</span>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>

                {/* SHA-256 and Replica Chips */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '10px 14px',
                    background: '#F8FAFC',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  {/* SHA-256 with copy */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: '#94A3B8', fontWeight: 600 }}>SHA-256:</span>
                    <span style={{ color: '#172033', fontWeight: 500 }}>
                      {obj.sha256 ? `${obj.sha256.slice(0, 24)}...` : '—'}
                    </span>
                    {obj.sha256 && (
                      <button
                        onClick={() => copyToClipboard(obj.sha256, obj.object_id)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2563EB', display: 'flex', alignItems: 'center' }}
                        title="Copy full SHA-256"
                      >
                        {copiedHash === obj.object_id ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>

                  {/* Replicas status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>REPLICAS:</span>
                    {replicas.map((r, rIdx) => {
                      const rStyle = getReplicaStatusStyle(r.status);
                      return (
                        <span
                          key={rIdx}
                          style={{
                            fontSize: '0.72rem',
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: rStyle.bg,
                            color: rStyle.color,
                            border: `1px solid ${rStyle.border}`,
                            fontWeight: 700,
                          }}
                        >
                          ● {r.node_id.toUpperCase()} ({r.status})
                        </span>
                      );
                    })}

                    <span className={`status-pill ${isAllHealthy ? 'healthy' : 'warning'}`}>
                      {healthyReplicas}/{totalReplicas} HEALTHY
                    </span>
                  </div>
                </div>

                {/* Expanded Replica Detail Cards Drawer */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        paddingTop: '10px',
                        borderTop: '1px solid #E2E8F0',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      {replicas.map((rep, rIdx) => (
                        <div
                          key={rIdx}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: 'var(--radius-sm)',
                            padding: '12px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            boxShadow: 'var(--shadow-xs)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <HardDrive size={14} color="#2563EB" />
                              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#172033' }}>
                                {rep.node_id.toUpperCase()}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontFamily: 'var(--font-mono)',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: getReplicaStatusStyle(rep.status).bg,
                                color: getReplicaStatusStyle(rep.status).color,
                                border: `1px solid ${getReplicaStatusStyle(rep.status).border}`,
                                fontWeight: 700,
                              }}
                            >
                              {rep.status}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                            Size: {formatBytes(rep.physical_size ?? obj.size_bytes)}
                          </div>

                          <div style={{ fontSize: '0.70rem', color: '#94A3B8', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                            Hash: {rep.sha256 ? `${rep.sha256.slice(0, 16)}...` : 'Verified'}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
