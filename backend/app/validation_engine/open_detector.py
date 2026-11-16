"""
Detecção Estilométrica de Texto Acadêmico Gerado por IA (Open-Detector adaptado para PT-BR)
Camada: Validation Engine
"""
from typing import List, Dict, Any, Tuple

MARCADORES_IA: List[Tuple[str, int]] = [
    ("imperativo ressaltar", 2),
    ("desempenha um papel crucial", 2),
    ("desempenham um papel crucial", 2),
    ("papel fundamental", 1),
    ("em última análise", 2),
    ("navegar pelas complexidades", 3),
    ("navegar pelas nuances", 3),
    ("tapeçaria multifacetada", 3),
    ("tapeçaria rica", 3),
    ("mergulhar nas nuances", 3),
    ("mergulhar a fundo", 2),
    ("no cenário contemporâneo", 2),
    ("no panorama contemporâneo", 2),
    ("serve como um testemunho", 3),
    ("um testemunho de", 2),
    ("lançar luz sobre", 2),
    ("intrincada teia", 3),
    ("ecossistema dinâmico", 2),
    ("vital ressaltar", 2),
    ("crucial destacar", 2),
    ("em suma", 1),
]

class OpenDetectorStylometry:
    """Detecta jargões sintéticos e marcadores hiper-frequentes em textos gerados por LLMs."""

    @classmethod
    def analisar_paragrafo(cls, texto: str, num_paragrafo: int = 1) -> Dict[str, Any]:
        p_lower = texto.lower()
        achados = []
        pontos = 0
        for termo, peso in MARCADORES_IA:
            if termo in p_lower:
                achados.append(termo)
                pontos += peso

        eh_suspeito = pontos >= 4
        return {
            "paragrafo": num_paragrafo,
            "pontos_ia": pontos,
            "eh_suspeito": eh_suspeito,
            "termos_detectados": achados,
            "gravidade": "estilo_ia" if eh_suspeito else "normal"
        }
