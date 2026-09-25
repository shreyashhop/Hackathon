from typing import Dict, Any


class FaultManager:
    """
    Manages simulated faults for fault injection testing.
    Phase 0: Baseline state reporting.
    Later phases: Latency injection, bit-rot simulation, dropped packets, and partition isolation.
    """

    def __init__(self, node_id: str):
        self.node_id = node_id
        self.is_down = False
        self.simulated_latency_ms = 0.0
        self.corrupt_reads = False

    def stop(self):
        self.is_down = True

    def recover(self):
        self.is_down = False

    def get_status(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "simulated_down": self.is_down,
            "latency_ms": self.simulated_latency_ms,
            "corrupt_reads": self.corrupt_reads,
        }
