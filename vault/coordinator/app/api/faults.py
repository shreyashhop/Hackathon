from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, status
import httpx

from ..core.config import settings
from ..core.health_monitor import health_monitor

router = APIRouter(prefix="/faults", tags=["Fault Simulation"])


def get_node_config(node_id: str) -> Dict[str, Any]:
    for n in settings.STORAGE_NODES:
        if n["id"] == node_id:
            return n
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Node {node_id} not found in cluster configuration"
    )


@router.post("/node/{node_id}/stop")
async def stop_node(node_id: str):
    """
    Controlled fault injection: Instructs a storage node to simulate being DOWN.
    The coordinator's health monitor will detect the failure on its next heartbeats.
    """
    node_cfg = get_node_config(node_id)
    url = f"{node_cfg['url']}/fault/stop"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.post(url)
            if res.status_code != 200:
                raise HTTPException(status_code=res.status_code, detail=f"Failed to inject fault on node {node_id}")
            return {
                "node_id": node_id,
                "action": "stop",
                "status": "fault_injected",
                "message": f"Node {node_id} has been stopped. The health monitor will transition it HEALTHY -> SUSPECT -> DOWN.",
            }
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach node {node_id}"
        )


@router.post("/node/{node_id}/recover")
async def recover_node(node_id: str):
    """
    Controlled fault recovery: Instructs a storage node to recover from failure.
    The coordinator's health monitor will detect recovery and transition it DOWN -> RECOVERING -> HEALTHY.
    """
    node_cfg = get_node_config(node_id)
    url = f"{node_cfg['url']}/fault/recover"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.post(url)
            if res.status_code != 200:
                raise HTTPException(status_code=res.status_code, detail=f"Failed to trigger recovery on node {node_id}")
            return {
                "node_id": node_id,
                "action": "recover",
                "status": "recovery_initiated",
                "message": f"Node {node_id} recovery triggered. The health monitor will transition it DOWN -> RECOVERING -> HEALTHY.",
            }
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach node {node_id}"
        )


@router.post("/node/{node_id}/partition")
async def partition_node(node_id: str):
    """
    Controlled fault injection: Instructs a storage node to simulate network partition / communication isolation.
    The coordinator's health monitor will detect the failure on its next heartbeats and transition HEALTHY -> SUSPECT -> PARTITIONED.
    """
    node_cfg = get_node_config(node_id)
    url = f"{node_cfg['url']}/fault/partition"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.post(url)
            if res.status_code != 200:
                raise HTTPException(status_code=res.status_code, detail=f"Failed to inject partition on node {node_id}")

            # Immediately update health monitor state
            await health_monitor.partition_node(node_id)

            return {
                "node_id": node_id,
                "action": "partition",
                "status": "partitioned",
                "message": f"Node {node_id} is now network-partitioned. Communication is isolated while the node stays alive.",
            }
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach node {node_id}"
        )


@router.post("/node/{node_id}/restore")
async def restore_partition(node_id: str):
    """
    Controlled fault recovery: Restores network communication for a partitioned storage node.
    Triggers reconciliation: detects missing, stale, or deleted replicas, restores RF=3, and returns node to HEALTHY.
    """
    get_node_config(node_id)
    await health_monitor.restore_node_partition(node_id)
    return {
        "node_id": node_id,
        "action": "restore",
        "status": "recovering",
        "message": f"Network communication to node {node_id} restored. Reconciliation initiated (RECOVERING -> HEALTHY).",
    }


@router.get("")
async def get_faults_summary():
    """Returns cluster nodes with their current simulation and health states."""
    nodes = health_monitor.get_all_nodes()
    return {
        "nodes": [
            {
                "node_id": n["node_id"],
                "status": n["status"],
                "failed_heartbeats": n["failed_heartbeats"],
                "is_partitioned": health_monitor.is_node_partitioned(n["node_id"]),
                "error": n["error"],
            }
            for n in nodes
        ]
    }


@router.post("/corruption/{object_id}/{node_id}")
@router.post("/corrupt/{object_id}/{node_id}")
@router.post("/replica/{object_id}/{node_id}/corrupt")
async def inject_corruption(object_id: str, node_id: str):
    """
    Controlled fault injection: Deterministically corrupts physical bytes of an object replica
    on a specific storage node without marking the node DOWN.
    """
    from ..db.database import db

    # 1. Validate object exists
    obj = db.get_object(object_id)
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object {object_id} not found in catalog"
        )

    # 2. Validate node exists in cluster
    node_cfg = get_node_config(node_id)

    # 3. Validate replica exists on node
    replicas = db.get_replicas_for_object(object_id)
    replica = next((r for r in replicas if r["node_id"] == node_id), None)
    if not replica:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Node {node_id} does not host a replica for object {object_id}"
        )

    if replica["status"] != "STORED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Replica on {node_id} is not in STORED state (current: {replica['status']})"
        )

    # 4. Instruct storage node to corrupt physical bytes
    url = f"{node_cfg['url']}/fault/corrupt/{object_id}"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.post(url)
            if res.status_code != 200:
                raise HTTPException(
                    status_code=res.status_code,
                    detail=f"Storage node failed to corrupt object: {res.text}"
                )
            corrupt_data = res.json()
            return {
                "object_id": object_id,
                "node_id": node_id,
                "action": "corrupt",
                "status": "corrupted",
                "original_sha256": obj["sha256"],
                "corrupted_sha256": corrupt_data.get("sha256"),
                "size_bytes": corrupt_data.get("size_bytes"),
                "message": f"Physical bytes on {node_id} modified. Node remains HEALTHY.",
            }
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach node {node_id}"
        )
