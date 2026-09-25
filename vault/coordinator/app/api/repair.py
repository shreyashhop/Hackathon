from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, status
from ..db.database import db

router = APIRouter(prefix="/repair", tags=["Repair Center"])


@router.get("/jobs", response_model=List[Dict[str, Any]])
async def list_jobs(limit: int = 50):
    """Returns list of recent replica repair jobs."""
    return db.list_repair_jobs(limit=limit)


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Returns details for a specific repair job."""
    job = db.get_repair_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repair job {job_id} not found"
        )
    return job


@router.get("/summary")
async def get_summary():
    """Returns aggregated repair statistics."""
    return db.get_repair_summary()
