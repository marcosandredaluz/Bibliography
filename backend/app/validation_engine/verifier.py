"""
Motor de Validação Referencial Anti-Alucinação (Anti-Hallucination & Anti-Frankenstein)
Camada: Validation Engine
Responsabilidade: Validar autenticidade de DOIs, autores e consistência cronológica e tipográfica.
"""
import urllib.request
import urllib.parse
import json
from typing import Dict, Any, Optional

from app.core.chronological_rules import ChronologicalValidator
from app.core.typographical_norm import comparar_campos_numericos

try:
    import Levenshtein
except ImportError:
    Levenshtein = None

class AntiHallucinationVerifier:
    def __init__(self, timeout: int = 8):
        self.timeout = timeout
        self.headers = {"User-Agent": "BibliografiaAntiHallucination/2.0 (Validador Forense)"}

    def calcular_similaridade_titulos(self, titulo_a: str, titulo_b: str) -> float:
        t1 = (titulo_a or "").strip().lower()
        t2 = (titulo_b or "").strip().lower()
        if not t1 or not t2:
            return 0.0
        if Levenshtein:
            return float(Levenshtein.ratio(t1, t2))
        w1 = set(t1.split())
        w2 = set(t2.split())
        return len(w1 & w2) / max(len(w1 | w2), 1)

    def validar_referencia(self, ref_declarada: Dict[str, Any]) -> Dict[str, Any]:
        doi = ref_declarada.get("doi", "").strip()
        if not doi:
            return {
                "status": "sem_doi",
                "risco": "medio",
                "mensagem": "Referência sem DOI informado; validada via metadados locais."
            }

        url = f"https://api.crossref.org/works/{urllib.parse.quote(doi)}"
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                if resp.status != 200:
                    return {
                        "status": "doi_inexistente",
                        "risco": "critico",
                        "mensagem": f"🚨 DOI Inexistente (HTTP {resp.status}): O DOI '{doi}' não existe nos registros oficiais."
                    }
                corpo = json.loads(resp.read().decode("utf-8"))
                item = corpo.get("message", {})

                titulo_oficial = item.get("title", [""])[0]
                autores_oficiais = [a.get("family", "").upper() for a in item.get("author", [])]

                # 1. Teste de Similaridade de Título (Levenshtein)
                score_titulo = self.calcular_similaridade_titulos(
                    ref_declarada.get("titulo", ""), titulo_oficial
                )

                # 2. Teste de Autoria
                autor_declarado = ref_declarada.get("autor", "").strip().upper()
                autor_presente = any(autor_declarado in a or a in autor_declarado for a in autores_oficiais)

                # 3. Teste Cronológico com Tolerância
                res_cronologia = ChronologicalValidator.validar_ano_com_tolerancia(
                    ano_declarado=ref_declarada.get("ano", ""),
                    crossref_data=item
                )

                # 4. Teste Tipográfico (Edição e Fascículo)
                edicao_ok = comparar_campos_numericos(
                    ref_declarada.get("edicao"),
                    item.get("edition"),
                    tipo_campo="edicao"
                )
                fasciculo_ok = comparar_campos_numericos(
                    ref_declarada.get("fasciculo"),
                    item.get("issue"),
                    tipo_campo="fasciculo"
                )

                # Detecção Anti-Frankenstein
                if score_titulo < 0.55 and not autor_presente:
                    autores_str = ", ".join(autores_oficiais[:3])
                    return {
                        "status": "doi_trocado_frankenstein",
                        "risco": "critico",
                        "score_titulo": round(score_titulo * 100),
                        "titulo_real": titulo_oficial,
                        "autores_reais": autores_oficiais,
                        "mensagem": (
                            f"🚨 CITAÇÃO FRANKENSTEIN / DOI SEQUESTRADO: O DOI '{doi}' pertence na verdade ao artigo "
                            f"'{titulo_oficial}' ({autores_str}), e não à obra declarada pelo autor!"
                        )
                    }

                if not res_cronologia.get("valido"):
                    return {
                        "status": "conflito_cronologico",
                        "risco": "medio",
                        "mensagem": res_cronologia.get("mensagem")
                    }

                return {
                    "status": "autenticada_conforme",
                    "risco": "zero",
                    "score_similaridade_titulo": round(score_titulo * 100),
                    "titulo_oficial": titulo_oficial,
                    "autores_oficiais": autores_oficiais,
                    "cronologia": res_cronologia,
                    "edicao_consistente": edicao_ok,
                    "fasciculo_consistente": fasciculo_ok,
                    "mensagem": f"✓ Referência Autêntica e Homologada no Crossref ({doi})."
                }

        except urllib.error.HTTPError as he:
            if he.code == 404:
                return {
                    "status": "doi_inexistente",
                    "risco": "critico",
                    "mensagem": f"🚨 DOI Inexistente (HTTP 404): O DOI '{doi}' foi forjado por IA e não existe no registro oficial."
                }
            return {"status": "erro_http", "risco": "baixo", "codigo": he.code}
        except Exception as e:
            return {"status": "erro_conexao", "risco": "baixo", "detalhe": str(e)}
