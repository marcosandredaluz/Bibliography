from .citation_regex import CitationExtractorABNT
from .semantic_inference import MultilingualSemanticInference, extrair_entidades_numericas
from .fulltext_scanner import FullTextEscalationScanner
from .chronological_rules import ChronologicalValidator
from .typographical_norm import (
    normalizar_edicao_para_inteiro,
    normalizar_fasciculo,
    romano_para_inteiro,
    comparar_campos_numericos
)

__all__ = [
    "CitationExtractorABNT",
    "MultilingualSemanticInference",
    "extrair_entidades_numericas",
    "FullTextEscalationScanner",
    "ChronologicalValidator",
    "normalizar_edicao_para_inteiro",
    "normalizar_fasciculo",
    "romano_para_inteiro",
    "comparar_campos_numericos"
]
