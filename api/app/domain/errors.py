"""Application failures shared by domain rules, services and HTTP mapping."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, *, headers: dict[str, str] | None = None):
        self.status, self.code, self.message = status, code, message
        self.headers = headers
