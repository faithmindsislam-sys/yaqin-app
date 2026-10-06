from functools import partial
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.contracts.knowledge_base import (
    DocumentId,
    RegisterDocument,
    ResourceMetadata,
    ResourceListParams,
    RetrievalQuery,
    ToggleResources,
)
from app.dependencies import get_services
from app.domain.errors import ApiError
from app.http.auth import require_role
from app.http.rate_limit import limit

router = APIRouter(prefix="/admin/rag", dependencies=[Depends(require_role("admin"))])


def _rag(request: Request, services=Depends(get_services)):
    return partial(services.rag.request, authorization=request.headers.get("authorization", ""))


@router.post("/documents", status_code=201)
async def register(body: RegisterDocument, rag=Depends(_rag)):
    return await rag("POST", "/documents", body.model_dump(exclude_none=True))


@router.get("/documents/{document_id}/status")
async def status(document_id: DocumentId, rag=Depends(_rag)):
    return await rag("GET", f"/documents/{document_id}/status")


@router.get("/resources")
async def resources(params: Annotated[ResourceListParams, Query()], rag=Depends(_rag)):
    return await rag("GET", "/resources", params=params.model_dump(exclude_none=True))


@router.post("/resources/toggle")
async def toggle(body: ToggleResources, rag=Depends(_rag)):
    return await rag("POST", "/resources/toggle", body.model_dump())


@router.post("/resources/{document_id}/metadata")
async def metadata(document_id: DocumentId, body: ResourceMetadata, rag=Depends(_rag)):
    if not body.model_fields_set:
        raise ApiError(400, "invalid_metadata", "Provide a title or short description.")
    return await rag("POST", f"/resources/{document_id}/metadata", body.model_dump(exclude_unset=True))


@router.post("/resources/{document_id}/delete")
async def delete(document_id: DocumentId, rag=Depends(_rag)):
    return await rag("POST", f"/resources/{document_id}/delete", {})


@router.post("/retrieval/test", dependencies=[Depends(limit)])
async def retrieve(body: RetrievalQuery, rag=Depends(_rag)):
    return await rag("POST", "/retrieval/test", body.model_dump(exclude_none=True))
