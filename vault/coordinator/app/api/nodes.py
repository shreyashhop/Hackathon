import asyncio
import time
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
import httpx

from ..core.config import settings
from ..core.events import manager
from ..models import NodeStatus, CapacityInfo

router = APIRouter(prefix="/nodes", tags=["Storage Nodes"])

# Cached state of node statuses
NODE_CACHE: Dict[str, Dict[str, Any]] = {}


async def check_single_node(node_cfg: Dict[str, Any], client: httpx.AsyncClient) -> Dict[str, Any]:
    node_id = node_cfg["id"]
    url = f"{node_cfg['url']}/health"
    start_time = time.time()
    
    try:
        response = await client.get(url, timeout=2.5)
        latency = round((time.time() - start_time) * 1000, 2)
        
        if response.status_code == 200:
            data = response.json()
            node_state = {
                "node_id": node_id,
                "host": node_cfg["host"],
                "port": node_cfg["port"],
                "url": node_cfg["url"],
                "status": data.get("status", "healthy"),
                "latency_ms": latency,
                "capacity": data.get("capacity"),
                "uptime_seconds": data.get("uptime_seconds"),
                "objects_count": data.get("objects_count", 0),
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "error": None,
            }
            return node_state
        else:
            return {
                "node_id": node_id,
                "host": node_cfg["host"],
                "port": node_cfg["port"],
                "url": node_cfg["url"],
                "status": "degraded",
                "latency_ms": latency,
                "capacity": None,
                "uptime_seconds": None,
                "objects_count": 0,
                "last_seen": None,
                "error": f"HTTP {response.status_code}",
            }
    except Exception as e:
        latency = round((time.time() - start_time) * 1000, 2)
        return {
            "node_id": node_id,
            "host": node_cfg["host"],
            "port": node_cfg["port"],
            "url": node_cfg["url"],
            "status": "offline",
            "latency_ms": latency,
            "capacity": None,
            "uptime_seconds": None,
            "objects_count": 0,
            "last_seen": None,
            "error": str(e),
        }


from ..core.health_monitor import health_monitor

NODE_CACHE: Dict[str, Dict[str, Any]] = {}


async def check_all_nodes() -> List[Dict[str, Any]]:
    """Returns active state machine node records from health monitor."""
    return health_monitor.get_all_nodes()


@router.get("", response_model=List[Dict[str, Any]])
async def get_nodes():
    """Returns the real live health status of all five storage nodes."""
    return health_monitor.get_all_nodes()


@router.get("/{node_id}")
async def get_node(node_id: str):
    """Returns health status for a specific node."""
    node_rec = health_monitor.get_node(node_id)
    if not node_rec:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in cluster configuration")
    return node_rec
