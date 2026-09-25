import asyncio
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import httpx

from .config import settings
from .events import manager
from .replication import compute_hrw_score
from ..db.database import db

MAX_CONCURRENT_REPAIRS = 3


class RepairManager:
    """
    Asynchronous replica repair engine with bounded worker concurrency.
    Detects under-replicated objects, deterministically selects targets,
    transfers real physical bytes, and cryptographically verifies replicas.
    """

    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_REPAIRS)
        self._worker_task: Optional[asyncio.Task] = None
        self._node_health_getter = None

    def set_node_health_getter(self, getter_func):
        """Injects callable that returns mapping of node_id -> status dict."""
        self._node_health_getter = getter_func

    def start(self):
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker_loop())
            print("[RepairManager] Background worker started (max concurrency: 3)")

    async def stop(self):
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None

    def get_node_states(self) -> Dict[str, str]:
        if self._node_health_getter:
            nodes = self._node_health_getter()
            return {n["node_id"]: n["status"] for n in nodes}
        return {f"node-{i}": "HEALTHY" for i in range(1, 6)}

    async def trigger_repairs_for_node(self, failed_node_id: str):
        """
        Triggered when a storage node is marked DOWN.
        Scans all objects hosted on that node and enqueues repairs if healthy replicas < RF.
        """
        print(f"[RepairManager] Triggering repairs for failed node: {failed_node_id}")
        affected_replicas = db.get_replicas_for_node(failed_node_id)
        node_states = self.get_node_states()

        for rep in affected_replicas:
            oid = rep["object_id"]
            all_reps = db.get_replicas_for_object(oid)
            obj = db.get_object(oid)
            if not obj:
                continue

            # Count healthy replicas (replica status == STORED and node status == HEALTHY)
            healthy_sources = [
                r for r in all_reps
                if r["status"] == "STORED" and node_states.get(r["node_id"]) == "HEALTHY"
            ]

            # Emit REPLICA_AT_RISK event
            await manager.broadcast("REPLICA_AT_RISK", {
                "object_id": oid,
                "object_name": obj["object_name"],
                "failed_node_id": failed_node_id,
                "healthy_replicas": len(healthy_sources),
                "replication_factor": settings.REPLICATION_FACTOR,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            # Check if repair is required
            if len(healthy_sources) < settings.REPLICATION_FACTOR:
                # Check idempotency: is there already an active repair for this object?
                active_job = db.get_active_repair_for_object(oid)
                if active_job:
                    print(f"[RepairManager] Object {oid} already has active repair {active_job['job_id']}. Skipping.")
                    continue

                if not healthy_sources:
                    print(f"[RepairManager] CRITICAL: Object {oid} has 0 healthy replicas. Cannot repair.")
                    continue

                source_node = healthy_sources[0]["node_id"]

                # Find eligible target node:
                # 1. Node status is HEALTHY
                # 2. Node is not currently storing a replica of this object
                # 3. Node is not the failed node
                existing_nodes = {r["node_id"] for r in all_reps if r["status"] in ("STORED", "PENDING")}
                eligible_targets = [
                    nid for nid, state in node_states.items()
                    if state == "HEALTHY" and nid not in existing_nodes and nid != failed_node_id
                ]

                if not eligible_targets:
                    print(f"[RepairManager] No eligible healthy target nodes available for object {oid}")
                    continue

                # Deterministic selection using HRW scoring
                eligible_targets.sort(key=lambda n: compute_hrw_score(oid, n), reverse=True)
                target_node = eligible_targets[0]

                # Create job
                job_id = f"repair-{uuid.uuid4().hex[:8]}"
                job_record = {
                    "job_id": job_id,
                    "object_id": oid,
                    "source_node_id": source_node,
                    "target_node_id": target_node,
                    "reason": f"NODE_DOWN:{failed_node_id}",
                    "status": "QUEUED",
                    "bytes_transferred": 0,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }

                db.create_repair_job(job_record)
                await manager.broadcast("REPAIR_QUEUED", {
                    **job_record,
                    "object_name": obj["object_name"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

                await self._queue.put(job_record)
                print(f"[RepairManager] Enqueued repair job {job_id} for {oid}: {source_node} -> {target_node}")

    async def trigger_corruption_repair(self, object_id: str, corrupt_node_id: str):
        """
        Triggered when physical data corruption is detected on a node.
        Target is the SAME node (corrupt_node_id) to restore that replica in-place.
        Healthy source is chosen from remaining STORED replicas on HEALTHY nodes.
        """
        print(f"[RepairManager] Triggering corruption repair for object {object_id} on node {corrupt_node_id}")
        obj = db.get_object(object_id)
        if not obj:
            print(f"[RepairManager] Object {object_id} not found in catalog")
            return

        # Idempotency check: active repair already queued/running for this object and corrupt node?
        active_job = db.get_active_repair_for_object(object_id, target_node_id=corrupt_node_id)
        if active_job:
            print(f"[RepairManager] Active repair already exists for {object_id} on {corrupt_node_id}: {active_job['job_id']}. Skipping.")
            return

        node_states = self.get_node_states()
        all_reps = db.get_replicas_for_object(object_id)

        # Select a healthy source replica (status == STORED and node status == HEALTHY and node != corrupt_node_id)
        healthy_sources = [
            r for r in all_reps
            if r["status"] == "STORED" and r["node_id"] != corrupt_node_id and node_states.get(r["node_id"]) == "HEALTHY"
        ]

        if not healthy_sources:
            print(f"[RepairManager] NO_HEALTHY_SOURCE for corruption repair of {object_id} on {corrupt_node_id}")
            await manager.broadcast("REPAIR_FAILED", {
                "object_id": object_id,
                "target_node_id": corrupt_node_id,
                "error": "NO_HEALTHY_SOURCE: No healthy STORED replicas available to repair corruption",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return

        source_node = healthy_sources[0]["node_id"]
        job_id = f"repair-corrupt-{uuid.uuid4().hex[:8]}"
        job_record = {
            "job_id": job_id,
            "object_id": object_id,
            "source_node_id": source_node,
            "target_node_id": corrupt_node_id,
            "reason": f"CORRUPTION:{corrupt_node_id}",
            "status": "QUEUED",
            "bytes_transferred": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        db.create_repair_job(job_record)
        await manager.broadcast("REPAIR_QUEUED", {
            **job_record,
            "object_name": obj["object_name"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        await self._queue.put(job_record)
        print(f"[RepairManager] Enqueued corruption repair job {job_id} for {object_id}: {source_node} -> {corrupt_node_id}")

    async def _worker_loop(self):
        """Continuously pulls and executes repair jobs up to concurrency limit."""
        while True:
            try:
                job = await self._queue.get()
                asyncio.create_task(self._execute_bounded_repair(job))
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[RepairManager] Worker loop exception: {e}")
                await asyncio.sleep(1)

    async def _execute_bounded_repair(self, job: Dict[str, Any]):
        async with self._semaphore:
            await self._run_repair_job(job)

    async def _run_repair_job(self, job: Dict[str, Any]):
        job_id = job["job_id"]
        oid = job["object_id"]
        source_nid = job["source_node_id"]
        target_nid = job["target_node_id"]
        now = datetime.now(timezone.utc).isoformat()

        # Update to RUNNING
        db.update_repair_job(job_id, {
            "status": "RUNNING",
            "started_at": now,
        })
        await manager.broadcast("REPAIR_STARTED", {
            "job_id": job_id,
            "object_id": oid,
            "source_node_id": source_nid,
            "target_node_id": target_nid,
            "timestamp": now,
        })

        obj = db.get_object(oid)
        if not obj:
            db.update_repair_job(job_id, {"status": "FAILED", "error": "Object not found in catalog"})
            await manager.broadcast("REPAIR_FAILED", {"job_id": job_id, "error": "Object missing"})
            return

        expected_sha = obj["sha256"]
        expected_size = obj["size_bytes"]

        # Find URLs
        source_url = self._get_node_url(source_nid)
        target_url = self._get_node_url(target_nid)

        if not source_url or not target_url:
            err = f"Could not resolve URL for source ({source_nid}) or target ({target_nid})"
            db.update_repair_job(job_id, {"status": "FAILED", "error": err, "completed_at": datetime.now(timezone.utc).isoformat()})
            await manager.broadcast("REPAIR_FAILED", {"job_id": job_id, "error": err})
            return

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                # 1. Fetch physical bytes from source node
                get_res = await client.get(f"{source_url}/retrieve/{oid}")
                if get_res.status_code != 200:
                    err = f"Source {source_nid} failed with HTTP {get_res.status_code}"
                    db.update_repair_job(job_id, {"status": "FAILED", "error": err, "completed_at": datetime.now(timezone.utc).isoformat()})
                    await manager.broadcast("REPAIR_FAILED", {"job_id": job_id, "error": err})
                    return

                payload = get_res.content

                # Verify source bytes checksum
                source_sha = hashlib.sha256(payload).hexdigest()
                if source_sha != expected_sha or len(payload) != expected_size:
                    err = f"Source checksum/size mismatch: got sha={source_sha} size={len(payload)}"
                    db.update_repair_job(job_id, {"status": "FAILED", "error": err, "completed_at": datetime.now(timezone.utc).isoformat()})
                    await manager.broadcast("REPAIR_FAILED", {"job_id": job_id, "error": err})
                    return

                # 2. Concurrently put to target node
                put_res = await client.put(f"{target_url}/store/{oid}", content=payload)
                if put_res.status_code != 200:
                    err = f"Target {target_nid} store failed with HTTP {put_res.status_code}"
                    db.update_repair_job(job_id, {"status": "FAILED", "error": err, "completed_at": datetime.now(timezone.utc).isoformat()})
                    await manager.broadcast("REPAIR_FAILED", {"job_id": job_id, "error": err})
                    return

                target_data = put_res.json()
                target_sha = target_data.get("sha256")
                target_size = target_data.get("size_bytes")

                # 3. Cryptographic and size verification of target replica
                if target_sha != expected_sha or target_size != expected_size:
                    err = f"Target replica verification failed: sha={target_sha}, size={target_size}"
                    db.update_repair_job(job_id, {"status": "FAILED", "error": err, "completed_at": datetime.now(timezone.utc).isoformat()})
                    await manager.broadcast("REPAIR_FAILED", {"job_id": job_id, "error": err})
                    return

                # 4. Success! Mark target replica STORED in DB
                db.insert_replica({
                    "object_id": oid,
                    "node_id": target_nid,
                    "status": "STORED",
                    "size_bytes": target_size,
                    "sha256": target_sha,
                })

                completed_time = datetime.now(timezone.utc).isoformat()
                db.update_repair_job(job_id, {
                    "status": "COMPLETED",
                    "bytes_transferred": len(payload),
                    "source_sha256": source_sha,
                    "target_sha256": target_sha,
                    "completed_at": completed_time,
                })

                # Refresh object status
                db.update_object_status(oid, "stored")

                await manager.broadcast("REPAIR_COMPLETED", {
                    "job_id": job_id,
                    "object_id": oid,
                    "object_name": obj["object_name"],
                    "source_node_id": source_nid,
                    "target_node_id": target_nid,
                    "bytes_transferred": len(payload),
                    "sha256": target_sha,
                    "timestamp": completed_time,
                })

                print(f"[RepairManager] Successfully completed repair {job_id}: {source_nid} -> {target_nid} ({len(payload)} bytes)")

            except Exception as e:
                err = f"Repair exception: {str(e)}"
                db.update_repair_job(job_id, {"status": "FAILED", "error": err, "completed_at": datetime.now(timezone.utc).isoformat()})
                await manager.broadcast("REPAIR_FAILED", {"job_id": job_id, "error": err})

    def _get_node_url(self, node_id: str) -> Optional[str]:
        for n in settings.STORAGE_NODES:
            if n["id"] == node_id:
                return n["url"]
        return None


# Singleton instance
repair_mgr = RepairManager()
