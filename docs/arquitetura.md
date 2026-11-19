# Arquitetura e Armazenamento

## Estrutura Principal

```text
├── electron/             # Processo principal Electron, wordServer (23119) e auditores
├── src/                  # Interface React 19 + Vite, leitor PDF.js e i18n
├── backend/              # Pipeline Python clean-room de layout PDF e adaptadores FastAPI
├── resources/            # Estilos CSL, filtro Pandoc/Quarto, template .dotm e Web Clipper MV3
├── training/             # Notebook e script Colab para fine-tuning e exportação ONNX
├── calibration_gate/     # Verificação anti-overfitting e gates de calibração
└── tests/                # Suítes unitárias, OpenXML, regressão e auditores
```

## Armazenamento Atômico em Disco

Diferente de gerenciadores baseados em arquivo único SQLite (sujeitos a conflitos de sincronização em nuvem), cada registro bibliográfico é gravado como arquivo `.json` individual em `referencias/`:

1. **Isolamento por registro:** alterações em um artigo modificam apenas seu respectivo `.json`.
2. **Escrita atômica:** gravações utilizam arquivo temporário seguido de substituição atômica.
3. **Sincronização BibTeX:** o arquivo `library.bib` na raiz da biblioteca é regenerado automaticamente após alterações para uso em LaTeX e Overleaf.
4. **Logs seguros:** dados bibliográficos e respostas de API não registram conteúdo integral de manuscritos em texto claro nos logs do servidor.
