"""
Contratos formais de extensibilidade via Pluggy
Camada: Plugin System
"""
import pluggy
from typing import List, Dict, Any, Optional

PROJECT_NAME = "bibliografia"

hookspec = pluggy.HookspecMarker(PROJECT_NAME)

class BibliografiaHookSpecs:
    """Especificações de Hooks para o Sistema de Gestão e Auditoria Bibliográfica."""

    @hookspec
    def registrar_tipologias_documentais(self) -> List[Dict[str, Any]]:
        """Retorna lista de dicionários definindo novos tipos de documentos aceitos pelo sistema."""

    @hookspec
    def ao_inicializar_banco(self, db_conn: Any) -> None:
        """Permite que o plugin crie ou atualize tabelas satélites no banco de dados SQLite/Postgres."""

    @hookspec
    def adicionar_extratores_metadados(self) -> List[Any]:
        """Retorna instâncias de classes de extratores bibliográficos (Translators)."""

    @hookspec
    def injetar_estilos_csl(self) -> List[Dict[str, str]]:
        """Retorna caminhos de arquivos CSL especializados para formatação ABNT/Vancouver."""

    @hookspec
    def auditar_normativas_especificas(self, documento_texto: str) -> List[Dict[str, Any]]:
        """Executa auditoria forense sobre o texto bruto do manuscrito para normas de domínio."""
