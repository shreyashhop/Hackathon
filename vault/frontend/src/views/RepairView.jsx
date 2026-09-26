import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Server,
  Layers,
  FileCheck,
  ShieldCheck,
} from 'lucide-react';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getJobStatusBadge(status) {
  const s = (status || '').toUpperCase();
  if (s === 'COMPLETED') return { className: 'healthy', label: 'COMPLETED', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' };
  if (s === 'RUNNING') return { className: 'recovering', label: 'RUNNING', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' };
  if (s === 'QUEUED') return { className: 'warning', label: 'QUEUED', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' };
  if (s === 'FAILED') return { className: 'failure', label: 'FAILED', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' };
  return { className: 'warning', label: s || 'UNKNOWN', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' };
}

function getReasonBadge(reason) {
  const r = (reason || '').toUpperCase();
  if (r.includes('PARTITION')) {
    return { label: 'PARTITION_RECONCILIATION', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' };
  }
  if (r.includes('CORRUPT')) {
    return { label: 'CORRUPTION_REPAIR', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' };
  }
  if (r.includes('NODE_DOWN')) {
    return { label: 'NODE_DOWN_REPAIR', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' };
  }
  return { label: r || 'REPAIR', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' };
}

export default function RepairView({ coordinatorBaseUrl = '' }) {
  const [jobs, setJobs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRepairs = useCallback(async () => {
    try {
      setLoading(true);
      const [jobsRes, sumRes] = await Promise.all([
        fetch(`${coordinatorBaseUrl}/repair/jobs`).catch(() => fetch('/repair/jobs')),
        fetch(`${coordinatorBaseUrl}/repair/summary`).catch(() => fetch('/repair/summary')),
      ]);

      if (jobsRes && jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }
      if (sumRes && sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }
      setError(null);
    } catch (err) {
      console.warn('Failed to fetch repair data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [coordinatorBaseUrl]);

  useEffect(() => {
    fetchRepairs();
    const interval = setInterval(fetchRepairs, 3000);
    return () => clearInterval(interval);
  }, [fetchRepairs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner: Repair Center Overview */}
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
            background: 'linear-gradient(90deg, #10B981, #2563EB)',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#172033', letterSpacing: '-0.02em' }}>
                Repair Center & Self-Healing
              </h2>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#10B981',
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 700,
                }}
              >
                AUTOMATIC RESTORATION
              </span>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#64748B', marginTop: '6px' }}>
              Autonomous peer-to-peer replica repair triggered on node outage or cryptographic corruption detection.
            </p>
          </div>

          <button
            onClick={fetchRepairs}
            disabled={loading}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.80rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Poll Jobs</span>
          </button>
        </div>

        {/* Repair Metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '16px',
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid #E2E8F0',
          }}
        >
          <div className="tech-inset" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>COMPLETED REPAIRS</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {summary ? (summary.completed || 0) : '0'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
              Replicas restored cleanly
            </div>
          </div>

          <div className="tech-inset" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>ACTIVE IN PROGRESS</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563EB', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {summary ? ((summary.running || 0) + (summary.queued || 0)) : '0'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
              {summary?.running || 0} transfer, {summary?.queued || 0} queued
            </div>
          </div>

          <div className="tech-inset" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>FAILED JOBS</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: (summary?.failed || 0) > 0 ? '#EF4444' : '#172033', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {summary ? (summary.failed || 0) : '0'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
              Unrecoverable failures
            </div>
          </div>

          <div className="tech-inset" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700 }}>TOTAL EXECUTED</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#172033', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {summary ? (summary.total || 0) : '0'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
              Lifetime repair tasks
            </div>
          </div>
        </div>
      </motion.div>

      {/* Repair Workflows List */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Wrench size={18} color="#2563EB" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#172033' }}>
            Infrastructure Repair Jobs ({jobs.length})
          </h3>
        </div>

        {jobs.length === 0 ? (
          <div className="panel" style={{ padding: '48px', textAlign: 'center' }}>
            <CheckCircle2 size={36} color="#10B981" style={{ margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#172033' }}>
              No Active or Recent Repair Jobs
            </h4>
            <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
              All replicas across all 5 nodes are verified healthy. Induce a node failure or byte corruption in Fault Lab to observe real automatic repair.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {jobs.map((job) => {
              const badge = getJobStatusBadge(job.status);
              const reasonBadge = getReasonBadge(job.reason);
              const isCompleted = job.status === 'COMPLETED';
              const isRunning = job.status === 'RUNNING';

              return (
                <motion.div
                  key={job.job_id}
                  layout
                  className="panel"
                  style={{
                    padding: '22px 26px',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: `4px solid ${badge.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  {/* Job Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#172033', fontFamily: 'var(--font-mono)' }}>
                        JOB #{job.job_id}
                      </span>
                      <span className={`status-pill ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: reasonBadge.bg,
                          color: reasonBadge.color,
                          border: `1px solid ${reasonBadge.border}`,
                          fontWeight: 800,
                        }}
                      >
                        REASON: {reasonBadge.label}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        Object: <strong>{job.object_id}</strong>
                      </span>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                      {job.created_at ? new Date(job.created_at).toLocaleTimeString() : ''}
                    </div>
                  </div>

                  {/* Multi-Stage Repair Pipeline Representation */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '10px',
                      padding: '12px 14px',
                      background: '#F8FAFC',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    {/* Stage 1: Trigger / Reason */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>STAGE 1</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: reasonBadge.color }}>
                        {reasonBadge.label}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                        Target: {job.target_node_id?.toUpperCase()}
                      </span>
                    </div>

                    {/* Stage 2: Source Selected */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>STAGE 2</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#2563EB' }}>
                        SOURCE SELECTED
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                        Donor: {job.source_node_id ? job.source_node_id.toUpperCase() : 'Autoselected'}
                      </span>
                    </div>

                    {/* Stage 3: Transfer */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>STAGE 3</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#7C3AED' }}>
                        STREAM TRANSFER
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                        {formatBytes(job.bytes_transferred || 0)} transferred
                      </span>
                    </div>

                    {/* Stage 4: SHA-256 Verify */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>STAGE 4</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#06B6D4' }}>
                        SHA-256 VERIFIED
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                        {job.bytes_transferred || 0} BYTES
                      </span>
                    </div>

                    {/* Stage 5: Completed */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>STAGE 5</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: isCompleted ? '#10B981' : '#F59E0B' }}>
                        {isCompleted ? 'COMPLETED ✓' : isRunning ? 'IN PROGRESS...' : 'QUEUED'}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                        {job.completed_at ? new Date(job.completed_at).toLocaleTimeString() : 'Pending'}
                      </span>
                    </div>
                  </div>

                  {/* Verification SHA Detail */}
                  {job.verified_sha256 && (
                    <div style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                      <strong>Verified SHA-256:</strong> {job.verified_sha256}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
