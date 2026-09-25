from fastapi import APIRouter
from ..core.config import settings
from ..db.database import db

router = APIRouter(prefix="/replication", tags=["Replication"])


@router.get("/summary")
async def get_summary():
    """Returns cluster replication metrics, parameters, and replica node distribution."""
    return db.get_replication_summary(settings.REPLICATION_FACTOR, settings.WRITE_QUORUM)


@router.get("/config")
async def get_config():
    """Returns active cluster replication and quorum parameters."""
    return {
        "replication_factor": settings.REPLICATION_FACTOR,
        "write_quorum": settings.WRITE_QUORUM,
    }
