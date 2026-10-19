from pydantic import BaseModel


class AuthUrlResponse(BaseModel):
    authorization_url: str
    state: str


class AuthCallbackResponse(BaseModel):
    ok: bool
