
"""
Test Orchestration Script:
Starts all 7 services, runs test_phase0.py, and shuts everything down cleanly.
"""

import os
import sys
import time
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NODE_EXE_DIR = r"C:\Users\SHREYASH TAPARIA\AppData\Local\Programs\nodejs"

processes = []

def main():
    import urllib.request
    try:
        with urllib.request.urlopen("http://localhost:8000/health", timeout=1) as resp:
            if resp.status == 200:
                print("[Orchestrator] Cluster is running in Docker. Running test_phase0.py directly...")
                ret = subprocess.run([sys.executable, os.path.join(BASE_DIR, "test_phase0.py")])
                sys.exit(ret.returncode)
    except Exception:
        pass

    merged_env = os.environ.copy()
    if NODE_EXE_DIR not in merged_env.get("PATH", ""):
        merged_env["PATH"] = f"{NODE_EXE_DIR};{merged_env.get('PATH', '')}"

    print("[Orchestrator] Starting 5 Storage Nodes...")
    for i in range(1, 6):
        node_id = f"node-{i}"
        node_port = str(8000 + i)
        node_data = os.path.join(BASE_DIR, "data", node_id)
        os.makedirs(node_data, exist_ok=True)
        env = merged_env.copy()
        env.update({
            "NODE_ID": node_id,
            "NODE_PORT": node_port,
            "NODE_DATA_DIR": node_data,
        })
        p = subprocess.Popen(
            f'python -m uvicorn app.main:app --host 0.0.0.0 --port {node_port}',
            env=env,
            cwd=os.path.join(BASE_DIR, "storage_node"),
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        processes.append(p)

    time.sleep(2)

    print("[Orchestrator] Starting Coordinator...")
    coord_data = os.path.join(BASE_DIR, "data", "coordinator")
    os.makedirs(coord_data, exist_ok=True)
    c_env = merged_env.copy()
    c_env.update({
        "PORT": "8000",
        "HOST": "0.0.0.0",
        "STORAGE_NODES": "localhost:8001,localhost:8002,localhost:8003,localhost:8004,localhost:8005",
        "COORDINATOR_DATA_DIR": coord_data,
        "HEALTH_CHECK_INTERVAL": "5",
    })
    coord_p = subprocess.Popen(
        'python -m uvicorn app.main:app --host 0.0.0.0 --port 8000',
        env=c_env,
        cwd=os.path.join(BASE_DIR, "coordinator"),
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    processes.append(coord_p)

    time.sleep(2)

    print("[Orchestrator] Starting Frontend (Vite preview on port 3000)...")
    front_p = subprocess.Popen(
        'npm run preview -- --host 0.0.0.0 --port 3000',
        env=merged_env,
        cwd=os.path.join(BASE_DIR, "frontend"),
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    processes.append(front_p)

    time.sleep(3)

    print("[Orchestrator] Running test_phase0.py...")
    try:
        ret = subprocess.run([sys.executable, os.path.join(BASE_DIR, "test_phase0.py")])
        exit_code = ret.returncode
    finally:
        print("[Orchestrator] Cleaning up background processes...")
        # Terminate processes forcefully on Windows
        subprocess.run("taskkill /F /IM uvicorn.exe /T", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
        subprocess.run("taskkill /F /IM node.exe /T", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
        for p in processes:
            try:
                p.terminate()
            except Exception:
                pass

    sys.exit(exit_code)

if __name__ == "__main__":
    main()
