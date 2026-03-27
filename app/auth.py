# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""PKCE OAuth 2.0 authentication for the MCP server."""

import base64
import hashlib
import json
import secrets
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import cast
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

_TOKEN_PATH = Path.home() / ".nitro" / "mcp_tokens.json"

CLIENT_ID = "nitro-mcp"


@dataclass(slots=True)
class TokenSet:
    access_token: str
    refresh_token: str
    expires_at: float


class _CallbackServer(HTTPServer):
    auth_url: str
    code_verifier: str
    redirect_uri: str


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
        self.wfile.write(b"<html><body><h2>Authenticated! You can close this tab.</h2></body></html>")
        try:
            r = httpx.post(
                f"{srv.auth_url}/token",
                data={
                    "grant_type": "authorization_code",
                    "code": codes[0],
                    "code_verifier": srv.code_verifier,
                    "redirect_uri": srv.redirect_uri,
                    "client_id": CLIENT_ID,
                },
                timeout=10,
            )
            r.raise_for_status()
            _save(_from_response(r.json()))
        except httpx.HTTPError:
            pass

    def log_message(self, format: str, *args: object) -> None:
        pass


def _save(tokens: TokenSet) -> None:
    _TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    _TOKEN_PATH.write_text(json.dumps({
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "expires_at": tokens.expires_at,
    }))


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


def _refresh(auth_url: str, refresh_token: str) -> TokenSet | None:
    try:
        r = httpx.post(
            f"{auth_url}/token",
            data={"grant_type": "refresh_token", "refresh_token": refresh_token, "client_id": CLIENT_ID},
            timeout=10,
        )
        if r.status_code != 200:
            return None
        tokens = _from_response(r.json())
        _save(tokens)
        return tokens
    except httpx.HTTPError:
        return None


def start_auth_flow(auth_url: str) -> str:
    """Spin up a loopback callback server, return the authorization URL for the user to visit.

    The server runs in a background thread and saves the token once the user completes the flow.
    """
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)

    server = _CallbackServer(("localhost", 0), _CallbackHandler)
    server.auth_url = auth_url
    server.code_verifier = code_verifier
    port = server.server_address[1]
    redirect_uri = f"http://localhost:{port}/callback"
    server.redirect_uri = redirect_uri

    def _serve() -> None:
        server.handle_request()
        server.server_close()

    threading.Thread(target=_serve, daemon=True).start()

    params = urlencode({
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "scope": "openid",
    })
    return f"{auth_url}/authorize?{params}"


def resolve_token(auth_url: str) -> str | None:
    """Return a valid access token if one exists, otherwise None."""
    stored = _load()
    if stored is None:
        return None

    if time.time() < stored.expires_at - 60:
        return stored.access_token

    refreshed = _refresh(auth_url, stored.refresh_token)
    if refreshed is None:
        _TOKEN_PATH.unlink(missing_ok=True)
        return None

    return refreshed.access_token
