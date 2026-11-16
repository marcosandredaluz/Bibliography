"""
Módulo de Extração de Citações ABNT NBR 10520 (Parentéticas e Narrativas)
Camada: Core / Domínio
Responsabilidade: Capturar com alta precisão chamadas autor-data no padrão ABNT.
"""
import re
from typing import List, Dict, Any, Optional

# Nomes de autores corporativos comuns em português / saúde / governo
AUTORES_CORPORATIVOS = [
    r'MINIST[ÉE]RIO\s+DA\s+SA[ÚU]DE',
    r'ORGANIZA[ÇC][ÃA]O\s+MUNDIAL\s+DA\s+SA[ÚU]DE',
    r'ORGANIZA[ÇC][ÃA]O\s+PAN-AMERICANA\s+DA\s+SA[ÚU]DE',
    r'AG[ÊE]NCIA\s+NACIONAL\s+DE\s+VIGIL[ÂA]NCIA\s+SANIT[ÁA]RIA',
    r'INSTITUTO\s+NACIONAL\s+DE\s+C[ÂA]NCER',
    r'FUNDA[ÇC][ÃA]O\s+OSWALDO\s+CRUZ',
    r'BRASIL',
    r'ANVISA',
    r'FIOCRUZ',
    r'INCA',
    r'OPAS',
    r'OMS',
    r'WHO',
    r'CDC',
    r'DATASUS'
]

CORPORATE_REGEX_STR = "|".join(AUTORES_CORPORATIVOS)

class CitationExtractorABNT:
    """
    Extrator de citações aderente à ABNT NBR 10520:
    - Chamadas parentéticas: (SILVA, 2020), (SILVA; SANTOS, 2021), (BRASIL, 2017, p. 15), (SILVA et al., 2019)
    - Chamadas narrativas no sujeito: Silva (2020), Silva e Santos (2021), Silva et al. (2019), Ministério da Saúde (2022)
    """

    # 1. Regex de bloco parentético: captura todo o conteúdo delimitado por parênteses que contenha ano
    REGEX_BLOCO_PARENTETICO = re.compile(
        r'\(([A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\s;.,/&\'-]+?,\s*(?:19|20)\d{2}[a-z]?(?:\s*,\s*p\.\s*\d+(?:-\d+)?)?.*?)\)'
    )

    # 2. Regex de citação narrativa: captura autor formal no texto seguido de (ANO[, p. X])
    # Suporta: Silva (2020), Silva e Santos (2020), Silva, Santos e Oliveira (2020), Silva et al. (2020),
    # bem como autores corporativos: Ministério da Saúde (2020), OMS (2021), BRASIL (2018)
    REGEX_NARRATIVA = re.compile(
        r'\b('
        # Autores Corporativos conhecidos
        r'(?:Minist[ée]rio\s+da\s+Sa[úu]de|Organiza[çc][ãa]o\s+Mundial\s+da\s+Sa[úu]de|'
        r'Ag[êe]ncia\s+Nacional\s+de\s+Vigil[âa]ncia\s+Sanit[áa]ria|Instituto\s+Nacional\s+de\s+C[âa]ncer|'
        r'Funda[çc][ãa]o\s+Oswaldo\s+Cruz|ANVISA|FIOCRUZ|INCA|OPAS|OMS|WHO|CDC|DATASUS|BRASIL)|'
        # Autores Pessoa Física: Silva / Silva e Santos / Silva, Santos e Oliveira / Silva et al.
        r'(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+'
        r'(?:(?:\s*,\s*|\s+(?:e|&)\s+)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)*'
        r'(?:\s+et\s+al\.?)?)'
        r')'
        r'\s*\(\s*((?:19|20)\d{2}[a-z]?)(?:\s*,\s*p(?:p)?\.\s*(\d+(?:-\d+)?))?\s*\)'
    )

    @classmethod
    def extrair_citacoes(cls, texto: str, num_paragrafo: int = 1) -> List[Dict[str, Any]]:
        """
        Extrai todas as citações (parentéticas e narrativas) presentes em um parágrafo.
        Retorna estrutura canônica normalizada.
        """
        citacoes: List[Dict[str, Any]] = []

        # --- A. Extração de Citações Narrativas ---
        for m in cls.REGEX_NARRATIVA.finditer(texto):
            autor_bruto = m.group(1).strip()
            ano_bruto = m.group(2).strip()
            pagina = m.group(3) if m.group(3) else None

            # Normaliza o autor para maiúsculo para fins de auditoria
            citacoes.append({
                "tipo": "narrativa",
                "autor": autor_bruto,
                "autor_normalizado": cls._normalizar_autor_narrativo(autor_bruto),
                "ano": ano_bruto,
                "pagina": pagina,
                "trecho_completo": m.group(0),
                "pos_inicio": m.start(),
                "pos_fim": m.end(),
                "paragrafo": num_paragrafo
            })

        # --- B. Extração de Citações Parentéticas ---
        # Uma chamada parentética pode conter uma ou múltiplas obras separadas por ';'
        for m in cls.REGEX_BLOCO_PARENTETICO.finditer(texto):
            # Ignora se for parte de uma narrativa já capturada
            inicio, fim = m.start(), m.end()
            if any(c["pos_inicio"] <= inicio and fim <= c["pos_fim"] for c in citacoes):
                continue

            conteudo_interno = m.group(1).strip()
            
            # Divide obras individuais por ';'
            sub_obras = cls._decompor_parenteses(conteudo_interno)
            for obra in sub_obras:
                obra["paragrafo"] = num_paragrafo
                obra["pos_inicio"] = inicio
                obra["pos_fim"] = fim
                obra["trecho_completo"] = m.group(0)
                citacoes.append(obra)

        return citacoes

    @classmethod
    def _normalizar_autor_narrativo(cls, autor: str) -> str:
        """Converte autor narrativo ('Silva e Santos' ou 'Brasil') para padrão caixa alta de indexação."""
        limpo = re.sub(r'\s+et\s+al\.?', ' ET AL.', autor, flags=re.I)
        return limpo.upper().strip()

    @classmethod
    def _decompor_parenteses(cls, conteudo: str) -> List[Dict[str, Any]]:
        """
        Decompõe strings parentéticas como:
        'SILVA, 2020' ou 'SILVA; SANTOS, 2020' ou 'SILVA, 2019; BRASIL, 2021, p. 12'
        """
        resultados = []
        # Divide por ';' quando seguido de um novo grupo autor-data
        partes = [p.strip() for p in re.split(r';(?=\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+,)', conteudo) if p.strip()]
        
        for parte in partes:
            match = re.search(r'^([A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\s;.,/&\'-]+?),\s*((?:19|20)\d{2}[a-z]?)(?:\s*,\s*p(?:p)?\.\s*(\d+(?:-\d+)?))?$', parte)
            if match:
                resultados.append({
                    "tipo": "parentetica",
                    "autor": match.group(1).strip(),
                    "autor_normalizado": match.group(1).strip().upper(),
                    "ano": match.group(2).strip(),
                    "pagina": match.group(3) if match.group(3) else None
                })
            else:
                # Fallback para parênteses com autor único e ano
                sub_match = re.search(r'([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+).*?((?:19|20)\d{2}[a-z]?)', parte)
                if sub_match:
                    resultados.append({
                        "tipo": "parentetica",
                        "autor": sub_match.group(1).strip(),
                        "autor_normalizado": sub_match.group(1).strip().upper(),
                        "ano": sub_match.group(2).strip(),
                        "pagina": None
                    })
        return resultados
