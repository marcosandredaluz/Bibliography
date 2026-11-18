"""
Ponto de Entrada da Aplicação FastAPI - Bibliografia Forense Backend
Clean Architecture, Configuração Pydantic & Logging Seguro com Loguru
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.integration_word.api import router as word_router
from app.config import settings
from app.core.logger import app_logger

app = FastAPI(
    title="Bibliography Engine",
    description="Motor local de auditoria de citações, anti-alucinação e integração com processadores de texto (.DOCX)",
    version="1.0.1",
    debug=settings.DEBUG
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
