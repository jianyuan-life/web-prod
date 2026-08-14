"""Exact-body request authentication for local Python Fly callers.

The serialized JSON string returned by :func:`create_signed_calculator_post`
is the only body callers may send.  Re-serializing the payload after signing
changes the request hash and is intentionally unsupported.
"""

from __future__ import annotations

from dataclasses import dataclass
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from typing import Any, Mapping


REQUEST_VERSION = "jianyuan.fly.request.v1"
REQUEST_KEY_DERIVATION_CONTEXT = b"jianyuan.fly.request.v1"
NONCE_HEADER = "X-Jianyuan-Attestation-Nonce"
REQUEST_PATHS = frozenset(
    {
        "/api/calculate",
        "/api/generate-pdf",
        "/api/chumenji-top",
        "/api/generate-report-async",
    }
)
_NONCE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{22,128}$")
_SIGNING_FIELDS = (
    "version",
    "key_id",
    "issued_at",
    "nonce",
    "method",
    "path",
    "request_hash",
)


@dataclass(frozen=True)
class SignedCalculatorPost:
    body: str
    headers: dict[str, str]
    nonce: str


def _auth_environment(environment: Mapping[str, str] | None) -> tuple[str, str]:
    source = os.environ if environment is None else environment
    secret = source.get("CALCULATOR_ATTESTATION_SECRET", "")
    key_id = source.get("CALCULATOR_ATTESTATION_KEY_ID", "").strip()
    if len(secret.encode("utf-8")) < 32:
        raise ValueError("calculator request auth secret is missing or invalid")
    if not key_id or len(key_id) > 240 or any(ord(char) < 33 or ord(char) > 126 for char in key_id):
        raise ValueError("calculator request auth key id is missing or invalid")
    return secret, key_id


def _new_nonce() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(24)).decode("ascii").rstrip("=")


def _framed_message(fields: Mapping[str, str]) -> bytes:
    chunks = []
    for name in _SIGNING_FIELDS:
        value = fields[name].encode("utf-8")
        chunks.extend((f"{name}={len(value)}:".encode("utf-8"), value, b"\n"))
    return b"".join(chunks)


def create_signed_calculator_post(
    path: str,
    payload: Any,
    *,
    environment: Mapping[str, str] | None = None,
    nonce: str | None = None,
    issued_at: int | None = None,
) -> SignedCalculatorPost:
    """Serialize once, sign those UTF-8 bytes, and return body plus headers."""

    if path not in REQUEST_PATHS:
        raise ValueError("calculator request path is not allowed")
    secret, key_id = _auth_environment(environment)
    request_nonce = _new_nonce() if nonce is None else nonce
    if not _NONCE_PATTERN.fullmatch(request_nonce):
        raise ValueError("calculator request nonce is invalid")
    timestamp = int(time.time()) if issued_at is None else issued_at
    if not isinstance(timestamp, int) or isinstance(timestamp, bool) or timestamp < 0:
        raise ValueError("calculator request issued_at is invalid")
    try:
        body = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise ValueError("calculator request payload is not JSON serializable") from error
    request_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    fields = {
        "version": REQUEST_VERSION,
        "key_id": key_id,
        "issued_at": str(timestamp),
        "nonce": request_nonce,
        "method": "POST",
        "path": path,
        "request_hash": request_hash,
    }
    request_key = hmac.new(
        secret.encode("utf-8"),
        REQUEST_KEY_DERIVATION_CONTEXT,
        hashlib.sha256,
    ).digest()
    signature = hmac.new(request_key, _framed_message(fields), hashlib.sha256).hexdigest()
    return SignedCalculatorPost(
        body=body,
        nonce=request_nonce,
        headers={
            "Content-Type": "application/json",
            NONCE_HEADER: request_nonce,
            "X-Jianyuan-Request-Version": REQUEST_VERSION,
            "X-Jianyuan-Request-Key-Id": key_id,
            "X-Jianyuan-Request-Issued-At": str(timestamp),
            "X-Jianyuan-Request-Signature": signature,
        },
    )
