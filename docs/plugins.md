# Sistema de Plugins Python

O backend auxiliar (`backend/app/plugin_system/`) utiliza **`pluggy`** para permitir extensões específicas por área do conhecimento sem alterar o núcleo do sistema.

## Hooks Disponíveis (`hookspecs.py`)

```python
import pluggy

hookspec = pluggy.HookspecMarker("bibliografia")

class BibliografiaHookSpecs:
    @hookspec
    def registrar_tipologias_documentais(self):
        """Retorna novas tipologias documentais suportadas pela extensão."""

    @hookspec
    def adicionar_extratores_metadados(self):
        """Injeta instâncias de extratores adicionais de bases externas."""

    @hookspec
    def auditar_normativas_especificas(self, documento_texto: str):
        """Executa regras específicas de auditoria normativa sobre o texto."""
```

## Exemplo de Extensão

Crie um módulo em `backend/app/plugins/<nome_plugin>/hooks.py` implementando os hooks com `@pluggy.HookimplMarker("bibliografia")` para que o `BibliografiaPluginManager` carregue a extensão na inicialização do backend Python.
