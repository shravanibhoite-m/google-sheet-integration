"""Google Sheets API access. Batched calls + backoff to stay inside quotas."""

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
)

# Google returns 429 when the per-minute quota is hit, 5xx when it is busy.
RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def _is_retryable(exc: BaseException) -> bool:
    return isinstance(exc, HttpError) and exc.resp.status in RETRYABLE_STATUS


backoff = retry(
    retry=retry_if_exception(_is_retryable),
    wait=wait_exponential_jitter(initial=1, max=30),
    stop=stop_after_attempt(5),
    reraise=True,
)


class SheetsService:
    def __init__(self, credentials: Credentials) -> None:
        self._api = build(
            "sheets", "v4", credentials=credentials, cache_discovery=False
        ).spreadsheets()

    @backoff
    def read(self, spreadsheet_id: str, ranges: list[str]) -> list[dict]:
        """One batchGet for all ranges instead of one call per range."""
        response = (
            self._api.values()
            .batchGet(spreadsheetId=spreadsheet_id, ranges=ranges)
            .execute()
        )
        return response.get("valueRanges", [])

    @backoff
    def write(self, spreadsheet_id: str, updates: list[dict]) -> int:
        """One batchUpdate for all ranges. Returns the number of updated cells."""
        body = {"valueInputOption": "USER_ENTERED", "data": updates}
        response = (
            self._api.values()
            .batchUpdate(spreadsheetId=spreadsheet_id, body=body)
            .execute()
        )
        return response.get("totalUpdatedCells", 0)
