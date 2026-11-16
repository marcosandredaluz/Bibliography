"""
Bibliografia Forense - Plugin Hook Specifications
Contratos formais de extensibilidade utilizando a biblioteca pluggy.
"""
import pluggy
from typing import List, Dict, Any, Optional

PROJECT_NAME = "bibliografia"

hookspec = pluggy.HookspecMarker(PROJECT_NAME)

class BibliografiaHookSpecs:
    """Especificações de Hooks para o Sistema de Gestão e Auditoria Bibliográfica."""

    @hookspec
    def registrar_tipologias_documentais(self) -> List[Dict[str, Any]]:
        """
        Retorna uma lista de novos tipos documentais suportados pelo plugin.
        Exemplo:
        [
            {
                "id": "portaria_sus",
                "label": "Portaria do Ministério da Saúde / SUS",
                "campos_obrigatorios": ["numero_norma", "ano", "orgao_emissor", "ementa"],
                "icone": "landmark"
            }
        ]
        """

    @hookspec
    def ao_inicializar_banco(self, db_conn: Any) -> None:
        """
        Permite que o plugin crie ou atualize tabelas satélites no banco de dados SQLite local.
        :param db_conn: Objeto sqlite3.Connection
        """

    @hookspec
    def adicionar_extratores_metadados(self) -> List[Any]:
        """
        Retorna uma lista de instâncias de classes de extratores bibliográficos (Translators).
        Cada extrator deve implementar 'pode_processar(identificador)' e 'extrair(identificador)'.
        """

    @hookspec
    def injetar_estilos_csl(self) -> List[Dict[str, str]]:
        """
        Retorna metadados e caminhos de arquivos CSL (Citation Style Language)
        para formatação ABNT / Vancouver customizada.
        """

    @hookspec
    def auditar_normativas_especificas(self, documento_texto: str) -> List[Dict[str, Any]]:
        """
        Executa auditoria forense especializada sobre o texto bruto do manuscrito.
        Verifica citações a normas revogadas, portarias consolidadas, conformidade de identificadores.
        :param documento_texto: Texto capturado do Word
        :return: Lista de achados de auditoria (inconformidades)
        """
