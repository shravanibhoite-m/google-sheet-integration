# Sheet Integration

Google Sheets integration service. Python managed with [uv](https://docs.astral.sh/uv/).

## Setup

```bash
uv sync                  # install dependencies from uv.lock
cp .env.example .env     # then fill in your Google OAuth values
```

## Run

```bash
uv run uvicorn src.main:app --reload
```

Open http://localhost:8000/docs for the API docs.

## Dependency commands

| Task | Command |
| --- | --- |
| Add a package | `uv add <pkg>` |
| Remove a package | `uv remove <pkg>` |
| Install from lock | `uv sync` |
| Run anything in the env | `uv run <cmd>` |
| Change Python version | `uv python pin <version>` |

## Folder structure

```
src/
  main.py         FastAPI app, wires the routers together
  config.py       settings read from .env (no hardcoded secrets)
  schemas/        Pydantic request/response models only
  services/       business logic + Google API calls
  routes/         HTTP endpoints, thin - they call services
```

Rule of thumb: **routes** handle HTTP, **services** do the work, **schemas** define the shapes. A route should never call the Google API directly.

## Google OAuth flow

1. `GET /auth/url` returns the Google consent URL and a `state` value.
2. User grants access; Google redirects to `GET /auth/callback`.
3. Pass that same `state` to `/sheets/values` to act as that user.

Tokens currently live in an in-memory dict in `src/services/google_auth.py`. Replace that with a real store (DB or Redis) before production.

## Quota handling

- Reads use `batchGet` and writes use `batchUpdate`, so N ranges cost 1 API call.
- `429` and `5xx` responses retry with exponential backoff + jitter (5 attempts) via `tenacity`.
