import asyncio
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx

from .config import settings
from .events import manager
from .repair_manager import repair_mgr
from ..db.database import db

HEARTBEAT_INTERVAL = 2.0
HEARTBEAT_TIMEOUT = 1.0
SUSPECT_THRESHOLD = 1
DOWN_THRESHOLD = 3


class NodeHealthMonitor:
    """
    Active Node Heartbeat Monitor & State Machine.
    State Machine:
      HEALTHY --(1 failure)--> SUSPECT --(3 failures)--> DOWN
      DOWN --(1 success)--> RECOVERING --(manifest reconcile)--> HEALTHY
    """

    def __init__(self):
        self._nodes: Dict[str, Dict[str, Any]] = {}
        self._monitor_task: Optional[asyncio.Task] = None
        self._running = False

        # Initialize node tracking records
        for n in settings.STORAGE_NODES:
            nid = n["id"]
            self._nodes[nid] = {
                "node_id": nid,
                "host": n["host"],
                "port": n["port"],
                "url": n["url"],
                "status": "HEALTHY",
                "last_heartbeat": None,
                "last_successful_heartbeat": None,
                "failed_heartbeats": 0,
                "latency_ms": None,
                "capacity": None,
                "uptime_seconds": None,
                "objects_count": 0,
                "error": None,
            }

        repair_mgr.set_node_health_getter(self.get_all_nodes)

    def start(self):
        if not self._running:
            self._running = True
            self._monitor_task = asyncio.create_task(self._monitor_loop())
            print("[NodeHealthMonitor] Started active heartbeat monitor (tick: 2.0s, timeout: 1.0s)")

    async def stop(self):
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

    def get_all_nodes(self) -> List[Dict[str, Any]]:
        return list(self._nodes.values())

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        return self._nodes.get(node_id)

    def get_healthy_node_ids(self) -> List[str]:
        return [nid for nid, n in self._nodes.items() if n["status"] == "HEALTHY"]

    async def _monitor_loop(self):
        # Initial brief sleep to let containers finish initialization
        await asyncio.sleep(1.0)
        async with httpx.AsyncClient(timeout=HEARTBEAT_TIMEOUT) as client:
            while self._running:
                try:
                    await self._tick(client)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    print(f"[NodeHealthMonitor] Tick error: {e}")
                await asyncio.sleep(HEARTBEAT_INTERVAL)

    async def _tick(self, client: httpx.AsyncClient):
        tasks = [self._check_node(node_cfg, client) for node_cfg in settings.STORAGE_NODES]
        await asyncio.gather(*tasks, return_exceptions=True)

        healthy_count = sum(1 for n in self._nodes.values() if n["status"] == "HEALTHY")
        cluster_state = "HEALTHY" if healthy_count == len(self._nodes) else ("DEGRADED" if healthy_count > 0 else "CRITICAL")

        # Periodic cluster heartbeat event
        await manager.broadcast("CLUSTER_HEARTBEAT", {
            "total_nodes": len(self._nodes),
            "healthy_nodes": healthy_count,
            "suspect_nodes": sum(1 for n in self._nodes.values() if n["status"] == "SUSPECT"),
            "down_nodes": sum(1 for n in self._nodes.values() if n["status"] == "DOWN"),
            "recovering_nodes": sum(1 for n in self._nodes.values() if n["status"] == "RECOVERING"),
            "cluster_state": cluster_state,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def _check_node(self, node_cfg: Dict[str, Any], client: httpx.AsyncClient):
        nid = node_cfg["id"]
        node_rec = self._nodes[nid]
        url = f"{node_cfg['url']}/health"
        now = datetime.now(timezone.utc).isoformat()
        node_rec["last_heartbeat"] = now

        start_time = time.time()
        success = False
        health_data = None
        error_msg = None

        try:
            resp = await client.get(url)
            latency = round((time.time() - start_time) * 1000, 2)
            node_rec["latency_ms"] = latency

            if resp.status_code == 200:
                success = True
                health_data = resp.json()
            else:
                error_msg = f"HTTP {resp.status_code}"
        except httpx.TimeoutException:
            error_msg = f"Heartbeat timed out after {HEARTBEAT_TIMEOUT}s"
        except httpx.RequestError as exc:
            error_msg = f"Connection error: {str(exc)}"
        except Exception as exc:
            error_msg = str(exc)

        # Apply State Machine Transitions
        prev_status = node_rec["status"]

        if success and health_data:
            node_rec["last_successful_heartbeat"] = now
            node_rec["failed_heartbeats"] = 0
            node_rec["capacity"] = health_data.get("capacity")
            node_rec["uptime_seconds"] = health_data.get("uptime_seconds")
            node_rec["objects_count"] = health_data.get("objects_count", 0)
            node_rec["error"] = None

            if prev_status == "DOWN":
                # Transition DOWN -> RECOVERING
                node_rec["status"] = "RECOVERING"
                await manager.broadcast("NODE_RECOVERING", {
                    "node_id": nid,
                    "previous_status": prev_status,
                    "current_status": "RECOVERING",
                    "timestamp": now,
                })
                await manager.broadcast("NODE_STATE_CHANGED", {
                    "node_id": nid,
                    "previous_status": prev_status,
                    "current_status": "RECOVERING",
                    "timestamp": now,
                })

                # Reconcile node manifest
                asyncio.create_task(self._reconcile_recovering_node(node_cfg))

            elif prev_status in ("SUSPECT", "RECOVERING"):
                node_rec["status"] = "HEALTHY"
                await manager.broadcast("NODE_STATE_CHANGED", {
                    "node_id": nid,
                    "previous_status": prev_status,
                    "current_status": "HEALTHY",
                    "timestamp": now,
                })
            else:
                node_rec["status"] = "HEALTHY"

        else:
            # Heartbeat Failure
            node_rec["failed_heartbeats"] += 1
            node_rec["error"] = error_msg
            failed_count = node_rec["failed_heartbeats"]

            if prev_status == "HEALTHY" and failed_count >= SUSPECT_THRESHOLD:
                # Transition HEALTHY -> SUSPECT
                node_rec["status"] = "SUSPECT"
                await manager.broadcast("NODE_SUSPECT", {
                    "node_id": nid,
                    "failed_count": failed_count,
                    "error": error_msg,
                    "timestamp": now,
                })
                await manager.broadcast("NODE_STATE_CHANGED", {
                    "node_id": nid,
                    "previous_status": prev_status,
                    "current_status": "SUSPECT",
                    "timestamp": now,
                })

            elif prev_status == "SUSPECT" and failed_count >= DOWN_THRESHOLD:
                # Transition SUSPECT -> DOWN
                node_rec["status"] = "DOWN"
                await manager.broadcast("NODE_DOWN", {
                    "node_id": nid,
                    "failed_count": failed_count,
                    "error": error_msg,
                    "timestamp": now,
                })
                await manager.broadcast("NODE_STATE_CHANGED", {
                    "node_id": nid,
                    "previous_status": prev_status,
                    "current_status": "DOWN",
                    "timestamp": now,
                })

                # Mark replicas on this node as UNAVAILABLE
                updated_count = db.update_replica_status_by_node(nid, "STORED", "UNAVAILABLE")
                print(f"[NodeHealthMonitor] Node {nid} marked DOWN. {updated_count} replicas set to UNAVAILABLE.")

                # Trigger automatic repair
                asyncio.create_task(repair_mgr.trigger_repairs_for_node(nid))

    async def _reconcile_recovering_node(self, node_cfg: Dict[str, Any]):
        """
        Reconciles returning node's physical manifest with coordinator catalog.
        Rule 17: If an object was already repaired and has 3 healthy replicas,
        do NOT create a 4th replica. Prune the redundant copy.
        """
        nid = node_cfg["id"]
        manifest_url = f"{node_cfg['url']}/manifest"
        print(f"[NodeHealthMonitor] Reconciling manifest for returning node {nid}...")

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(manifest_url)
                if res.status_code == 200:
                    manifest = res.json().get("items", [])
                    print(f"[NodeHealthMonitor] Node {nid} reported {len(manifest)} physical objects.")

                    for item in manifest:
                        oid = item["object_id"]
                        obj = db.get_object(oid)
                        if not obj:
                            continue

                        # Check healthy replicas excluding this returning node
                        all_reps = db.get_replicas_for_object(oid)
                        other_healthy = [
                            r for r in all_reps
                            if r["node_id"] != nid and r["status"] == "STORED"
                        ]

                        if len(other_healthy) >= settings.REPLICATION_FACTOR:
                            # Rule 17: Object already has RF=3 healthy replicas elsewhere!
                            # Delete redundant replica from returning node to maintain RF=3
                            print(f"[NodeHealthMonitor] Object {oid} already has {len(other_healthy)} replicas. Pruning redundant copy from {nid}.")
                            try:
                                await client.delete(f"{node_cfg['url']}/delete/{oid}")
                            except Exception:
                                pass
                            db.delete_replica(oid, nid)
                        else:
                            # Restore replica status to STORED if checksum matches
                            if item["sha256"] == obj["sha256"]:
                                db.update_replica_status(oid, nid, "STORED", item["size_bytes"], item["sha256"])
                                print(f"[NodeHealthMonitor] Restored replica {oid} on returning node {nid} to STORED.")
        except Exception as e:
            print(f"[NodeHealthMonitor] Manifest reconciliation failed for {nid}: {e}")

        # Transition RECOVERING -> HEALTHY
        node_rec = self._nodes[nid]
        node_rec["status"] = "HEALTHY"
        now = datetime.now(timezone.utc).isoformat()

        await manager.broadcast("NODE_RECOVERED", {
            "node_id": nid,
            "timestamp": now,
        })
        await manager.broadcast("NODE_STATE_CHANGED", {
            "node_id": nid,
            "previous_status": "RECOVERING",
            "current_status": "HEALTHY",
            "timestamp": now,
        })
        print(f"[NodeHealthMonitor] Node {nid} successfully recovered and marked HEALTHY.")


# Singleton instance
health_monitor = NodeHealthMonitor()
