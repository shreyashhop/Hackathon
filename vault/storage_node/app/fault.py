from typing import Dict, Any


class FaultManager:
    """
    Manages simulated faults for fault injection testing.
    Phase 0: Baseline state reporting.
    Phase 3: Simulated node stopping (DOWN) and recovery.
    Phase 4: Cryptographic bit-rot / byte corruption.
    Phase 5: Network partition / communication isolation.
    """

    def __init__(self, node_id: str):
        self.node_id = node_id
        self.is_down = False
        self.is_partitioned = False
        self.simulated_latency_ms = 0.0
        self.corrupt_reads = False

    def stop(self):
        self.is_down = True

    def recover(self):
        self.is_down = False

    def partition(self):
        self.is_partitioned = True

    def unpartition(self):
        self.is_partitioned = False

    def get_status(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "simulated_down": self.is_down,
            "simulated_partitioned": self.is_partitioned,
            "latency_ms": self.simulated_latency_ms,
            "corrupt_reads": self.corrupt_reads,
        }
