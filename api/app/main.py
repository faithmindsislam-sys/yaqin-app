import asyncio
import logging
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse

from app.configuration.settings import get_settings
from app.domain.operations import diagnostic
from app.container import create_repository, create_services
from app.controllers import (
    admin_controller,
    content_controller,
    curriculum_controller,
    health_controller,
    knowledge_base_controller,
    mcp_controller,
    public_controller,
    review_controller,
    speech_controller,
    tutor_controller,
)
from app.http import error_handlers
from app.http.developer_docs import EXAMPLES, brand_technical_docs, render_developer_docs
from app.http.public_boundary import PublicBoundary
from app.services.lesson_service import _BACKGROUND

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings = get_settings()
    async with AsyncExitStack() as stack:
        repository = await create_repository(settings)
        stack.push_async_callback(repository.close)
        services = create_services(repository, settings)
        diagnostic("runtime_config", default_model=settings.bedrock_model_id,
                   tutor_model=settings.tutor_model_id or settings.bedrock_model_id,
                   fast_model=settings.fast_model_id or settings.bedrock_model_id,
                   tutor_runtime="remote" if services.agent.enabled else "local",
                   review_skip_tiers=settings.review_skip_tiers, tutor_seconds=settings.tutor_seconds,
                   tutor_model_calls=settings.tutor_model_calls, tutor_tokens=settings.tutor_tokens,
                   repository=type(repository).__name__)
        # Register storage cleanup before composition so startup failures cannot leak it.
        stack.push_async_callback(services.embeddings.close)
        stack.push_async_callback(services.llm.close)
        stack.push_async_callback(services.rag.close)
        stack.push_async_callback(services.agent.close)
        stack.push_async_callback(services.speech_gateway.close)
        application.state.services = services
        if getattr(application.state, "mcp_server", None) is not None:
            await stack.enter_async_context(application.state.mcp_server.session_manager.run())
        async def recover():
            while True:
                try:
                    await repository.expire_draft_jobs(settings.course_seconds + 30)
                except Exception:
                    logging.warning("draft_recovery_unavailable")
                await asyncio.sleep(30)
        recovery = asyncio.create_task(recover())
        try:
            yield
        finally:
            recovery.cancel()
            await asyncio.gather(recovery, return_exceptions=True)
            tasks = list(_BACKGROUND)
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


def create_app() -> FastAPI:
    application = FastAPI(
        title="Yaqeen API", version="0.1.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json"
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["authorization", "content-type", "mcp-protocol-version", "mcp-session-id"],
        expose_headers=["WWW-Authenticate", "Retry-After", "Mcp-Session-Id"],
    )
    error_handlers.install(application)
    for controller in (
        health_controller,
        content_controller,
        curriculum_controller,
        tutor_controller,
        review_controller,
        admin_controller,
        knowledge_base_controller,
        speech_controller,
    ):
        application.include_router(controller.router, prefix="/api")
    public_api = FastAPI(
        title="Yaqeen Public API", version="1.0.0", docs_url=None, redoc_url=None,
        description="Read published courses and approved sources, or ask the tutor in English and Arabic.\n\n"
                    "In [Swagger](/api/v1/swagger), click **Authorize** and paste only your access token "
                    "(without `Bearer`) to try requests.\n\n"
                    "[Developer guide](/api/v1/docs) · [Full schema reference](/api/v1/reference)",
        swagger_ui_parameters={"defaultModelsExpandDepth": -1, "displayRequestDuration": True,
                               "persistAuthorization": False, "validatorUrl": None},
        servers=[{"url": "/api/v1"}],
    )
    # One lifecycle owns providers, authentication and dependency overrides for both interfaces.
    public_api.state = application.state
    public_api.dependency_overrides = application.dependency_overrides
    public_api.add_middleware(PublicBoundary)
    error_handlers.install(public_api)
    for route in public_controller.router.routes:
        if getattr(route, "path", None) in EXAMPLES:
            route.responses[200] = {"content": {"application/json": {"example": EXAMPLES[route.path]}}}
    public_api.include_router(public_controller.router)
    developer_guide = render_developer_docs(public_api.openapi(), technical_base="/api/v1")

    @public_api.get("/swagger", include_in_schema=False, response_class=HTMLResponse)
    async def public_swagger():
        html = get_swagger_ui_html(openapi_url="/api/v1/openapi.json", title="Yaqeen Public API · Swagger",
                                   swagger_ui_parameters=public_api.swagger_ui_parameters)
        return HTMLResponse(brand_technical_docs(html.body.decode()))

    @public_api.get("/reference", include_in_schema=False, response_class=HTMLResponse)
    async def public_reference():
        html = get_redoc_html(openapi_url="/api/v1/openapi.json", title="Yaqeen Public API · Reference",
                              with_google_fonts=False)
        return HTMLResponse(brand_technical_docs(html.body.decode()))

    @public_api.get("/docs", include_in_schema=False, response_class=HTMLResponse)
    async def developer_docs(download: bool = False):
        if download:
            return HTMLResponse(render_developer_docs(public_api.openapi()),
                                headers={"Content-Disposition": 'attachment; filename="yaqeen-developer-guide-v1.html"'})
        return HTMLResponse(developer_guide)

    if get_settings().mcp_resource_url:
        server, transport = mcp_controller.create_mcp(application, get_settings())
        application.state.mcp_server = server
        application.mount("/api/v1/mcp", transport)
    application.mount("/api/v1", public_api)
    return application


app = create_app()
