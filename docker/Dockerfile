# ==============================================================================
# Dockerfile Multi-Stage: Backend Bibliografia Forense (Python 3.11)
# Estágio 1: Builder com compilação de dependências pesadas e virtualenv
# Estágio 2: Runtime enxuto, seguro e não-root para produção
# ==============================================================================

# --- ESTÁGIO 1: Builder ---
FROM python:3.11-slim AS builder

WORKDIR /build

# Instala ferramentas de compilação essenciais
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Cria ambiente virtual isolado
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Instala poetry e dependências de produção
RUN pip install --no-cache-dir --upgrade pip poetry-core

COPY pyproject.toml ./
# Instala as dependências diretamente no ambiente virtual
RUN pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    pluggy \
    requests \
    beautifulsoup4 \
    numpy \
    pypdf \
    pydantic

# --- ESTÁGIO 2: Runtime Final ---
FROM python:3.11-slim AS runner

LABEL org.opencontainers.image.title="Bibliography Engine"
LABEL org.opencontainers.image.description="Local forensic citation auditing, anti-hallucination engine, and document integration"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app

# Cria usuário sem privilégios de root para segurança
RUN groupadd -g 1001 bibliografia && \
    useradd -u 1001 -g bibliografia -s /bin/bash -m bibliografia

# Copia o ambiente virtual compilado do builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV PYTHONUNBUFFERED=1

# Copia o código-fonte da aplicação
COPY backend/app /app/app

# Cria diretório de banco de dados e dados com permissões adequadas
RUN mkdir -p /app/data && chown -R bibliografia:bibliografia /app

USER bibliografia

EXPOSE 23119

# Healthcheck interno
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:23119/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "23119"]
