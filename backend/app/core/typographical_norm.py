"""
Módulo de Normalização Tipográfica e Comparação Numérica Canônica
Camada: Core / Domínio
Responsabilidade: Converter caracteres numéricos de edições e fascículos (ordinais, algarismos romanos,
zeros à esquerda e suplementos) para valores inteiros padronizados antes da validação.
"""
import re
from typing import Optional, Union, Dict, Any

# Mapa de algarismos romanos para inteiros
MAPA_ROMANOS = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
}

# Mapa de numerais por extenso comuns em edições de livros
NUMERAIS_EXTENSO = {
    "primeira": 1, "segunda": 2, "terceira": 3, "quarta": 4, "quinta": 5,
    "sexta": 6, "setima": 7, "sétima": 7, "oitava": 8, "nona": 9, "decima": 10, "décima": 10,
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6
}

def romano_para_inteiro(romano: str) -> Optional[int]:
    """Converte numeral romano (ex: 'IV', 'III', 'XII') para inteiro."""
    romano = (romano or "").strip().upper()
    if not re.match(r'^[IVXLCDM]+$', romano):
        return None
    total = 0
    prev_val = 0
    for char in reversed(romano):
        val = MAPA_ROMANOS.get(char, 0)
        if val < prev_val:
            total -= val
        else:
            total += val
            prev_val = val
    return total

def normalizar_edicao_para_inteiro(edicao_raw: Any) -> Optional[int]:
    """
    Normaliza representações textuais de edições para valor inteiro único:
    - '2. ed.' -> 2
    - '2ª edição' -> 2
    - '2nd ed.' -> 2
    - 'Second Edition' -> 2
    - 'III' -> 3
    - 4 -> 4
    """
    if edicao_raw is None:
        return None

    if isinstance(edicao_raw, int):
        return edicao_raw

    txt = str(edicao_raw).strip().lower()
    if not txt:
        return None

    # 1. Procura dígitos diretos (ex: '2', '2ª', '3rd', '4th ed')
    match_digito = re.search(r'\b(\d+)(?:[ªº°]|st|nd|rd|th)?(?:\s*\.?\s*(?:ed|edi[çc][ãa]o|edition))?', txt)
    if match_digito:
        return int(match_digito.group(1))

    # 2. Procura números por extenso
    for palavra, num in NUMERAIS_EXTENSO.items():
        if palavra in txt:
            return num

    # 3. Procura algarismos romanos isolados
    match_romano = re.search(r'\b([ivxlcdm]+)\b(?:\s*\.?\s*(?:ed|edition))?', txt, re.IGNORECASE)
    if match_romano:
        conv = romano_para_inteiro(match_romano.group(1))
        if conv:
            return conv

    return None

def normalizar_fasciculo(fasciculo_raw: Any) -> Dict[str, Any]:
    """
    Normaliza representação de fascículo (issue):
    - '04' -> {'numero': 4, 'eh_suplemento': False}
    - 'Suppl 1' ou 'Supl. 2' -> {'numero': 1, 'eh_suplemento': True, 'tipo': 'suplemento'}
    - 'Pt 2' -> {'numero': 2, 'eh_suplemento': False, 'tipo': 'parte'}
    - '3-4' -> {'numeros': [3, 4], 'eh_suplemento': False}
    """
    if fasciculo_raw is None:
        return {"numero": None, "eh_suplemento": False, "raw": None}

    txt = str(fasciculo_raw).strip()
    if not txt:
        return {"numero": None, "eh_suplemento": False, "raw": ""}

    eh_supl = bool(re.search(r'\b(suppl|supl|suplemento)\b', txt, re.IGNORECASE))
    
    # Fascículo duplo/triplo (ex: '3-4' ou '1/2')
    match_faixa = re.search(r'(\d+)\s*[-/]\s*(\d+)', txt)
    if match_faixa:
        return {
            "numeros": [int(match_faixa.group(1)), int(match_faixa.group(2))],
            "numero_principal": int(match_faixa.group(1)),
            "eh_suplemento": eh_supl,
            "raw": txt
        }

    # Procura dígito simples removendo zeros à esquerda
    match_digito = re.search(r'\b0*(\d+)\b', txt)
    if match_digito:
        return {
            "numero": int(match_digito.group(1)),
            "eh_suplemento": eh_supl,
            "raw": txt
        }

    # Procura algarismo romano
    match_romano = re.search(r'\b([IVXLCDM]+)\b', txt.upper())
    if match_romano:
        num_rom = romano_para_inteiro(match_romano.group(1))
        if num_rom:
            return {
                "numero": num_rom,
                "eh_suplemento": eh_supl,
                "raw": txt
            }

    return {"numero": None, "eh_suplemento": eh_supl, "raw": txt}

def comparar_campos_numericos(
    valor_declarado: Any,
    valor_oficial: Any,
    tipo_campo: str = "edicao"
) -> bool:
    """
    Compara dois valores tipográficos convertendo-os para inteiros canônicos.
    tipo_campo: 'edicao' | 'fasciculo' | 'volume'
    """
    if valor_declarado is None or valor_oficial is None:
        # Se um dos dois não foi informado, não veta
        return True

    if tipo_campo == "edicao":
        ed_decl = normalizar_edicao_para_inteiro(valor_declarado)
        ed_ofic = normalizar_edicao_para_inteiro(valor_oficial)
        if ed_decl is not None and ed_ofic is not None:
            return ed_decl == ed_ofic
        return str(valor_declarado).strip().lower() == str(valor_oficial).strip().lower()

    elif tipo_campo in ["fasciculo", "numero", "issue"]:
        f_decl = normalizar_fasciculo(valor_declarado)
        f_ofic = normalizar_fasciculo(valor_oficial)

        # Se ambos tiverem representação inteira
        num_d = f_decl.get("numero") or f_decl.get("numero_principal")
        num_o = f_ofic.get("numero") or f_ofic.get("numero_principal")

        if num_d is not None and num_o is not None:
            # Compara valor numérico e compatibilidade de suplemento
            return (num_d == num_o) and (f_decl["eh_suplemento"] == f_ofic["eh_suplemento"])

    elif tipo_campo == "volume":
        try:
            # Remove zeros à esquerda e compara como inteiros
            v_decl = int(re.sub(r'\D', '', str(valor_declarado)) or -1)
            v_ofic = int(re.sub(r'\D', '', str(valor_oficial)) or -1)
            if v_decl > 0 and v_ofic > 0:
                return v_decl == v_ofic
        except Exception:
            pass

    return str(valor_declarado).strip().lower() == str(valor_oficial).strip().lower()
