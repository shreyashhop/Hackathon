from typing import Dict, Any, List


class LocalIndex:
    """
    Manages local chunk index and verification hashes for objects held on this node.
    Phase 0: Skeleton initialization.
    Later phases: SQLite or in-memory catalog of chunks, checksums, and version tags.
    """

    def __init__(self, node_id: str, data_dir: str):
        self.node_id = node_id
        self.data_dir = data_dir
        self._entries: Dict[str, Dict[str, Any]] = {}

    def get_summary(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "indexed_items": len(self._entries),
        }
