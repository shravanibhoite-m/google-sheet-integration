from pydantic import BaseModel, Field


class ReadResponse(BaseModel):
    """Values for one A1 range, e.g. 'Sheet1!A1:D50'."""

    range: str
    values: list[list[str]] = Field(default_factory=list)


class RangeUpdate(BaseModel):
    range: str
    values: list[list[str]]


class WriteRequest(BaseModel):
    """Several ranges in one request so we spend one API call, not many."""

    updates: list[RangeUpdate]


class WriteResponse(BaseModel):
    updated_cells: int
