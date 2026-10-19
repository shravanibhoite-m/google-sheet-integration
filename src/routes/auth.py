from fastapi import APIRouter, HTTPException

from src.schemas.auth import AuthCallbackResponse, AuthUrlResponse
from src.services import google_auth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/url", response_model=AuthUrlResponse)
def get_auth_url() -> AuthUrlResponse:
    url, state = google_auth.authorization_url()
    return AuthUrlResponse(authorization_url=url, state=state)


@router.get("/callback", response_model=AuthCallbackResponse)
def auth_callback(code: str, state: str) -> AuthCallbackResponse:
    try:
        google_auth.exchange_code(code=code, state=state)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"OAuth failed: {exc}") from exc
    return AuthCallbackResponse(ok=True)
