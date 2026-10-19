from fastapi import FastAPI

from src.routes import auth, sheets

app = FastAPI(title="Sheet Integration")

app.include_router(auth.router)
app.include_router(sheets.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
