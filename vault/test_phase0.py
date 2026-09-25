"""
Vault Phase 0 Comprehensive Verification Test Suite
Tests:
1. Coordinator /health endpoint
2. All 5 Storage Node /health endpoints (8001, 8002, 8003, 8004, 8005)
3. Coordinator /nodes endpoint returning all 5 real nodes with metrics
4. Frontend loading (HTTP 200 on port 3000)
5. WebSocket connection and live events streaming (/events/ws)
6. Error checking and verification
"""

import sys
import time
import json
import asyncio
import httpx
import websockets

BASE_COORDINATOR_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:3000"
STORAGE_PORTS = [8001, 8002, 8003, 8004, 8005]

results = {
    "coordinator_health": False,
    "nodes_health": {},
    "coordinator_nodes": False,
    "frontend_loads": False,
    "websocket_connects": False,
}

async def test_coordinator_health():
    print("\n[TEST 1] Testing Coordinator /health...")
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{BASE_COORDINATOR_URL}/health", timeout=5.0)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        print(f"  Service: {data.get('service')}")
        print(f"  Status: {data.get('status')}")
        print(f"  Cluster State: {data.get('cluster_state')}")
        print(f"  Nodes Total: {data.get('nodes_total')}, Nodes Healthy: {data.get('nodes_healthy')}")
        assert data.get("status") == "healthy"
        assert data.get("nodes_total") == 5
        results["coordinator_health"] = True
        return data

async def test_storage_nodes_health():
    print("\n[TEST 2] Testing All 5 Storage Nodes directly on /health...")
    async with httpx.AsyncClient() as client:
        for idx, port in enumerate(STORAGE_PORTS, 1):
            expected_id = f"node-{idx}"
            url = f"http://localhost:{port}/health"
            try:
                res = await client.get(url, timeout=3.0)
                assert res.status_code == 200, f"Node {port} returned {res.status_code}"
                data = res.json()
                print(f"  [{expected_id}] Port {port}: Status={data.get('status')}, Uptime={data.get('uptime_seconds')}s, Capacity={data.get('capacity', {}).get('total_gb')}GB")
                assert data.get("node_id") == expected_id
                assert data.get("status") == "healthy"
                assert "capacity" in data
                results["nodes_health"][expected_id] = True
            except Exception as e:
                print(f"  [{expected_id}] FAILED on port {port}: {e}")
                results["nodes_health"][expected_id] = False

async def test_coordinator_nodes():
    print("\n[TEST 3] Testing Coordinator /nodes endpoint...")
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{BASE_COORDINATOR_URL}/nodes", timeout=5.0)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        nodes = res.json()
        print(f"  Returned {len(nodes)} nodes from coordinator /nodes:")
        assert len(nodes) == 5, f"Expected 5 nodes, got {len(nodes)}"
        for n in nodes:
            print(f"    - {n['node_id']} (Port {n['port']}): Status={n['status']}, Latency={n['latency_ms']}ms, Used={n.get('capacity', {}).get('used_gb')}GB")
            assert n['status'] in ("healthy", "HEALTHY")
            assert n['latency_ms'] is not None
        results["coordinator_nodes"] = True
        return nodes

async def test_frontend():
    print("\n[TEST 4] Testing Frontend on port 3000...")
    async with httpx.AsyncClient() as client:
        res = await client.get(FRONTEND_URL, timeout=5.0)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        assert "<div id=\"root\">" in res.text or "Vault" in res.text, "Frontend HTML does not contain root div"
        print(f"  Frontend loaded successfully: HTTP {res.status_code}")
        results["frontend_loads"] = True

async def test_websocket():
    print("\n[TEST 5] Testing WebSocket connection at ws://localhost:8000/events/ws...")
    uri = "ws://localhost:8000/events/ws"
    try:
        async with websockets.connect(uri) as ws:
            # 1. Receive welcome message
            greeting = await asyncio.wait_for(ws.recv(), timeout=4.0)
            data = json.loads(greeting)
            print(f"  Received WebSocket Event: {data.get('event_type')}")
            assert data.get("event_type") == "SYSTEM_CONNECTED"
            
            # 2. Send ping
            await ws.send(json.dumps({"type": "PING"}))
            reply = await asyncio.wait_for(ws.recv(), timeout=4.0)
            reply_data = json.loads(reply)
            print(f"  Received Ping Reply: {reply_data.get('event_type')}")
            assert reply_data.get("event_type") == "PONG"
            results["websocket_connects"] = True
    except Exception as e:
        print(f"  WebSocket Test Failed: {e}")
        results["websocket_connects"] = False

async def main():
    print("=" * 60)
    print("VAULT PHASE 0 VERIFICATION TEST RUNNER")
    print("=" * 60)
    
    await test_coordinator_health()
    await test_storage_nodes_health()
    await test_coordinator_nodes()
    await test_frontend()
    await test_websocket()
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Coordinator /health:           {'PASSED' if results['coordinator_health'] else 'FAILED'}")
    all_nodes_pass = len(results["nodes_health"]) == 5 and all(results["nodes_health"].values())
    print(f"All 5 Storage Nodes /health:   {'PASSED' if all_nodes_pass else 'FAILED'}")
    print(f"Coordinator /nodes (5 Nodes):  {'PASSED' if results['coordinator_nodes'] else 'FAILED'}")
    print(f"Frontend HTTP Load (Port 3000):{'PASSED' if results['frontend_loads'] else 'FAILED'}")
    print(f"WebSocket /events/ws:          {'PASSED' if results['websocket_connects'] else 'FAILED'}")
    print("=" * 60)
    
    if (
        results['coordinator_health']
        and all_nodes_pass
        and results['coordinator_nodes']
        and results['frontend_loads']
        and results['websocket_connects']
    ):
        print("\n>>> ALL PHASE 0 ACCEPTANCE TESTS PASSED SUCCESSFULLY! <<<\n")
        sys.exit(0)
    else:
        print("\n>>> SOME TESTS FAILED! <<<\n")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
