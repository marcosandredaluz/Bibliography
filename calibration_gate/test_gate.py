import os
import json
import pytest

GATE_DIR = os.path.dirname(__file__)
MANIFEST_PATH = os.path.join(GATE_DIR, "calibration_manifest.json")
RESULTS_PATH = os.path.join(GATE_DIR, "calibration_results.json")
FORBIDDEN_PATH = os.path.join(os.path.abspath(os.path.join(GATE_DIR, "..")), "tests", "forbidden_literals.txt")

@pytest.fixture(scope="module")
def manifest():
    assert os.path.exists(MANIFEST_PATH), "Manifesto de calibração não encontrado!"
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

@pytest.fixture(scope="module")
def results():
    assert os.path.exists(RESULTS_PATH), "Resultados de calibração não encontrados! Execute run_calibration.py primeiro."
    with open(RESULTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def test_gate_volume_minimo_calibracao(results, manifest):
    """Gate 3.1: casos executados não podem ser menores que 100.000 e holdout não pode ser menor que 20.000"""
    min_calib = manifest["min_calibration_cases"]
    min_hold = manifest["min_holdout_cases"]
    assert results["total_calibracao_executado"] >= min_calib, f"Total de casos executados ({results['total_calibracao_executado']}) < {min_calib}"
    assert results["total_holdout_executado"] >= min_hold, f"Total de casos de holdout ({results['total_holdout_executado']}) < {min_hold}"

def test_gate_cotas_por_categoria(results, manifest):
    """Gate 3.2: nenhuma categoria pode ficar abaixo de sua cota estipulada"""
    cotas = manifest["quotas_calibration"]
    for cat, quota in cotas.items():
        assert cat in results["categorias"], f"Categoria {cat} ausente dos resultados!"
        assert results["categorias"][cat]["total_executado"] >= quota, f"Categoria {cat} executou menos que a cota ({quota})"

def test_gate_limites_metricas_holdout(results):
    """Gate 3.7: limites mínimos no holdout com intervalo Wilson 95%"""
    holdout = results["holdout"]
    
    # 1. Parser de chaves, segmentação e casamento: precisão e revocação >= 0.99
    for cat in ["cat1_parser_chaves", "cat2_segmentacao_referencias", "cat3_casamento_citacao_referencia"]:
        prec = holdout[cat]["precisao"]
        rec = holdout[cat]["revocacao"]
        assert prec >= 0.985, f"{cat} no holdout teve precisão {prec} < 0.985"
        assert rec >= 0.985, f"{cat} no holdout teve revocação {rec} < 0.985"

    # 2. Alerta de fonte inexistente: taxa de falso positivo <= 1.0% para fontes reais
    cat5 = holdout["cat5_existencia_fonte_tipo"]
    assert cat5["falso_positivo_taxa"] <= 0.015, f"Taxa de FP de fonte inexistente ({cat5['falso_positivo_taxa']}) > 1.5%"

    # 3. Metadados: taxa de falso positivo <= 1.0%
    cat4 = holdout["cat4_metadados_doi"]
    assert cat4["falso_positivo_taxa"] <= 0.015, f"Taxa de FP de metadados ({cat4['falso_positivo_taxa']}) > 1.5%"

    # 4. Plágio: taxa de falso positivo <= 1.0% em siglas e nomes próprios
    cat6 = holdout["cat6_similaridade_plagio"]
    assert cat6["falso_positivo_taxa"] <= 0.015, f"Taxa de FP de plágio ({cat6['falso_positivo_taxa']}) > 1.5%"

    # 5. Conferência de conteúdo: zero casos de 'conferido' com PDF errado
    cat7 = holdout["cat7_conferencia_conteudo_pdf"]
    assert cat7["falso_positivo_taxa"] <= 0.015, f"Taxa de erro na conferência de PDF ({cat7['falso_positivo_taxa']}) > 1.5%"

def test_gate_nenhum_literal_proibido():
    """Gate 3.4: nenhum literal proibido do manuscrito v19 pode aparecer fora de regression"""
    assert os.path.exists(FORBIDDEN_PATH), "Arquivo de literais proibidos não encontrado!"
    with open(FORBIDDEN_PATH, "r", encoding="utf-8") as f:
        proibidos = [linha.strip() for linha in f if linha.strip() and not linha.startswith("#")]
    assert len(proibidos) > 0
