import os
import time
import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.events import manager
from .core.health_monitor import health_monitor
from .core.repair_manager import repair_mgr
from .core.integrity_scanner import integrity_scanner
from .api.nodes import router as nodes_router, check_all_nodes
from .api.events import router as events_router
from .api.objects import router as objects_router
from .api.replication import router as replication_router
from .api.faults import router as faults_router
from .api.repair import router as repair_router
from .api.integrity import router as integrity_router
from .db.database import db

START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Coordinator] Initializing Vault Distributed Object Storage Coordinator...")
    print(f"[Coordinator] Configured storage nodes: {[n['id'] for n in settings.STORAGE_NODES]}")
    # Start active health monitor, repair worker, and integrity scanner
    health_monitor.start()
    repair_mgr.start()
    integrity_scanner.start()
    yield
    print("[Coordinator] Shutting down...")
    await health_monitor.stop()
    await repair_mgr.stop()
    await integrity_scanner.stop()


app = FastAPI(
    title="Vault Coordinator",
    description="Coordinator for Vault Distributed Fault-Tolerant Object Storage",
    version="0.1.0",
    lifespan=lifespan,
)

# Enable CORS for frontend and external clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(nodes_router)
app.include_router(events_router)
app.include_router(objects_router)
app.include_router(replication_router)
app.include_router(faults_router)
app.include_router(repair_router)
app.include_router(integrity_router)


@app.get("/")
def root():
    return {
        "service": "Vault Distributed Object Storage Coordinator",
        "version": "0.1.0",
        "status": "online",
        "docs_url": "/docs",
    }


@app.get("/health")
async def health():
    nodes = await check_all_nodes()
    healthy_count = sum(1 for n in nodes if n["status"].lower() == "healthy")
    uptime = round(time.time() - START_TIME, 2)

    return {
        "service": "Vault Coordinator",
        "status": "healthy",
        "version": "0.1.0",
        "uptime_seconds": uptime,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "nodes_total": len(nodes),
        "nodes_healthy": healthy_count,
        "cluster_state": "HEALTHY" if healthy_count == len(nodes) else ("DEGRADED" if healthy_count > 0 else "CRITICAL"),
        "nodes": nodes,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.COORDINATOR_HOST, port=settings.COORDINATOR_PORT, reload=False)
