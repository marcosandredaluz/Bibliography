"""
Gerenciador central de plugins baseado em Pluggy
Camada: Plugin System
"""
import os
import sys
import importlib
import logging
from typing import List, Dict, Any, Optional
import pluggy

from .hookspecs import BibliografiaHookSpecs, PROJECT_NAME

logger = logging.getLogger("bibliografia.plugins")

class BibliografiaPluginManager:
    """Gerencia o ciclo de vida dos plugins do Bibliografia Forense."""

    def __init__(self, plugins_dir: Optional[str] = None):
        self.pm = pluggy.PluginManager(PROJECT_NAME)
        self.pm.add_hookspecs(BibliografiaHookSpecs)
        self.plugins_dir = plugins_dir or os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "plugins")
        )
        self._carregar_plugins_locais()

    def _carregar_plugins_locais(self):
        """Descobre e carrega pacotes de plugins localizados no diretório plugins/."""
        if not os.path.exists(self.plugins_dir):
            return

        if self.plugins_dir not in sys.path:
            sys.path.insert(0, self.plugins_dir)

        for item in os.listdir(self.plugins_dir):
            item_path = os.path.join(self.plugins_dir, item)
            if os.path.isdir(item_path):
                hook_file = os.path.join(item_path, "hooks.py")
                if os.path.exists(hook_file):
                    try:
                        module_name = f"app.plugins.{item}.hooks"
                        mod = importlib.import_module(module_name)
                        if hasattr(mod, "plugin") and mod.plugin is not None:
                            self.pm.register(mod.plugin, name=item)
                        elif hasattr(mod, "Plugin"):
                            instance = mod.Plugin()
                            self.pm.register(instance, name=item)
                    except Exception as e:
                        logger.error(f"Erro ao carregar plugin '{item}': {e}")

    def registrar_plugin_manualmente(self, plugin_obj: Any, name: Optional[str] = None):
        """Permite injeção de plugins programaticamente."""
        self.pm.register(plugin_obj, name=name)

    def obter_tipologias_registradas(self) -> List[Dict[str, Any]]:
        resultado = []
        for tipos in self.pm.hook.registrar_tipologias_documentais():
            if tipos and isinstance(tipos, list):
                resultado.extend(tipos)
        return resultado

    def inicializar_banco_dados(self, db_conn: Any):
        self.pm.hook.ao_inicializar_banco(db_conn=db_conn)

    def obter_extratores_metadados(self) -> List[Any]:
        extratores = []
        for lista in self.pm.hook.adicionar_extratores_metadados():
            if lista and isinstance(lista, list):
                extratores.extend(lista)
        return extratores

    def obter_estilos_csl(self) -> List[Dict[str, str]]:
        estilos = []
        for lista in self.pm.hook.injetar_estilos_csl():
            if lista and isinstance(lista, list):
                estilos.extend(lista)
        return estilos

    def auditar_documento(self, documento_texto: str) -> List[Dict[str, Any]]:
        achados = []
        for lista in self.pm.hook.auditar_normativas_especificas(documento_texto=documento_texto):
            if lista and isinstance(lista, list):
                achados.extend(lista)
        return achados
