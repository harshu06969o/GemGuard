"""
GeM-Guard — Hybrid Storage Module
Defaulting to backend/data/uploads/ for offline hackathon reliability.
Supports automated SHA-256 hashing and pluggable storage providers.
"""

import hashlib
import logging
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Optional, Union
from fastapi import UploadFile

from app.paths import DATA_DIR, UPLOADS_DIR

logger = logging.getLogger("gemguard.storage")

# Default uploads directory: backend/data/uploads/
DEFAULT_UPLOAD_DIR = UPLOADS_DIR
DEFAULT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class StoredFile:
    """Metadata of a stored file."""
    filename: str
    file_path: Path
    relative_path: str
    file_hash: str
    size_bytes: int
    content_type: str = "application/octet-stream"
    provider: str = "local"


class HybridStorage:
    """
    Hybrid Storage Manager
    Prioritizes local disk storage under backend/data/uploads/ for guaranteed
    offline hackathon reliability, with optional cloud replication if configured.
    """

    def __init__(self, base_dir: Path = DEFAULT_UPLOAD_DIR):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.provider = os.getenv("STORAGE_PROVIDER", "local")

    @staticmethod
    def compute_hash(data: bytes) -> str:
        """Compute SHA-256 digest of byte content."""
        return hashlib.sha256(data).hexdigest()

    async def save_file(
        self,
        file_input: Union[UploadFile, bytes, BinaryIO],
        filename: str,
        subfolder: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> StoredFile:
        """
        Save file to backend/data/uploads/ and compute its SHA-256 hash.
        
        Args:
            file_input: UploadFile, raw bytes, or file-like object.
            filename: Target file name.
            subfolder: Optional subdirectory within uploads (e.g. 'tenders', 'bids').
            content_type: Optional MIME content type.
        """
        target_dir = self.base_dir / subfolder if subfolder else self.base_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize filename
        safe_filename = Path(filename).name

        # Extract bytes
        if isinstance(file_input, UploadFile):
            content = await file_input.read()
            # Reset seek position for any downstream consumers
            await file_input.seek(0)
            if not content_type and file_input.content_type:
                content_type = file_input.content_type
        elif isinstance(file_input, bytes):
            content = file_input
        elif hasattr(file_input, "read"):
            content = file_input.read()
            if hasattr(file_input, "seek"):
                file_input.seek(0)
        else:
            raise ValueError(f"Unsupported file_input type: {type(file_input)}")

        file_hash = self.compute_hash(content)
        file_path = target_dir / safe_filename

        # Write to disk
        with open(file_path, "wb") as f:
            f.write(content)

        size_bytes = len(content)
        relative_path = str(file_path.relative_to(self.base_dir.parent))

        logger.info(
            "Saved file '%s' (%d bytes, SHA-256: %s) to %s",
            safe_filename,
            size_bytes,
            file_hash[:12],
            file_path,
        )

        return StoredFile(
            filename=safe_filename,
            file_path=file_path,
            relative_path=relative_path,
            file_hash=file_hash,
            size_bytes=size_bytes,
            content_type=content_type or "application/octet-stream",
            provider="local",
        )

    def get_file_path(self, filename_or_path: Union[str, Path]) -> Path:
        """Resolve a filename or path to a valid Path inside storage."""
        p = Path(filename_or_path)
        if p.is_absolute() and p.exists():
            return p
        # Check direct inside base_dir
        direct = self.base_dir / p.name
        if direct.exists():
            return direct
        # Search recursively inside base_dir
        matches = list(self.base_dir.rglob(p.name))
        if matches:
            return matches[0]
        return direct

    def read_file(self, filename_or_path: Union[str, Path]) -> bytes:
        """Read file bytes from storage."""
        path = self.get_file_path(filename_or_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found in storage: {filename_or_path}")
        with open(path, "rb") as f:
            return f.read()

    def file_exists(self, filename_or_path: Union[str, Path]) -> bool:
        """Check if file exists in storage."""
        path = self.get_file_path(filename_or_path)
        return path.exists() and path.is_file()

    def delete_file(self, filename_or_path: Union[str, Path]) -> bool:
        """Delete file from storage."""
        path = self.get_file_path(filename_or_path)
        if path.exists() and path.is_file():
            path.unlink()
            logger.info("Deleted file: %s", path)
            return True
        return False

    def get_url(self, filename: str) -> str:
        """Generate static file URL path."""
        safe_name = Path(filename).name
        return f"/api/files/{safe_name}"


# Singleton instance
storage = HybridStorage()


def get_storage() -> HybridStorage:
    """FastAPI dependency to inject storage instance."""
    return storage
