"""
Módulo de Escalação para Texto Integral e Varredura de Tabelas (Two-Stage Verification)
Camada: Core / Domínio
Responsabilidade: Varrer documento original completo (discussão, resultados e tabelas)
sempre que a validação pelo resumo (Abstract) for insatisfatória.
"""
import os
import re
from typing import List, Dict, Any, Optional

try:
    import pypdf
except ImportError:
    pypdf = None

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

from .semantic_inference import MultilingualSemanticInference, extrair_entidades_numericas

class FullTextEscalationScanner:
    """
    Executa verificação em duas etapas:
    Estágio 1: Checagem rápida no Resumo (Abstract).
    Estágio 2: Escalação para o texto completo do PDF/manuscrito (Resultados, Discussão e Tabelas).
    """

    def __init__(self):
        self.semantic_engine = MultilingualSemanticInference()

    def extrair_texto_integral_pdf(self, caminho_pdf: str) -> Dict[str, Any]:
        """Extrai texto de todas as páginas do PDF, identificando tabelas e seções."""
        if not os.path.exists(caminho_pdf):
            return {"sucesso": False, "erro": "Arquivo PDF não encontrado."}

        paginas_texto = []
        tabelas_detectadas = []

        # 1. Tentativa com PyMuPDF (fitz)
        if fitz:
            try:
                doc = fitz.open(caminho_pdf)
                for num_pag, pag in enumerate(doc, start=1):
                    txt = pag.get_text("text")
                    paginas_texto.append({"pagina": num_pag, "texto": txt})
                    # Busca padrões de tabelas
                    for m in re.finditer(r'(?:Table|Tabela)\s+\d+[:.\s]+.*?(?=\n\n|\Z)', txt, re.DOTALL | re.IGNORECASE):
                        tabelas_detectadas.append({"pagina": num_pag, "conteudo": m.group(0)[:800]})
                doc.close()
                return {
                    "sucesso": True,
                    "paginas": paginas_texto,
                    "tabelas": tabelas_detectadas,
                    "texto_completo": "\n".join(p["texto"] for p in paginas_texto)
                }
            except Exception:
                pass

        # 2. Tentativa com pypdf
        if pypdf:
            try:
                reader = pypdf.PdfReader(caminho_pdf)
                for num_pag, pag in enumerate(reader.pages, start=1):
                    txt = pag.extract_text() or ""
                    paginas_texto.append({"pagina": num_pag, "texto": txt})
                    for m in re.finditer(r'(?:Table|Tabela)\s+\d+[:.\s]+.*?(?=\n\n|\Z)', txt, re.DOTALL | re.IGNORECASE):
                        tabelas_detectadas.append({"pagina": num_pag, "conteudo": m.group(0)[:800]})
                return {
                    "sucesso": True,
                    "paginas": paginas_texto,
                    "tabelas": tabelas_detectadas,
                    "texto_completo": "\n".join(p["texto"] for p in paginas_texto)
                }
            except Exception as e:
                return {"sucesso": False, "erro": f"Erro pypdf: {e}"}

        return {"sucesso": False, "erro": "Nenhum parser de PDF disponível (instale pypdf ou pymupdf)."}

    def validar_em_dois_estagios(
        self,
        afirmacao_citada: str,
        resumo_abstract: Optional[str],
        caminho_pdf_integral: Optional[str] = None,
        texto_integral_direto: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Dois Estágios de Verificação:
        - 1º Estágio: Resumo
        - 2º Estágio: Se insatisfatório no resumo, escala para o texto integral e tabelas.
        """
        # --- ESTÁGIO 1: Validação Rápida no Abstract ---
        if resumo_abstract and len(resumo_abstract.strip()) > 30:
            resultado_resumo = self.semantic_engine.validar_afirmacao_contra_documento(
                afirmacao_citada, resumo_abstract
            )
            if resultado_resumo["aprovado"]:
                return {
                    "validado": True,
                    "estagio": "estagio_1_resumo",
                    "score_cosseno": resultado_resumo["score_cosseno"],
                    "evidencia": resumo_abstract[:300] + "...",
                    "secao_encontrada": "Abstract / Resumo",
                    "mensagem": "✓ Citação validada satisfatoriamente no Resumo do artigo."
                }

        # --- ESTÁGIO 2: Escalação para Texto Integral (Discussão, Resultados e Tabelas) ---
        texto_completo = ""
        tabelas = []

        if texto_integral_direto:
            texto_completo = texto_integral_direto
        elif caminho_pdf_integral and os.path.exists(caminho_pdf_integral):
            extracao = self.extrair_texto_integral_pdf(caminho_pdf_integral)
            if extracao.get("sucesso"):
                texto_completo = extracao["texto_completo"]
                tabelas = extracao.get("tabelas", [])

        if not texto_completo:
            return {
                "validado": False,
                "estagio": "falha_extracao",
                "mensagem": "Não foi possível validar pelo resumo e o texto integral do PDF não está acessível."
            }

        # 2.1 Varredura nas Tabelas extraídas
        for tab in tabelas:
            res_tab = self.semantic_engine.validar_afirmacao_contra_documento(
                afirmacao_citada, tab["conteudo"]
            )
            if res_tab["aprovado"]:
                return {
                    "validado": True,
                    "estagio": "estagio_2_tabela",
                    "score_cosseno": res_tab["score_cosseno"],
                    "evidencia": tab["conteudo"],
                    "secao_encontrada": f"Tabela (Pág. {tab.get('pagina', '?')})",
                    "mensagem": f"✓ Citação comprovada nos dados tabulares (Pág. {tab.get('pagina')})."
                }

        # 2.2 Fatiamento em janelas deslizantes (chunks) com sobreposição
        paragrafos = [p.strip() for p in texto_completo.split("\n\n") if len(p.strip()) > 40]
        melhor_candidato = None
        maior_score = 0.0

        for idx, p in enumerate(paragrafos):
            res_p = self.semantic_engine.validar_afirmacao_contra_documento(afirmacao_citada, p)
            if res_p["score_cosseno"] > maior_score:
                maior_score = res_p["score_cosseno"]
                melhor_candidato = (p, res_p)

            if res_p["aprovado"]:
                # Identifica se é seção de discussão ou resultados
                secao = "Texto Integral"
                if re.search(r'\b(discuss[ãa]o|discussion)\b', p, re.I):
                    secao = "Discussão"
                elif re.search(r'\b(resultado|results)\b', p, re.I):
                    secao = "Resultados"

                return {
                    "validado": True,
                    "estagio": "estagio_2_texto_integral",
                    "score_cosseno": res_p["score_cosseno"],
                    "evidencia": p[:350] + "...",
                    "secao_encontrada": secao,
                    "mensagem": f"✓ Citação comprovada no texto integral (Seção: {secao})."
                }

        # Se após escanear o texto completo não houver validação
        return {
            "validado": False,
            "estagio": "rejeitado_apos_texto_integral",
            "maior_score_cosseno": round(maior_score, 4),
            "mensagem": "🚨 A afirmação citada não possui respaldo nem no resumo, nem nas tabelas ou discussão do texto integral."
        }
