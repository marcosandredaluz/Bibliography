# Desenvolvimento de Plugins com Pluggy

O **Bibliografia Forense** utiliza a biblioteca **`pluggy`** (o mesmo motor que alimenta o `pytest`) para garantir a separação estrita entre o núcleo universal e módulos de domínio específico.

---

## 🏗️ Especificação de Hooks (`hookspecs.py`)

O núcleo universal expõe quatro contratos formais via `@hookspec`:

```python
import pluggy

hookspec = pluggy.HookspecMarker("bibliografia")

class BibliografiaHookSpecs:
    @hookspec
    def registrar_tipologias_documentais(self):
        """Retorna uma lista de novos tipos documentais suportados pelo plugin."""

    @hookspec
    def ao_inicializar_banco(self, db_conn):
        """Cria tabelas satélites no banco SQLite local."""

    @hookspec
    def adicionar_extratores_metadados(self):
        """Injeta instâncias de classes extratoras de bases de dados."""

    @hookspec
    def auditar_normativas_especificas(self, documento_texto: str):
        """Executa auditoria forense sobre o texto bruto do manuscrito."""
```

---

## 💉 Implementação de um Plugin (Ex: Módulo Saúde Pública)

Para criar um novo plugin, crie um diretório em `backend/app/plugins/<nome_plugin>/` contendo `hooks.py`:

```python
import pluggy

hookimpl = pluggy.HookimplMarker("bibliografia")

class MeuPlugin:
    @hookimpl
    def registrar_tipologias_documentais(self):
        return [{
            "id": "portaria_sus",
            "label": "Portaria do Ministério da Saúde",
            "campos_obrigatorios": ["numero_norma", "ano", "ementa"]
        }]

plugin = MeuPlugin()
```

O `BibliografiaPluginManager` descobrirá e ativará o plugin automaticamente na inicialização do servidor.
