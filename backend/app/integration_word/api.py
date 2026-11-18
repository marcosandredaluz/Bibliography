"""
Rotas e Controladores de Integração com Processador de Texto (.DOCX)
Camada: Integration Word
"""
import os
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.core.citation_regex import CitationExtractorABNT
from app.core.fulltext_scanner import FullTextEscalationScanner
from app.validation_engine.open_detector import OpenDetectorStylometry
from app.plugin_system.manager import BibliografiaPluginManager

router = APIRouter(prefix="/api/word", tags=["Word Integration"])
plugin_mgr = BibliografiaPluginManager()
pdf_scanner = FullTextEscalationScanner()


class PdfLayoutRequest(BaseModel):
    caminho_pdf: str
    usar_docling: bool = False

class AuditoriaRequest(BaseModel):
    texto: str
    modulo: Optional[str] = "todos"

class AlertaItem(BaseModel):
    tipo: str
    paragrafo: int
    trecho: str
    mensagem: str
    gravidade: str

class AuditoriaResponse(BaseModel):
    status: str
    total_palavras: int
    total_citacoes: int
    alertas: List[AlertaItem]
    resumo: Dict[str, Any]

@router.get("/ping")
async def ping():
    return {
        "ok": True,
        "engine": "Bibliografia Clean Architecture Backend",
        "version": "2.0.0",
        "status": "online",
        "port": 23119,
        "plugins_ativos": [t["id"] for t in plugin_mgr.obter_tipologias_registradas()]
    }

@router.post("/auditar", response_model=AuditoriaResponse)
async def auditar_manuscrito(req: AuditoriaRequest):
    texto = req.texto
    if not texto or len(texto.strip()) < 10:
        raise HTTPException(status_code=400, detail="Manuscrito vazio ou insuficiente.")

    paragrafos = [p.strip() for p in texto.split("\n") if p.strip()]
    alertas: List[AlertaItem] = []
    todas_citacoes = []

    # 1. Extração de Citações ABNT NBR 10520 robusta (Parentéticas e Narrativas)
    for idx, p in enumerate(paragrafos, start=1):
        cits = CitationExtractorABNT.extrair_citacoes(p, num_paragrafo=idx)
        todas_citacoes.extend(cits)

    # 2. Localização da Seção de Referências
    idx_referencias = -1
    for idx, p in enumerate(paragrafos):
        if re.match(r'^(REFERÊNCIAS|BIBLIOGRAFIA|REFERÊNCIAS\s+BIBLIOGRÁFICAS)\b', p.upper()):
            idx_referencias = idx
            break

    linhas_refs = paragrafos[idx_referencias + 1:] if idx_referencias != -1 else []
    texto_refs_completo = "\n".join(linhas_refs).upper()

    # 3. Auditoria de Citações Órfãs
    if req.modulo in ["todos", "chamadas"]:
        for cit in todas_citacoes:
            autor_alvo = cit.get("autor_normalizado", "").split()[0].upper()
            if autor_alvo and autor_alvo not in texto_refs_completo:
                alertas.append(AlertaItem(
                    tipo="citacao_orfa",
                    paragrafo=cit["paragrafo"],
                    trecho=cit.get("trecho_completo", f"{cit['autor']} ({cit['ano']})"),
                    mensagem=f"🚨 Citação Órfã: '{cit['autor']} ({cit['ano']})' chamada no texto, mas ausente nas Referências.",
                    gravidade="alta"
                ))

    # 4. Detecção de Marcadores de IA (Open-Detector)
    if req.modulo in ["todos", "estilo_ia"]:
        for idx, p in enumerate(paragrafos, start=1):
            if idx_referencias != -1 and idx > idx_referencias:
                break
            res_ia = OpenDetectorStylometry.analisar_paragrafo(p, num_paragrafo=idx)
            if res_ia["eh_suspeito"]:
                termos_str = ", ".join(res_ia["termos_detectados"])
                alertas.append(AlertaItem(
                    tipo="estilo_ia",
                    paragrafo=idx,
                    trecho=p[:100] + "...",
                    mensagem=f"⚠️ Estilo Típico de IA ({res_ia['pontos_ia']} pts): Marcadores encontrados: [{termos_str}].",
                    gravidade="estilo_ia"
                ))

    # 5. Auditoria de Plugins Especializados (ex: Saúde Pública)
    achados_plugins = plugin_mgr.auditar_documento(texto)
    for achado in achados_plugins:
        alertas.append(AlertaItem(
            tipo=achado.get("tipo", "plugin_alerta"),
            paragrafo=1,
            trecho="Documento Geral",
            mensagem=achado.get("mensagem", ""),
            gravidade=achado.get("gravidade", "media")
        ))

    total_palavras = sum(len(p.split()) for p in paragrafos)
    return AuditoriaResponse(
        status="sucesso",
        total_palavras=total_palavras,
        total_citacoes=len(todas_citacoes),
        alertas=alertas,
        resumo={
            "orfas": len([a for a in alertas if a.tipo == "citacao_orfa"]),
            "estilo_ia": len([a for a in alertas if a.tipo == "estilo_ia"]),
            "plugins": len(achados_plugins)
        }
    )


@router.post("/extrair-layout-pdf")
async def extrair_layout_pdf(req: PdfLayoutRequest):
    caminho = (req.caminho_pdf or "").strip()
    if not caminho or not caminho.lower().endswith(".pdf") or not os.path.isfile(caminho):
        raise HTTPException(status_code=400, detail="Caminho de arquivo .pdf inválido ou inexistente.")
    resultado = pdf_scanner.extrair_texto_integral_pdf(caminho, usar_docling=req.usar_docling)
    if not resultado.get("sucesso"):
        raise HTTPException(status_code=422, detail=resultado.get("erro", "Falha ao processar layout do PDF."))
    return resultado
