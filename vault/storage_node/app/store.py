import os
import shutil
import hashlib
import re
from typing import Dict, Any, Optional


class LocalStore:
    """
    Local filesystem storage engine for an individual Vault storage node.
    Phase 0: Initializes directory and reports real disk capacity.
    Phase 1: Real object store, retrieve, delete, checksum calculation.
    """

    def __init__(self, data_dir: str):
        self.data_dir = os.path.abspath(data_dir)
        self.objects_dir = os.path.join(self.data_dir, "objects")
        os.makedirs(self.objects_dir, exist_ok=True)

    def _validate_object_id(self, object_id: str) -> str:
        if not object_id or not re.match(r'^[a-zA-Z0-9_-]+$', object_id):
            raise ValueError(f"Invalid object_id: {object_id}")
        file_path = os.path.abspath(os.path.join(self.objects_dir, object_id))
        # Ensure path stays within objects_dir (prevent path traversal)
        if not file_path.startswith(self.objects_dir):
            raise ValueError(f"Path traversal detected for object_id: {object_id}")
        return file_path

    def store_object(self, object_id: str, data: bytes) -> Dict[str, Any]:
        """Writes bytes to disk atomically via temporary file and returns size & sha256 checksum."""
        file_path = self._validate_object_id(object_id)
        tmp_path = f"{file_path}.tmp"
        with open(tmp_path, "wb") as f:
            f.write(data)
        os.replace(tmp_path, file_path)
        sha256_hash = hashlib.sha256(data).hexdigest()
        return {
            "object_id": object_id,
            "size_bytes": len(data),
            "sha256": sha256_hash,
        }

    def corrupt_object(self, object_id: str) -> Dict[str, Any]:
        """Corrupts an object's physical bytes on disk deterministically while leaving node healthy."""
        file_path = self._validate_object_id(object_id)
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Object {object_id} not found on node")

        with open(file_path, "r+b") as f:
            data = f.read()
            if not data:
                f.write(b"CORRUPT")
            else:
                f.seek(0)
                # Deterministically flip first byte
                corrupted_byte = (data[0] ^ 0xFF).to_bytes(1, "little")
                f.write(corrupted_byte)

        chk = self.get_checksum(object_id)
        return {
            "object_id": object_id,
            "corrupted": True,
            "size_bytes": chk["size_bytes"] if chk else 0,
            "sha256": chk["sha256"] if chk else "",
        }

    def retrieve_object(self, object_id: str) -> Optional[bytes]:
        """Reads object bytes from disk."""
        file_path = self._validate_object_id(object_id)
        if not os.path.isfile(file_path):
            return None
        with open(file_path, "rb") as f:
            return f.read()

    def delete_object(self, object_id: str) -> bool:
        """Deletes object file from disk."""
        file_path = self._validate_object_id(object_id)
        if os.path.isfile(file_path):
            os.remove(file_path)
            return True
        return False

    def get_checksum(self, object_id: str) -> Optional[Dict[str, Any]]:
        """Calculates checksum and size for a stored object."""
        file_path = self._validate_object_id(object_id)
        if not os.path.isfile(file_path):
            return None
        hasher = hashlib.sha256()
        size = 0
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
                size += len(chunk)
        return {
            "object_id": object_id,
            "size_bytes": size,
            "sha256": hasher.hexdigest(),
        }

    def get_capacity(self) -> Dict[str, Any]:
        """Returns disk capacity statistics for the node data volume."""
        try:
            total, used, free = shutil.disk_usage(self.data_dir)
            usage_percent = round((used / total) * 100, 2) if total > 0 else 0.0
            return {
                "total_bytes": total,
                "used_bytes": used,
                "free_bytes": free,
                "total_gb": round(total / (1024**3), 2),
                "used_gb": round(used / (1024**3), 2),
                "free_gb": round(free / (1024**3), 2),
                "usage_percent": usage_percent,
            }
        except Exception as e:
            return {
                "total_bytes": 0,
                "used_bytes": 0,
                "free_bytes": 0,
                "total_gb": 0.0,
                "used_gb": 0.0,
                "free_gb": 0.0,
                "usage_percent": 0.0,
                "error": str(e),
            }

    def count_objects(self) -> int:
        """Counts files present in node objects storage directory."""
        try:
            if not os.path.exists(self.objects_dir):
                return 0
            return len([f for f in os.listdir(self.objects_dir) if os.path.isfile(os.path.join(self.objects_dir, f))])
        except Exception:
            return 0

    def list_manifest(self) -> list:
        """Returns physical object manifest stored on this node."""
        manifest = []
        try:
            if not os.path.exists(self.objects_dir):
                return manifest
            for f in os.listdir(self.objects_dir):
                file_path = os.path.join(self.objects_dir, f)
                if os.path.isfile(file_path):
                    chk = self.get_checksum(f)
                    if chk:
                        manifest.append(chk)
            return manifest
        except Exception:
            return manifest
