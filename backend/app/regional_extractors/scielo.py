"""
Extrator Oficial SciELO (ArticleMeta REST API + Fallback Highwire HTML)
Camada: Regional Extractors
Inspirado na lógica do translator oficial Zotero 'SciELO.js'.
"""
import re
import urllib.request
import urllib.parse
import json
from typing import Dict, Any, Optional
from bs4 import BeautifulSoup

from .base import BaseTranslator

class ScieloExtractor(BaseTranslator):
    @property
    def nome(self) -> str:
        return "SciELO (Scientific Electronic Library Online)"

    def pode_processar(self, entrada: str) -> bool:
        """Verifica se é DOI com prefixo 10.1590 (SciELO Brasil) ou URL scielo.br/scielo.org ou PID."""
        if "10.1590" in entrada:
            return True
        if "scielo" in entrada.lower():
            return True
        if re.search(r'S\d{4}-\d{3}[0-9X]\d{13}', entrada, re.IGNORECASE):
            return True
        return False

    def extrair_metadados(self, entrada: str) -> Optional[Dict[str, Any]]:
        # Se for DOI ou PID, consulta via Crossref / ArticleMeta API
        pid_match = re.search(r'(S\d{4}-\d{3}[0-9X]\d{13})', entrada, re.IGNORECASE)
        doi_match = re.search(r'(10\.1590/[-._;()/:A-Za-z0-9]+)', entrada)

        if doi_match:
            doi = doi_match.group(1).rstrip('.,;)]}')
            return self._consultar_crossref_scielo(doi)
        
        if pid_match:
            pid = pid_match.group(1)
            return self._consultar_articlemeta(pid)

        # Fallback se for URL web direta
        if entrada.startswith("http"):
            return self._raspar_html_scielo(entrada)

        return None

    def _consultar_crossref_scielo(self, doi: str) -> Optional[Dict[str, Any]]:
        url = f"https://api.crossref.org/works/{urllib.parse.quote(doi)}"
        req = urllib.request.Request(url, headers={"User-Agent": "SciELOExtractor/2.0"})
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    item = json.loads(resp.read().decode("utf-8")).get("message", {})
                    autores = [
                        {"family": a.get("family", ""), "given": a.get("given", "")}
                        for a in item.get("author", [])
                    ]
                    parts = item.get("issued", {}).get("date-parts", [[""]])
                    ano = str(parts[0][0]) if parts and parts[0] else ""

                    return {
                        "id": f"scielo_{doi.replace('/', '_')}",
                        "type": "article-journal",
                        "title": item.get("title", [""])[0],
                        "author": autores,
                        "container-title": item.get("container-title", [""])[0],
                        "issued": {"date-parts": [[int(ano)]]} if ano.isdigit() else {},
                        "volume": item.get("volume"),
                        "issue": item.get("issue"),
                        "page": item.get("page"),
                        "DOI": doi,
                        "publisher": "SciELO",
                        "source": "SciELO Crossref API"
                    }
        except Exception:
            pass
        return None

    def _consultar_articlemeta(self, pid: str) -> Optional[Dict[str, Any]]:
        url = f"http://articlemeta.scielo.org/api/v1/article/?collection=scl&code={pid}"
        req = urllib.request.Request(url, headers={"User-Agent": "SciELOExtractor/2.0"})
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    dados = json.loads(resp.read().decode("utf-8"))
                    # Normaliza metadados do ArticleMeta
                    tit = dados.get("article", {}).get("v12", [{}])[0].get("_", "")
                    return {
                        "id": f"scielo_{pid}",
                        "type": "article-journal",
                        "title": tit,
                        "source": "SciELO ArticleMeta REST API"
                    }
        except Exception:
            pass
        return None

    def _raspar_html_scielo(self, url: str) -> Optional[Dict[str, Any]]:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                html = resp.read().decode("utf-8")
                soup = BeautifulSoup(html, "html.parser")
                
                # Zotero SciELO.js method: busca meta tags padrão Highwire
                tit = soup.find("meta", {"name": "citation_title"})
                doi = soup.find("meta", {"name": "citation_doi"})
                journal = soup.find("meta", {"name": "citation_journal_title"})
                date = soup.find("meta", {"name": "citation_publication_date"})
                
                autores = []
                for a in soup.find_all("meta", {"name": "citation_author"}):
                    if a.get("content"):
                        autores.append({"literal": a.get("content")})

                return {
                    "id": f"scielo_web_{hash(url)}",
                    "type": "article-journal",
                    "title": tit.get("content") if tit else "",
                    "DOI": doi.get("content") if doi else None,
                    "container-title": journal.get("content") if journal else "",
                    "issued": {"date-parts": [[int(date.get("content")[:4])]]} if date and date.get("content")[:4].isdigit() else {},
                    "author": autores,
                    "source": "SciELO HTML Highwire Tags"
                }
        except Exception:
            pass
        return None
