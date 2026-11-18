# Bibliography 📚🔍

[![CI Pipeline](https://github.com/marcosandredaluz/Bibliography/actions/workflows/ci.yml/badge.svg)](https://github.com/marcosandredaluz/Bibliography/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-v1.0.1-blue.svg)](https://github.com/marcosandredaluz/Bibliography/releases)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![Node.js 20+](https://img.shields.io/badge/node.js-20+-green.svg)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker Multi-Stage](https://img.shields.io/badge/Docker-Multi--Stage-2496ED.svg)](docker/Dockerfile)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

**Open-source, privacy-first desktop platform for academic writing, federated literature search, double-blind systematic review screening (PRISMA 2020), citation lineage analysis, and forensic manuscript auditing against AI hallucinations and hijacked DOIs.**

> 🇧🇷 **Documentação em Português:** Para ler a versão completa em português, acesse [README_pt.md](README_pt.md).

---

## 🌟 Key Features

### 1. 🔍 Federated Scientific Search Hub
- **Parallel Querying:** Search and compare hit counts across major open scientific databases (PubMed/MEDLINE, Europe PMC, Crossref, ClinicalTrials.gov, and OpenAlex) in a single unified search bar with a visual real-time progress bar.
- **Institutional & Clinical Access:** Direct deep-link redirectors for subscription-based databases (Scopus, Web of Science, Embase, CINAHL) via federated university logins (CAPES/CAFe).

### 2. 📊 Methodological PRISMA 2020 & Double-Blind Screening
- **Lossless Deduplication:** Merge duplicate records while preserving notes, PDFs, user tags, and publication identifiers.
- **Title & Abstract Screening:** Streamlined workflow for inclusion, exclusion, and tracking reasons for removal in systematic and scoping reviews.
- **Automated Diagram Export:** One-click generation of the official PRISMA 2020 flow diagram ready for journal submission.

### 3. 🔗 Citation Lineage & Knowledge Graph (*Citation Chaining*)
- **Backward & Forward Chaining:** Explore the causal scientific lineage from any seed article:
  - ⏪ **The Foundation:** Prior papers that grounded the work.
  - ⏩ **The Impact:** Subsequent derivative papers that cited the work.
- **Recursive Discovery:** Interactive tree exploration to uncover foundational literature without manual queries.

### 4. 🔬 Forensic Citation Auditing & Anti-Hallucination Engine
- **Detect AI Hallucinations:** Detect phantom references frequently fabricated by Generative AI (LLMs).
- **Frankenstein Citation Detection:** Flag hijacked DOIs where a legitimate DOI is erroneously assigned to a different title or author (Levenshtein distance verification against official Crossref metadata).
- **Two-Stage Text Scanner:** Cross-examine cited statements against abstracts and full-text PDFs, validating invariant numerical data (percentages, $p$-values, confidence intervals).

### 5. 📝 Native Document Integration (.DOCX & CSL)
- **Local HTTP Microservice (Port 23119):** Seamless communication with local desktop word processors and document templates via automation scripts.
- **2,800+ Citation Styles:** Instant formatting according to ABNT, Vancouver, APA 7th ed., IEEE, Nature, and university-specific standards.
- **Privacy-Guaranteed:** 100% offline-first. Your unpublished thesis drafts and manuscript texts are never uploaded to any remote server or third-party cloud.

---

## 🏛️ System Architecture (Clean Architecture)

Built upon strict SOLID principles, Clean Architecture, and decoupled local services:

```
D:\BIBLIOGRAFIA\
├── .github/
│   ├── workflows/             # CI/CD Pipelines (Linting, Bandit SAST, Pytest)
│   ├── ISSUE_TEMPLATE/        # Structured Bug Reports & Feature Requests
│   └── PULL_REQUEST_TEMPLATE.md
├── backend/                   # Python 3.11+ Core (FastAPI Microservice)
│   ├── app/
│   │   ├── main.py            # Local REST API & Lifespan Controller
│   │   ├── core/              # Normative Extraction & Levenshtein Algorithms
│   │   ├── integration_word/  # Open XML (.DOCX) Communication Adapters
│   │   ├── validation_engine/ # Anti-Hallucination & Forensic Verifiers
│   │   ├── regional_extractors/ # Open Access Translators (SciELO & BVS/LILACS)
│   │   └── plugin_system/     # Extensibility System via Pluggy
│   └── tests/                 # 5,000+ Automated Unit and Adversarial Tests
├── src/                       # Frontend SPA (React 19 / Vite / PDF.js)
│   ├── components/            # SearchHub, PRISMA, CitationGraph, Auditor
│   └── locales/               # Language Packs (English, Portuguese, Spanish, etc.)
├── electron/                  # Electron Desktop Shell & Local CSL Parsers
├── docker/
│   └── Dockerfile             # Multi-stage production container
├── docker-compose.yml         # Container orchestration (Backend + Web SPA)
├── CITATION.cff               # Machine-readable scientific citation metadata
├── CONTRIBUTING.md            # Guidelines for open-source contributors
└── LICENSE                    # Apache 2.0 Open Source License
```

---

## 🚀 Quick Start with Docker

To spin up the entire local environment (FastAPI Backend + Web SPA) in one command:

```bash
docker-compose up --build -d
```

- **Backend API:** `http://localhost:23119`
- **Interactive Swagger Docs:** `http://localhost:23119/docs`
- **Web Interface:** `http://localhost:5173`

---

## 🛠️ Local Development Setup

### Prerequisites
- Python 3.10+ and [Poetry](https://python-poetry.org/)
- Node.js 20+ and npm

```bash
# 1. Clone repository
git clone https://github.com/marcosandredaluz/Bibliography.git
cd Bibliography

# 2. Install backend dependencies & start server
poetry install
poetry run uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 23119 --reload

# 3. In another terminal, install frontend dependencies & launch desktop app
npm install
npm run dev
```

---

## 🧪 Testing & Quality Assurance

This codebase is validated by a rigorous testing matrix comprising over **5,000 automated industrial and adversarial tests**:

```bash
# Backend unit and validation tests
poetry run pytest backend/tests/ -v

# Static application security testing (SAST)
poetry run bandit -r backend/app -ll

# Massive calibration and red-team forensic battery (5,000+ tests)
npm run test:calibracao
```

---

## 👥 Multi-Author Collaboration & Cloud Synchronization

Unlike traditional reference managers that rely on monolithic SQLite database files (which easily corrupt or produce sync conflicts when multiple researchers save at the same time in shared cloud folders), **Bibliography** is built on a **Decoupled Atomic File Architecture**:

- **Atomic JSON Storage:** Each scientific reference is saved as an isolated `.json` record inside `referencias/`. When Co-Author A adds 3 papers, only those 3 lightweight files sync across Google Drive, OneDrive, Dropbox, or Nextcloud to Co-Author B without database locks.
- **Real-Time Overleaf & LaTeX Synchronization:** The root `library.bib` is automatically updated in real-time, enabling synchronized BibTeX citation keys for collaborative writing teams.
- **Cross-Author Forensic Audit:** Co-authors can audit shared `.docx` manuscript drafts to ensure newly added paragraphs have valid citations in the master bibliography.

### 💡 RFC: Calling the Community for Collaborative Solutions!
We are actively designing the next generation of multi-author research workflows and invite researchers, scientometricians, and open-source developers to collaborate:
- **Git-Backed Reference Repositories:** Tracking reference libraries directly through Git commits for lab provenance.
- **Portable Study Bundles (`.bibpack`):** One-click packaging of study collections, attached PDFs, and PRISMA screening logs.
- **Real-time Peer-to-Peer Collaborative Screening:** CRDT-based blind review consensus matrices.

👉 **Join the Discussion:** Check our [GitHub Issues](https://github.com/marcosandredaluz/Bibliography/issues) to propose improvements and share your lab workflow needs!

---

## 🌐 Internationalization & Language Packs

Bibliography is built for the global scientific community. Language definitions are stored as JSON files under `src/locales/`:

- `en.json` (English - Default International)
- `pt-BR.json` (Português do Brasil)
- `es.json` (Español)
- `fr.json` (Français)

> **🤝 Community Translations Wanted!**  
> We actively welcome contributions to add support for **Chinese (中文)**, **Arabic (العربية)**, **Russian (Русский)**, **German (Deutsch)**, and more. Check our [Contribution Guide](CONTRIBUTING.md#internationalization-translations) to learn how to submit a new language pack in minutes.

---

## 🤝 Open-Source Inspirations & Acknowledgments

This project builds solely upon open standards, public scientific APIs, and clean-room architectural/algorithmic inspirations from the open-source and scientometric community (excluding proprietary commercial software):

- **Word Add-in & Reference Extraction:** Architectural concepts inspired by [`zotero/zotero-word-for-windows-integration`](https://github.com/zotero/zotero-word-for-windows-integration) (`.dotm` Fluent Ribbon / VBA `wdFieldAddin` bridge), [`rmzelle/ref-extractor`](https://github.com/rmzelle/ref-extractor) (OpenXML `<w:instrText>` reverse extraction), [`Future-Scholars/paperlib`](https://github.com/Future-Scholars/paperlib) (local HTTP IPC bridge), and [`citation-style-language/styles`](https://github.com/citation-style-language/styles).
- **Anti-Hallucination & Claim Verification:** Two-stage evidence triage, atomic claim checking, and composite scoring inspired by [`amazon-science/RefChecker`](https://github.com/amazon-science/RefChecker), [`markrussinovich/refchecker`](https://github.com/markrussinovich/refchecker), [`atomgptlab/hallucination_detector`](https://github.com/atomgptlab/hallucination_detector), [`Vikranth3140/Citation-Hallucination-Detection`](https://github.com/Vikranth3140/Citation-Hallucination-Detection), [`hadipourh/verifyref`](https://github.com/hadipourh/verifyref), and [`allenai/scicite`](https://github.com/allenai/scicite).
- **Legal/Institutional NER, Retrieval & Scientometrics:** Entity taxonomy from [`peluz/lener-br`](https://github.com/peluz/lener-br) / [`pierreguillou/ner-bert-large-cased-pt-lenerbr`](https://huggingface.co/pierreguillou/ner-bert-large-cased-pt-lenerbr); Okapi BM25 (`rank_bm25`) & TF-IDF (`scikit-learn`); **statcheck** (*Nuijten et al.*); **Problematic Paper Screener** (*Cabanac, Labbé & Magazinov*); gene-symbol screening (*Ziemann et al. / HGNC*); **Winnowing** (MOSS), **RKR-GST** (JPlag), `diff-match-patch`, [`Imalwayshere/Open-Detector`](https://github.com/Imalwayshere/Open-Detector), and [`irgifebry/plagiarism-checker`](https://github.com/irgifebry/plagiarism-checker).

For the complete dependency, repository, and standards manifest under Apache 2.0, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## 👤 Author & Maintainer

Developed and maintained by:
* **[Marcos André da Luz](https://www.linkedin.com/in/marcos-andre-da-luz-847039141)**  
  *Doctoral Researcher in Health Technology & Clinical Informatics.*

---

## 📖 How to Cite

If you use Bibliography in your academic research, systematic review, thesis, or publication, please cite it using the metadata in [CITATION.cff](CITATION.cff) or as:

```bibtex
@software{da_luz_bibliography_2026,
  author = {da Luz, Marcos André},
  title = {Bibliography: Open-Source Academic Writing Assistant & Forensic Citation Verification Engine},
  version = {1.0.1},
  year = {2026},
  url = {https://github.com/marcosandredaluz/Bibliography},
  license = {Apache-2.0}
}
```

---

## 📄 License

Distributed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.
