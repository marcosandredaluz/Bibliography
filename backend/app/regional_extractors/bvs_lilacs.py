"""
Extrator Biblioteca Virtual em Saúde (BVS / LILACS / BIREME)
Camada: Regional Extractors
Inspirado na lógica do translator oficial Zotero 'BVS.js' e iAHx API.
"""
import urllib.request
import urllib.parse
import json
from typing import Dict, Any, Optional
from .base import BaseTranslator

class BvsLilacsExtractor(BaseTranslator):
    @property
    def nome(self) -> str:
        return "BVS / LILACS (BIREME / OPAS / OMS)"

    def pode_processar(self, entrada: str) -> bool:
        return ("bvsalud.org" in entrada.lower()) or ("lilacs" in entrada.lower())

    def extrair_metadados(self, query_ou_url: str) -> Optional[Dict[str, Any]]:
        # Consulta endpoint iAHx da BVS em formato JSON
        termo = urllib.parse.quote(query_ou_url)
        url = f"https://pesquisa.bvsalud.org/portal/?output=json&q={termo}"
        req = urllib.request.Request(url, headers={"User-Agent": "BVSExtractor/2.0"})
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    dados = json.loads(resp.read().decode("utf-8"))
                    docs = dados.get("diaServerResponse", [{}])[0].get("response", {}).get("docs", [])
                    if docs:
                        doc = docs[0]
                        titulo = doc.get("ti", [""])[0] if doc.get("ti") else ""
                        autores = [{"literal": a} for a in doc.get("au", [])]
                        ano = doc.get("da", [""])[0][:4] if doc.get("da") else ""
                        
                        return {
                            "id": f"bvs_{doc.get('id', 'unk')}",
                            "type": "article-journal",
                            "title": titulo,
                            "author": autores,
                            "container-title": doc.get("fo", [""])[0] if doc.get("fo") else "",
                            "issued": {"date-parts": [[int(ano)]]} if ano.isdigit() else {},
                            "source": "Portal Regional BVS (iAHx / LILACS)"
                        }
        except Exception:
            pass
        return None
