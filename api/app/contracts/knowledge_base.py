from pathlib import PurePath
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

DocumentId = Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]
FORMATS = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".csv": "text/csv",
    ".json": "application/json",
}


class ResourceListParams(BaseModel):
    q: str = Field(default="", max_length=200, pattern=r"^[^\x00]*$")
    status: Literal["WAITING_UPLOAD", "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"] | None = None
    page: int = Field(default=1, ge=1, le=2147483647)
    page_size: int = Field(default=25, ge=1, le=100)


class JsonExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    textField: str = Field(min_length=1, max_length=200)
    titleField: str | None = Field(default=None, min_length=1, max_length=200)


class ResourceMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=200, pattern=r"^[^\x00-\x1f\x7f]*$")
    description: str | None = Field(default=None, max_length=160, pattern=r"^[^\x00-\x1f\x7f]*$")


class RegisterDocument(ResourceMetadata):
    filename: str = Field(min_length=1, max_length=200)
    content_type: str
    jsonExtraction: JsonExtraction | None = None

    @model_validator(mode="after")
    def supported_format(self):
        suffix = PurePath(self.filename).suffix.lower()
        if "/" in self.filename or "\\" in self.filename or any(ord(c) < 32 for c in self.filename):
            raise ValueError("Provide a filename without a path or control characters")
        if FORMATS.get(suffix) != self.content_type:
            raise ValueError("Unsupported file format or Content-Type")
        if (suffix == ".json") != (self.jsonExtraction is not None):
            raise ValueError("JSON resources require text field selections; other formats must omit them")
        return self


class ToggleResources(BaseModel):
    model_config = ConfigDict(extra="forbid")
    documentIds: list[DocumentId] = Field(min_length=1, max_length=500)
    enabled: StrictBool


class RetrievalQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=1000)
    documentId: DocumentId | None = None

    @model_validator(mode="after")
    def nonempty(self):
        self.query = self.query.strip()
        if not self.query:
            raise ValueError("Enter a retrieval query")
        return self
