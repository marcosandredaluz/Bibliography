"""
Motor de Validação Referencial Anti-Alucinação (Anti-Hallucination & Anti-Frankenstein)
Inspirado diretamente no markrussinovich/refchecker e amazon-science/RefChecker.
Detecta identidades forjadas por LLMs, DOIs sequestrados (Frankenstein) e DOIs sintéticos 404.
"""
import urllib.request
import urllib.parse
import json
from typing import Dict, Any, List

try:
    import Levenshtein
except ImportError:
    Levenshtein = None

class AntiHallucinationVerifier:
    def __init__(self, timeout: int = 8):
        self.timeout = timeout
        self.headers = {"User-Agent": "BibliografiaAntiHallucination/2.0 (Validador Forense)"}

    def calcular_similaridade_titulos(self, titulo_a: str, titulo_b: str) -> float:
        """Calcula similaridade com Levenshtein (ou Jaccard se biblioteca não disponível)."""
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
        """
        Valida a integridade da referência:
        ref_declarada = {
            "autor": "SCAVASINE",
            "ano": "2022",
            "titulo": "Store-and-forward teleneurology triage...",
            "doi": "10.1055/s-0042-1758447"
        }
        """
        doi = ref_declarada.get("doi", "").strip()
        if not doi:
            return {
                "status": "sem_doi",
                "risco": "medio",
                "mensagem": "Referência sem DOI/identificador persistente (verificação por metadados de texto)."
            }

        url = f"https://api.crossref.org/works/{urllib.parse.quote(doi)}"
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                if resp.status != 200:
                    return {
                        "status": "doi_inexistente",
                        "risco": "critico",
                        "mensagem": f"🚨 DOI Sintético Falso (HTTP {resp.status}): O DOI '{doi}' não existe nos registros oficiais do Crossref."
                    }
                corpo = json.loads(resp.read().decode("utf-8"))
                item = corpo.get("message", {})

                titulo_oficial = item.get("title", [""])[0]
                autores_oficiais = [a.get("family", "").upper() for a in item.get("author", [])]
                ano_oficial = ""
                parts = item.get("issued", {}).get("date-parts", [[""]])
                if parts and parts[0] and parts[0][0]:
                    ano_oficial = str(parts[0][0])

                # 1. Teste de Similaridade do Título (Regra Russinovich ≥ 70%)
                score_titulo = self.calcular_similaridade_titulos(
                    ref_declarada.get("titulo", ""), titulo_oficial
                )

                # 2. Teste de Presença do Autor Declarado nos Autores Oficiais
                autor_declarado = ref_declarada.get("autor", "").strip().upper()
                autor_presente = any(autor_declarado in a or a in autor_declarado for a in autores_oficiais)

                # 3. Classificação Forense Anti-Frankenstein
                # Se o título é radicalmente diferente e o autor declarado não existe no artigo
                if score_titulo < 0.55 and not autor_presente:
                    autores_str = ", ".join(autores_oficiais[:3])
                    return {
                        "status": "doi_trocado_frankenstein",
                        "risco": "critico",
                        "score_titulo": round(score_titulo * 100),
                        "titulo_real": titulo_oficial,
                        "autores_reais": autores_oficiais,
                        "ano_real": ano_oficial,
                        "mensagem": (
                            f"🚨 CITAÇÃO FRANKENSTEIN / DOI SEQUESTRADO: O DOI '{doi}' pertence na verdade ao artigo "
                            f"'{titulo_oficial}' ({autores_str}, {ano_oficial}), e não à obra declarada pelo autor!"
                        )
                    }

                # 4. Divergência leve de ano ou autor
                if not autor_presente and score_titulo >= 0.70:
                    return {
                        "status": "autor_divergente",
                        "risco": "medio",
                        "mensagem": f"⚠️ Divergência de Autoria: O autor '{autor_declarado}' não consta na ficha oficial da editora ({', '.join(autores_oficiais[:3])})."
                    }

                # 5. Conforme e Autenticada
                return {
                    "status": "autenticada_conforme",
                    "risco": "zero",
                    "score_similaridade_titulo": round(score_titulo * 100),
                    "titulo_oficial": titulo_oficial,
                    "autores_oficiais": autores_oficiais,
                    "ano_oficial": ano_oficial,
                    "mensagem": f"✓ Referência Autêntica Autenticada no Crossref ({doi})."
                }

        except urllib.error.HTTPError as he:
            if he.code == 404:
                return {
                    "status": "doi_inexistente",
                    "risco": "critico",
                    "mensagem": f"🚨 DOI Inexistente (HTTP 404): O DOI '{doi}' foi inventado por IA e não existe no registro Crossref."
                }
            return {"status": "erro_http", "risco": "baixo", "codigo": he.code}
        except Exception as e:
            return {"status": "erro_conexao", "risco": "baixo", "detalhe": str(e)}
