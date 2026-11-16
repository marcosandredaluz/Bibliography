# Arquitetura do Sistema e Clean Code

O projeto adota Clean Architecture e os princípios SOLID para manter manutenibilidade de longo prazo:

```
backend/
├── app/
│   ├── core/              # Regras de Negócio e Algoritmos Fundamentais
│   ├── integration_word/  # Adaptadores de Entrada/Saída para Processadores de Texto (.DOCX)
│   ├── validation_engine/ # Motores de Verificação Forense
│   ├── regional_extractors/ # Extratores de Dados de Fontes Externas
│   └── plugin_system/     # Camada de Extensibilidade e Inversão de Controle (Pluggy)
```

## Diretrizes de Qualidade
- **Tipagem Estática:** Código validado com `mypy`.
- **Formatação Automatizada:** Padronizado com `black` e `ruff`.
- **Análise Estática de Segurança:** Verificado via `bandit`.
- **Privacidade de Logs:** Registros sanitizados via `loguru`, bloqueando a gravação de textos acadêmicos em texto claro.

---

## ☁️ Armazenamento Atômico & Colaboração Multi-Autor em Nuvem

Diferente de gerenciadores tradicionais que utilizam um único arquivo binário SQLite (`.sqlite`), o **Bibliografia** implementa um modelo de **armazenamento atômico e desacoplado**:

1. **Isolamento por Referência:** Cada obra é persistida como um arquivo `.json` individual dentro de `referencias/`.
2. **Prevenção de Corrupção em Nuvem:** Serviços como OneDrive, Google Drive e Dropbox frequentemente geram conflitos e corrompem bancos monolíticos quando múltiplos usuários salvam simultaneamente. O modelo atômico permite que coautores sincronizem apenas os artigos alterados.
3. **Escrita Segura e Atômica:** Gravações utilizam escrita temporária seguida de rename atômico com retentativas, tolerando bloqueios transitórios de sincronizadores de nuvem.
4. **Sincronização Contínua com BibTeX:** O arquivo `library.bib` é reconstruído na raiz a cada alteração, integrando-se perfeitamente a fluxos colaborativos em Overleaf e LaTeX.
