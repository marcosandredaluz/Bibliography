import os
import pytest

FORBIDDEN_FILE = os.path.join(os.path.dirname(__file__), "forbidden_literals.txt")

def carregar_literais_proibidos():
    if not os.path.exists(FORBIDDEN_FILE):
        return []
    with open(FORBIDDEN_FILE, "r", encoding="utf-8") as f:
        linhas = [linha.strip() for linha in f if linha.strip() and not linha.startswith("#")]
    return linhas

def test_nenhum_literal_proibido_no_codigo():
    literais = carregar_literais_proibidos()
    assert len(literais) > 0, "Arquivo de literais proibidos não pode estar vazio"
    
    diretorios_analisar = ["electron", "src"]
    raiz_projeto = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    violacoes = []
    
    for dir_rel in diretorios_analisar:
        dir_abs = os.path.join(raiz_projeto, dir_rel)
        if not os.path.exists(dir_abs):
            continue
        for root, dirs, files in os.walk(dir_abs):
            # Ignorar dist, build, node_modules, regression
            if "node_modules" in root or "dist" in root or "win-unpacked" in root:
                continue
            for file in files:
                if not file.endswith((".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".py")):
                    continue
                caminho_arq = os.path.join(root, file)
                try:
                    with open(caminho_arq, "r", encoding="utf-8", errors="ignore") as f:
                        conteudo = f.read()
                        for lit in literais:
                            if lit.lower() in conteudo.lower():
                                violacoes.append(f"Literal proibido '{lit}' encontrado em {os.path.relpath(caminho_arq, raiz_projeto)}")
                except Exception as e:
                    pass
                    
    assert len(violacoes) == 0, f"Violações da Regra de Ouro (Anti-Overfitting):\n" + "\n".join(violacoes)
