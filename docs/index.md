# Documentação Técnica — Bibliografia Científica

Documentação de arquitetura e módulos internos do aplicativo desktop (`v1.1.0`).

## Visão Geral

- **Interface Desktop (Electron + React 19 / Vite):** Gerenciamento de biblioteca, leitor `PDF.js`, triagem PRISMA 2020, painel de Risco de Viés (RoB 2 / ROBINS-I) e Auditoria Reversa de `.docx` / `.pdf`.
- **Motor Local Node (`electron/`):** Persistência atômica em JSON, serviço HTTP loopback na porta `23119`, resolvedor de metadados (Crossref, PubMed, OpenAlex, SciELO, Semantic Scholar), formatação CSL (`citeproc-js`) e inferência semântica offline via ONNX (`custom-forensic-minilm` INT8).
- **Pipeline Auxiliar Python (`backend/`):** Extração geométrica de layout PDF (`pdfplumber` MIT + `pypdf` BSD-3-Clause, sem dependências AGPL) e adaptador REST opcional para integração Word.

## Seções

- [Arquitetura e Armazenamento](arquitetura.md)
- [Motor de Auditoria e Validação](auditoria.md)
- [Extratores Regionais (SciELO e BVS / LILACS)](extratores.md)
- [Integração Word, Web Clipper e Pandoc](integracao-word.md)
- [Sistema de Plugins Python](plugins.md)
