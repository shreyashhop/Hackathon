import os
import time
import asyncio
import traceback
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel

from .store import LocalStore
from .fault import FaultManager
from .local_index import LocalIndex

# Environment configuration
NODE_ID = os.getenv("NODE_ID", "node-1")
NODE_PORT = int(os.getenv("NODE_PORT", "8001"))
NODE_DATA_DIR = os.getenv("NODE_DATA_DIR", f"./data/{NODE_ID}")

# Core services
store = LocalStore(NODE_DATA_DIR)
fault_mgr = FaultManager(NODE_ID)
local_index = LocalIndex(NODE_ID, NODE_DATA_DIR)

START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure data directory and objects subdirectory exist
    os.makedirs(os.path.join(NODE_DATA_DIR, "objects"), exist_ok=True)
    print(f"[{NODE_ID}] Storage node initialized on port {NODE_PORT}")
    print(f"[{NODE_ID}] Storage directory: {os.path.abspath(NODE_DATA_DIR)}")
    yield
    print(f"[{NODE_ID}] Storage node shutting down")


# CORS — restricted to coordinator and frontend origins
_CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000",
).split(",")


class StorageSecurityHeaders(BaseHTTPMiddleware):
    """Adds security-related HTTP headers to every storage node response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cache-Control"] = "no-store"
        if "Server" in response.headers:
            del response.headers["Server"]
        return response


app = FastAPI(
    title=f"Vault Storage Node ({NODE_ID})",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,   # No docs exposure on storage nodes
    redoc_url=None,
)

# Security headers
app.add_middleware(StorageSecurityHeaders)

# Enable CORS for coordinator interactions
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)


# ---------- Global Exception Handler — prevent info leakage ----------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler that prevents internal details from leaking."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred."},
    )


@app.middleware("http")
async def network_partition_middleware(request: Request, call_next):
    # Allow partition control endpoints and fault inspection so state can be restored/queried
    if request.url.path in ("/fault/partition", "/fault/unpartition", "/fault/restore", "/fault"):
        return await call_next(request)

    if fault_mgr.is_partitioned:
        # A network-partitioned node drops/delays external communication
        # Delaying past coordinator's timeout (1-2s) causes real TimeoutException
        await asyncio.sleep(4.0)
        return Response(content=f"Network partition: host {NODE_ID} unreachable", status_code=status.HTTP_504_GATEWAY_TIMEOUT)

    return await call_next(request)


@app.get("/")
def root():
    return {
        "service": "Vault Storage Node",
        "node_id": NODE_ID,
        "status": "online",
        "port": NODE_PORT,
    }


@app.get("/health")
def health():
    if fault_mgr.is_down:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Node {NODE_ID} is simulated DOWN"
        )
    capacity = store.get_capacity()
    uptime = round(time.time() - START_TIME, 2)
    objects_count = store.count_objects()

    return {
        "node_id": NODE_ID,
        "status": "healthy",
        "port": NODE_PORT,
        "uptime_seconds": uptime,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "capacity": capacity,
        "objects_count": objects_count,
        "fault": fault_mgr.get_status(),
    }


# ============================================================
# PHASE 1: Real Object Storage Operations
# ============================================================

@app.put("/store/{object_id}")
async def store_object(object_id: str, request: Request):
    """Stores physical object bytes on this storage node."""
    if fault_mgr.is_down:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Node {NODE_ID} is simulated DOWN")
    try:
        data = await request.body()
        result = store.store_object(object_id, data)
        return {
            "node_id": NODE_ID,
            "object_id": object_id,
            "size_bytes": result["size_bytes"],
            "sha256": result["sha256"],
            "status": "stored",
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to write object"
        )


@app.get("/retrieve/{object_id}")
async def retrieve_object(object_id: str):
    """Retrieves physical object bytes from this storage node."""
    if fault_mgr.is_down:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Node {NODE_ID} is simulated DOWN")
    try:
        data = store.retrieve_object(object_id)
        if data is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Object {object_id} not found on {NODE_ID}")
        return Response(content=data, media_type="application/octet-stream")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal storage error")


@app.delete("/delete/{object_id}")
async def delete_object(object_id: str):
    """Deletes physical object file from this storage node."""
    if fault_mgr.is_down:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Node {NODE_ID} is simulated DOWN")
    try:
        success = store.delete_object(object_id)
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Object {object_id} not found on {NODE_ID}")
        return {
            "node_id": NODE_ID,
            "object_id": object_id,
            "status": "deleted",
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal storage error")


@app.get("/checksum/{object_id}")
async def get_checksum(object_id: str):
    """Calculates and returns sha256 checksum and size for a stored object."""
    if fault_mgr.is_down:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Node {NODE_ID} is simulated DOWN")
    try:
        chk = store.get_checksum(object_id)
        if chk is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Object {object_id} not found on {NODE_ID}")
        return {
            "node_id": NODE_ID,
            **chk,
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal storage error")


@app.get("/manifest")
async def get_manifest():
    """Returns physical object manifest stored on this node."""
    if fault_mgr.is_down:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Node {NODE_ID} is simulated DOWN")
    return {
        "node_id": NODE_ID,
        "items": store.list_manifest(),
        "count": store.count_objects(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/fault/stop")
async def fault_stop():
    """Simulates node stopping for fault injection."""
    fault_mgr.stop()
    return {"node_id": NODE_ID, "status": "stopped", "is_down": True}


@app.post("/fault/recover")
async def fault_recover():
    """Simulates node recovery from failure."""
    fault_mgr.recover()
    return {"node_id": NODE_ID, "status": "recovered", "is_down": False}


@app.post("/fault/corrupt/{object_id}")
async def fault_corrupt(object_id: str):
    """Deterministically corrupts physical bytes of an object while node stays healthy."""
    if fault_mgr.is_down:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Node {NODE_ID} is simulated DOWN"
        )
    try:
        res = store.corrupt_object(object_id)
        return {
            "node_id": NODE_ID,
            "status": "corrupted",
            **res,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found on node")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Corruption operation failed")


@app.post("/fault/partition")
async def fault_partition():
    """Simulates network partition / communication isolation."""
    fault_mgr.partition()
    return {"node_id": NODE_ID, "status": "partitioned", "is_partitioned": True}


@app.post("/fault/restore")
@app.post("/fault/unpartition")
async def fault_restore():
    """Restores network communication from partition."""
    fault_mgr.unpartition()
    return {"node_id": NODE_ID, "status": "restored", "is_partitioned": False}


@app.get("/fault")
async def fault_status():
    """Returns current simulated fault status."""
    return fault_mgr.get_status()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=NODE_PORT, reload=False)
