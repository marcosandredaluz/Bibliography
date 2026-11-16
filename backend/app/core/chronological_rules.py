"""
Módulo de Tolerância Cronológica de Publicação (Crossref & PubMed)
Camada: Core / Domínio
Responsabilidade: Resolver conflitos entre datas de depósito eletrônico preliminar (Epub Ahead of Print)
e ano de lançamento do fascículo impresso definitivo.
"""
from typing import Dict, Any, List, Set, Optional

class ChronologicalValidator:
    """
    Validador de coerência temporal de datas de publicação acadêmica.
    Cruza metadados do Crossref e PubMed, admitindo simultaneamente:
    1. Data de depósito / publicação eletrônica preliminar (Online Ahead of Print / Epub)
    2. Data de publicação do volume/fascículo impresso definitivo (Print Issue Date)
    """

    @classmethod
    def extrair_anos_crossref(cls, crossref_item: Dict[str, Any]) -> Dict[str, Optional[int]]:
        """Extrai ano online e ano impresso a partir da estrutura da API do Crossref."""
        ano_online = None
        ano_print = None
        ano_issued = None

        # 1. Data de publicação online preliminar
        pub_online = crossref_item.get("published-online", {}).get("date-parts", [[]])
        if pub_online and pub_online[0] and pub_online[0][0]:
            try:
                ano_online = int(pub_online[0][0])
            except (ValueError, TypeError):
                pass

        # 2. Data de publicação impressa
        pub_print = crossref_item.get("published-print", {}).get("date-parts", [[]])
        if pub_print and pub_print[0] and pub_print[0][0]:
            try:
                ano_print = int(pub_print[0][0])
            except (ValueError, TypeError):
                pass

        # 3. Data genérica issued / created
        issued = crossref_item.get("issued", {}).get("date-parts", [[]])
        if issued and issued[0] and issued[0][0]:
            try:
                ano_issued = int(issued[0][0])
            except (ValueError, TypeError):
                pass

        return {
            "ano_online": ano_online,
            "ano_print": ano_print,
            "ano_issued": ano_issued
        }

    @classmethod
    def extrair_anos_pubmed(cls, pubmed_article: Dict[str, Any]) -> Dict[str, Optional[int]]:
        """Extrai datas de publicação eletrônica e impressa a partir do registro do PubMed."""
        ano_epub = None
        ano_print = None

        # Histórico de publicação do PubMed
        history = pubmed_article.get("history", {})
        if "aheadofprint" in history:
            try:
                ano_epub = int(history["aheadofprint"][:4])
            except Exception:
                pass
        elif "pubmed" in history:
            try:
                ano_epub = int(history["pubmed"][:4])
            except Exception:
                pass

        # Data do Journal Issue
        if "journal_year" in pubmed_article:
            try:
                ano_print = int(pubmed_article["journal_year"])
            except Exception:
                pass

        return {
            "ano_pubmed_epub": ano_epub,
            "ano_pubmed_print": ano_print
        }

    @classmethod
    def validar_ano_com_tolerancia(
        cls,
        ano_declarado: Any,
        crossref_data: Optional[Dict[str, Any]] = None,
        pubmed_data: Optional[Dict[str, Any]] = None,
        tolerancia_max_anos: int = 1
    ) -> Dict[str, Any]:
        """
        Valida o ano declarado no manuscrito com tolerância para discrepâncias
        entre publicação preliminar online e fascículo impresso.
        """
        try:
            # Limpa e converte ano declarado para inteiro (ex: '2021a' -> 2021)
            ano_limpo = int(str(ano_declarado).strip()[:4])
        except (ValueError, TypeError):
            return {
                "valido": False,
                "motivo": f"Ano declarado inválido: '{ano_declarado}'"
            }

        anos_validos: Set[int] = set()
        detalhes_fontes = {}

        if crossref_data:
            anos_cr = cls.extrair_anos_crossref(crossref_data)
            detalhes_fontes["crossref"] = anos_cr
            for v in anos_cr.values():
                if v:
                    anos_validos.add(v)

        if pubmed_data:
            anos_pm = cls.extrair_anos_pubmed(pubmed_data)
            detalhes_fontes["pubmed"] = anos_pm
            for v in anos_pm.values():
                if v:
                    anos_validos.add(v)

        if not anos_validos:
            return {
                "valido": True,
                "aviso": "Nenhum metadado de data encontrado para confirmação oficial; mantido sem veto."
            }

        # 1. Correspondência exata em qualquer uma das datas autoritativas
        if ano_limpo in anos_validos:
            tipo_data = "impresso"
            if crossref_data and ano_limpo == crossref_data.get("published-online", {}).get("date-parts", [[None]])[0][0]:
                tipo_data = "depósito eletrônico preliminar (Online Ahead of Print / Epub)"
            elif crossref_data and ano_limpo == crossref_data.get("published-print", {}).get("date-parts", [[None]])[0][0]:
                tipo_data = "fascículo impresso definitivo (Print Issue)"

            return {
                "valido": True,
                "ano_validado": ano_limpo,
                "tipo_compatibilidade": tipo_data,
                "anos_oficiais_reconhecidos": sorted(list(anos_validos)),
                "mensagem": f"✓ Ano {ano_limpo} validado com sucesso via {tipo_data}."
            }

        # 2. Tolerância Cronológica (diferença de até 1 ano entre depósito online e publicação)
        menor_diferenca = min(abs(ano_limpo - a) for a in anos_validos)
        if menor_diferenca <= tolerancia_max_anos:
            ano_oficial_proximo = min(anos_validos, key=lambda a: abs(ano_limpo - a))
            return {
                "valido": True,
                "ano_validado": ano_limpo,
                "tipo_compatibilidade": "tolerancia_cronologica_epub_print",
                "anos_oficiais_reconhecidos": sorted(list(anos_validos)),
                "aviso": (
                    f"⚠️ Coerência Cronológica com Tolerância: O ano citado ({ano_limpo}) difere em apenas {menor_diferenca} ano "
                    f"do registro oficial ({ano_oficial_proximo}), situação típica de transição Epub Ahead of Print -> Volume Impresso."
                )
            }

        return {
            "valido": False,
            "ano_declarado": ano_limpo,
            "anos_oficiais_reconhecidos": sorted(list(anos_validos)),
            "detalhes": detalhes_fontes,
            "mensagem": f"🚨 Conflito de Datas: O ano citado ({ano_limpo}) não corresponde a nenhuma das datas oficiais registradas ({sorted(list(anos_validos))})."
        }
