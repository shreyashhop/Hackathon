import os
import uuid
import hashlib
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response, status
import httpx

from ..core.config import settings
from ..core.events import manager
from ..core.replication import select_replica_nodes
from ..db.database import db
from .nodes import check_all_nodes

router = APIRouter(prefix="/objects", tags=["Object Storage"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_object(
    file: UploadFile = File(...),
    object_id: Optional[str] = Form(None)
):
    """
    Phase 2 Real Distributed Replication with Quorum (W=2, RF=3):
    1. Read and calculate SHA-256 of uploaded bytes.
    2. Select RF (3) healthy storage nodes using Rendezvous Hashing (HRW).
    3. Initialize replica metadata with status PENDING.
    4. Concurrently transmit physical bytes to all selected replica nodes.
    5. Each node writes to its filesystem and returns SHA-256 & size.
    6. Coordinator verifies returned checksum and size for every replica.
    7. Evaluates Write Quorum (W=2):
       - If success_count >= W: upload succeeds (stored if 3/3, degraded if 2/3).
       - If success_count < W: write quorum failed (HTTP 500/503).
    8. Broadcasts replication events over WebSocket.
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File or filename is required"
        )

    safe_filename = os.path.basename(file.filename)
    if not safe_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename"
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot upload an empty (0 byte) file"
        )

    size_bytes = len(content)
    sha256_hash = hashlib.sha256(content).hexdigest()
    if not object_id:
        object_id = str(uuid.uuid4())
    content_type = file.content_type or "application/octet-stream"

    rf = settings.REPLICATION_FACTOR
    w_quorum = settings.WRITE_QUORUM

    from ..core.health_monitor import health_monitor

    # 1. Check node health and identify eligible nodes
    try:
        nodes = await check_all_nodes()
        # Candidate nodes for HRW placement include healthy and partitioned nodes (excluding DOWN nodes)
        candidate_nodes = [n for n in nodes if str(n.get("status", "")).lower() != "down"]
        healthy_nodes = [n for n in nodes if str(n.get("status", "")).lower() == "healthy"]
    except Exception as e:
        await manager.broadcast("OBJECT_OPERATION_FAILED", {
            "operation": "upload",
            "object_id": object_id,
            "error": f"Failed checking cluster nodes: {str(e)}",
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query cluster storage nodes: {str(e)}"
        )

    # Validate quorum feasibility: at least w_quorum reachable healthy nodes required
    if len(healthy_nodes) < w_quorum:
        err_msg = (
            f"Insufficient healthy nodes: only {len(healthy_nodes)} healthy, "
            f"minimum write quorum W={w_quorum} required"
        )
        await manager.broadcast("WRITE_QUORUM_FAILED", {
            "object_id": object_id,
            "healthy_nodes": len(healthy_nodes),
            "write_quorum": w_quorum,
            "error": err_msg,
        })
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=err_msg
        )

    # 2. Select replica nodes using deterministic Rendezvous Hashing (HRW)
    selected_nodes = select_replica_nodes(object_id, candidate_nodes, rf)
    selected_node_ids = [n["node_id"] for n in selected_nodes]

    # Emit starting events
    await manager.broadcast("OBJECT_UPLOAD_STARTED", {
        "object_id": object_id,
        "object_name": safe_filename,
        "size_bytes": size_bytes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    await manager.broadcast("REPLICATION_STARTED", {
        "object_id": object_id,
        "object_name": safe_filename,
        "size_bytes": size_bytes,
        "replication_factor": len(selected_nodes),
        "write_quorum": w_quorum,
        "replica_nodes": selected_node_ids,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # 3. Create initial object metadata in SQLite database
    primary_node_id = selected_nodes[0]["node_id"] if selected_nodes else ""
    db.insert_object({
        "object_id": object_id,
        "object_name": safe_filename,
        "size_bytes": size_bytes,
        "content_type": content_type,
        "sha256": sha256_hash,
        "storage_node_id": primary_node_id,
        "status": "pending",
    })

    # 4. Create replica records in PENDING state
    for node in selected_nodes:
        nid = node["node_id"]
        db.insert_replica({
            "object_id": object_id,
            "node_id": nid,
            "status": "PENDING",
            "size_bytes": size_bytes,
            "sha256": sha256_hash,
        })

    # 5. Concurrently write bytes to all selected replica nodes
    async def write_to_replica(node: Dict[str, Any], client: httpx.AsyncClient) -> Dict[str, Any]:
        nid = node["node_id"]
        url = node["url"]
        is_node_part = health_monitor.is_node_partitioned(nid)
        await manager.broadcast("REPLICA_WRITE_STARTED", {
            "object_id": object_id,
            "node_id": nid,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        try:
            resp = await client.put(f"{url}/store/{object_id}", content=content, timeout=2.5)
            if resp.status_code != 200:
                err = f"HTTP {resp.status_code}: {resp.text}"
                target_status = "PARTITIONED" if is_node_part or resp.status_code == 504 else "FAILED"
                db.update_replica_status(object_id, nid, target_status)
                if target_status == "PARTITIONED":
                    await manager.broadcast("PARTITION_REQUEST_FAILED", {
                        "object_id": object_id,
                        "node_id": nid,
                        "operation": "write",
                        "error": err,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                await manager.broadcast("REPLICA_WRITE_FAILED", {
                    "object_id": object_id,
                    "node_id": nid,
                    "error": err,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                return {"node_id": nid, "success": False, "error": err, "is_partitioned": (target_status == "PARTITIONED")}

            node_data = resp.json()
            returned_sha = node_data.get("sha256")
            returned_size = node_data.get("size_bytes")

            # Verify size and checksum
            if returned_sha != sha256_hash or returned_size != size_bytes:
                err = f"Checksum or size mismatch from {nid} (got sha={returned_sha}, size={returned_size})"
                db.update_replica_status(object_id, nid, "FAILED")
                try:
                    await client.delete(f"{url}/delete/{object_id}", timeout=2.5)
                except Exception:
                    pass
                await manager.broadcast("REPLICA_WRITE_FAILED", {
                    "object_id": object_id,
                    "node_id": nid,
                    "error": err,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                return {"node_id": nid, "success": False, "error": err, "is_partitioned": False}

            # Mark replica as STORED
            db.update_replica_status(object_id, nid, "STORED", size_bytes, sha256_hash)
            await manager.broadcast("REPLICA_STORED", {
                "object_id": object_id,
                "node_id": nid,
                "size_bytes": size_bytes,
                "sha256": sha256_hash,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return {"node_id": nid, "success": True, "size_bytes": size_bytes, "sha256": sha256_hash, "is_partitioned": False}

        except Exception as exc:
            err = str(exc)
            target_status = "PARTITIONED" if is_node_part or "timed out" in err.lower() or "504" in err else "FAILED"
            db.update_replica_status(object_id, nid, target_status)
            if target_status == "PARTITIONED":
                await manager.broadcast("PARTITION_REQUEST_FAILED", {
                    "object_id": object_id,
                    "node_id": nid,
                    "operation": "write",
                    "error": err,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            await manager.broadcast("REPLICA_WRITE_FAILED", {
                "object_id": object_id,
                "node_id": nid,
                "error": err,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return {"node_id": nid, "success": False, "error": err, "is_partitioned": (target_status == "PARTITIONED")}

    async with httpx.AsyncClient(timeout=30.0) as client:
        write_tasks = [write_to_replica(node, client) for node in selected_nodes]
        replica_results = await asyncio.gather(*write_tasks, return_exceptions=False)

    # 6. Evaluate Write Quorum
    successful_replicas = [r["node_id"] for r in replica_results if r.get("success")]
    success_count = len(successful_replicas)
    target_count = len(selected_nodes)

    if success_count >= w_quorum:
        # Quorum satisfied!
        await manager.broadcast("WRITE_QUORUM_SATISFIED", {
            "object_id": object_id,
            "stored_replicas": success_count,
            "replication_factor": target_count,
            "write_quorum": w_quorum,
            "successful_nodes": successful_replicas,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Check if any partitioned node missed the write
        partitioned_failed = [r["node_id"] for r in replica_results if r.get("is_partitioned")]
        if partitioned_failed:
            await manager.broadcast("PARTITIONED_WRITE", {
                "object_id": object_id,
                "partitioned_node_id": partitioned_failed[0],
                "partitioned_nodes": partitioned_failed,
                "successful_replicas": success_count,
                "write_quorum": w_quorum,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        final_status = "stored" if success_count == target_count else "degraded"
        db.update_object_status(object_id, final_status)

        await manager.broadcast("REPLICATION_COMPLETED", {
            "object_id": object_id,
            "object_name": safe_filename,
            "status": final_status,
            "stored_replicas": success_count,
            "replication_factor": target_count,
            "write_quorum": w_quorum,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        saved_meta = db.get_object(object_id)
        if saved_meta:
            saved_meta["replication_factor"] = target_count
            saved_meta["stored_replicas"] = success_count
            saved_meta["write_quorum"] = w_quorum
            saved_meta["quorum_satisfied"] = True
        return saved_meta
    else:
        # Write Quorum Failed
        db.update_object_status(object_id, "failed")
        err_msg = (
            f"Write quorum failed: only {success_count} of {w_quorum} required replicas succeeded "
            f"(target RF={target_count})"
        )
        await manager.broadcast("WRITE_QUORUM_FAILED", {
            "object_id": object_id,
            "stored_replicas": success_count,
            "replication_factor": target_count,
            "write_quorum": w_quorum,
            "error": err_msg,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=err_msg
        )


@router.get("", response_model=List[Dict[str, Any]])
async def list_objects():
    """Returns list of real object metadata including replica details from catalog."""
    return db.list_objects()


@router.get("/{object_id}", response_model=Dict[str, Any])
async def get_object_metadata(object_id: str):
    """Returns metadata for a specific object including all replicas."""
    obj = db.get_object(object_id)
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object {object_id} not found"
        )
    return obj


@router.get("/{object_id}/replicas", response_model=Dict[str, Any])
async def get_object_replicas(object_id: str):
    """
    Returns replica topology, quorum parameters, and replica statuses for an object.
    """
    obj = db.get_object(object_id)
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object {object_id} not found"
        )

    replicas = db.get_replicas_for_object(object_id)
    stored_count = sum(1 for r in replicas if r["status"] == "STORED")

    return {
        "object_id": object_id,
        "object_name": obj["object_name"],
        "replication_factor": settings.REPLICATION_FACTOR,
        "write_quorum": settings.WRITE_QUORUM,
        "stored_replicas": stored_count,
        "total_replicas": len(replicas),
        "status": obj["status"],
        "sha256": obj["sha256"],
        "size_bytes": obj["size_bytes"],
        "replicas": replicas,
    }


@router.get("/{object_id}/download")
async def download_object(object_id: str):
    """
    Phase 2 Replica-Aware Read / Download:
    1. Look up object and all replica records with status STORED.
    2. Try downloading from an available STORED replica.
    3. Verify returned SHA-256 against catalog.
    4. If a replica fails checksum or network, emit REPLICA_READ_FAILED, mark FAILED,
       and try another STORED replica.
    5. Return valid bytes upon success.
    """
    obj = db.get_object(object_id)
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object {object_id} not found"
        )

    replicas = db.get_replicas_for_object(object_id)
    stored_replicas = [r for r in replicas if r["status"] == "STORED"]

    # Backward compatibility with Phase 1 single-node objects
    if not stored_replicas and obj.get("storage_node_id"):
        stored_replicas = [{"node_id": obj["storage_node_id"]}]

    if not stored_replicas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No stored replicas available for object {object_id}"
        )

    # Prioritize replicas on currently HEALTHY nodes to ensure sub-millisecond failover
    from ..core.health_monitor import health_monitor
    healthy_node_ids = set(health_monitor.get_healthy_node_ids())
    stored_replicas.sort(key=lambda r: 0 if r["node_id"] in healthy_node_ids else 1)

    # Check for any replica on a partitioned node
    all_obj_reps = db.get_replicas_for_object(object_id)
    partitioned_reps = [
        r for r in all_obj_reps
        if r.get("status") == "PARTITIONED" or health_monitor.is_node_partitioned(r["node_id"])
    ]

    node_dict = {n["id"]: n for n in settings.STORAGE_NODES}
    download_errors = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for rep in stored_replicas:
            nid = rep["node_id"]
            node_cfg = node_dict.get(nid)
            if not node_cfg:
                continue

            try:
                resp = await client.get(f"{node_cfg['url']}/retrieve/{object_id}", timeout=2.5)
                if resp.status_code == 404:
                    err = f"Physical file missing on {nid}"
                    db.update_replica_status(object_id, nid, "FAILED")
                    await manager.broadcast("REPLICA_READ_FAILED", {
                        "object_id": object_id,
                        "node_id": nid,
                        "error": err,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    download_errors.append(err)
                    continue

                if resp.status_code != 200:
                    err = f"Storage node {nid} returned HTTP {resp.status_code}"
                    if health_monitor.is_node_partitioned(nid) or resp.status_code == 504:
                        await manager.broadcast("PARTITION_REQUEST_FAILED", {
                            "object_id": object_id,
                            "node_id": nid,
                            "operation": "read",
                            "error": err,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                    download_errors.append(err)
                    continue

                data = resp.content
                download_sha = hashlib.sha256(data).hexdigest()

                # Verify SHA-256 integrity
                if download_sha != obj["sha256"]:
                    err = f"Checksum mismatch on replica {nid}: expected {obj['sha256']}, got {download_sha}"
                    # Mark replica CORRUPT in database
                    db.update_replica_status(object_id, nid, "CORRUPT")
                    # Emit REPLICA_CORRUPT and INTEGRITY_CHECK_FAILED events
                    await manager.broadcast("REPLICA_CORRUPT", {
                        "object_id": object_id,
                        "object_name": obj["object_name"],
                        "node_id": nid,
                        "expected_sha": obj["sha256"],
                        "actual_sha": download_sha,
                        "detected_during": "read",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    await manager.broadcast("INTEGRITY_CHECK_FAILED", {
                        "object_id": object_id,
                        "node_id": nid,
                        "expected_sha": obj["sha256"],
                        "actual_sha": download_sha,
                        "error": err,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    await manager.broadcast("REPLICA_READ_FAILED", {
                        "object_id": object_id,
                        "node_id": nid,
                        "error": err,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    # Asynchronously trigger corruption repair without blocking read
                    from ..core.repair_manager import repair_mgr
                    asyncio.create_task(repair_mgr.trigger_corruption_repair(object_id, nid))
                    download_errors.append(err)
                    # Try next stored replica
                    continue

                # Valid replica read succeeded!
                if partitioned_reps and nid not in [p["node_id"] for p in partitioned_reps]:
                    await manager.broadcast("PARTITIONED_READ_FAILOVER", {
                        "object_id": object_id,
                        "partitioned_node_id": partitioned_reps[0]["node_id"],
                        "served_by_node_id": nid,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                await manager.broadcast("REPLICA_READ", {
                    "object_id": object_id,
                    "node_id": nid,
                    "size_bytes": len(data),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                await manager.broadcast("OBJECT_DOWNLOAD", {
                    "object_id": object_id,
                    "object_name": obj["object_name"],
                    "serving_node_id": nid,
                    "size_bytes": len(data),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

                return Response(
                    content=data,
                    media_type=obj.get("content_type", "application/octet-stream"),
                    headers={
                        "Content-Disposition": f'attachment; filename="{obj["object_name"]}"',
                        "Content-Length": str(len(data)),
                        "X-Vault-Sha256": obj["sha256"],
                        "X-Vault-Serving-Node": nid,
                        "X-Vault-Replica-Node": nid,
                    }
                )

            except Exception as exc:
                err = str(exc)
                if health_monitor.is_node_partitioned(nid) or "timed out" in err.lower() or "504" in err:
                    await manager.broadcast("PARTITION_REQUEST_FAILED", {
                        "object_id": object_id,
                        "node_id": nid,
                        "operation": "read",
                        "error": err,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                download_errors.append(err)
                continue

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"All stored replicas failed during download: {'; '.join(download_errors)}"
    )


@router.delete("/{object_id}")
async def delete_object(object_id: str):
    """
    Phase 2 Replica-Aware Delete:
    1. Concurrently deletes physical file on all known replica nodes.
    2. Deletes replica records and object metadata from SQLite catalog.
    3. Emits REPLICA_DELETE and OBJECT_DELETED events.
    """
    obj = db.get_object(object_id)
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object {object_id} not found"
        )

    replicas = db.get_replicas_for_object(object_id)
    node_dict = {n["id"]: n for n in settings.STORAGE_NODES}

    # Identify all nodes holding replicas
    target_nodes = []
    for r in replicas:
        n_cfg = node_dict.get(r["node_id"])
        if n_cfg and n_cfg not in target_nodes:
            target_nodes.append(n_cfg)

    # Backward compatibility with Phase 1
    if not target_nodes and obj.get("storage_node_id"):
        n_cfg = node_dict.get(obj["storage_node_id"])
        if n_cfg:
            target_nodes.append(n_cfg)

    async def delete_from_node(node: Dict[str, Any], client: httpx.AsyncClient):
        nid = node["id"]
        try:
            await client.delete(f"{node['url']}/delete/{object_id}", timeout=2.5)
            await manager.broadcast("REPLICA_DELETE", {
                "object_id": object_id,
                "node_id": nid,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:
            print(f"[Coordinator] Warning: Could not delete replica from {nid}: {exc}")
            from ..core.health_monitor import health_monitor
            if health_monitor.is_node_partitioned(nid):
                await manager.broadcast("PARTITION_REQUEST_FAILED", {
                    "object_id": object_id,
                    "node_id": nid,
                    "operation": "delete",
                    "error": str(exc),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    if target_nodes:
        async with httpx.AsyncClient(timeout=10.0) as client:
            del_tasks = [delete_from_node(n, client) for n in target_nodes]
            await asyncio.gather(*del_tasks, return_exceptions=True)

    # Remove metadata
    db.delete_object(object_id)

    await manager.broadcast("OBJECT_DELETED", {
        "object_id": object_id,
        "object_name": obj["object_name"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "status": "deleted",
        "object_id": object_id,
        "object_name": obj["object_name"],
        "deleted_replicas": len(target_nodes),
    }


# ============================================================
# Replication Summary Endpoint
# ============================================================

@router.get("/replication/summary")
async def get_replication_summary():
    """Returns cluster replication summary and node replica distribution."""
    return db.get_replication_summary(settings.REPLICATION_FACTOR, settings.WRITE_QUORUM)
