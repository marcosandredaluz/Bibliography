# Bibliografia Científica (`v1.1.0`)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/release-v1.1.0-blue.svg)](https://github.com/marcosandredaluz/Bibliography/releases)

Gerenciador de referências desktop (*offline-first*), bancada de triagem para revisões sistemáticas e auditor de citações para escrita acadêmica em ciências da saúde e áreas afins.

> **English:** See [README.md](README.md).

---

## Funcionalidades Principais

- **Biblioteca Local e Busca Federada:** Armazenamento local em arquivos JSON individuais com sincronização automática de `library.bib`, além de busca paralela em PubMed, Europe PMC, Crossref, OpenAlex e ClinicalTrials.gov.
- **Auditoria Reversa de Manuscritos (`.docx` e `.pdf`):**
  - Confronto entre citações no corpo do texto (ABNT NBR 10520 / NBR 6023 e Vancouver numérico/sobrescrito) e a lista de referências via Crossref, PubMed e SciELO.
  - Detecção de referências inexistentes, DOIs trocados e inconsistências em figuras e tabelas.
  - Leitura geométrica de PDFs em 2 colunas e textos rotacionados a 90° (`PDF.js` na interface + `pdfplumber`/`pypdf` no Python).
  - Validação semântica bilíngue offline (`PT <-> EN`) entre afirmação e fonte via modelo ONNX quantizado INT8 embarcado (`custom-forensic-minilm`).
- **Revisão Sistemática e Risco de Viés:** Desduplicação, triagem em duplo-cego, exportação PRISMA 2020 e avaliação Cochrane RoB 2 / ROBINS-I com revisão humana obrigatória (`pending_human_review`) e trilha encadeada por SHA-256.
- **Integrações (Word, Navegador e Pandoc/Quarto):**
  - Serviço HTTP local (`127.0.0.1:23119`) para o suplemento `.dotm` do Word e extração OpenXML.
  - Web Clipper Manifest V3 (`POST /api/v1/clip` autenticado via `X-Bibliography-Local-Token`).
  - Endpoints de citação (`/api/v1/citations/resolve`, `/api/v1/citations/bibliography`) e filtro Panflute para Pandoc / Quarto (`>= 1.4.0`).

---

## Estrutura do Projeto

```text
.
├── src/                  # Interface React 19 + Vite, leitor PDF.js e traduções (pt-BR, en, es, fr)
├── electron/             # Processo principal Electron, wordServer e auditores locais
├── backend/              # Pipeline Python de layout PDF (pdfplumber/pypdf) e API FastAPI
├── resources/            # Estilos CSL, filtro Pandoc, template Word e extensão Web Clipper MV3
├── training/             # Scripts e notebook Colab para ajuste fino e exportação ONNX INT8
├── calibration_gate/     # Testes anti-overfitting e calibração
└── tests/                # Testes unitários, regressão, OpenXML e auditores
```

---

## Execução Local

### Pré-requisitos
- Node.js 20+ e npm
- Python 3.10+ (opcional, para o pipeline auxiliar de layout PDF em `backend/requirements.txt`)

```bash
npm install
npm run dev
```

Para gerar o instalador Windows (NSIS):

```bash
npm run dist
```

Os instaladores prontos ficam publicados em [GitHub Releases](https://github.com/marcosandredaluz/Bibliography/releases).

---

## Testes

```bash
# Bateria de calibração e regressão
npm run test:calibracao

# Testes unitários dos módulos e auditores
node tests/test_novos_modulos_clean_room.test.cjs
node tests/test_novos_auditores_forenses.test.cjs
```

---

## Manutenção e Citação

Mantido por **[Marcos André da Luz](https://www.linkedin.com/in/marcos-andre-da-luz-847039141)**.  
Avisos de dependências e licenças de terceiros em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Metadados de citação em [CITATION.cff](CITATION.cff).

Licenciado sob [Apache 2.0](LICENSE).
