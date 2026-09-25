# Vault: Distributed Fault-Tolerant Object Storage
## System Design & Architecture Specification

---

## 1. Overview & Architectural Goals

**Vault** is a real fault-tolerant distributed object storage web application designed to deliver high availability, strong consistency guarantees via quorum consensus, automatic self-healing, bit-rot corruption detection, and dynamic fault simulation.

### Core System Properties
* **Decentralized Storage Mesh:** 5 independent storage node processes with dedicated non-shared persistent volumes.
* **Orchestrating Coordinator:** FastAPI coordinator managing metadata, routing, health supervision, and quorum consensus.
* **ACID Metadata Engine:** SQLite metadata database storing object catalogs, chunk layouts, and replica locations.
* **Real-time Live Events:** Bidirectional WebSocket stream broadcasting cluster heartbeats, node status transitions, and fault events.
* **Reactive Cloud Console:** React + Vite single page application delivering developer-grade infrastructure visibility.

---

## 2. High-Level System Architecture

```
                    +-----------------------------+
                    |       React Frontend        |
                    | (SPA / Infrastructure UI)   |
                    +--------------+--------------+
                                   |
                   HTTP REST       | WebSocket (/events/ws)
                                   v
                    +-----------------------------+
                    |      Vault Coordinator      |
                    |        (FastAPI)            |
                    |                             |
                    |  +-----------------------+  |
                    |  |   SQLite Metadata DB  |  |
                    |  +-----------------------+  |
                    +--------------+--------------+
                                   |
                Internal REST Mesh | Health Checks
        +------------+-------------+-------------+------------+
        |            |             |             |            |
        v            v             v             v            v
  +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
  |  Node 1   | |  Node 2   | |  Node 3   | |  Node 4   | |  Node 5   |
  | Port 8001 | | Port 8002 | | Port 8003 | | Port 8004 | | Port 8005 |
  | Vol: /vol1| | Vol: /vol2| | Vol: /vol3| | Vol: /vol4| | Vol: /vol5|
  +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
```

---

## 3. Component Breakdown

### 3.1. Storage Nodes (5 Independent Processes)
* **Process Independence:** Each storage node runs in an isolated container or operating system process with a unique `NODE_ID` (`node-1` through `node-5`) and unique dedicated port (`8001` - `8005`).
* **Volume Isolation:** Nodes have zero shared disk dependencies. Each node mounts its own persistent storage directory (`NODE_DATA_DIR`).
* **Local Storage Engine:** Direct filesystem writes for raw chunks, utilizing atomic writes (`.tmp` write followed by rename) to prevent partial writes.
* **Local Index:** In-memory and on-disk catalog of stored chunk checksums, sizes, and timestamps.
* **Fault Management Module:** Software interceptor enabling simulated latency injection, process death, and controlled bit-rot corruption for testing resilience.

### 3.2. Coordinator Service
* **Role:** Single point of entry for clients, routing object writes/reads, coordinating quorum consensus, and conducting failure detection.
* **Health Supervisor:** Continuously polls all five storage nodes (`GET /health`) every 5 seconds, recording real network latency and disk utilization metrics.
* **WebSocket Event Hub:** Broadcaster maintaining active client connections and streaming events (`CLUSTER_HEARTBEAT`, `NODE_STATUS_CHANGED`, `REPLICA_REPAIRED`, etc.).
* **Metadata Database (SQLite):**
  * `storage_nodes`: Registered node topology, ports, health status, and last seen timestamps.
  * `objects`: Key, object size, full hash, creation timestamp.
  * `object_chunks`: Object-to-chunk mapping, sequence, chunk SHA-256 hash, and chunk size.
  * `chunk_replicas`: Node placements for each chunk with version numbers and validation status.

### 3.3. React Frontend Console
* **Aesthetic:** Modern, developer-focused dark infrastructure console (slate/zinc palette with cyan and emerald accents).
* **Sidebar Views:**
  * **Dashboard:** High-level cluster health, total capacity, average latency, and the 5 dynamic node cards.
  * **Nodes:** Comprehensive breakdown of process ports, disk capacity, uptime, and direct health checks.
  * **Objects (Phase 1):** Object browser, upload/download management, chunk layout visualizer.
  * **Replication (Phase 2):** Quorum configuration, replica distribution visualizer.
  * **Repair Center (Phase 3):** Live replica self-healing monitoring and background anti-entropy queues.
  * **Integrity (Phase 4):** Merkle tree verifier and scheduled bit-rot scrubbing dashboard.
  * **Fault Lab (Phase 5):** Chaos engineering interface to inject faults, kill nodes, and trigger split-brain partitions.
  * **Topology (Phase 5):** Graphical network mesh and latency matrix.
  * **Rebalancing (Phase 6):** Node addition/eviction chunk migration monitor.
  * **Events:** Live WebSocket stream viewer.
  * **Settings:** Quorum parameters and coordinator configuration.

---

## 4. Protocols & Communication

### 4.1. Coordinator REST Endpoints
* `GET /health`: Comprehensive coordinator health, active node count, and aggregate cluster state.
* `GET /nodes`: Real live health status of all five storage nodes, latency, and disk metrics.
* `GET /nodes/{node_id}`: Dedicated status for an individual node.
* `GET /events/history`: Recent buffer of system events.
* `GET /events/ws`: WebSocket endpoint for streaming real-time live events.

### 4.2. Storage Node REST Endpoints
* `GET /health`: Node status (`healthy`, `degraded`, `offline`), disk capacity (`total_bytes`, `used_bytes`, `free_bytes`), uptime, port, and stored object count.
* `GET /`: Basic node banner and identity.

---

## 5. Fault-Tolerance, Quorum, & Self-Healing Model

### 5.1. Quorum Consistency Model
* **Total Nodes ($N$):** 5
* **Replication Factor ($R$):** 3 (Every chunk stored on 3 distinct nodes)
* **Write Quorum ($W$):** 2 ($W > R / 2$ guarantees write overlap)
* **Read Quorum ($R_{read}$):** 2 ($W + R_{read} > R$ guarantees strong consistency)
* Fault tolerance: The system tolerates the simultaneous loss of 2 storage nodes while remaining fully operational for read and write operations.

### 5.2. Failure Detection & Heartbeats
* Coordinator sends async HTTP pings every 5 seconds with a 2.5-second timeout.
* If a node misses 2 consecutive checks, the coordinator marks it as `degraded` or `offline` and broadcasts a `NODE_STATUS_CHANGED` event via WebSocket.

### 5.3. Replica Repair & Integrity
* **Read-Repair:** When a read quorum encounters a stale or missing chunk replica, the coordinator asynchronously reconstructs and writes the latest version to the lagging node.
* **Integrity Validation:** Chunks are cryptographically verified against their SHA-256 hash upon read and during background scrubbing cycles.

---

## 6. Implementation Roadmap

| Phase | Title | Scope |
| :--- | :--- | :--- |
| **Phase 0** | **System Skeleton & Boot** | 5 nodes + coordinator + React UI + WebSocket + Docker stack boot (Current) |
| **Phase 1** | **Object Storage Engine** | Chunking, file writes/reads, SQLite metadata, object CRUD |
| **Phase 2** | **Quorum Replication** | Quorum write/read protocol ($R=3, W=2$), replica placement algorithm |
| **Phase 3** | **Self-Healing & Repair** | Failure detection, read-repair, automatic background reconstruction |
| **Phase 4** | **Integrity & Bit-Rot** | Cryptographic SHA-256 verification, scheduled scrubbing, corruption healer |
| **Phase 5** | **Chaos & Fault Lab** | Interactive node crashing, latency injection, network partition simulation |
| **Phase 6** | **Dynamic Rebalancing** | Dynamic node addition/removal, consistent hash ring data migration |
