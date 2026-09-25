import hashlib
from typing import List, Dict, Any, Tuple


def compute_hrw_score(object_id: str, node_id: str) -> int:
    """
    Computes a 64-bit integer weight score for a given (object_id, node_id) pair.
    Uses SHA-256 to ensure cryptographic uniformity and strict determinism.
    """
    key = f"{object_id}:{node_id}".encode("utf-8")
    digest = hashlib.sha256(key).digest()
    return int.from_bytes(digest[:8], byteorder="big")


def select_replica_nodes(
    object_id: str,
    eligible_nodes: List[Dict[str, Any]],
    replication_factor: int = 3,
) -> List[Dict[str, Any]]:
    """
    Selects top `replication_factor` nodes using Rendezvous Hashing (Highest Random Weight).
    Only eligible (currently healthy) nodes are evaluated.
    Returns the chosen nodes ranked by descending weight score.
    """
    if not eligible_nodes:
        return []

    scored_nodes: List[Tuple[int, Dict[str, Any]]] = []
    for node in eligible_nodes:
        node_id = node.get("id") or node.get("node_id")
        score = compute_hrw_score(object_id, node_id)
        scored_nodes.append((score, node))

    # Sort descending by score; tie-break stably by node_id
    scored_nodes.sort(
        key=lambda item: (item[0], item[1].get("id") or item[1].get("node_id")),
        reverse=True,
    )

    k = min(replication_factor, len(scored_nodes))
    return [node for _, node in scored_nodes[:k]]
