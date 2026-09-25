from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class CapacityInfo(BaseModel):
    total_bytes: int = 0
    used_bytes: int = 0
    free_bytes: int = 0
    total_gb: float = 0.0
    used_gb: float = 0.0
    free_gb: float = 0.0
    usage_percent: float = 0.0
    error: Optional[str] = None


class NodeStatus(BaseModel):
    node_id: str
    host: str
    port: int
    url: str
    status: str = "unknown"  # healthy, degraded, offline, unknown
    latency_ms: Optional[float] = None
    capacity: Optional[CapacityInfo] = None
    uptime_seconds: Optional[float] = None
    objects_count: int = 0
    last_seen: Optional[str] = None
    error: Optional[str] = None


class CoordinatorHealth(BaseModel):
    service: str = "Vault Coordinator"
    status: str = "healthy"
    version: str = "0.1.0"
    uptime_seconds: float
    timestamp: str
    nodes_total: int
    nodes_healthy: int
    nodes: List[Dict[str, Any]]


class EventMessage(BaseModel):
    event_type: str
    timestamp: str
    data: Dict[str, Any]
