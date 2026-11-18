"""
Ponto de Entrada da Aplicação FastAPI - Bibliografia Forense Backend
Clean Architecture, Configuração Pydantic & Logging Seguro com Loguru
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import re
from app.integration_word.api import router as word_router
from app.config import settings
from app.core.logger import app_logger

app = FastAPI(
    title="Bibliography Engine",
    description="Motor local de auditoria de citações, anti-alucinação e integração com processadores de texto (.DOCX)",
    version="1.0.1",
    debug=settings.DEBUG
)

_LOCAL_HOST_RE = re.compile(r"^(?:127\.0\.0\.1|localhost|testserver)(?::\d{1,5})?$", re.IGNORECASE)

@app.middleware("http")
async def validar_host_local(request: Request, call_next):
    host = request.headers.get("host", "")
    if host and not _LOCAL_HOST_RE.match(host.strip()):
        return JSONResponse({"detail": "Host não autorizado"}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Cache-Control", "no-store")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:23119",
        "http://localhost:23119",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_origin_regex=r"^https?://(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(word_router)

@app.on_event("startup")
async def ao_iniciar():
    app_logger.info(f"Iniciando Bibliografia Engine no host {settings.APP_HOST}:{settings.APP_PORT} (Env: {settings.APP_ENV})")

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "app": "Bibliografia Forense Engine",
        "version": "0.2.0",
        "environment": settings.APP_ENV
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.APP_HOST, port=settings.APP_PORT, reload=settings.DEBUG)
