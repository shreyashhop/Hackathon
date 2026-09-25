# Vault — Distributed Fault-Tolerant Object Storage

Vault is a real fault-tolerant distributed object-storage web application. It features a decentralized storage mesh with 5 independent storage nodes, an orchestrating FastAPI coordinator with SQLite metadata tracking, real-time WebSocket live events, and a React + Vite infrastructure management console.

---

## Architecture Overview (Phase 0)

```
vault/
├── docker-compose.yml
├── README.md
├── VAULT_DESIGN.md
│
├── coordinator/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── nodes.py
│   │   │   └── events.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── events.py
│   │   ├── db/
│   │   │   └── database.py
│   │   └── models.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── storage_node/
│   ├── app/
│   │   ├── main.py
│   │   ├── store.py
│   │   ├── fault.py
│   │   └── local_index.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   └── Sidebar.jsx
│   │   ├── views/
│   │   │   ├── DashboardView.jsx
│   │   │   ├── NodesView.jsx
│   │   │   ├── EventsView.jsx
│   │   │   └── PlaceholderView.jsx
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   ├── Dockerfile
│   └── index.html
│
└── data/
```

---

## Services & Ports

| Service | Port | Description |
| :--- | :--- | :--- |
| **coordinator** | `8000` | REST API, node health supervisor, WebSocket live events hub |
| **node-1** | `8001` | Storage node 1 (dedicated persistent volume) |
| **node-2** | `8002` | Storage node 2 (dedicated persistent volume) |
| **node-3** | `8003` | Storage node 3 (dedicated persistent volume) |
| **node-4** | `8004` | Storage node 4 (dedicated persistent volume) |
| **node-5** | `8005` | Storage node 5 (dedicated persistent volume) |
| **frontend** | `3000` | React + Vite Cloud Console UI |

---

## Quickstart Guide

### Option 1: Running with Docker Compose (Standard)

From the `vault/` directory:

```bash
# 1. Build the containers
docker compose build

# 2. Start all 7 services
docker compose up
```

All 7 containers (`vault-coordinator`, `vault-node-1` through `vault-node-5`, and `vault-frontend`) will start up.

### Option 2: Running Locally (Fast Native Verification)

You can launch all 7 services directly on your host machine:

```bash
# In vault directory:
python run_local.py
```

This starts:
* Coordinator on `http://localhost:8000`
* Storage nodes on ports `8001`, `8002`, `8003`, `8004`, `8005`
* Frontend dev server on `http://localhost:3000`

---

## API Endpoints

### Coordinator (`http://localhost:8000`)
* `GET /health`: Cluster health, active node count, uptime, and node overview.
* `GET /nodes`: Live health check and capacity statistics of all 5 storage nodes.
* `GET /nodes/{node_id}`: Health status of a specific storage node.
* `GET /events/history`: Recent event log buffer.
* `WS /events/ws`: Real-time WebSocket event stream (`CLUSTER_HEARTBEAT`, `NODE_STATUS_CHANGED`, `SYSTEM_CONNECTED`).

### Storage Nodes (`http://localhost:8001` - `8005`)
* `GET /health`: Node ID, process status (`healthy`), real volume capacity (total, used, free GB), uptime, and stored object count.
* `GET /`: Service banner.

---

## Frontend Console Features
* **Sidebar Navigation:** Complete set of 11 views (Dashboard, Objects, Nodes, Replication, Repair Center, Integrity, Fault Lab, Topology, Rebalancing, Events, Settings).
* **System Dashboard:** Live cluster status, capacity meters, average ping latency, and 5 interactive node cards displaying real status from the coordinator.
* **Nodes View:** Deep-dive into each storage process, port mappings, and disk utilization.
* **WebSocket Integration:** Real-time event log with pulse indicators and auto-reconnect.
