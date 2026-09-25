import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Activity,
  HardDrive,
  FileCheck,
  Zap,
  Play,
  FileSearch,
} from 'lucide-react';

export default function IntegrityView({ coordinatorBaseUrl = '' }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);
  const [error, setError] = useState(null);

  const getBaseUrl = useCallback(() => {
    return coordinatorBaseUrl || (window.location.port === '8000' ? '' : 'http://localhost:8000');
  }, [coordinatorBaseUrl]);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let res;
      try {
        res = await fetch(`${getBaseUrl()}/integrity/summary`);
      } catch {
        res = await fetch('/integrity/summary');
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.warn('Failed to fetch /integrity/summary:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getBaseUrl]);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 5000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const handleRunScan = async () => {
    try {
      setScanning(true);
      setError(null);
      let res;
      try {
        res = await fetch(`${getBaseUrl()}/integrity/scan`, { method: 'POST' });
      } catch {
        res = await fetch('/integrity/scan', { method: 'POST' });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Scan failed: HTTP ${res.status}`);
      }

      const result = await res.json();
      setLastScanResult(result);
      await fetchSummary();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const isHealthy = (summary?.corrupted_detected ?? 0) === 0;

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
            background: 'linear-gradient(90deg, #10B981, #06B6D4)',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#172033', letterSpacing: '-0.02em' }}>
                Data Integrity Auditor
              </h2>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  color: isHealthy ? '#10B981' : '#EF4444',
                  background: isHealthy ? '#ECFDF5' : '#FEF2F2',
                  border: `1px solid ${isHealthy ? '#A7F3D0' : '#FECACA'}`,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 700,
                }}
              >
                {isHealthy ? 'ZERO-TRUST VERIFIED' : `${summary?.corrupted_detected} CORRUPT REPLICAS`}
              </span>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#64748B', marginTop: '6px' }}>
              Automated bit-rot scanner that cryptographically verifies physical on-disk SHA-256 digests against authoritative catalog records.
            </p>
          </div>

          <button
            onClick={handleRunScan}
            disabled={scanning}
            className="btn btn-primary"
            style={{
              padding: '10px 22px',
              fontSize: '0.88rem',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            }}
          >
            <Play size={16} fill="currentColor" />
            <span>{scanning ? 'SCANNING CLUSTER...' : 'RUN INTEGRITY SCAN'}</span>
          </button>
        </div>
      </motion.div>

      {/* Visual SHA Verification Animation during Active Scan */}
      {scanning && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="panel"
          style={{
            padding: '20px 24px',
            background: '#EFF6FF',
            borderColor: '#BFDBFE',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
            }}
            className="spin"
          >
            <RefreshCw size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#172033' }}>
              Cryptographic Integrity Audit in Progress...
            </div>
            <div style={{ fontSize: '0.78rem', color: '#2563EB', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              Computing hardware SHA-256 for all local volumes across Nodes 1–5...
            </div>
          </div>
        </motion.div>
      )}

      {/* 6 Integrity Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Card 1: Total Replicas */}
        <motion.div whileHover={{ y: -3 }} className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-icon-wrapper" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <HardDrive size={18} />
            </div>
            <span className="status-pill healthy" style={{ fontSize: '0.65rem' }}>AUDITED</span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#172033', fontFamily: 'var(--font-mono)' }}>
            {summary?.total_replicas_scanned ?? 0}
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
            Total Replicas
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Physical chunks on nodes
          </div>
        </motion.div>

        {/* Card 2: Verified Replicas */}
        <motion.div whileHover={{ y: -3 }} className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-icon-wrapper" style={{ background: '#ECFDF5', color: '#10B981' }}>
              <CheckCircle2 size={18} />
            </div>
            <span className="status-pill healthy" style={{ fontSize: '0.65rem' }}>MATCH</span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>
            {summary?.verified_healthy ?? 0}
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
            Verified Replicas
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
            SHA-256 match catalog
          </div>
        </motion.div>

        {/* Card 3: Corrupted Replicas */}
        <motion.div whileHover={{ y: -3 }} className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-icon-wrapper" style={{ background: '#FEF2F2', color: '#EF4444' }}>
              <ShieldAlert size={18} />
            </div>
            <span className={`status-pill ${(summary?.corrupted_detected ?? 0) === 0 ? 'healthy' : 'failure'}`} style={{ fontSize: '0.65rem' }}>
              {(summary?.corrupted_detected ?? 0) === 0 ? 'CLEAN' : 'ALERT'}
            </span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: (summary?.corrupted_detected ?? 0) === 0 ? '#10B981' : '#EF4444', fontFamily: 'var(--font-mono)' }}>
            {summary?.corrupted_detected ?? 0}
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
            Corrupted Replicas
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Physical bit-rot detected
          </div>
        </motion.div>

        {/* Card 4: Last Scan */}
        <motion.div whileHover={{ y: -3 }} className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-icon-wrapper" style={{ background: '#F8FAFC', color: '#64748B' }}>
              <Clock size={18} />
            </div>
            <span className="status-pill healthy" style={{ fontSize: '0.65rem' }}>CRON</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#172033', fontFamily: 'var(--font-mono)' }}>
            {summary?.last_scan_at ? new Date(summary.last_scan_at).toLocaleTimeString() : 'Pending'}
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
            Last Scan
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Periodic audit cycle
          </div>
        </motion.div>

        {/* Card 5: Repairs Triggered */}
        <motion.div whileHover={{ y: -3 }} className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-icon-wrapper" style={{ background: '#FFFBEB', color: '#F59E0B' }}>
              <Zap size={18} />
            </div>
            <span className="status-pill warning" style={{ fontSize: '0.65rem' }}>AUTO-FIX</span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F59E0B', fontFamily: 'var(--font-mono)' }}>
            {summary?.repairs_triggered ?? 0}
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
            Repairs Triggered
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Dispatched to repair queue
          </div>
        </motion.div>

        {/* Card 6: Verification Failures */}
        <motion.div whileHover={{ y: -3 }} className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-icon-wrapper" style={{ background: '#FEF2F2', color: '#EF4444' }}>
              <AlertTriangle size={18} />
            </div>
            <span className="status-pill failure" style={{ fontSize: '0.65rem' }}>CHECKSUM</span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: (summary?.corrupted_detected ?? 0) === 0 ? '#10B981' : '#EF4444', fontFamily: 'var(--font-mono)' }}>
            {summary?.corrupted_detected ?? 0}
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#172033' }}>
            Verification Failures
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Digest mismatches
          </div>
        </motion.div>
      </div>

      {/* Last Scan Details Panel if available */}
      {lastScanResult && (
        <div className="panel" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <FileCheck size={18} color="#10B981" />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#172033' }}>
              Latest Scan Execution Report
            </h4>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              fontSize: '0.78rem',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div><strong>Replicas Audited:</strong> {lastScanResult.scanned_replicas}</div>
            <div><strong>Verified Healthy:</strong> {lastScanResult.verified_healthy}</div>
            <div><strong>Corruptions Discovered:</strong> {lastScanResult.corrupted_found}</div>
            <div><strong>Repairs Initiated:</strong> {lastScanResult.repairs_queued}</div>
          </div>
        </div>
      )}
    </div>
  );
}
