import json
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..core.events import manager

router = APIRouter(prefix="/events", tags=["Live Events"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and receive client messages (e.g. heartbeat or ping)
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "PING":
                    await websocket.send_text(json.dumps({
                        "event_type": "PONG",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "data": {"reply": "pong"},
                    }))
            except Exception:
                # Simple text ping
                if data.strip().lower() == "ping":
                    await websocket.send_text(json.dumps({
                        "event_type": "PONG",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "data": {"reply": "pong"},
                    }))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


@router.get("/history")
async def get_event_history():
    """Returns recent system events buffer."""
    return {
        "count": len(manager.history),
        "events": manager.history,
    }
