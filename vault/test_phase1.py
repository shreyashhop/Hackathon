"""
Vault Phase 1 Comprehensive Acceptance Test Suite
Tests:
1. Empty file upload rejection (HTTP 400)
2. Real file upload through Coordinator (POST /objects)
3. Object metadata verification in Coordinator (GET /objects and GET /objects/{id})
4. Physical file existence and SHA-256 verification on designated storage node
5. Storage node object count increment verification
6. Real file download through Coordinator (GET /objects/{id}/download) with SHA-256 bit-for-bit check
7. Real file delete through Coordinator (DELETE /objects/{id})
8. Physical file removal verification from storage node filesystem
9. Storage node object count decrement verification
10. Empty state verification (GET /objects returns empty catalog)
11. Phase 0 regression verification (health, all 5 nodes, WebSocket event bus)
"""

import sys
import os
import time
import json
import hashlib
import asyncio
import httpx
import websockets

COORDINATOR_URL = "http://localhost:8000"
FRONTEND_PROXY_URL = "http://localhost:3000"

NODE_PORTS = {
    "node-1": 8001,
    "node-2": 8002,
    "node-3": 8003,
    "node-4": 8004,
    "node-5": 8005,
}

test_results = {}


async def test_empty_file_upload_rejected():
    print("\n[TEST 1] Testing rejection of empty file upload (0 bytes)...")
    async with httpx.AsyncClient() as client:
        files = {"file": ("empty.txt", b"", "text/plain")}
        res = await client.post(f"{COORDINATOR_URL}/objects", files=files)
        print(f"  Empty file upload response: HTTP {res.status_code}, {res.text}")
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        test_results["empty_file_rejected"] = True


async def test_real_file_upload():
    print("\n[TEST 2] Testing real file upload (POST /objects)...")
    payload = b"Hello Vault Distributed Storage! This is a real test payload for Phase 1 verification."
    expected_sha256 = hashlib.sha256(payload).hexdigest()
    expected_size = len(payload)

    async with httpx.AsyncClient() as client:
        files = {"file": ("vault_phase1_test.txt", payload, "text/plain")}
        res = await client.post(f"{COORDINATOR_URL}/objects", files=files)
        assert res.status_code == 201, f"Expected 201 Created, got {res.status_code}: {res.text}"
        data = res.json()
        print(f"  Stored object_id: {data.get('object_id')}")
        print(f"  Assigned node:    {data.get('storage_node_id')}")
        print(f"  Calculated SHA:   {data.get('sha256')}")
        print(f"  Stored bytes:     {data.get('size_bytes')}")

        assert data.get("object_name") == "vault_phase1_test.txt"
        assert data.get("size_bytes") == expected_size
        assert data.get("sha256") == expected_sha256
        assert data.get("storage_node_id") in NODE_PORTS
        assert data.get("status") == "stored"

        test_results["upload"] = data
        return data, payload


async def test_object_catalog(object_meta):
    print("\n[TEST 3] Testing object catalog (GET /objects and GET /objects/{id})...")
    oid = object_meta["object_id"]
    async with httpx.AsyncClient() as client:
        # 1. List objects
        res = await client.get(f"{COORDINATOR_URL}/objects")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        catalog = res.json()
        print(f"  Catalog count: {len(catalog)} object(s)")
        assert any(item["object_id"] == oid for item in catalog), f"Object {oid} not found in catalog"

        # 2. Get specific object
        res_single = await client.get(f"{COORDINATOR_URL}/objects/{oid}")
        assert res_single.status_code == 200, f"Expected 200, got {res_single.status_code}"
        item = res_single.json()
        assert item["object_id"] == oid
        assert item["sha256"] == object_meta["sha256"]
        test_results["catalog"] = True


async def test_physical_storage_on_node(object_meta, original_bytes):
    print("\n[TEST 4] Testing physical bytes and checksum on storage node directly...")
    oid = object_meta["object_id"]
    node_id = object_meta["storage_node_id"]
    port = NODE_PORTS[node_id]

    async with httpx.AsyncClient() as client:
        # 1. Retrieve physical bytes directly from node
        res = await client.get(f"http://localhost:{port}/retrieve/{oid}")
        assert res.status_code == 200, f"Expected 200 from storage node {node_id}, got {res.status_code}"
        retrieved_bytes = res.content
        print(f"  Direct node bytes retrieved: {len(retrieved_bytes)} bytes")
        assert retrieved_bytes == original_bytes, "Retrieved bytes from storage node do not match original bytes!"

        # 2. Query node checksum endpoint
        chk_res = await client.get(f"http://localhost:{port}/checksum/{oid}")
        assert chk_res.status_code == 200
        chk_data = chk_res.json()
        print(f"  Storage node checksum verification: {chk_data.get('sha256')}")
        assert chk_data.get("sha256") == object_meta["sha256"]
        assert chk_data.get("size_bytes") == len(original_bytes)

        # 3. Verify node objects_count incremented
        health_res = await client.get(f"http://localhost:{port}/health")
        assert health_res.status_code == 200
        health_data = health_res.json()
        print(f"  Storage node {node_id} objects count: {health_data.get('objects_count')}")
        assert health_data.get("objects_count") >= 1, "Expected node objects_count >= 1"

        test_results["physical_storage"] = True


async def test_download_through_coordinator(object_meta, original_bytes):
    print("\n[TEST 5] Testing download through Coordinator (GET /objects/{id}/download)...")
    oid = object_meta["object_id"]
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{COORDINATOR_URL}/objects/{oid}/download")
        assert res.status_code == 200, f"Download failed with status {res.status_code}: {res.text}"
        downloaded_bytes = res.content
        download_sha = hashlib.sha256(downloaded_bytes).hexdigest()

        print(f"  Downloaded size: {len(downloaded_bytes)} bytes")
        print(f"  Downloaded SHA:  {download_sha}")
        assert downloaded_bytes == original_bytes, "Downloaded bytes do not match original payload!"
        assert download_sha == object_meta["sha256"], "Downloaded SHA-256 does not match catalog!"
        assert res.headers.get("X-Vault-Sha256") == object_meta["sha256"]
        test_results["download"] = True


async def test_delete_object(object_meta):
    print("\n[TEST 6] Testing delete through Coordinator (DELETE /objects/{id})...")
    oid = object_meta["object_id"]
    node_id = object_meta["storage_node_id"]
    port = NODE_PORTS[node_id]

    async with httpx.AsyncClient() as client:
        # 1. Delete via coordinator
        del_res = await client.delete(f"{COORDINATOR_URL}/objects/{oid}")
        assert del_res.status_code == 200, f"Delete failed: {del_res.status_code}"
        print(f"  Delete result: {del_res.json()}")

        # 2. Verify coordinator catalog no longer contains object
        get_res = await client.get(f"{COORDINATOR_URL}/objects/{oid}")
        assert get_res.status_code == 404, f"Expected 404, got {get_res.status_code}"

        # 3. Verify physical file is gone from storage node
        node_res = await client.get(f"http://localhost:{port}/retrieve/{oid}")
        assert node_res.status_code == 404, f"Expected 404 from storage node, got {node_res.status_code}"

        # 4. Verify storage node objects_count decremented
        health_res = await client.get(f"http://localhost:{port}/health")
        health_data = health_res.json()
        print(f"  Storage node {node_id} objects count after delete: {health_data.get('objects_count')}")
        assert health_data.get("objects_count") == 0, "Expected objects_count to decrement to 0"

        test_results["delete"] = True


async def test_empty_catalog():
    print("\n[TEST 7] Testing empty catalog state...")
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{COORDINATOR_URL}/objects")
        assert res.status_code == 200
        items = res.json()
        print(f"  Catalog count: {len(items)} object(s)")
        assert len(items) == 0, f"Expected 0 objects, got {len(items)}"
        test_results["empty_catalog"] = True


async def test_frontend_proxy():
    print("\n[TEST 8] Testing Frontend Nginx Proxy for /objects on port 3000...")
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{FRONTEND_PROXY_URL}/objects")
        assert res.status_code == 200, f"Frontend proxy /objects returned {res.status_code}"
        print(f"  Frontend proxy /objects responded: HTTP {res.status_code}")
        test_results["frontend_proxy"] = True


async def test_phase0_regression():
    print("\n[TEST 9] Verifying Phase 0 regression (Health, Nodes, WebSocket)...")
    async with httpx.AsyncClient() as client:
        # Coordinator health
        h_res = await client.get(f"{COORDINATOR_URL}/health")
        assert h_res.status_code == 200
        h_data = h_res.json()
        assert h_data.get("cluster_state") == "HEALTHY"
        assert h_data.get("nodes_healthy") == 5

        # All 5 nodes
        n_res = await client.get(f"{COORDINATOR_URL}/nodes")
        assert n_res.status_code == 200
        nodes = n_res.json()
        assert len(nodes) == 5
        assert all(n["status"] in ("healthy", "HEALTHY") for n in nodes)

    # WebSocket
    async with websockets.connect("ws://localhost:8000/events/ws") as ws:
        msg = await asyncio.wait_for(ws.recv(), timeout=4.0)
        data = json.loads(msg)
        assert data.get("event_type") == "SYSTEM_CONNECTED"

    print("  Phase 0 regression check: ALL HEALTHY")
    test_results["regression"] = True


async def main():
    print("=" * 65)
    print("VAULT PHASE 1 ACCEPTANCE TEST RUNNER")
    print("=" * 65)

    # Clean up any stale objects before testing
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{COORDINATOR_URL}/objects")
            if res.status_code == 200:
                for obj in res.json():
                    await client.delete(f"{COORDINATOR_URL}/objects/{obj['object_id']}")
        except Exception:
            pass

    await test_empty_file_upload_rejected()
    obj_meta, payload = await test_real_file_upload()
    await test_object_catalog(obj_meta)
    await test_physical_storage_on_node(obj_meta, payload)
    await test_download_through_coordinator(obj_meta, payload)
    await test_delete_object(obj_meta)
    await test_empty_catalog()
    await test_frontend_proxy()
    await test_phase0_regression()

    print("\n" + "=" * 65)
    print("PHASE 1 TEST SUMMARY")
    print("=" * 65)
    all_passed = True
    for key, val in [
        ("Empty File Upload Rejection (400)", test_results.get("empty_file_rejected")),
        ("Real File Upload (201 Created)", bool(test_results.get("upload"))),
        ("Object Catalog Metadata (GET /objects)", test_results.get("catalog")),
        ("Storage Node Physical Bytes & SHA-256", test_results.get("physical_storage")),
        ("Coordinator File Download & SHA Check", test_results.get("download")),
        ("Object Deletion (Coordinator & Node)", test_results.get("delete")),
        ("Empty Catalog State ([])", test_results.get("empty_catalog")),
        ("Frontend /objects Proxy (Port 3000)", test_results.get("frontend_proxy")),
        ("Phase 0 Non-Regression Suite", test_results.get("regression")),
    ]:
        status_str = "PASSED" if val else "FAILED"
        print(f"{key:<45}: {status_str}")
        if not val:
            all_passed = False

    print("=" * 65)
    if all_passed:
        print("\n>>> ALL PHASE 1 ACCEPTANCE TESTS PASSED SUCCESSFULLY! <<<\n")
        sys.exit(0)
    else:
        print("\n>>> PHASE 1 ACCEPTANCE TESTS FAILED! <<<\n")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
