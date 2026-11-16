"""
Módulo de Extração Forçada de Metadados de PDFs Brutos
Inspirado na arquitetura do Future-Scholars/paperlib e markrussinovich/refchecker.
Combina leitura ultrarrápida do cabeçalho do PDF com busca em cascata (DOI -> arXiv -> Crossref Fuzzy).
"""
import re
from typing import Optional, Dict, Any

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import Levenshtein
except ImportError:
    Levenshtein = None

import urllib.request
import urllib.parse
import json

DOI_REGEX = re.compile(r'10\.\d{4,9}/[-._;()/:A-Za-z0-9]+')
ARXIV_REGEX = re.compile(r'arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)', re.IGNORECASE)

class PdfMetadataExtractor:
    def __init__(self, timeout: int = 8):
        self.timeout = timeout
        self.headers = {"User-Agent": "BibliografiaWordEngine/2.0 (mailto:pesquisa@bibliografia.local)"}

    def extrair_texto_cabecalho(self, caminho_pdf: str, max_paginas: int = 2) -> str:
        """Extrai o texto das primeiras páginas do PDF para localização de DOI, título e autores."""
        if not fitz:
            return ""
        texto = []
        try:
            doc = fitz.open(caminho_pdf)
            qtd = min(len(doc), max_paginas)
            for i in range(qtd):
                texto.append(doc[i].get_text("text"))
            doc.close()
        except Exception:
            return ""
        return "\n".join(texto)

    def extrair_metadados_pdf(self, caminho_pdf: str) -> Dict[str, Any]:
        """Pipeline em cascata para extrair metadados confiáveis de qualquer PDF acadêmico."""
        texto_cabecalho = self.extrair_texto_cabecalho(caminho_pdf)
        if not texto_cabecalho:
            return {"sucesso": False, "erro": "Não foi possível extrair texto do arquivo PDF."}

        # 1. Tentativa de extração por DOI embutido no texto da primeira página
        match_doi = DOI_REGEX.search(texto_cabecalho)
        if match_doi:
            doi_candidato = match_doi.group(0).rstrip('.,;)]}')
            dados = self.buscar_crossref_por_doi(doi_candidato)
            if dados and dados.get("sucesso"):
                dados["metodo_extracao"] = "doi_embutido"
                return dados

        # 2. Tentativa por arXiv ID
        match_arxiv = ARXIV_REGEX.search(texto_cabecalho)
        if match_arxiv:
            dados = self.buscar_crossref_por_doi(f"10.48550/arXiv.{match_arxiv.group(1)}")
            if dados and dados.get("sucesso"):
                dados["metodo_extracao"] = "arxiv_id"
                return dados

        # 3. Fallback: Extração do título provável e correspondência fuzzy contra Crossref
        linhas = [l.strip() for l in texto_cabecalho.split("\n") if len(l.strip()) > 15]
        # Pega as primeiras linhas como provável título do trabalho
        candidato_titulo = " ".join(linhas[:3]) if linhas else ""
        if candidato_titulo:
            dados_fuzzy = self.buscar_crossref_fuzzy(candidato_titulo)
            if dados_fuzzy and dados_fuzzy.get("sucesso"):
                return dados_fuzzy

        return {
            "sucesso": False,
            "erro": "Identificadores bibliográficos (DOI/arXiv) não encontrados no cabeçalho do documento.",
            "candidato_titulo": candidato_titulo[:120] if candidato_titulo else None
        }

    def buscar_crossref_por_doi(self, doi: str) -> Optional[Dict[str, Any]]:
        """Consulta autoritativa por DOI no Crossref."""
        url = f"https://api.crossref.org/works/{urllib.parse.quote(doi)}"
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                if resp.status == 200:
                    corpo = json.loads(resp.read().decode("utf-8"))
                    item = corpo.get("message", {})
                    autores = [
                        f"{a.get('family', '')}, {a.get('given', '')}".strip(', ')
                        for a in item.get("author", [])
                    ]
                    ano = ""
                    parts = item.get("issued", {}).get("date-parts", [[""]])
                    if parts and parts[0] and parts[0][0]:
                        ano = str(parts[0][0])

                    return {
                        "sucesso": True,
                        "doi": doi,
                        "titulo": item.get("title", [""])[0],
                        "autores": autores,
                        "ano": ano,
                        "periodico": item.get("container-title", [""])[0],
                        "volume": item.get("volume"),
                        "numero": item.get("issue"),
                        "paginas": item.get("page"),
                        "resumo": item.get("abstract", "")
                    }
        except Exception:
            pass
        return None

    def buscar_crossref_fuzzy(self, titulo_query: str) -> Optional[Dict[str, Any]]:
        """Busca nebulosa no Crossref com corte Levenshtein de 70% de similaridade."""
        query_sanitizada = re.sub(r'[^a-zA-Z0-9\s]', ' ', titulo_query)[:120].strip()
        url = f"https://api.crossref.org/works?query.title={urllib.parse.quote(query_sanitizada)}&rows=3"
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                if resp.status == 200:
                    corpo = json.loads(resp.read().decode("utf-8"))
                    itens = corpo.get("message", {}).get("items", [])
                    for it in itens:
                        tit_oficial = it.get("title", [""])[0]
                        if not tit_oficial:
                            continue
                        
                        score = 0.0
                        if Levenshtein:
                            score = Levenshtein.ratio(titulo_query.lower(), tit_oficial.lower())
                        else:
                            # Fallback simples por palavras comuns se Levenshtein não estiver compilado
                            w1 = set(titulo_query.lower().split())
                            w2 = set(tit_oficial.lower().split())
                            score = len(w1 & w2) / max(len(w1 | w2), 1)

                        if score >= 0.68:
                            autores = [
                                f"{a.get('family', '')}, {a.get('given', '')}".strip(', ')
                                for a in item.get("author", []) if 'item' in locals()
                            ] if False else [
                                f"{a.get('family', '')}, {a.get('given', '')}".strip(', ')
                                for a in it.get("author", [])
                            ]
                            ano = ""
                            parts = it.get("issued", {}).get("date-parts", [[""]])
                            if parts and parts[0] and parts[0][0]:
                                ano = str(parts[0][0])

                            return {
                                "sucesso": True,
                                "score_confianca": round(score * 100),
                                "doi": it.get("DOI"),
                                "titulo": tit_oficial,
                                "autores": autores,
                                "ano": ano,
                                "periodico": it.get("container-title", [""])[0],
                                "metodo_extracao": "fuzzy_title_matching"
                            }
        except Exception:
            pass
        return None
