"""
Vault Local Orchestrator (Phase 0)
Launches all 7 services in parallel processes for native local testing:
- 5 independent Storage Nodes (ports 8001-8005) with isolated data directories
- 1 Coordinator (port 8000)
- 1 Frontend (port 3000)
"""

import os
import sys
import time
import signal
import subprocess

SERVICES = []
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NODE_EXE_DIR = r"C:\Users\SHREYASH TAPARIA\AppData\Local\Programs\nodejs"

def start_service(name, cmd, env=None, cwd=None):
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    # Ensure node/npm in PATH
    if NODE_EXE_DIR not in merged_env.get("PATH", ""):
        merged_env["PATH"] = f"{NODE_EXE_DIR};{merged_env.get('PATH', '')}"
    
    p = subprocess.Popen(
        cmd,
        env=merged_env,
        cwd=cwd or BASE_DIR,
        shell=True,
    )
    SERVICES.append((name, p))
    print(f"[Vault] Started {name} (PID: {p.pid})")
    return p


def main():
    print("=" * 60)
    print("Starting Vault Distributed Object Storage Stack (Phase 0)")
    print("=" * 60)

    # 1. Start 5 Storage Nodes
    for i in range(1, 6):
        node_id = f"node-{i}"
        node_port = str(8000 + i)
        node_data = os.path.join(BASE_DIR, "data", node_id)
        os.makedirs(node_data, exist_ok=True)
        
        env = {
            "NODE_ID": node_id,
            "NODE_PORT": node_port,
            "NODE_DATA_DIR": node_data,
        }
        cmd = f'python -m uvicorn app.main:app --host 0.0.0.0 --port {node_port}'
        start_service(f"Storage {node_id}", cmd, env=env, cwd=os.path.join(BASE_DIR, "storage_node"))

    time.sleep(1)

    # 2. Start Coordinator
    coord_data = os.path.join(BASE_DIR, "data", "coordinator")
    os.makedirs(coord_data, exist_ok=True)
    coord_env = {
        "PORT": "8000",
        "HOST": "0.0.0.0",
        "STORAGE_NODES": "localhost:8001,localhost:8002,localhost:8003,localhost:8004,localhost:8005",
        "COORDINATOR_DATA_DIR": coord_data,
        "HEALTH_CHECK_INTERVAL": "5",
    }
    cmd = 'python -m uvicorn app.main:app --host 0.0.0.0 --port 8000'
    start_service("Coordinator", cmd, env=coord_env, cwd=os.path.join(BASE_DIR, "coordinator"))

    time.sleep(1)

    # 3. Start Frontend
    frontend_dir = os.path.join(BASE_DIR, "frontend")
    cmd = 'npm run dev'
    start_service("Frontend (Vite)", cmd, cwd=frontend_dir)

    print("\n" + "=" * 60)
    print("All 7 Vault services running:")
    print("  Coordinator: http://localhost:8000")
    print("  Node 1:      http://localhost:8001/health")
    print("  Node 2:      http://localhost:8002/health")
    print("  Node 3:      http://localhost:8003/health")
    print("  Node 4:      http://localhost:8004/health")
    print("  Node 5:      http://localhost:8005/health")
    print("  Frontend UI: http://localhost:3000")
    print("Press Ctrl+C to terminate all services.")
    print("=" * 60 + "\n")

    try:
        while True:
            time.sleep(1)
            for name, p in SERVICES:
                if p.poll() is not None:
                    print(f"[Warning] {name} exited with code {p.returncode}")
    except KeyboardInterrupt:
        print("\n[Vault] Shutting down all services...")
        for name, p in SERVICES:
            try:
                p.terminate()
            except Exception:
                pass
        print("[Vault] Shutdown complete.")


if __name__ == "__main__":
    main()
