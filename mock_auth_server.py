# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Mock OAuth 2.0 + PKCE authorization server for local testing."""

import base64
import hashlib
import secrets
import time
from typing import Annotated

import uvicorn
from fastapi import FastAPI, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from jose import jwt

SECRET_KEY = "mock-secret-for-local-testing-only"
ALGORITHM = "HS256"
ISSUER = "http://localhost:9999"
ACCESS_TOKEN_TTL = 3600
REFRESH_TOKEN_TTL = 86400

_auth_codes: dict[str, dict[str, str]] = {}
_refresh_tokens: dict[str, str] = {}
_users: dict[str, str] = {
    "test@gonitro.com": "password",
}

app = FastAPI(title="Mock Nitro Auth Server")


def _make_access_token(subject: str, audience: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": subject,
            "azp": "mock-client",
            "iat": now,
            "exp": now + ACCESS_TOKEN_TTL,
            "aud": audience,
            "jti": secrets.token_hex(16),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _verify_pkce(code_verifier: str, code_challenge: str, method: str) -> bool:
    if method == "S256":
        digest = hashlib.sha256(code_verifier.encode()).digest()
        computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        return computed == code_challenge
    return code_verifier == code_challenge


@app.get("/.well-known/openid-configuration")
def openid_config() -> JSONResponse:
    return JSONResponse({
        "issuer": ISSUER,
        "authorization_endpoint": f"{ISSUER}/authorize",
        "token_endpoint": f"{ISSUER}/token",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256", "plain"],
    })


@app.get("/authorize", response_class=HTMLResponse)
def authorize(
    response_type: str = Query(...),
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    code_challenge: str = Query(...),
    code_challenge_method: str = Query("S256"),
    state: str = Query(""),
    scope: str = Query(""),
) -> HTMLResponse:
    if response_type != "code":
        raise HTTPException(400, "unsupported_response_type")

    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html>
    <head><title>Mock Nitro Login</title>
    <style>
        body {{ font-family: sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }}
        input {{ width: 100%; padding: 8px; margin: 8px 0; box-sizing: border-box; }}
        button {{ width: 100%; padding: 10px; background: #0066cc; color: white; border: none; cursor: pointer; border-radius: 4px; }}
        button:hover {{ background: #0052a3; }}
        label {{ font-size: 0.85em; color: #555; }}
    </style>
    </head>
    <body>
        <h2>Nitro Account (Mock)</h2>
        <form method="post" action="/authorize/submit" autocomplete="off">
            <input type="hidden" name="client_id" value="{client_id}">
            <input type="hidden" name="redirect_uri" value="{redirect_uri}">
            <input type="hidden" name="code_challenge" value="{code_challenge}">
            <input type="hidden" name="code_challenge_method" value="{code_challenge_method}">
            <input type="hidden" name="scope" value="{scope}">
            <input type="hidden" name="state" value="{state}">
            <label>Email</label>
            <input type="email" name="email" value="test@gonitro.com" required>
            <label>Password</label>
            <input type="password" name="password" value="password" required autocomplete="new-password">
            <button type="submit">Sign in</button>
        </form>
    </body>
    </html>
    """)


@app.post("/authorize/submit", response_model=None)
def authorize_submit(
    client_id: Annotated[str, Form()],
    redirect_uri: Annotated[str, Form()],
    code_challenge: Annotated[str, Form()],
    code_challenge_method: Annotated[str, Form()],
    state: Annotated[str, Form()],
    scope: Annotated[str, Form()],
    email: Annotated[str, Form()],
    password: Annotated[str, Form()],
) -> RedirectResponse | HTMLResponse:
    if _users.get(email) != password:
        return HTMLResponse(
            """
        <!DOCTYPE html><html><body style="font-family:sans-serif;max-width:400px;margin:100px auto;padding:20px">
        <h2>Invalid credentials</h2><p>Email or password is incorrect.</p>
        <a href="javascript:history.back()">Go back</a>
        </body></html>
        """,
            status_code=401,
        )
    code = secrets.token_urlsafe(32)
    _auth_codes[code] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "subject": email,
        "scope": scope,
    }
    sep = "&" if "?" in redirect_uri else "?"
    return RedirectResponse(f"{redirect_uri}{sep}code={code}&state={state}", status_code=302)


@app.post("/token")
async def token(request: Request) -> JSONResponse:
    form = await request.form()
    grant_type = form.get("grant_type")

    if grant_type == "authorization_code":
        code = str(form.get("code", ""))
        code_verifier = str(form.get("code_verifier", ""))
        redirect_uri = str(form.get("redirect_uri", ""))

        stored = _auth_codes.pop(code, None)
        if not stored:
            raise HTTPException(400, "invalid_grant")
        if stored["redirect_uri"] != redirect_uri:
            raise HTTPException(400, "invalid_grant")
        if not _verify_pkce(
            code_verifier, stored["code_challenge"], stored["code_challenge_method"]
        ):
            raise HTTPException(400, "invalid_grant")

        access_token = _make_access_token(stored["subject"], "api.gonitro.com")
        refresh_token = secrets.token_urlsafe(40)
        _refresh_tokens[refresh_token] = stored["subject"]

        return JSONResponse({
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": ACCESS_TOKEN_TTL,
            "refresh_token": refresh_token,
            "scope": stored["scope"],
        })

    if grant_type == "refresh_token":
        refresh_token = str(form.get("refresh_token", ""))
        subject = _refresh_tokens.pop(refresh_token, None)
        if not subject:
            raise HTTPException(400, "invalid_grant")

        access_token = _make_access_token(subject, "api.gonitro.com")
        new_refresh_token = secrets.token_urlsafe(40)
        _refresh_tokens[new_refresh_token] = subject

        return JSONResponse({
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": ACCESS_TOKEN_TTL,
            "refresh_token": new_refresh_token,
        })

    raise HTTPException(400, "unsupported_grant_type")


@app.get("/callback", response_class=HTMLResponse)
def callback(code: str = Query(...), state: str = Query("")) -> HTMLResponse:
    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html>
    <head><title>Authorized</title>
    <style>
        body {{ font-family: sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }}
        code {{ background: #f0f0f0; padding: 4px 8px; border-radius: 4px; word-break: break-all; }}
    </style>
    </head>
    <body>
        <h2>Authorization successful</h2>
        <p>Code: <code>{code}</code></p>
        <p>State: <code>{state}</code></p>
    </body>
    </html>
    """)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9999)
