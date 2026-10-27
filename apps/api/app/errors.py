"""오류 코드 (상세설계 v1.3 'API' 오류 코드). 응답: {error, message(M-xxx), fields?}. 화면은 message로 문구 표시"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

ERRORS = {
    "E-VALID": (400, "M-160"),
    "E-AREA": (400, "M-141"),
    "E-AUTH": (401, "M-151"),
    "E-PAY": (402, "M-173"),
    "E-AMOUNT": (402, "M-175"),
    "E-FORBID": (403, "M-191"),
    "E-NOTFOUND": (404, "M-190"),
    "E-SEAT": (409, "M-120"),
    "E-DUE": (409, "M-209"),
    "E-CLOSED": (409, "M-153"),
    "E-HOLD": (410, "M-171"),
    "E-SOLDOUT": (409, "M-174"),
    "E-STATE": (409, "M-900"),
    "E-PARTNER": (502, "M-900"),  # 본 사이트 연동 오류 (연결 실패·키 오류 등)
    "E-SERVER": (500, "M-900"),
}


class ApiError(Exception):
    def __init__(self, code: str, fields: list[dict] | None = None, extra: dict | None = None):
        super().__init__(code)
        self.code, self.fields, self.extra = code, fields, extra


def fail(code: str, fields: list[dict] | None = None, extra: dict | None = None):
    """extra: 응답에 더 넣을 값 (예: E-AUTH 의 loginUrl)"""
    raise ApiError(code, fields, extra)


def _body(code: str, fields: list[dict] | None = None, extra: dict | None = None) -> JSONResponse:
    status, msg = ERRORS[code]
    b = {"error": code, "message": msg, **(extra or {})}
    if fields:
        b["fields"] = fields
    return JSONResponse(b, status_code=status)


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return _body(e.code, e.fields, e.extra)

    from .adapters.partner import PartnerError

    @app.exception_handler(PartnerError)
    async def _partner(_: Request, e: PartnerError):
        import logging

        logging.getLogger("golf.partner").warning("partner error %s %s", e.status, e.code)
        return _body("E-PARTNER", extra={"partnerError": e.code})

    @app.exception_handler(RequestValidationError)
    async def _valid(_: Request, e: RequestValidationError):
        fields = [{"field": ".".join(str(x) for x in err["loc"][1:]), "rule": err["type"]} for err in e.errors()]
        return _body("E-VALID", fields)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return _body("E-NOTFOUND" if e.status_code == 404 else "E-SERVER")

    @app.exception_handler(Exception)
    async def _any(_: Request, e: Exception):
        import logging

        logging.getLogger("golf").exception(e)
        return _body("E-SERVER")
