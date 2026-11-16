"""
Módulo de Configuração e Validação de Variáveis de Ambiente
Utiliza pydantic-settings com validação estrita de tipos na inicialização.
"""
import os
from typing import Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class AppSettings(BaseSettings):
    """Configurações da aplicação validadas na inicialização."""
    
    # Servidor FastAPI
    APP_ENV: str = Field(default="development", description="Ambiente: development, production, test")
    APP_HOST: str = Field(default="127.0.0.1", description="Host de bind do servidor local")
    APP_PORT: int = Field(default=23119, description="Porta de escuta do backend")
    DEBUG: bool = Field(default=False, description="Modo debug")

    # Banco de Dados SQLite Local
    DATABASE_PATH: str = Field(
        default="data/bibliografia_local.db",
        description="Caminho relativo ou absoluto do banco SQLite"
    )

    # Timeouts e Limites de Rede
    CROSSREF_TIMEOUT_SECONDS: int = Field(default=8, ge=2, le=30)
    SCIELO_API_URL: str = Field(default="http://articlemeta.scielo.org/api/v1/article/")
    BVS_SEARCH_URL: str = Field(default="https://pesquisa.bvsalud.org/portal/")

    # Chaves e Serviços Opcionais
    SEMANTIC_SCHOLAR_API_KEY: Optional[str] = Field(default=None)
    PUBMED_API_KEY: Optional[str] = Field(default=None)

    # Modelos e Embeddings
    EMBEDDING_MODEL_NAME: str = Field(default="paraphrase-multilingual-MiniLM-L12-v2")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @field_validator("APP_PORT")
    @classmethod
    def validar_porta(cls, v: int) -> int:
        if not (1024 <= v <= 65535):
            raise ValueError(f"Porta inválida ({v}). Deve estar entre 1024 e 65535.")
        return v

def carregar_configuracoes() -> AppSettings:
    """Instancia e valida as variáveis de ambiente."""
    try:
        return AppSettings()
    except Exception as e:
        raise RuntimeError(f"🚨 Falha crítica de configuração de ambiente: {e}") from e

settings = carregar_configuracoes()
