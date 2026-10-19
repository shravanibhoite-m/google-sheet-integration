from fastapi import APIRouter, Depends, HTTPException, Query

from src.config import settings
from src.schemas.sheet import ReadResponse, WriteRequest, WriteResponse
from src.services.google_auth import get_credentials
from src.services.sheets import SheetsService

router = APIRouter(prefix="/sheets", tags=["sheets"])


def sheets_service(state: str = Query(..., description="OAuth session state")) -> SheetsService:
    """Resolve the caller's credentials into a ready-to-use service."""
    credentials = get_credentials(state)
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated with Google")
    return SheetsService(credentials)


@router.get("/values", response_model=list[ReadResponse])
def read_values(
    ranges: list[str] = Query(..., description="A1 ranges, e.g. Sheet1!A1:D50"),
    service: SheetsService = Depends(sheets_service),
) -> list[ReadResponse]:
    value_ranges = service.read(settings.spreadsheet_id, ranges)
    return [
        ReadResponse(range=item.get("range", ""), values=item.get("values", []))
        for item in value_ranges
    ]


@router.post("/values", response_model=WriteResponse)
def write_values(
    payload: WriteRequest,
    service: SheetsService = Depends(sheets_service),
) -> WriteResponse:
    updates = [{"range": u.range, "values": u.values} for u in payload.updates]
    updated = service.write(settings.spreadsheet_id, updates)
    return WriteResponse(updated_cells=updated)
