from pydantic_settings import BaseSettings, SettingsConfigDict

SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"


class Settings(BaseSettings):
    """Read from environment or a local .env file. Never hardcode secrets."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/callback"

    spreadsheet_id: str = ""
    scopes: list[str] = [SHEETS_SCOPE]


settings = Settings()
