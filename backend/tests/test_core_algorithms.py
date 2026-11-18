"""
Testes Unitários dos Cinco Gargalos Algorítmicos
"""

from app.core.citation_regex import CitationExtractorABNT
from app.core.semantic_inference import (
    extrair_entidades_numericas,
    MultilingualSemanticInference
)
from app.core.chronological_rules import ChronologicalValidator
from app.core.typographical_norm import (
    normalizar_edicao_para_inteiro,
    normalizar_fasciculo,
    comparar_campos_numericos
)
from app.core.fulltext_scanner import FullTextEscalationScanner
from app.core.pdf_layout_pipeline import (
    detectar_colunas_por_palavras,
    reconstruir_dois_quebrados_por_y,
    extrair_layout_e_tabelas_pdf,
)

def test_1_regex_abnt_narrativa_e_parentetica():
    texto = (
        "Segundo Silva e Santos (2020), a intervenção foi efetiva. "
        "Dados epidemiológicos reforçam este achado (BRASIL, 2017, p. 15; OMS, 2021). "
        "De acordo com Ministério da Saúde (2022), as diretrizes foram atualizadas."
    )
    cits = CitationExtractorABNT.extrair_citacoes(texto)
    assert len(cits) >= 3

    # Valida presença de autor corporativo e narrativas
    autores = [c["autor_normalizado"] for c in cits]
    assert any("SILVA" in a for a in autores)
    assert any("BRASIL" in a for a in autores)
    assert any("MINISTÉRIO DA SAÚDE" in a for a in autores)

def test_2_inferencia_semantica_e_entidades_numericas():
    frase_pt = "A taxa de mortalidade em 30 dias foi de 14,5% nos pacientes tratados (p < 0.05)."
    frase_en = "The 30-day mortality rate was 14.5% among treated patients (p < 0.05)."
    
    # Extração numérica invariante
    nums = extrair_entidades_numericas(frase_pt)
    assert any(n["tipo"] == "percentual" and n["valor_numerico"] == 14.5 for n in nums)
    assert any(n["tipo"] == "p_value" and n["valor_numerico"] == 0.05 for n in nums)

    # Similaridade semântica
    engine = MultilingualSemanticInference()
    resultado = engine.validar_afirmacao_contra_documento(frase_pt, frase_en)
    assert resultado["aprovado"] is True
    assert resultado["coincidencia_numerica"] is True

def test_3_tolerancia_cronologica_epub_ahead_of_print():
    # Artigo publicado online em 2021 e impresso em 2022
    crossref_fake = {
        "published-online": {"date-parts": [[2021, 10, 15]]},
        "published-print": {"date-parts": [[2022, 3, 1]]}
    }
    
    # Autor citou 2021 (data eletrônica)
    res_2021 = ChronologicalValidator.validar_ano_com_tolerancia(2021, crossref_data=crossref_fake)
    assert res_2021["valido"] is True

    # Autor citou 2022 (data do fascículo)
    res_2022 = ChronologicalValidator.validar_ano_com_tolerancia(2022, crossref_data=crossref_fake)
    assert res_2022["valido"] is True

    # Autor citou ano absurdo (ex: 2015)
    res_2015 = ChronologicalValidator.validar_ano_com_tolerancia(2015, crossref_data=crossref_fake)
    assert res_2015["valido"] is False

def test_4_normalizacao_tipografica_edicoes_e_fasciculos():
    # Edições ordinais e romanas para inteiros
    assert normalizar_edicao_para_inteiro("2ª ed.") == 2
    assert normalizar_edicao_para_inteiro("2nd edition") == 2
    assert normalizar_edicao_para_inteiro("Second Edition") == 2
    assert normalizar_edicao_para_inteiro("III") == 3
    assert normalizar_edicao_para_inteiro(4) == 4

    # Comparação tipográfica
    assert comparar_campos_numericos("2ª ed.", "2", tipo_campo="edicao") is True
    assert comparar_campos_numericos("Suppl 1", "supl. 1", tipo_campo="fasciculo") is True
    assert comparar_campos_numericos("04", 4, tipo_campo="fasciculo") is True

def test_5_escala_texto_integral():
    scanner = FullTextEscalationScanner()
    resumo_vazio = "Estudo sobre epidemiologia no Brasil."
    texto_integral = "DISCUSSÃO\nA taxa observada de redução foi de 30% em comparação com o grupo controle."
    
    afirmacao = "Houve redução de 30% em relação ao controle."
    
    resultado = scanner.validar_em_dois_estagios(
        afirmacao_citada=afirmacao,
        resumo_abstract=resumo_vazio,
        texto_integral_direto=texto_integral
    )
    assert resultado["validado"] is True
    assert resultado["estagio"] == "estagio_2_texto_integral"


def _criar_pdf_duas_colunas_minimo(caminho_pdf: str) -> None:
    """Gera um PDF 1.4 válido mínimo em texto puro para testar extração sem PyMuPDF/fitz."""
    stream = (
        "BT /F1 10 Tf "
        "40 720 Td (1. Domingues CMAS Coberturas vacinais) Tj "
        "320 0 Td (6. Anvisa RDC 197 2017) Tj "
        "-320 -14 Td (10.1590/S1518-8787.) Tj "
        "0 -14 Td (2016050000232) Tj "
        "ET"
    )
    objs = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
        "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream\nendobj\n",
    ]
    partes = ["%PDF-1.4\n"]
    offsets = []
    for o in objs:
        offsets.append(sum(len(p.encode("latin1")) for p in partes))
        partes.append(o)
    xref_pos = sum(len(p.encode("latin1")) for p in partes)
    partes.append(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n")
    for off in offsets:
        partes.append(f"{off:010d} 00000 n \n")
    partes.append(f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n")
    with open(caminho_pdf, "wb") as f:
        f.write("".join(partes).encode("latin1"))


def test_6_pipeline_pdf_permissivo_colunas_e_doi_y():
    import sys
    import tempfile
    import os

    assert "fitz" not in sys.modules

    # 1. Teste de detecção de 2 colunas por X (evita mistura entre coluna esquerda e direita)
    palavras_2col = []
    for i in range(22):
        y = 100 + i * 14
        palavras_2col.append({"text": f"esq{i}", "x0": 40, "x1": 90, "top": y, "bottom": y + 10})
        palavras_2col.append({"text": f"dir{i}", "x0": 330, "x1": 380, "top": y, "bottom": y + 10})

    ncols, cortes = detectar_colunas_por_palavras(palavras_2col, largura_pagina=600.0)
    assert ncols == 2
    assert cortes == [0.0, 300.0, 600.0]

    # 2. Teste de reconstrução de DOI quebrado no fim da linha por coordenada Y
    palavras_doi = [
        {"text": "Disponível:", "x0": 40, "x1": 100, "top": 200, "bottom": 210},
        {"text": "10.1590/S1518-", "x0": 105, "x1": 200, "top": 200, "bottom": 210},
        {"text": "8787.2016050000232.", "x0": 40, "x1": 180, "top": 214, "bottom": 224},
    ]
    dois = reconstruir_dois_quebrados_por_y(palavras_doi)
    assert "10.1590/S1518-8787.2016050000232" in dois

    # 3. Teste em arquivo PDF real com pdfplumber/pypdf
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = os.path.join(tmpdir, "teste_permissivo.pdf")
        _criar_pdf_duas_colunas_minimo(pdf_path)
        res = extrair_layout_e_tabelas_pdf(pdf_path)
        assert res["sucesso"] is True
        assert res["motor"] in ("pdfplumber+spartan", "pypdf", "docling")
        assert "Domingues" in res["texto_completo"]
        assert "fitz" not in sys.modules
