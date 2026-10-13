"""Private storage for user-uploaded stretch illustrations."""

import io
import logging
import os
import uuid
from functools import lru_cache
from typing import Any, BinaryIO

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_PIXELS = 24_000_000
IMAGE_SIZE = (640, 480)


class ImageStorageUnavailable(Exception):
    """Raised when durable image storage is not configured or reachable."""


def _normalized_image(upload: BinaryIO) -> bytes:
    # Validate the actual payload, not just the browser-provided MIME type.
    upload.seek(0, os.SEEK_END)
    if upload.tell() > MAX_IMAGE_BYTES:
        raise ValueError("Image must be no larger than 2 MB.")
    upload.seek(0)
    try:
        with Image.open(upload) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Upload a valid JPEG, PNG, or WebP image.")
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise ValueError("Image dimensions are too large.")
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail(IMAGE_SIZE, Image.Resampling.LANCZOS)
            # Pad instead of stretching, so every catalog thumbnail has the same
            # dimensions without changing the proportions of the original image.
            canvas = Image.new("RGB", IMAGE_SIZE, "white")
            canvas.paste(
                image,
                (
                    (IMAGE_SIZE[0] - image.width) // 2,
                    (IMAGE_SIZE[1] - image.height) // 2,
                ),
            )
            output = io.BytesIO()
            canvas.save(output, format="WEBP", quality=82, method=6)
            return output.getvalue()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Upload a valid JPEG, PNG, or WebP image.") from exc


@lru_cache(maxsize=2)
def _s3_client(region_name: str) -> Any:
    return boto3.client(
        "s3",
        region_name=region_name,
        config=Config(connect_timeout=3, read_timeout=8, retries={"max_attempts": 2}),
    )


def save_stretch_image(upload: BinaryIO, user_id: object, exercise_id: object) -> str:
    content = _normalized_image(upload)
    bucket = os.environ.get("STRETCH_IMAGE_BUCKET", "").strip()
    # Scope object keys by account and exercise; the random suffix makes image
    # replacement write a new object before the previous one is removed.
    key = f"stretching/{user_id}/{exercise_id}/{uuid.uuid4()}.webp"
    if not bucket:
        # Local development may use MEDIA_ROOT, but production must use durable
        # storage so uploads are not lost when an application container changes.
        if not settings.DEBUG:
            raise ImageStorageUnavailable(
                "Image uploads are not configured on this server."
            )
        return default_storage.save(key, ContentFile(content))
    try:
        # Keep the bucket private; reads are streamed only after API owner checks.
        _s3_client(os.environ.get("AWS_REGION", "eu-central-1")).put_object(
            Bucket=bucket,
            Key=key,
            Body=content,
            ContentType="image/webp",
            ServerSideEncryption="AES256",
        )
    except (BotoCoreError, ClientError) as exc:
        logger.warning("Stretch image upload failed (%s)", type(exc).__name__)
        raise ImageStorageUnavailable(
            "Image could not be stored. Please retry."
        ) from exc
    return key


def open_stretch_image(key: str) -> BinaryIO:
    bucket = os.environ.get("STRETCH_IMAGE_BUCKET", "").strip()
    if not bucket:
        try:
            return default_storage.open(key, "rb")
        except OSError as exc:
            logger.warning("Stretch image read failed (%s)", type(exc).__name__)
            raise ImageStorageUnavailable(
                "Image could not be read. Please retry."
            ) from exc
    try:
        # Keep private images behind the authenticated owner-checking API path.
        return _s3_client(os.environ.get("AWS_REGION", "eu-central-1")).get_object(
            Bucket=bucket, Key=key
        )["Body"]
    except (BotoCoreError, ClientError) as exc:
        logger.warning("Stretch image read failed (%s)", type(exc).__name__)
        raise ImageStorageUnavailable(
            "Image could not be read. Please retry."
        ) from exc


def delete_stretch_image(key: str) -> None:
    def delete() -> None:
        bucket = os.environ.get("STRETCH_IMAGE_BUCKET", "").strip()
        try:
            if bucket:
                _s3_client(os.environ.get("AWS_REGION", "eu-central-1")).delete_object(
                    Bucket=bucket, Key=key
                )
            else:
                default_storage.delete(key)
        except (BotoCoreError, ClientError, OSError) as exc:
            logger.warning("Stretch image cleanup failed (%s)", type(exc).__name__)

    # Don't remove an image if the database transaction that replaced or deleted
    # its reference rolls back.
    transaction.on_commit(delete)
