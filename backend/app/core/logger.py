"""
Módulo de Gestão de Logs e Privacidade Rigorosa (Loguru)
Camada: Core
Responsabilidade: Rotação automática de arquivos e anonimização/mascaramento de textos acadêmicos,
metadados de saúde e conteúdo inédito do usuário para proteção de propriedade intelectual.
"""
import sys
import re
import os
from typing import Any, Dict
from loguru import logger

# Expressões regulares para detecção e anonimização de conteúdo sensível
REGEX_TEXTO_LONGO = re.compile(r'("texto"|"conteudo"|"manuscrito"|"abstract")\s*:\s*"(?:[^"\\]|\\.)*"', re.IGNORECASE)
REGEX_TERMO_BUSCA = re.compile(r'("q"|"query"|"termo")\s*:\s*"(?:[^"\\]|\\.)*"', re.IGNORECASE)
REGEX_CPF = re.compile(r'\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b')
REGEX_EMAIL = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')

def filtro_privacidade(record: Dict[str, Any]) -> bool:
    """
    Filtro de sanitização profunda:
    Intercepta todas as mensagens de log antes da escrita em disco ou stdout.
    Substitui trechos de textos de manuscritos e termos de busca por metadados anônimos.
    """
    mensagem = record["message"]

    # 1. Mascara trechos de manuscrito ou textos brutos
    if len(mensagem) > 300 and ("paragrafo" in mensagem.lower() or "manuscrito" in mensagem.lower()):
        # Redige preservando apenas o tamanho estatístico
        tamanho = len(mensagem)
        record["message"] = f"[CONTEÚDO DO MANUSCRITO REDIGIDO POR PRIVACIDADE: {tamanho} caracteres processados]"
        return True

    # 2. Mascara campos estruturados contendo texto ou queries
    mensagem_limpa = REGEX_TEXTO_LONGO.sub(r'\1: "[TEXTO_REDIGIDO]"', mensagem)
    mensagem_limpa = REGEX_TERMO_BUSCA.sub(r'\1: "[QUERY_HASHED]"', mensagem_limpa)
    
    # 3. Mascara dados pessoais acidentais (CPF, E-mail)
    mensagem_limpa = REGEX_CPF.sub("[CPF_REMOVIDO]", mensagem_limpa)
    mensagem_limpa = REGEX_EMAIL.sub("[EMAIL_REMOVIDO]", mensagem_limpa)

    record["message"] = mensagem_limpa
    return True

def configurar_logging(
    caminho_log: str = "data/logs/bibliografia_engine.log",
    nivel: str = "INFO",
    rotacao: str = "10 MB",
    retencao: str = "7 days"
):
    """Configura o Loguru com sinks sanitizados para console e arquivo com rotação."""
    logger.remove()

    # Sink 1: Console / Terminal (Colorido, formatado e filtrado)
    logger.add(
        sys.stderr,
        level=nivel,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        filter=filtro_privacidade
    )

    # Sink 2: Arquivo em disco com rotação, compressão zip e privacidade estrita
    os.makedirs(os.path.dirname(caminho_log), exist_ok=True)
    logger.add(
        caminho_log,
        level=nivel,
        rotation=rotacao,
        retention=retencao,
        compression="zip",
        encoding="utf-8",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{line} - {message}",
        filter=filtro_privacidade,
        enqueue=True  # Thread-safe assíncrono
    )

    logger.info("Sistema de logging seguro inicializado com anonimização ativa.")

# Inicializa com padrões seguros
configurar_logging()
app_logger = logger
