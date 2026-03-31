# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""PKCE OAuth 2.0 authentication for the MCP server."""

import base64
import hashlib
import json
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import cast
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

_TOKEN_PATH = Path.home() / ".nitro" / "mcp_tokens.json"
_CALLBACK_PORTS = [27834, 41209, 53671, 19438, 62105]
_DEBUG_DIR = Path(__file__).parent.parent


@dataclass(slots=True)
class TokenSet:
    access_token: str
    refresh_token: str
    expires_at: float


class _CallbackServer(HTTPServer):
    auth_url: str
    client_id: str
    code_verifier: str
    redirect_uri: str
    token_saved: bool


class _CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        srv = cast(_CallbackServer, self.server)
        qs = parse_qs(urlparse(self.path).query)
        codes = qs.get("code", [])
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        if not codes:
            self.wfile.write(b"<html><body><h2>Missing code. Please try again.</h2></body></html>")
            return
        self.wfile.write(_SUCCESS_HTML)
        r = httpx.post(
            f"{srv.auth_url}/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": codes[0],
                "code_verifier": srv.code_verifier,
                "redirect_uri": srv.redirect_uri,
                "client_id": srv.client_id,
            },
            timeout=10,
        )
        _write_debug_response(r.text)
        r.raise_for_status()
        _save(_from_response(r.json()))
        srv.token_saved = True

    def log_message(self, format: str, *args: object) -> None:
        pass


def _write_debug_response(body: str) -> None:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    (_DEBUG_DIR / f"{ts}.txt").write_text(body)


def _save(tokens: TokenSet) -> None:
    _TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    _TOKEN_PATH.write_text(
        json.dumps({
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "expires_at": tokens.expires_at,
        })
    )


def _load() -> TokenSet | None:
    if not _TOKEN_PATH.exists():
        return None
    data = json.loads(_TOKEN_PATH.read_text())
    return TokenSet(
        access_token=data["access_token"],
        refresh_token=data["refresh_token"],
        expires_at=data["expires_at"],
    )


def _from_response(data: dict[str, object]) -> TokenSet:
    raw_expires = data.get("expires_in")
    expires_in = int(raw_expires) if isinstance(raw_expires, int | float | str) else 3600
    return TokenSet(
        access_token=str(data["access_token"]),
        refresh_token=str(data["refresh_token"]),
        expires_at=time.time() + expires_in,
    )


def _refresh(auth_url: str, client_id: str, refresh_token: str) -> TokenSet | None:
    try:
        r = httpx.post(
            f"{auth_url}/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
            },
            timeout=10,
        )
        if r.status_code != 200:
            return None
        tokens = _from_response(r.json())
        _save(tokens)
        return tokens
    except httpx.HTTPError:
        return None


_SUCCESS_HTML: bytes = (
    b"<!DOCTYPE html><html><head><meta charset='utf-8'><title>Signed in to Nitro</title>"
    b"<style>"
    b"body{margin:0;display:flex;align-items:center;justify-content:center;"
    b"height:100vh;font-family:-apple-system,BlinkMacSystemFont,sans-serif;"
    b"background:#f9f9f9;color:#111}"
    b".card{text-align:center;padding:48px;background:white;"
    b"border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.08)}"
    b".check{font-size:48px;margin-bottom:16px}"
    b"h1{font-size:20px;font-weight:600;margin:0 0 8px}"
    b"p{font-size:14px;color:#666;margin:0}"
    b"</style></head><body>"
    b"<div class='card'>"
    b"<div class='check'>&#x2705;</div>"
    b"<h1>Signed in to Nitro</h1>"
    b"<p>You can close this tab.</p>"
    b"</div>"
    b"<script>setTimeout(()=>window.close(),2000)</script>"
    b"</body></html>"
)


def _bind_callback_server() -> _CallbackServer:
    for port in _CALLBACK_PORTS:
        try:
            return _CallbackServer(("localhost", port), _CallbackHandler)
        except OSError:
            continue
    raise RuntimeError("No available callback ports. Ensure one of the registered ports is free.")


def start_auth_flow(auth_url: str, client_id: str) -> str:
    """Spin up a loopback callback server and return the authorization URL for the user to visit."""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)

    server = _bind_callback_server()
    port = server.server_address[1]
    server.auth_url = auth_url
    server.client_id = client_id
    server.code_verifier = code_verifier
    server.token_saved = False
    redirect_uri = f"http://localhost:{port}/callback"
    server.redirect_uri = redirect_uri

    def _serve() -> None:
        while not server.token_saved:
            server.handle_request()
        server.server_close()

    threading.Thread(target=_serve, daemon=True).start()

    params = urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "scope": "openid offline_access",
    })
    authorize_url = f"{auth_url}/authorize?{params}"

    return authorize_url


def resolve_token(auth_url: str, client_id: str) -> str | None:
    """Return a valid access token if one exists, otherwise None."""
    stored = _load()
    if stored is None:
        return None

    if time.time() < stored.expires_at - 60:
        return stored.access_token

    refreshed = _refresh(auth_url, client_id, stored.refresh_token)
    if refreshed is None:
        _TOKEN_PATH.unlink(missing_ok=True)
        return None

    return refreshed.access_token
