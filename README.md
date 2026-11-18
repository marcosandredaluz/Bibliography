# Bibliography (`v1.0.2`)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/release-v1.0.2-blue.svg)](https://github.com/marcosandredaluz/Bibliography/releases)

Desktop, offline-first reference manager, systematic review screening workbench, and citation verification tool built for academic writing in health sciences and related fields.

> **Português (BR):** Veja [README_pt.md](README_pt.md).

---

## Core Capabilities

- **Reference Library & Federated Search:** Local library backed by atomic JSON records + synchronized `library.bib`, with federated queries across PubMed, Europe PMC, Crossref, OpenAlex, and ClinicalTrials.gov.
- **Forensic Manuscript Auditing (`.docx` & `.pdf`):**
  - Cross-checks in-text citations (ABNT NBR 10520 / NBR 6023 and Vancouver superscript/numeric) against the reference list and Crossref/PubMed/SciELO metadata.
  - Detects fabricated references, swapped/hijacked DOIs, and figure/table numbering gaps.
  - Two-column PDF layout segmentation and 90°-rotated figure text handling (`PDF.js` in UI + `pdfplumber`/`pypdf` in Python).
  - Offline bilingual claim-to-source semantic verification (`PT <-> EN`) via an embedded INT8-quantized MiniLM ONNX model (`custom-forensic-minilm`).
- **Systematic Review & Risk of Bias:** Deduplication, double-blind screening, PRISMA 2020 flow export, and Cochrane RoB 2 / ROBINS-I assessment with mandatory human sign-off (`pending_human_review`) and an append-only SHA-256 audit log.
- **Word, Browser & Pandoc/Quarto Bridges:**
  - Local HTTP service (`127.0.0.1:23119`) for `.dotm` Word integration and XML field extraction.
  - Manifest V3 browser clipper (`POST /api/v1/clip` with `X-Bibliography-Local-Token`).
  - Citations API (`/api/v1/citations/resolve`, `/api/v1/citations/bibliography`) and Panflute filter compatible with Pandoc / Quarto (`>= 1.4.0`).

---

## Project Layout

```text
.
├── src/                  # React 19 + Vite UI, PDF.js reader, i18n locales (pt-BR, en, es, fr)
├── electron/             # Electron main process, wordServer, citation/ONNX/RoB/ABNT auditors
├── backend/              # Python PDF layout pipeline (pdfplumber/pypdf) and Word FastAPI adapter
├── resources/            # CSL styles, Pandoc filter, Word add-in template, Web Clipper MV3
├── training/             # Google Colab fine-tuning & INT8 ONNX export scripts
├── calibration_gate/     # Anti-overfitting & benchmark calibration runners
└── tests/                # Unit, regression, OpenXML, and forensic auditor test suites
```

---

## Running Locally

### Prerequisites
- Node.js 20+ and npm
- Python 3.10+ (for the optional PDF layout backend in `backend/requirements.txt`)

```bash
npm install
npm run dev
```

To build the Windows NSIS installer:

```bash
npm run dist
```

Prebuilt installers are published under [GitHub Releases](https://github.com/marcosandredaluz/Bibliography/releases).

---

## Verification

```bash
# Forensic calibration and red-team suites
npm run test:calibracao

# Clean-room & auditor unit tests
node tests/test_novos_modulos_clean_room.test.cjs
node tests/test_novos_auditores_forenses.test.cjs
```

---

## Maintainer & Citation

Maintained by **[Marcos André da Luz](https://www.linkedin.com/in/marcos-andre-da-luz-847039141)**.  
Third-party licenses and open-source notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Citation metadata is available in [CITATION.cff](CITATION.cff).

```bibtex
@software{da_luz_bibliography_2026,
  author  = {da Luz, Marcos André},
  title   = {Bibliography: Offline-First Reference Manager and Forensic Citation Auditor},
  version = {1.0.2},
  year    = {2026},
  url     = {https://github.com/marcosandredaluz/Bibliography},
  license = {Apache-2.0}
}
```

Licensed under the [Apache 2.0 License](LICENSE).
