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
