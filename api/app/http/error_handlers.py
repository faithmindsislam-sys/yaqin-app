from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.domain.errors import ApiError

CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    422: "bad_request",
    429: "rate_limited",
}


def _body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        headers = e.headers or ({"WWW-Authenticate": "Bearer"} if e.status == 401 else None)
        return JSONResponse(_body(e.code, e.message), status_code=e.status, headers=headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return JSONResponse(_body(CODES.get(e.status_code, "error"), str(e.detail)), status_code=e.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        first = e.errors()[0] if e.errors() else {}
        where = ".".join(str(x) for x in first.get("loc", []) if x != "body")
        return JSONResponse(_body("bad_request", f"{where}: {first.get('msg', 'invalid request')}"), status_code=400)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, e: Exception):
        return JSONResponse(_body("internal", "Something went wrong on our side."), status_code=500)
