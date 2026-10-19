"""Google OAuth 2.0 flow using the official google-auth-oauthlib library."""

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from src.config import settings

# Swap this for a real store (DB / Redis) before production.
# One process-local dict is fine for local development only.
_TOKEN_STORE: dict[str, Credentials] = {}


def _build_flow(state: str | None = None) -> Flow:
    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=settings.scopes,
        redirect_uri=settings.google_redirect_uri,
        state=state,
    )


def authorization_url() -> tuple[str, str]:
    """Step 1: send the user here to grant access."""
    url, state = _build_flow().authorization_url(
        access_type="offline",  # we need a refresh token
        include_granted_scopes="true",
        prompt="consent",
    )
    return url, state


def exchange_code(code: str, state: str) -> None:
    """Step 2: Google redirects back with a code; trade it for tokens."""
    flow = _build_flow(state=state)
    flow.fetch_token(code=code)
    _TOKEN_STORE[state] = flow.credentials


def get_credentials(state: str) -> Credentials | None:
    """Return valid credentials, refreshing them if the access token expired."""
    creds = _TOKEN_STORE.get(state)
    if creds is None:
        return None
    if not creds.valid and creds.refresh_token:
        creds.refresh(Request())
        _TOKEN_STORE[state] = creds
    return creds
