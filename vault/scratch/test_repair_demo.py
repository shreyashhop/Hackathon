import httpx
import time

client = httpx.Client(base_url="http://localhost:8000", timeout=10.0)

# 1. Clean up old objects if any
for o in client.get("/objects").json():
    client.delete(f"/objects/{o['object_id']}")

# 2. Upload test object
files = {"file": ("repair_test.txt", b"Vault Automatic Replica Repair Verification Payload - Phase 3", "text/plain")}
res = client.post("/objects", files=files)
obj = res.json()
oid = obj["object_id"]
reps = [r["node_id"] for r in obj["replicas"]]
print("Uploaded object:", oid, "on nodes:", reps)

target_failed_node = reps[0]
print(f"Triggering failure on {target_failed_node}...")
client.post(f"/faults/node/{target_failed_node}/stop")

# Wait for failure detection and automatic repair
print("Waiting for failure detection and automatic repair...")
completed = False
for i in range(15):
    time.sleep(1)
    node_status = client.get(f"/nodes/{target_failed_node}").json()["status"]
    jobs = client.get("/repair/jobs").json()
    rep_obj = client.get(f"/objects/{oid}/replicas").json()
    stored_count = rep_obj.get("stored_replicas")
    print(f"  [{i+1}s] {target_failed_node} status: {node_status}, stored replicas: {stored_count}, jobs: {len(jobs)}")
    if jobs and any(j["status"] == "COMPLETED" for j in jobs):
        completed = True
        print("[OK] Repair job completed successfully!")
        print("Job details:", jobs[0])
        break

# Recover failed node
print(f"Recovering {target_failed_node}...")
client.post(f"/faults/node/{target_failed_node}/recover")
time.sleep(4)
final_reps = client.get(f"/objects/{oid}/replicas").json()
print("Final replicas for object:", [(r["node_id"], r["status"]) for r in final_reps["replicas"]])
print("Healthy replica count:", final_reps["stored_replicas"])

# Clean up
client.delete(f"/objects/{oid}")
print("Cleaned up object.")
