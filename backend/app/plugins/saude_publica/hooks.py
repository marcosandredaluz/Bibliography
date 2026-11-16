"""
Implementação dos Hooks do Pluggy para Saúde Pública
Camada: Plugins / Saúde Pública
"""
import pluggy
from typing import List, Dict, Any
from .models import criar_tabelas_saude

hookimpl = pluggy.HookimplMarker("bibliografia")

class PluginSaudePublica:
    """Plugin para suporte a Legislação do SUS, PCDTs e Padrões HL7 FHIR."""

    @hookimpl
    def registrar_tipologias_documentais(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "portaria_sus",
                "label": "Portaria do Ministério da Saúde / SUS",
                "campos_obrigatorios": ["numero_norma", "ano", "orgao_origem", "ementa"],
                "icone": "landmark"
            },
            {
                "id": "protocolo_clinico_pcdt",
                "label": "Protocolo Clínico e Diretrizes Terapêuticas (PCDT)",
                "campos_obrigatorios": ["titulo", "ano", "portaria_aprovacao", "condicao_clinica"],
                "icone": "activity"
            },
            {
                "id": "especificacao_hl7_fhir",
                "label": "Guia de Integração e Padrão HL7 FHIR (RNDS/e-SUS)",
                "campos_obrigatorios": ["recurso_fhir", "versao", "perfil_canonical_url"],
                "icone": "code"
            }
        ]

    @hookimpl
    def ao_inicializar_banco(self, db_conn: Any) -> None:
        criar_tabelas_saude(db_conn)

    @hookimpl
    def auditar_normativas_especificas(self, documento_texto: str) -> List[Dict[str, Any]]:
        achados = []
        # Exemplo de auditoria forense: Alerta se citar Portaria 2.436/2017 (PNAB) sem mencionar consolidação
        if "2.436/2017" in documento_texto or "2436/2017" in documento_texto:
            achados.append({
                "tipo": "norma_consolidada",
                "gravidade": "media",
                "mensagem": "A Portaria de Consolidação GM/MS nº 2/2017 incorporou a PNAB (Portaria 2.436/2017). Recomenda-se citar a consolidação."
            })
        return achados

plugin = PluginSaudePublica()
