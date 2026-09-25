from typing import Dict, Any
from fastapi import APIRouter

from ..core.integrity_scanner import integrity_scanner

router = APIRouter(prefix="/integrity", tags=["Data Integrity"])


@router.post("/scan")
async def trigger_integrity_scan():
    """
    Manually triggers a cluster-wide cryptographic data integrity scan.
    Verifies physical SHA-256 on disk for all replicas against authoritative catalog digests.
    """
    result = await integrity_scanner.run_scan()
    return result


@router.get("/summary")
async def get_integrity_summary():
    """
    Returns current cluster data integrity posture, cumulative audit metrics,
    and corrupted replica counts.
    """
    return integrity_scanner.get_summary()


@router.get("/status")
async def get_integrity_status():
    """Alias for /integrity/summary."""
    return integrity_scanner.get_summary()
