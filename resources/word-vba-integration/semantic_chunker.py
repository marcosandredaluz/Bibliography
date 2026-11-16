"""
Segmentador Semântico de Seções Acadêmicas para RAG Local e Validação Bounded
Inspirado na arquitetura do Kewal-07/ai-research-paper-assitant e yha9806/academic-writing-toolkit.
Fatia o texto do Word pela taxonomia IMRaD e isola trechos com números, métodos e limitações.
"""
import re
from typing import List, Dict, Any

TAXONOMIA_SECOES = {
    "preambulo": re.compile(r'^(RESUMO|ABSTRACT|SUMÁRIO|SUMARIO)\b', re.I),
    "introducao": re.compile(r'^(1\s+)?(INTRODUÇÃO|INTRODUCAO|CONTEXTUALIZAÇÃO|CONTEXTUALIZACAO|OBJETIVOS)\b', re.I),
    "metodologia": re.compile(r'^(2\s+)?(MÉTODO|METODO|METODOLOGIA|MATERIAL\s+E\s+MÉTODOS|DELINEAMENTO|CASUÍSTICA)\b', re.I),
    "resultados": re.compile(r'^(3\s+)?(RESULTADOS|ACHADOS|ANÁLISE\s+DE\s+DADOS)\b', re.I),
    "discussao": re.compile(r'^(4\s+)?(DISCUSSÃO|DISCUSSAO|IMPLICAÇÕES\s+CLÍNICAS)\b', re.I),
    "limitacoes": re.compile(r'^(LIMITAÇÕES|LIMITACOES|PONTOS\s+FRACOS)\b', re.I),
    "conclusao": re.compile(r'^(5\s+)?(CONCLUSÃO|CONCLUSAO|CONSIDERAÇÕES\s+FINAIS)\b', re.I),
    "referencias": re.compile(r'^(6\s+)?(REFERÊNCIAS|REFERENCIAS|BIBLIOGRAFIA|REFERÊNCIAS\s+BIBLIOGRÁFICAS)\b', re.I)
}

# Expressões de metodologia comum que não devem gerar falsos positivos de plágio
JARGOES_METODOLOGIA = [
    "dados foram analisados estatisticamente",
    "comitê de ética em pesquisa",
    "termo de consentimento livre e esclarecido",
    "nível de significância adotado foi",
    "estudo transversal retrospectivo",
    "revisão integrativa da literatura",
    "software spss versão",
    "população do estudo foi composta por"
]

class AcademicSectionChunker:
    @staticmethod
    def segmentar_manuscrito(texto: str) -> List[Dict[str, Any]]:
        """
        Recebe o texto completo do documento do Word e segmenta estruturalmente cada parágrafo.
        Associa a seção canônica, se possui dados numéricos e se é jargão metodológico.
        """
        paragrafos_brutos = [p.strip() for p in texto.split("\n") if p.strip()]
        secao_atual = "introducao"
        chunks = []

        for num_p, p in enumerate(paragrafos_brutos, start=1):
            # Detecta transição de seção estrutural no documento
            for nome_secao, regex in TAXONOMIA_SECOES.items():
                if regex.match(p):
                    secao_atual = nome_secao
                    break

            texto_lower = p.lower()
            eh_jargao = any(j in texto_lower for j in JARGOES_METODOLOGIA)
            contem_numeros = bool(re.search(r'\b\d+([.,]\d+)?%?\b', p))

            chunks.append({
                "paragrafo": num_p,
                "secao": secao_atual,
                "texto": p,
                "tamanho_palavras": len(p.split()),
                "contem_numeros": contem_numeros,
                "eh_jargao_metodologico": eh_jargao
            })

        return chunks

    @staticmethod
    def extrair_ancoras_numericas(frase: str) -> List[str]:
        """Extrai âncoras empíricas de dados (ex: '30%', '500 pacientes', 'p < 0.05') para validação de paráfrase."""
        return re.findall(r'\b\d+(?:[.,]\d+)?%?|\bp\s*[<=]\s*0[.,]\d+\b', frase)
