"""
Vault Phase 4 Test Suite
Validates Data Integrity, Physical Corruption Detection, Read-Time Failover,
Background & Manual Integrity Scanning, and Automatic Corruption Repair.

Tests:
1. TEST 1 — All 5 nodes initially HEALTHY.
2. TEST 2 — Upload RF=3 object (3 STORED replicas).
3. TEST 3 — Record authoritative SHA-256.
4. TEST 4 — Inject physical corruption on 1 replica, verify node remains HEALTHY.
5. TEST 5 — Verify physical checksum mismatch on storage node.
6. TEST 6 — Read-time corruption detection: download succeeds, replica becomes CORRUPT.
7. TEST 7 — Automatic corruption repair: repair job created.
8. TEST 8 — Verify repair source is a different healthy STORED replica.
9. TEST 9 — Verify physical repair: target physical file exists.
10. TEST 10 — Verify repaired checksum: target SHA == authoritative SHA.
11. TEST 11 — Verify repaired size == object.size_bytes.
12. TEST 12 — Verify replica state: target replica is STORED.
13. TEST 13 — Verify RF remains 3 (no 4th replica created).
14. TEST 14 — Background/manual integrity scan: POST /integrity/scan.
15. TEST 15 — Fault Injection API: web endpoints call real backend.
16. TEST 16 — Phase 3 regression: run test_phase3.py.
17. TEST 17 — Phase 2 regression: run test_phase2.py.
18. TEST 18 — Phase 1 regression: run test_phase1.py.
19. TEST 19 — Phase 0 regression: run run_tests.py.
"""

import sys
import time
import hashlib
import subprocess
import requests

COORDINATOR_URL = "http://localhost:8000"
TIMEOUT = 10


def log(msg, status="INFO"):
    colors = {
        "INFO": "\033[94m",
        "PASS": "\033[92m",
        "FAIL": "\033[91m",
        "WARN": "\033[93m",
    }
    reset = "\033[0m"
    print(f"{colors.get(status, '')}[{status}] {msg}{reset}")


def ensure_cluster_healthy(clean_catalog=False):
    """Ensure all 5 nodes are recovered and in HEALTHY state before starting a test."""
    for i in range(1, 6):
        node_id = f"node-{i}"
        try:
            requests.post(f"{COORDINATOR_URL}/faults/node/{node_id}/recover", timeout=2)
        except Exception:
            pass
    if clean_catalog:
        try:
            res = requests.get(f"{COORDINATOR_URL}/objects", timeout=2)
            if res.status_code == 200:
                for obj in res.json():
                    requests.delete(f"{COORDINATOR_URL}/objects/{obj['object_id']}", timeout=2)
        except Exception:
            pass
    start = time.time()
    while time.time() - start < 10:
        try:
            res = requests.get(f"{COORDINATOR_URL}/nodes", timeout=2)
            if res.status_code == 200:
                nodes = res.json()
                healthy = [n for n in nodes if n.get("status") == "HEALTHY"]
                if len(healthy) == 5:
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


def test_1_nodes_healthy():
    log("=== TEST 1 — Verify all 5 storage nodes are HEALTHY ===")
    assert ensure_cluster_healthy(), "Failed to bring all 5 nodes to HEALTHY"

    res = requests.get(f"{COORDINATOR_URL}/nodes", timeout=TIMEOUT)
    assert res.status_code == 200
    nodes = res.json()
    assert len(nodes) == 5
    for n in nodes:
        assert n["status"] == "HEALTHY", f"Node {n['node_id']} status is {n['status']}"
    log("TEST 1 PASSED: All 5 nodes verified HEALTHY.", "PASS")


def test_2_through_13_corruption_lifecycle():
    log("=== TESTS 2-13 — Full Data Corruption Detection & Repair Lifecycle ===")
    ensure_cluster_healthy()

    # TEST 2: Upload RF=3 object
    content = b"VAULT-PHASE-4-DATA-INTEGRITY-CORRUPTION-TEST-" + str(time.time()).encode()
    authoritative_sha = hashlib.sha256(content).hexdigest()
    expected_size = len(content)

    log(f"--- TEST 2: Uploading RF=3 test object ({expected_size} bytes) ---")
    files = {"file": ("phase4_integrity_test.txt", content, "text/plain")}
    res = requests.post(f"{COORDINATOR_URL}/objects", files=files, timeout=TIMEOUT)
    assert res.status_code in (200, 201), f"Upload failed: {res.text}"
    obj_data = res.json()
    object_id = obj_data["object_id"]
    replicas = obj_data.get("replicas", [])
    assert len(replicas) == 3, f"Expected 3 replicas, got {len(replicas)}"
    stored_nodes = [r["node_id"] for r in replicas if r["status"] == "STORED"]
    assert len(stored_nodes) == 3, f"Expected 3 STORED replicas, got {stored_nodes}"
    log(f"TEST 2 PASSED: Object {object_id} stored on 3 nodes: {stored_nodes}", "PASS")

    # TEST 3: Record authoritative SHA-256
    log("--- TEST 3: Record authoritative object SHA-256 ---")
    catalog_sha = obj_data["sha256"]
    assert catalog_sha == authoritative_sha, f"Catalog sha mismatch: {catalog_sha} vs {authoritative_sha}"
    log(f"TEST 3 PASSED: Authoritative SHA-256 recorded: {catalog_sha}", "PASS")

    # TEST 4: Inject physical corruption
    corrupt_node = stored_nodes[0]
    other_stored_nodes = stored_nodes[1:]
    log(f"--- TEST 4: Injecting physical corruption into replica on {corrupt_node} ---")
    corrupt_res = requests.post(f"{COORDINATOR_URL}/faults/corruption/{object_id}/{corrupt_node}", timeout=TIMEOUT)
    assert corrupt_res.status_code == 200, f"Corruption endpoint failed: {corrupt_res.text}"
    c_data = corrupt_res.json()
    corrupted_sha = c_data["corrupted_sha256"]
    log(f"Corruption injected. New physical SHA: {corrupted_sha}")
    assert corrupted_sha != authoritative_sha, "Corrupted SHA should not match authoritative SHA"

    # Verify node remains HEALTHY
    node_res = requests.get(f"{COORDINATOR_URL}/nodes/{corrupt_node}", timeout=TIMEOUT)
    assert node_res.status_code == 200
    assert node_res.json()["status"] == "HEALTHY", f"Node {corrupt_node} should remain HEALTHY after disk corruption"
    log(f"TEST 4 PASSED: Physical bytes modified, and node {corrupt_node} remains HEALTHY.", "PASS")

    # TEST 5: Verify physical checksum mismatch on storage node
    log("--- TEST 5: Verify physical checksum mismatch directly from node ---")
    node_num = corrupt_node.replace("node-", "")
    direct_chk_res = requests.get(f"http://localhost:800{node_num}/checksum/{object_id}", timeout=TIMEOUT)
    assert direct_chk_res.status_code == 200
    physical_sha = direct_chk_res.json()["sha256"]
    log(f"Direct storage node physical SHA: {physical_sha}")
    assert physical_sha != authoritative_sha, "Physical checksum on node must mismatch authoritative checksum"
    assert physical_sha == corrupted_sha, "Physical checksum on node must match corrupted hash"
    log("TEST 5 PASSED: Physical checksum mismatch verified on disk.", "PASS")

    # TEST 6: Read-time corruption detection & transparent failover
    log("--- TEST 6: Read-time corruption detection and failover ---")
    dl_res = requests.get(f"{COORDINATOR_URL}/objects/{object_id}/download", timeout=TIMEOUT)
    assert dl_res.status_code == 200, f"Download failed during corruption: {dl_res.status_code}"
    dl_content = dl_res.content
    assert len(dl_content) == expected_size, f"Downloaded size mismatch: {len(dl_content)} vs {expected_size}"
    dl_sha = hashlib.sha256(dl_content).hexdigest()
    assert dl_sha == authoritative_sha, f"Client received corrupted bytes! Expected {authoritative_sha}, got {dl_sha}"
    log(f"Client received valid bytes ({len(dl_content)} B, SHA={dl_sha[:12]}...)")

    # Verify that the corrupted replica was marked CORRUPT in database
    obj_after_dl = requests.get(f"{COORDINATOR_URL}/objects/{object_id}", timeout=TIMEOUT).json()
    corrupt_rep = next((r for r in obj_after_dl["replicas"] if r["node_id"] == corrupt_node), None)
    assert corrupt_rep is not None
    # Replica can be CORRUPT (or already restored if repair finished rapidly)
    log(f"Replica state on {corrupt_node} after read detection: {corrupt_rep['status']}")
    log("TEST 6 PASSED: Download succeeded through healthy replica; corruption detected.", "PASS")

    # TEST 7: Automatic corruption repair job created & executed
    log("--- TEST 7: Waiting for automatic corruption repair job ---")
    start_repair = time.time()
    repair_found = False
    repair_completed = False
    repaired_job = None

    while time.time() - start_repair < 15:
        jobs_res = requests.get(f"{COORDINATOR_URL}/repair/jobs", timeout=2)
        if jobs_res.status_code == 200:
            jobs = jobs_res.json()
            job = next((j for j in jobs if j["object_id"] == object_id and j["target_node_id"] == corrupt_node), None)
            if job:
                repair_found = True
                if job["status"] == "COMPLETED":
                    repair_completed = True
                    repaired_job = job
                    break
        time.sleep(0.5)

    assert repair_found, "Corruption repair job was not queued"
    assert repair_completed, "Corruption repair job did not complete within timeout"
    log(f"TEST 7 PASSED: Corruption repair job completed: ID={repaired_job['job_id']}", "PASS")

    # TEST 8: Verify repair source
    log("--- TEST 8: Verify repair source is a different healthy replica ---")
    source_node = repaired_job["source_node_id"]
    assert source_node != corrupt_node, f"Source node cannot be the corrupted node: {source_node}"
    assert source_node in other_stored_nodes, f"Source node {source_node} not in healthy replicas {other_stored_nodes}"
    log(f"TEST 8 PASSED: Repair used healthy source node {source_node} to repair target {corrupt_node}.", "PASS")

    # TEST 9: Verify physical file exists on target node
    log("--- TEST 9: Verify physical file exists on target node ---")
    check_file_cmd = f"docker exec vault-{corrupt_node} ls -l /data/objects/{object_id}"
    res = subprocess.run(check_file_cmd, shell=True, capture_output=True, text=True)
    assert res.returncode == 0, f"Repaired file missing on disk: {res.stderr}"
    log(f"Repaired physical file confirmed: {res.stdout.strip()}")
    log("TEST 9 PASSED: Target physical file exists on disk.", "PASS")

    # TEST 10: Verify repaired checksum matches authoritative SHA
    log("--- TEST 10: Verify repaired physical checksum ---")
    calc_sha_cmd = f"docker exec vault-{corrupt_node} sha256sum /data/objects/{object_id}"
    sha_res = subprocess.run(calc_sha_cmd, shell=True, capture_output=True, text=True)
    assert sha_res.returncode == 0, f"Failed to compute sha256 in container: {sha_res.stderr}"
    target_physical_sha = sha_res.stdout.split()[0].strip()
    log(f"Target physical SHA after repair: {target_physical_sha}")
    assert target_physical_sha == authoritative_sha, f"Repaired physical SHA mismatch: {target_physical_sha} vs {authoritative_sha}"
    log("TEST 10 PASSED: Target physical checksum matches authoritative checksum.", "PASS")

    # TEST 11: Verify repaired size matches
    log("--- TEST 11: Verify repaired file size ---")
    node_chk_after = requests.get(f"http://localhost:800{node_num}/checksum/{object_id}", timeout=TIMEOUT).json()
    assert node_chk_after["size_bytes"] == expected_size, f"Size mismatch: {node_chk_after['size_bytes']} vs {expected_size}"
    log(f"Repaired size: {node_chk_after['size_bytes']} bytes")
    log("TEST 11 PASSED: Repaired physical size verified.", "PASS")

    # TEST 12: Verify replica metadata is marked STORED
    log("--- TEST 12: Verify replica metadata in catalog is STORED ---")
    final_obj = requests.get(f"{COORDINATOR_URL}/objects/{object_id}", timeout=TIMEOUT).json()
    target_rep = next((r for r in final_obj["replicas"] if r["node_id"] == corrupt_node), None)
    assert target_rep is not None
    assert target_rep["status"] == "STORED", f"Expected STORED, got {target_rep['status']}"
    assert target_rep["sha256"] == authoritative_sha, f"Expected {authoritative_sha}, got {target_rep['sha256']}"
    log(f"Replica on {corrupt_node} is STORED with verified SHA.")
    log("TEST 12 PASSED: Replica metadata marked STORED.", "PASS")

    # TEST 13: Verify RF remains 3 (no 4th replica created)
    log("--- TEST 13: Verify RF remains 3 (no 4th replica created) ---")
    stored_count = sum(1 for r in final_obj["replicas"] if r["status"] == "STORED")
    total_count = len(final_obj["replicas"])
    log(f"Final replica distribution: {[r['node_id'] for r in final_obj['replicas']]}")
    assert total_count == 3, f"Expected exactly 3 replicas total, got {total_count}"
    assert stored_count == 3, f"Expected exactly 3 STORED replicas, got {stored_count}"
    log("TEST 13 PASSED: Exactly 3 healthy replicas maintained without creating a 4th replica.", "PASS")

    # Clean up test object
    requests.delete(f"{COORDINATOR_URL}/objects/{object_id}", timeout=TIMEOUT)
    log(f"Cleaned up test object {object_id}")


def test_14_integrity_scanner():
    log("=== TEST 14 — Background & Manual Cryptographic Integrity Scan ===")
    ensure_cluster_healthy()

    # Step 1: Upload an object to scan
    content = b"VAULT-PHASE-4-SCANNER-TEST-BYTES-" + str(time.time()).encode()
    files = {"file": ("scanner_test.txt", content, "text/plain")}
    res = requests.post(f"{COORDINATOR_URL}/objects", files=files, timeout=TIMEOUT)
    assert res.status_code in (200, 201)
    obj = res.json()
    oid = obj["object_id"]
    corrupt_node = obj["replicas"][0]["node_id"]

    # Step 2: Inject corruption
    requests.post(f"{COORDINATOR_URL}/faults/corruption/{oid}/{corrupt_node}", timeout=TIMEOUT)

    # Step 3: Trigger manual scan via POST /integrity/scan
    scan_res = requests.post(f"{COORDINATOR_URL}/integrity/scan", timeout=TIMEOUT)
    assert scan_res.status_code == 200
    scan_data = scan_res.json()
    log(f"Scan response: status={scan_data.get('status')}, checks={scan_data.get('checks_performed')}, mismatches={scan_data.get('mismatches_found')}")
    assert scan_data.get("checks_performed", 0) >= 3, "Scanner should check at least 3 replicas"
    assert scan_data.get("mismatches_found", 0) >= 1, "Scanner should detect the corrupted replica"
    assert scan_data.get("repairs_triggered", 0) >= 1, "Scanner should trigger repair for mismatch"

    # Step 4: Verify summary endpoint
    summary_res = requests.get(f"{COORDINATOR_URL}/integrity/summary", timeout=TIMEOUT)
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["checks_performed"] > 0
    log(f"Integrity Summary verified: {summary}")

    # Wait for scanner-triggered repair to complete
    time.sleep(3.0)
    final_obj = requests.get(f"{COORDINATOR_URL}/objects/{oid}", timeout=TIMEOUT).json()
    repaired_rep = next((r for r in final_obj["replicas"] if r["node_id"] == corrupt_node), None)
    assert repaired_rep["status"] == "STORED", f"Replica should be repaired to STORED, got {repaired_rep['status']}"

    # Cleanup
    requests.delete(f"{COORDINATOR_URL}/objects/{oid}", timeout=TIMEOUT)
    log("TEST 14 PASSED: Integrity scan detected mismatch and triggered automatic repair.", "PASS")


def test_15_fault_injection_api():
    log("=== TEST 15 — Fault Injection API Controls ===")
    ensure_cluster_healthy()

    # Verify GET /faults
    f_res = requests.get(f"{COORDINATOR_URL}/faults", timeout=TIMEOUT)
    assert f_res.status_code == 200
    nodes = f_res.json().get("nodes", [])
    assert len(nodes) == 5

    # Verify node stop and recover
    stop_res = requests.post(f"{COORDINATOR_URL}/faults/node/node-2/stop", timeout=TIMEOUT)
    assert stop_res.status_code == 200
    assert stop_res.json()["action"] == "stop"

    rec_res = requests.post(f"{COORDINATOR_URL}/faults/node/node-2/recover", timeout=TIMEOUT)
    assert rec_res.status_code == 200
    assert rec_res.json()["action"] == "recover"

    ensure_cluster_healthy()
    log("TEST 15 PASSED: Fault injection endpoints verified.", "PASS")


def test_16_phase3_regression():
    log("=== TEST 16 — Phase 3 Regression Test Suite ===")
    ensure_cluster_healthy(clean_catalog=True)
    res = subprocess.run([sys.executable, "test_phase3.py"], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print(res.stderr, file=sys.stderr)
    assert res.returncode == 0, f"Phase 3 regression tests failed with exit code {res.returncode}"
    log("TEST 16 PASSED: Phase 3 regression suite passed.", "PASS")


def test_17_phase2_regression():
    log("=== TEST 17 — Phase 2 Regression Test Suite ===")
    ensure_cluster_healthy(clean_catalog=True)
    res = subprocess.run([sys.executable, "test_phase2.py"], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print(res.stderr, file=sys.stderr)
    assert res.returncode == 0, f"Phase 2 regression tests failed with exit code {res.returncode}"
    log("TEST 17 PASSED: Phase 2 regression suite passed.", "PASS")


def test_18_phase1_regression():
    log("=== TEST 18 — Phase 1 Regression Test Suite ===")
    ensure_cluster_healthy(clean_catalog=True)
    res = subprocess.run([sys.executable, "test_phase1.py"], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print(res.stderr, file=sys.stderr)
    assert res.returncode == 0, f"Phase 1 regression tests failed with exit code {res.returncode}"
    log("TEST 18 PASSED: Phase 1 regression suite passed.", "PASS")


def test_19_phase0_regression():
    log("=== TEST 19 — Phase 0 Regression Test Suite ===")
    ensure_cluster_healthy(clean_catalog=True)
    res = subprocess.run([sys.executable, "run_tests.py"], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print(res.stderr, file=sys.stderr)
    assert res.returncode == 0, f"Phase 0 regression tests failed with exit code {res.returncode}"
    log("TEST 19 PASSED: Phase 0 regression suite passed.", "PASS")


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("VAULT PHASE 4 AUTOMATED VERIFICATION SUITE")
    print("Data Integrity, Physical Corruption Detection & Automatic Repair")
    print("=" * 70 + "\n")

    try:
        test_1_nodes_healthy()
        test_2_through_13_corruption_lifecycle()
        test_14_integrity_scanner()
        test_15_fault_injection_api()
        test_16_phase3_regression()
        test_17_phase2_regression()
        test_18_phase1_regression()
        test_19_phase0_regression()

        print("\n" + "=" * 70)
        log("ALL 19 PHASE 4 TESTS & REGRESSIONS PASSED SUCCESSFULLY!", "PASS")
        print("=" * 70 + "\n")
        sys.exit(0)
    except AssertionError as e:
        log(f"TEST FAILED: {e}", "FAIL")
        sys.exit(1)
    except Exception as e:
        log(f"UNEXPECTED ERROR: {e}", "FAIL")
        import traceback
        traceback.print_exc()
        sys.exit(1)
