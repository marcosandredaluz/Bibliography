# Third-Party Notices & Open-Source Acknowledgments

**Bibliography** (*Bibliografia Forense*) is distributed under the **Apache License 2.0** (see [`LICENSE`](LICENSE)).  
This document records open-source dependencies, public scientific standards, and open-source architectural/algorithmic inspirations from GitHub and academic literature used cleanly inside this project. Commercial and closed-source software products are intentionally excluded.

---

## 1. Runtime & Build Open-Source Dependencies

As declared in [`package.json`](package.json):

| Package / Project | Role in Bibliography | Repository / Ecosystem |
|---|---|---|
| **Electron** & **electron-builder** | Cross-platform desktop shell & Windows NSIS packaging | Open Source (MIT) |
| **React** & **Vite** | Frontend SPA rendering and production bundling | Open Source (MIT) |
| **PDF.js** (`pdfjs-dist`) & **pdf-parse** | Client & Node local PDF text/layout extraction | Open Source (Apache-2.0 / MIT) |
| **mammoth** | `.docx` document conversion & structural inspection | Open Source (BSD-2-Clause) |
| **Citation.js** (`@citation-js/core`), **citeproc-js** (`citeproc`), **CSL Styles** (`citation-style-language/styles`) | Deterministic CSL-JSON parsing and formatting across 2,800+ citation styles | Open Source (MIT / CPAL / CC-BY-SA) |
| **Transformers.js** (`@huggingface/transformers`) | Local ONNX multilingual semantic inference (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`) | Open Source (Apache-2.0) |
| **Google Diff Match Patch** (`diff-match-patch`) | Exact span comparison and literal overlap matching | Open Source (Apache-2.0) |

---

## 2. Open-Source GitHub & Academic Architectural Inspirations

The modules listed below were cleanly designed and implemented in JavaScript/Node.js & Python, drawing architectural and algorithmic inspiration from the following open-source repositories and peer-reviewed tools:

### Word Processor Integration & Citation Field Extraction
- **`zotero/zotero-word-for-windows-integration`**: Architectural inspiration for global `.dotm` Word templates, custom Fluent UI Ribbon (`customUI14.xml`), VBA macro hooks, and dynamic field (`wdFieldAddin`) synchronization (`electron/word_dotm_builder.cjs`, `resources/word-vba-integration/`).
- **`rmzelle/ref-extractor`**: Concept for reverse extraction of structured citation metadata embedded inside Word OpenXML `<w:instrText>` fields (`electron/word_ref_extractor.cjs`).
- **`Future-Scholars/paperlib`**: Local HTTP IPC communication model between desktop reference libraries and external document editors, and modular metadata adapters (`electron/wordServer.cjs`, `electron/scielo_bvs_parser.cjs`).

### Forensic Reference Authentication & Anti-Hallucination
- **`amazon-science/RefChecker`** & **`markrussinovich/refchecker`**: Atomic claim decomposition, active retraction screening, and two-stage abstract/full-text claim verification (`electron/auditor.cjs`, `electron/metadata.cjs`, `electron/field_composite_scorer.cjs`, `docs/auditoria.md`).
- **`atomgptlab/hallucination_detector`**, **`Vikranth3140/Citation-Hallucination-Detection`**, & **`hadipourh/verifyref`**: Deterministic field-wise composite scoring across title, authors, year, and venue (`electron/field_composite_scorer.cjs`).
- **`allenai/scicite`** & **`onecite`**: Citation discursive intent taxonomy — methodological, supportive, contrastive, and conceptual (`electron/auditor.cjs`).

### Brazilian Legal/Institutional NER, Retrieval & NLP
- **`peluz/lener-br`** & **`pierreguillou/ner-bert-large-cased-pt-lenerbr`**: Entity taxonomy (`LEGISLACAO`, `ORGANIZACAO`) adapted for deterministic classification of Brazilian laws, health ministry notes, official portals, and institutional courseware (`electron/lener_br_classifier.cjs`).
- **`rank_bm25`** & **`scikit-learn` (`TfidfVectorizer`)**: Deterministic Okapi BM25 ranking and sparse TF-IDF vector scoring for bilingual claim support (`electron/bm25_scorer.cjs`, `electron/tfidf_claim_support.cjs`).

### Scientometrics, Stylometry & Plagiarism Algorithms
- **Problematic Paper Screener** (*Guillaume Cabanac, Cyril Labbé & Alexander Magazinov, 2021*): Detection of automated paraphrasing "tortured phrases" (`electron/tortured_phrases_detector.cjs`).
- **`statcheck`** (*Michele Nuijten et al.*): Deterministic statistical test consistency auditing across $Z$, $t$, $F$, $\chi^2$, and $r$ vs. reported $p$-values (`electron/statcheck_forense.cjs`).
- **Ziemann et al. / HUGO Gene Nomenclature Committee (HGNC)**: Screening biomedical gene symbols corrupted into spreadsheet dates (`electron/corrupcao_biomedica_detector.cjs`).
- **Winnowing** (*Schleimer, Wilkerson & Aiken / MOSS*) & **Running Karp-Rabin Greedy String Tiling (RKR-GST / JPlag)**: Fingerprinting index and mosaic plagiarism detection (`electron/similarity_winnowing.cjs`, `electron/similarity_tiling.cjs`).
- **`irgifebry/plagiarism-checker`** & **`Imalwayshere/Open-Detector`**: Offline stylometric heuristics — lexical richness (TTR/Guiraud), burstiness, Flesch readability, and syntactic cadence analysis (`electron/estilometria_academica.cjs`, `electron/auditor.cjs`).
- **Beall's List Archive** & **COPE Publication Ethics Guidelines**: Predatory/hijacked journal triage and citation/authorship concentration metrics (`electron/periodicos_predatorios_detector.cjs`, `electron/rede_citacoes_forense.cjs`).

---

## 3. Open Scientific Metadata Providers & Standards

- **APIs & Open Registries:** PubMed / NCBI E-utilities, Europe PMC, Crossref, OpenAlex (+ Retraction Watch metadata), Unpaywall, ClinicalTrials.gov, SciELO, and BVS/LILACS.
- **Standards:** ABNT NBR 6023, ABNT NBR 10520, CSL 1.0.2 / CSL-JSON, PRISMA 2020, STROBE, CONSORT.
