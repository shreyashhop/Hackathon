import React from 'react';
import {
  Database,
  Copy,
  Wrench,
  ShieldCheck,
  Flame,
  Network,
  Scale,
  Settings,
  Lock,
  ArrowRight,
  Terminal,
  Cpu,
} from 'lucide-react';

const MODULE_SPEC = {
  objects: {
    title: 'Object Catalog & Storage Engine',
    subsystem: 'SUBSYSTEM: OBJECT-STORE',
    description: 'Chunking engine, SHA-256 content addressing, SQLite object metadata index, and parallel chunk streaming.',
    icon: Database,
    specs: [
      { label: 'Storage Primitive', value: '4MB Fixed Chunks' },
      { label: 'Addressing', value: 'SHA-256 Digest' },
      { label: 'Metadata Store', value: 'SQLite Write-Ahead Log' },
      { label: 'Transfer Protocol', value: 'Chunked Streaming HTTP' },
    ],
    planned: [
      'Multipart chunk upload and assembly verification',
      'Chunk deduplication via cryptographic content hashing',
      'Object metadata catalog with queryable tag support',
      'Stream-optimized download proxy with range requests',
    ],
  },
  replication: {
    title: 'Distributed Replication Mesh',
    subsystem: 'SUBSYSTEM: REPLICATION-CORE',
    description: 'Configurable replication factor (R=3), write quorum (W=2), read quorum (R=2), and consistent hash ring.',
    icon: Copy,
    specs: [
      { label: 'Replication Factor', value: 'R = 3 Replicas' },
      { label: 'Quorum Rule', value: 'W + R > N (Strict Consistency)' },
      { label: 'Topology Placement', value: 'Consistent Hash Ring' },
      { label: 'Coordinator Role', value: 'Reactive Quorum Arbiter' },
    ],
    planned: [
      'Consistent hashing ring with virtual node distribution',
      'Concurrent parallel multi-replica writes with write-quorum barrier',
      'Read quorum verification with highest version convergence',
      'Replica affinity mapping avoiding single points of failure',
    ],
  },
  repair: {
    title: 'Self-Healing & Replica Repair',
    subsystem: 'SUBSYSTEM: ANTI-ENTROPY',
    description: 'Heartbeat timeout watchdog, missed write logs, read-repair triggers, and background replica reconstruction.',
    icon: Wrench,
    specs: [
      { label: 'Failure Threshold', value: '3 Consecutive Heartbeat Misses' },
      { label: 'Detection Mode', value: 'Passive Read-Repair + Active Scrubber' },
      { label: 'Reconstruction', value: 'Peer-to-Peer Chunk Sync' },
      { label: 'Throttling', value: 'Token Bucket Bandwidth Cap' },
    ],
    planned: [
      'Automated background anti-entropy tree exchange',
      'Opportunistic read-repair during client read requests',
      'Missed writes journal playback upon node restoration',
      'Degraded replica auto-cloning to healthy standby nodes',
    ],
  },
  integrity: {
    title: 'Cryptographic Data Integrity',
    subsystem: 'SUBSYSTEM: INTEGRITY-VERIFIER',
    description: 'Cryptographic SHA-256 chunk validation, background bit-rot scrubbers, and corrupted replica replacement.',
    icon: ShieldCheck,
    specs: [
      { label: 'Checksum Algorithm', value: 'SHA-256 Merkle Roots' },
      { label: 'Scrub Frequency', value: 'Scheduled Background Scrub' },
      { label: 'Corruption Handling', value: 'Quorum Invalidation & Auto-Heal' },
      { label: 'Proof Verification', value: 'On-Demand Audit API' },
    ],
    planned: [
      'Continuous background bit-rot storage scanner',
      'Zero-trust chunk read validation before returning to client',
      'Silent corruption quarantine and automatic healthy replica copy',
      'Cryptographic tamper-evidence audit trails',
    ],
  },
  fault_lab: {
    title: 'Fault Injection Simulator',
    subsystem: 'SUBSYSTEM: CHAOS-TESTING',
    description: 'Interactive chaos testing: kill nodes, introduce artificial latency, drop packets, or simulate disk bit flips.',
    icon: Flame,
    specs: [
      { label: 'Process Control', value: 'SIGSTOP / SIGKILL API' },
      { label: 'Network Emulation', value: 'Netem Latency & Drop Rules' },
      { label: 'Disk Simulation', value: 'Synthetic Bit Flip Injector' },
      { label: 'Quorum Safety', value: 'Interactive Split-Brain Prevention' },
    ],
    planned: [
      'One-click node failure and recovery injection',
      'Custom configurable network latency injection (10ms - 2000ms)',
      'Simulated bit-rot corruptor to test self-healing pipelines',
      'Network partition simulator splitting nodes across virtual partitions',
    ],
  },
  topology: {
    title: 'Cluster Topology & Rack Awareness',
    subsystem: 'SUBSYSTEM: TOPOLOGY-ROUTER',
    description: 'Visual map of nodes, network links, availability zones, and simulated partition boundaries.',
    icon: Network,
    specs: [
      { label: 'Cluster Scale', value: '5 Storage Nodes + 1 Coordinator' },
      { label: 'Zones / Racks', value: 'Simulated Multi-Zone Awareness' },
      { label: 'Interconnect', value: 'Mesh Overlay Network' },
      { label: 'Partition Detection', value: 'Gossip Failure Vector' },
    ],
    planned: [
      'Interactive visual network graph showing real-time ping links',
      'Rack-aware chunk placement preventing co-located replica loss',
      'Live link latency heatmap between coordinator and all nodes',
      'Dynamic visual split-brain detection and partition fencing',
    ],
  },
  rebalancing: {
    title: 'Dynamic Data Rebalancing',
    subsystem: 'SUBSYSTEM: ELASTIC-RING',
    description: 'Seamless node expansion, decommissioning, and graceful chunk migration with minimal movement.',
    icon: Scale,
    specs: [
      { label: 'Migration Strategy', value: 'Consistent Hash Segment Splitting' },
      { label: 'Bandwidth Cap', value: 'Adaptive Rate-Limited I/O' },
      { label: 'Availability', value: 'Zero-Downtime Live Migration' },
      { label: 'Audit Log', value: 'Transactional Migration Journal' },
    ],
    planned: [
      'Node addition with automated incremental chunk rebalancing',
      'Graceful node decommission with drain and verify protocol',
      'Bandwidth-throttled background data migration',
      'Live rebalancing progress monitor and transfer metrics',
    ],
  },
  settings: {
    title: 'System & Cluster Configuration',
    subsystem: 'SUBSYSTEM: CONFIG-ENGINE',
    description: 'Coordinator tuning, health check intervals, default quorum parameters, and storage paths.',
    icon: Settings,
    specs: [
      { label: 'Heartbeat Interval', value: '5 Seconds' },
      { label: 'Node Timeout', value: '2.5 Seconds' },
      { label: 'Storage Root', value: '/data/{node_id}' },
      { label: 'Log Verbosity', value: 'INFO' },
    ],
    planned: [
      'Dynamic coordinator heartbeat frequency adjustment',
      'Configurable quorum thresholds for read and write paths',
      'Node storage allocation limits and warning alarms',
      'Real-time debug log streaming and trace introspection',
    ],
  },
};

export default function PlaceholderView({ tabId }) {
  const spec = MODULE_SPEC[tabId] || {
    title: 'Subsystem Specification',
    subsystem: 'SUBSYSTEM: EXTENSION',
    description: 'Technical specification for Vault cluster extension.',
    icon: Database,
    specs: [],
    planned: [],
  };

  const Icon = spec.icon;

  return (
    <div style={{ maxWidth: '860px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        className="panel"
        style={{
          padding: '24px 28px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          position: 'relative',
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-violet), transparent)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-inset)',
              border: '1px solid var(--accent-cyan-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
              flexShrink: 0,
            }}
          >
            <Icon size={20} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                {spec.title}
              </h2>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-violet-highlight)',
                  background: 'var(--accent-violet-dim)',
                  border: '1px solid var(--accent-violet-border)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-xs)',
                  fontWeight: 600,
                }}
              >
                {spec.subsystem}
              </span>
              <span
                className="status-pill warning"
                style={{ fontSize: '0.64rem' }}
              >
                NOT IMPLEMENTED IN PHASE 0
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: '4px', lineHeight: '1.45' }}>
              {spec.description}
            </p>
          </div>
        </div>

        {/* Technical Architecture Specs */}
        {spec.specs && spec.specs.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '0.70rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-dim)',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                textTransform: 'uppercase',
              }}
            >
              TARGET ARCHITECTURAL DESIGN (PLANNED SPECIFICATION)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
              }}
            >
              {spec.specs.map((item, idx) => (
                <div key={idx} className="tech-inset">
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.66rem', marginBottom: '2px' }}>
                    {item.label}
                  </div>
                  <div style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target Capabilities */}
        <div>
          <div
            style={{
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              letterSpacing: '0.06em',
              marginBottom: '8px',
              textTransform: 'uppercase',
            }}
          >
            TARGET SUBSYSTEM CAPABILITIES
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '8px',
            }}
          >
            {spec.planned.map((feat, idx) => (
              <div
                key={idx}
                className="tech-inset"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--text-muted)',
                }}
              >
                <ArrowRight size={12} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Phase Scope Callout */}
        <div
          style={{
            marginTop: '20px',
            padding: '10px 14px',
            background: 'var(--accent-cyan-dim)',
            border: '1px solid var(--accent-cyan-border)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.76rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-main)',
          }}
        >
          <Lock size={13} style={{ color: 'var(--accent-cyan)' }} />
          <span>
            PHASE 0 CONTROL CONSOLE: Live cluster bootstrap verification & telemetry active. Subsystem implementation unlocks in sequential phases.
          </span>
        </div>
      </div>
    </div>
  );
}
