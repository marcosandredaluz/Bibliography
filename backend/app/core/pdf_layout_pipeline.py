"""
Pipeline Híbrido e Permissivo (MIT / Apache-2.0 / BSD) para PDFs Científicos.

Responsabilidades:
- Extração determinística por coordenadas geométricas (x0, top, x1, bottom) via pdfplumber (MIT).
- Detecção de layout em múltiplas colunas (calha vertical no eixo X) sem GPU.
- Reconstrução de DOIs quebrados em fim de linha via agrupamento por coordenada Y.
- Extração de tabelas determinística (pdfplumber lines/text e spartan CPU-only opcional em MIT).
- Interface opcional para conversão estruturada DoclingDocument via docling (MIT; modelos Apache-2.0 / CDLA-Permissive-2.0).
- Fallback leve em pypdf (BSD-3-Clause), sem dependências AGPL (PyMuPDF/fitz removido).
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import spartan
except ImportError:
    spartan = None

try:
    import pypdf
except ImportError:
    pypdf = None

try:
    from docling.document_converter import DocumentConverter
except ImportError:
    DocumentConverter = None

_DOI_REGEX = re.compile(r"10\.\d{4,9}/[^\s\"'<>]+", re.IGNORECASE)
_TABELA_HEADER_REGEX = re.compile(r"(?:Table|Tabela)\s+\d+[:.\s]+.*?(?=\n\n|\Z)", re.DOTALL | re.IGNORECASE)


def detectar_colunas_por_palavras(
    words: List[Dict[str, Any]],
    largura_pagina: float,
) -> Tuple[int, List[float]]:
    """Detecta layout de 1 ou 2 colunas por ausência de palavras cruzando a calha central."""
    if not words or largura_pagina <= 0:
        return 1, [0.0, max(float(largura_pagina), 1.0)]

    centro_min = largura_pagina * 0.44
    centro_max = largura_pagina * 0.56
    cruzando_centro = [
        w for w in words
        if w["x0"] < centro_min and w["x1"] > centro_max and len(str(w.get("text", ""))) > 3
    ]
    esquerdas = [w for w in words if w["x1"] <= largura_pagina * 0.49]
    direitas = [w for w in words if w["x0"] >= largura_pagina * 0.51]

    limite_cruzamento = max(3, int(len(words) * 0.03))
    if len(esquerdas) >= 20 and len(direitas) >= 20 and len(cruzando_centro) <= limite_cruzamento:
        return 2, [0.0, largura_pagina * 0.5, float(largura_pagina)]
    return 1, [0.0, float(largura_pagina)]


def _agrupar_linhas_por_y(words: List[Dict[str, Any]], y_tol: float = 4.0) -> List[str]:
    """Agrupa tokens em linhas visuais segundo proximidade no eixo vertical (top)."""
    if not words:
        return []

    ordenadas = sorted(words, key=lambda w: (round(float(w["top"]) / y_tol), float(w["x0"])))
    linhas: List[str] = []
    tokens_linha: List[str] = []
    ultimo_top: Optional[float] = None

    for w in ordenadas:
        top_atual = float(w["top"])
        texto_w = str(w.get("text", "")).strip()
        if not texto_w:
            continue
        if ultimo_top is not None and abs(top_atual - ultimo_top) > y_tol:
            if tokens_linha:
                linhas.append(" ".join(tokens_linha))
            tokens_linha = [texto_w]
        else:
            tokens_linha.append(texto_w)
        ultimo_top = top_atual

    if tokens_linha:
        linhas.append(" ".join(tokens_linha))
    return linhas


def reconstruir_dois_quebrados_por_y(
    words: List[Dict[str, Any]],
    y_tol: float = 4.0,
) -> List[str]:
    """Reconstroi DOIs divididos por quebra de linha (ex.: '10.1590/' na linha N e sufixo na N+1)."""
    linhas = _agrupar_linhas_por_y(words, y_tol=y_tol)
    if not linhas:
        return []

    linhas_unidas: List[str] = []
    for ln in linhas:
        ln_limpa = ln.strip()
        if (
            linhas_unidas
            and re.search(r"10\.\d{4,9}/[^\s]*[-/]$", linhas_unidas[-1])
            and ln_limpa
        ):
            linhas_unidas[-1] = linhas_unidas[-1] + ln_limpa.lstrip()
        else:
            linhas_unidas.append(ln_limpa)

    texto = "\n".join(linhas_unidas)
    return sorted({m.group(0).rstrip(".,;)]}") for m in _DOI_REGEX.finditer(texto)})


def extrair_rodapes_por_y(
    words: List[Dict[str, Any]],
    altura_pagina: float,
    faixa_inferior: float = 0.90,
) -> List[str]:
    """Separa linhas situadas nos 10% inferiores da página para evitar poluição do corpo."""
    if not words or altura_pagina <= 0:
        return []
    limite_y = altura_pagina * faixa_inferior
    rodape_words = [w for w in words if float(w["top"]) >= limite_y]
    return _agrupar_linhas_por_y(rodape_words, y_tol=4.0)


def _serializar_tabela_para_auditoria(colunas: List[str], linhas: List[List[str]]) -> str:
    """Converte matriz tabular em texto pesquisável compatível com FullTextEscalationScanner."""
    partes = []
    if colunas:
        partes.append(" | ".join(colunas))
    for row in linhas:
        partes.append(" | ".join(row))
    return "\n".join(partes)


def _extrair_tabelas_pagina_pdfplumber(page: Any, num_pag: int) -> List[Dict[str, Any]]:
    """Extrai tabelas por linhas explícitas e, em fallback, por alinhamento textual sem GPU."""
    raw_tables = page.extract_tables(table_settings={
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 3,
        "join_tolerance": 3,
    }) or page.extract_tables(table_settings={
        "vertical_strategy": "text",
        "horizontal_strategy": "text",
        "text_x_tolerance": 3,
        "text_y_tolerance": 3,
    }) or []

    tabelas: List[Dict[str, Any]] = []
    for raw in raw_tables:
        if not raw or len(raw) < 2:
            continue
        colunas = [str(c or "").strip() for c in raw[0]]
        linhas = [[str(c or "").strip() for c in row] for row in raw[1:]]
        conteudo = _serializar_tabela_para_auditoria(colunas, linhas)
        if conteudo.strip():
            tabelas.append({
                "pagina": num_pag,
                "origem": "pdfplumber",
                "titulo": "",
                "colunas": colunas,
                "linhas": linhas,
                "conteudo": conteudo[:1200],
            })
    return tabelas


def _extrair_tabelas_spartan(caminho_pdf: str) -> List[Dict[str, Any]]:
    """Extrai tabelas via shlok-n/spartan (MIT, CPU-only) quando instalado."""
    if spartan is None:
        return []
    sp_doc = spartan.process_pdf(caminho_pdf)
    tabelas: List[Dict[str, Any]] = []
    for tb in sp_doc.get("tables", []):
        colunas = [str(c) for c in tb.get("columns", [])]
        linhas = [[str(c) for c in r] for r in tb.get("rows", [])]
        tabelas.append({
            "pagina": int(tb.get("page", 1)),
            "origem": "spartan",
            "titulo": str(tb.get("title", "")),
            "colunas": colunas,
            "linhas": linhas,
            "conteudo": _serializar_tabela_para_auditoria(colunas, linhas)[:1200],
        })
    return tabelas


def _extrair_docling_opcional(caminho_pdf: str) -> Optional[Dict[str, Any]]:
    """
    Conversão estruturada opcional via Docling (código MIT).
    Modelos base (docling-models): Apache-2.0 / CDLA-Permissive-2.0.
    """
    if DocumentConverter is None:
        return None
    converter = DocumentConverter()
    conv_result = converter.convert(caminho_pdf)
    doc = conv_result.document
    return {
        "schema_docling": doc.export_to_dict(),
        "markdown": doc.export_to_markdown() if hasattr(doc, "export_to_markdown") else "",
        "licencas_ativas": {
            "codigo": "MIT",
            "modelos_docling": "Apache-2.0 / CDLA-Permissive-2.0",
        },
    }


def _extrair_fallback_pypdf(caminho_pdf: str) -> Dict[str, Any]:
    """Fallback determinístico via pypdf (BSD-3-Clause) caso pdfplumber falhe."""
    if pypdf is None:
        return {
            "sucesso": False,
            "erro": "Nenhum parser permissivo de PDF disponível (instale pdfplumber ou pypdf).",
        }

    reader = pypdf.PdfReader(caminho_pdf)
    paginas_texto: List[Dict[str, Any]] = []
    tabelas_detectadas: List[Dict[str, Any]] = []
    dois_set = set()

    for num_pag, pag in enumerate(reader.pages, start=1):
        txt = pag.extract_text() or ""
        paginas_texto.append({
            "pagina": num_pag,
            "colunas_detectadas": 1,
            "blocos": [{"coluna": 0, "bbox": [0.0, 0.0, 0.0, 0.0], "texto": txt}],
            "rodapes": [],
            "texto": txt,
        })
        for m in _DOI_REGEX.finditer(txt):
            dois_set.add(m.group(0).rstrip(".,;)]}"))
        for m in _TABELA_HEADER_REGEX.finditer(txt):
            tabelas_detectadas.append({
                "pagina": num_pag,
                "origem": "pypdf_regex",
                "titulo": "",
                "colunas": [],
                "linhas": [],
                "conteudo": m.group(0)[:800],
            })

    return {
        "sucesso": True,
        "motor": "pypdf",
        "paginas": paginas_texto,
        "tabelas": tabelas_detectadas,
        "dois_reconstruidos": sorted(dois_set),
        "texto_completo": "\n".join(p["texto"] for p in paginas_texto),
        "docling_document": None,
    }


def extrair_layout_e_tabelas_pdf(
    caminho_pdf: str,
    usar_docling: bool = False,
) -> Dict[str, Any]:
    """Extrai layout multi-coluna, rodapés, DOIs reconstruídos, tabelas e texto integral sem AGPL."""
    if not os.path.exists(caminho_pdf):
        return {"sucesso": False, "erro": "Arquivo PDF não encontrado."}

    docling_payload = _extrair_docling_opcional(caminho_pdf) if usar_docling else None

    if pdfplumber is None:
        if docling_payload:
            md = docling_payload.get("markdown", "")
            return {
                "sucesso": True,
                "motor": "docling",
                "paginas": [],
                "tabelas": [],
                "dois_reconstruidos": sorted({m.group(0).rstrip(".,;)]}") for m in _DOI_REGEX.finditer(md)}),
                "texto_completo": md,
                "docling_document": docling_payload,
            }
        return _extrair_fallback_pypdf(caminho_pdf)

    try:
        paginas_out: List[Dict[str, Any]] = []
        tabelas_out: List[Dict[str, Any]] = []
        dois_set = set()

        with pdfplumber.open(caminho_pdf) as pdf:
            for num_pag, page in enumerate(pdf.pages, start=1):
                largura = float(page.width)
                altura = float(page.height)
                words = page.extract_words(keep_blank_chars=False, use_text_flow=False) or []

                ncols, cortes = detectar_colunas_por_palavras(words, largura)
                rodapes = extrair_rodapes_por_y(words, altura)
                dois_set.update(reconstruir_dois_quebrados_por_y(words))

                limite_corpo_y = altura * 0.90
                blocos: List[Dict[str, Any]] = []
                textos_coluna: List[str] = []

                for col_idx in range(ncols):
                    x_ini, x_fim = cortes[col_idx], cortes[col_idx + 1]
                    col_words = [
                        w for w in words
                        if x_ini <= (float(w["x0"]) + float(w["x1"])) / 2.0 < x_fim
                        and float(w["top"]) < limite_corpo_y
                    ]
                    linhas_col = _agrupar_linhas_por_y(col_words, y_tol=4.0)
                    col_txt = "\n".join(linhas_col)
                    if col_txt:
                        blocos.append({
                            "coluna": col_idx,
                            "bbox": [round(x_ini, 2), 0.0, round(x_fim, 2), round(limite_corpo_y, 2)],
                            "texto": col_txt,
                        })
                        textos_coluna.append(col_txt)

                tabelas_out.extend(_extrair_tabelas_pagina_pdfplumber(page, num_pag))
                paginas_out.append({
                    "pagina": num_pag,
                    "colunas_detectadas": ncols,
                    "blocos": blocos,
                    "rodapes": rodapes,
                    "texto": "\n\n".join(textos_coluna),
                })

        if not tabelas_out and spartan is not None:
            tabelas_out.extend(_extrair_tabelas_spartan(caminho_pdf))

        return {
            "sucesso": True,
            "motor": "docling" if docling_payload else "pdfplumber+spartan",
            "paginas": paginas_out,
            "tabelas": tabelas_out,
            "dois_reconstruidos": sorted(dois_set),
            "texto_completo": "\n\n".join(p["texto"] for p in paginas_out),
            "docling_document": docling_payload,
        }
    except Exception:
        return _extrair_fallback_pypdf(caminho_pdf)
