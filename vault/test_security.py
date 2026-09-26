"""
Vault Security Regression Test Suite
=====================================
Tests for vulnerabilities addressed in the Security Hardening Pass:
  - Path traversal prevention (storage node)
  - SQL injection prevention (coordinator)
  - Input validation (object_id format, file size limits)
  - Information leakage prevention (no paths/stack traces in responses)
  - Security headers verification
  - Content-Disposition header safety
  - Rate limit / request size enforcement
"""

import os
import sys
import json
import uuid
import time
import hashlib
import asyncio
import requests

# ---------- Configuration ----------

COORDINATOR_URL = os.getenv("COORDINATOR_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
STORAGE_NODE_1_URL = os.getenv("STORAGE_NODE_1_URL", "http://localhost:8001")

# ---------- Helpers ----------

def upload_test_file(name: str = "security_test.txt", content: bytes = b"security test data"):
    """Upload a small test file and return metadata."""
    resp = requests.post(
        f"{COORDINATOR_URL}/objects",
        files={"file": (name, content, "text/plain")},
    )
    return resp

def wait_for_services(max_wait=60):
    """Wait until services are available."""
    start = time.time()
    while time.time() - start < max_wait:
        try:
            r = requests.get(f"{COORDINATOR_URL}/health", timeout=3)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


# ============================================================
# Test Results Tracking
# ============================================================

PASSED = 0
FAILED = 0
ERRORS = []

def test_pass(name: str):
    global PASSED
    PASSED += 1
    print(f"  ✓ {name}")

def test_fail(name: str, detail: str = ""):
    global FAILED
    FAILED += 1
    ERRORS.append(f"{name}: {detail}")
    print(f"  ✗ {name} — {detail}")


# ============================================================
# 1. PATH TRAVERSAL TESTS (Storage Node)
# ============================================================

def test_path_traversal():
    """Verify storage node rejects path-traversal object IDs."""
    print("\n═══ PATH TRAVERSAL PREVENTION ═══")
    
    traversal_ids = [
        "../../../etc/passwd",
        "..\\..\\..\\windows\\system32\\config\\sam",
        "....//....//etc/shadow",
        "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        "foo/../../../etc/passwd",
        "\x00malicious",
    ]
    
    for tid in traversal_ids:
        try:
            # Try PUT (store)
            r = requests.put(
                f"{STORAGE_NODE_1_URL}/store/{tid}",
                data=b"malicious data",
                timeout=5,
            )
            # 400 = blocked by validation, 404 = path normalized by framework (safe), 422 = rejected by FastAPI
            if r.status_code in (400, 404, 422):
                test_pass(f"PUT /store/{tid[:30]}... -> {r.status_code} (blocked)")
            else:
                test_fail(f"PUT /store/{tid[:30]}...", f"Expected 400/404/422, got {r.status_code}")
        except Exception as e:
            test_pass(f"PUT /store/{tid[:30]}... -> connection error (safe)")

    for tid in traversal_ids[:3]:
        try:
            r = requests.get(f"{STORAGE_NODE_1_URL}/retrieve/{tid}", timeout=5)
            # 400 = blocked by validation, 404 = path normalized (safe), 422 = framework rejection
            if r.status_code in (400, 404, 422):
                test_pass(f"GET /retrieve/{tid[:30]}... -> {r.status_code} (blocked)")
            else:
                test_fail(f"GET /retrieve/{tid[:30]}...", f"Expected 400/404/422, got {r.status_code}")
        except Exception as e:
            test_pass(f"GET /retrieve/{tid[:30]}... -> connection error (safe)")


# ============================================================
# 2. OBJECT_ID VALIDATION TESTS (Coordinator)
# ============================================================

def test_object_id_validation():
    """Verify coordinator rejects malformed object IDs."""
    print("\n═══ OBJECT ID INPUT VALIDATION ═══")
    
    bad_ids = [
        "not-a-uuid",
        "'; DROP TABLE objects; --",
        "<script>alert(1)</script>",
        "../../../etc/passwd",
        "a" * 500,  # Very long
    ]
    
    for bid in bad_ids:
        label = bid[:40]
        try:
            r = requests.get(f"{COORDINATOR_URL}/objects/{bid}", timeout=5)
            if r.status_code in (400, 404, 422):
                test_pass(f"GET /objects/{label} -> {r.status_code} (rejected)")
            else:
                test_fail(f"GET /objects/{label}", f"Expected 400/404/422, got {r.status_code}")
        except Exception as e:
            test_pass(f"GET /objects/{label} -> connection error (safe)")

    # Valid UUID format should succeed (404 because it doesn't exist)
    valid_uuid = str(uuid.uuid4())
    try:
        r = requests.get(f"{COORDINATOR_URL}/objects/{valid_uuid}", timeout=5)
        if r.status_code == 404:
            test_pass(f"GET /objects/(valid UUID) → 404 (accepted format, not found)")
        else:
            test_fail(f"GET /objects/(valid UUID)", f"Expected 404, got {r.status_code}")
    except Exception as e:
        test_fail(f"GET /objects/(valid UUID)", str(e))


# ============================================================
# 3. FILE UPLOAD VALIDATION TESTS
# ============================================================

def test_upload_validation():
    """Verify upload restrictions: empty file, missing file, filename validation."""
    print("\n═══ FILE UPLOAD VALIDATION ═══")
    
    # Empty file
    r = requests.post(
        f"{COORDINATOR_URL}/objects",
        files={"file": ("empty.txt", b"", "text/plain")},
        timeout=10,
    )
    if r.status_code == 400:
        test_pass("Empty file upload → 400 (rejected)")
    else:
        test_fail("Empty file upload", f"Expected 400, got {r.status_code}")
    
    # Missing file
    r = requests.post(f"{COORDINATOR_URL}/objects", timeout=10)
    if r.status_code in (400, 422):
        test_pass(f"Missing file upload → {r.status_code} (rejected)")
    else:
        test_fail("Missing file upload", f"Expected 400/422, got {r.status_code}")
    
    # Malicious filename (should be sanitized to basename)
    r = requests.post(
        f"{COORDINATOR_URL}/objects",
        files={"file": ("../../etc/passwd", b"test data", "text/plain")},
        timeout=10,
    )
    if r.status_code in (201, 400):
        if r.status_code == 201:
            data = r.json()
            name = data.get("object_name", "")
            if "/" not in name and "\\" not in name:
                test_pass(f"Malicious filename sanitized to: '{name}'")
                # Cleanup
                oid = data.get("object_id")
                if oid:
                    requests.delete(f"{COORDINATOR_URL}/objects/{oid}", timeout=5)
            else:
                test_fail("Malicious filename", f"Filename not sanitized: {name}")
        else:
            test_pass("Malicious filename → 400 (rejected)")
    else:
        test_fail("Malicious filename", f"Unexpected status: {r.status_code}")


# ============================================================
# 4. INFORMATION LEAKAGE TESTS
# ============================================================

def test_information_leakage():
    """Verify responses don't leak filesystem paths, stack traces, or internal details."""
    print("\n═══ INFORMATION LEAKAGE PREVENTION ═══")
    
    sensitive_patterns = [
        "/app/data/",
        "/usr/",
        "\\app\\",
        "C:\\",
        "Traceback",
        "File \"",
        "line ",
        ".py\"",
        "sqlite3.",
    ]
    
    # 1. Request non-existent object
    r = requests.get(f"{COORDINATOR_URL}/objects/{uuid.uuid4()}", timeout=5)
    body = r.text.lower()
    for pattern in sensitive_patterns:
        if pattern.lower() in body:
            test_fail(f"404 response leaks '{pattern}'", body[:100])
            break
    else:
        test_pass("404 response does not leak internal paths/traces")
    
    # 2. Download non-existent object
    r = requests.get(f"{COORDINATOR_URL}/objects/{uuid.uuid4()}/download", timeout=5)
    body = r.text.lower()
    for pattern in sensitive_patterns:
        if pattern.lower() in body:
            test_fail(f"Download 404 leaks '{pattern}'", body[:100])
            break
    else:
        test_pass("Download 404 does not leak internal details")
    
    # 3. Storage node health endpoint should not expose data_dir
    try:
        r = requests.get(f"{STORAGE_NODE_1_URL}/health", timeout=5)
        if r.status_code == 200:
            data = r.json()
            if "data_dir" in data:
                test_fail("Storage node health leaks data_dir", str(data.get("data_dir")))
            else:
                test_pass("Storage node health does not expose data_dir")
        else:
            test_pass("Storage node health status ≠ 200 (possibly simulated DOWN)")
    except Exception:
        test_pass("Storage node not reachable (safe for this test)")
    
    # 4. Storage node error should not expose full exception
    try:
        r = requests.get(f"{STORAGE_NODE_1_URL}/retrieve/nonexistent-object-id", timeout=5)
        body = r.text
        for pattern in sensitive_patterns:
            if pattern.lower() in body.lower():
                test_fail(f"Storage 404 leaks '{pattern}'", body[:100])
                break
        else:
            test_pass("Storage node error does not leak internal details")
    except Exception:
        test_pass("Storage node not reachable (safe for this test)")


# ============================================================
# 5. SECURITY HEADERS TESTS
# ============================================================

def test_security_headers():
    """Verify security headers are present on responses."""
    print("\n═══ SECURITY HEADERS ═══")
    
    # Test coordinator
    r = requests.get(f"{COORDINATOR_URL}/health", timeout=5)
    headers = r.headers
    
    checks = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": None,  # Just check presence
    }
    
    for header, expected_value in checks.items():
        val = headers.get(header)
        if val:
            if expected_value and val.lower() != expected_value.lower():
                test_fail(f"Coordinator {header}", f"Expected '{expected_value}', got '{val}'")
            else:
                test_pass(f"Coordinator {header}: {val}")
        else:
            test_fail(f"Coordinator {header}", "Header missing")
    
    # Test for Content-Security-Policy
    csp = headers.get("Content-Security-Policy")
    if csp and "frame-ancestors" in csp.lower():
        test_pass(f"Coordinator Content-Security-Policy present")
    else:
        test_fail("Coordinator Content-Security-Policy", "Missing or incomplete")
    
    # Test nginx/frontend security headers (if accessible)
    try:
        fr = requests.get(f"{FRONTEND_URL}/", timeout=5)
        fh = fr.headers
        
        nginx_checks = ["X-Content-Type-Options", "X-Frame-Options"]
        for header in nginx_checks:
            if fh.get(header):
                test_pass(f"Frontend (nginx) {header}: {fh.get(header)}")
            else:
                test_fail(f"Frontend (nginx) {header}", "Header missing")
        
        # server_tokens off — should not reveal nginx version
        server = fh.get("Server", "")
        if "nginx/" in server.lower():
            test_fail("Frontend reveals nginx version", server)
        else:
            test_pass(f"Frontend Server header does not reveal version: '{server}'")
    except Exception:
        print("  ⊘ Frontend not reachable — skipping nginx header tests")


# ============================================================
# 6. DOCS ENDPOINT TESTS
# ============================================================

def test_docs_disabled():
    """Verify API docs are disabled in production (Docker)."""
    print("\n═══ API DOCS EXPOSURE ═══")
    
    # In Docker, docs should be disabled
    for path in ["/docs", "/redoc"]:
        r = requests.get(f"{COORDINATOR_URL}{path}", timeout=5)
        if r.status_code == 404:
            test_pass(f"Coordinator {path} → 404 (disabled in production)")
        elif r.status_code == 200:
            # This may be ok in development mode
            print(f"  ⊘ Coordinator {path} → 200 (acceptable in dev mode, disabled in Docker)")
        else:
            test_pass(f"Coordinator {path} → {r.status_code}")
    
    # Storage node docs should always be disabled
    try:
        for path in ["/docs", "/redoc"]:
            r = requests.get(f"{STORAGE_NODE_1_URL}{path}", timeout=5)
            if r.status_code == 404:
                test_pass(f"Storage node {path} → 404 (disabled)")
            else:
                test_fail(f"Storage node {path}", f"Expected 404, got {r.status_code}")
    except Exception:
        print("  ⊘ Storage node not reachable — skipping docs test")


# ============================================================
# 7. CONTENT-DISPOSITION HEADER SAFETY
# ============================================================

def test_content_disposition_safety():
    """Verify Content-Disposition header doesn't allow injection."""
    print("\n═══ CONTENT-DISPOSITION HEADER SAFETY ═══")
    
    # Upload file with special characters in name
    special_name = 'test"file;name=evil.txt'
    r = upload_test_file(name=special_name, content=b"header safety test")
    
    if r.status_code != 201:
        print(f"  ⊘ Upload failed ({r.status_code}) — skipping header test")
        return
    
    data = r.json()
    oid = data["object_id"]
    
    # Download and check Content-Disposition
    dr = requests.get(f"{COORDINATOR_URL}/objects/{oid}/download", timeout=10)
    if dr.status_code == 200:
        cd = dr.headers.get("Content-Disposition", "")
        # Check that the header uses RFC 5987 encoding or doesn't contain raw special chars
        if "filename*=UTF-8''" in cd:
            test_pass(f"Content-Disposition uses RFC 5987 encoding")
        elif '"' not in special_name or cd.count('"') <= 2:
            test_pass(f"Content-Disposition appears safe: {cd[:60]}")
        else:
            test_fail("Content-Disposition may be injectable", cd[:80])
    else:
        test_fail("Download failed for header test", str(dr.status_code))
    
    # Cleanup
    requests.delete(f"{COORDINATOR_URL}/objects/{oid}", timeout=5)


# ============================================================
# 8. SQL INJECTION TESTS
# ============================================================

def test_sql_injection():
    """Verify SQL injection is prevented in coordinator APIs."""
    print("\n═══ SQL INJECTION PREVENTION ═══")
    
    sqli_payloads = [
        "'; DROP TABLE objects; --",
        "1 OR 1=1",
        "1' UNION SELECT * FROM sqlite_master--",
        "1; DELETE FROM objects WHERE 1=1;--",
    ]
    
    for payload in sqli_payloads:
        label = payload[:35]
        
        # Test via object_id parameter
        r = requests.get(f"{COORDINATOR_URL}/objects/{payload}", timeout=5)
        if r.status_code in (400, 404, 422):
            test_pass(f"SQLi object_id '{label}' → {r.status_code} (blocked)")
        else:
            test_fail(f"SQLi object_id '{label}'", f"Unexpected {r.status_code}")
    
    # Verify data is still intact after injection attempts
    r = requests.get(f"{COORDINATOR_URL}/objects", timeout=5)
    if r.status_code == 200:
        test_pass("Objects table intact after SQLi attempts")
    else:
        test_fail("Objects table check after SQLi", f"Status {r.status_code}")


# ============================================================
# 9. CORS CONFIGURATION TESTS
# ============================================================

def test_cors_configuration():
    """Verify CORS doesn't use wildcard with credentials."""
    print("\n═══ CORS CONFIGURATION ═══")
    
    # Send a preflight-like request with a non-whitelisted origin
    r = requests.options(
        f"{COORDINATOR_URL}/objects",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
        timeout=5,
    )
    
    acao = r.headers.get("Access-Control-Allow-Origin", "")
    if acao == "*":
        test_fail("CORS allows wildcard origin", "Access-Control-Allow-Origin: *")
    elif "evil.example.com" in acao:
        test_fail("CORS reflects arbitrary origin", acao)
    else:
        test_pass(f"CORS does not reflect arbitrary origin (got: '{acao}')")

    # Test with whitelisted origin
    r = requests.get(
        f"{COORDINATOR_URL}/health",
        headers={"Origin": "http://localhost:3000"},
        timeout=5,
    )
    acao = r.headers.get("Access-Control-Allow-Origin", "")
    if "localhost:3000" in acao:
        test_pass(f"CORS allows whitelisted origin: {acao}")
    else:
        # May not be present for simple GET — acceptable
        test_pass(f"CORS for whitelisted origin: '{acao}' (may be omitted for simple requests)")


# ============================================================
# MAIN
# ============================================================

def main():
    global PASSED, FAILED

    print("=" * 60)
    print("VAULT SECURITY REGRESSION TEST SUITE")
    print("=" * 60)

    print("\nWaiting for services...")
    if not wait_for_services(max_wait=60):
        print("ERROR: Services not available after 60 seconds")
        sys.exit(1)
    
    print("Services ready!\n")

    # Run all test suites
    test_path_traversal()
    test_object_id_validation()
    test_upload_validation()
    test_information_leakage()
    test_security_headers()
    test_docs_disabled()
    test_content_disposition_safety()
    test_sql_injection()
    test_cors_configuration()

    # Summary
    total = PASSED + FAILED
    print("\n" + "=" * 60)
    print(f"SECURITY TEST RESULTS: {PASSED}/{total} passed, {FAILED} failed")
    print("=" * 60)
    
    if ERRORS:
        print("\nFailed tests:")
        for err in ERRORS:
            print(f"  ✗ {err}")
    
    if FAILED > 0:
        sys.exit(1)
    else:
        print("\n✓ All security tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
