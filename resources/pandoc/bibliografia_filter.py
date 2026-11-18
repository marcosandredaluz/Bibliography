"""
Filtro Pandoc / Quarto (BSD-3-Clause, via sergiocorreia/panflute).
Intercepta @chave no AST Pandoc, consulta http://127.0.0.1:23119/api/v1/citations/resolve
e /api/v1/citations/bibliography, falhando explicitamente em caso de chave ausente,
duplicidade ou servidor offline.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List

import panflute as pf


def _post_local(endpoint: str, payload: Dict[str, Any], port: int = 23119, token: str = "") -> Dict[str, Any]:
    url = f"http://127.0.0.1:{port}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Bibliography-Local-Token"] = token
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            msg = json.loads(raw).get("erro", raw)
        except Exception:
            msg = raw
        raise RuntimeError(f"Erro HTTP {exc.code} em {endpoint}: {msg}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Servidor Bibliografia em 127.0.0.1:{port} indisponível: {exc}") from exc


def resolve_citation(key: str, page: str = "", port: int = 23119, token: str = "") -> Dict[str, Any]:
    data = _post_local("/api/v1/citations/resolve", {"keys": [key], "page": page}, port=port, token=token)
    if key in data.get("missing_keys", []):
        raise KeyError(f"Chave inexistente: @{key}")
    if key in data.get("duplicate_keys", []):
        raise ValueError(f"Chave duplicada/ambígua: @{key}")
    return data["resolved"][key]


def build_bibliography(keys: List[str], style: str = "associacao-brasileira-de-normas-tecnicas", port: int = 23119, token: str = "") -> Dict[str, Any]:
    return _post_local("/api/v1/citations/bibliography", {"keys": sorted(set(keys)), "style": style}, port=port, token=token)


def prepare(doc: pf.Doc) -> None:
    doc._cited_keys = []


def action(elem: pf.Element, doc: pf.Doc) -> None:
    if isinstance(elem, pf.Cite):
        for c in elem.citations:
            if c.id and c.id not in doc._cited_keys:
                doc._cited_keys.append(c.id)


def finalize(doc: pf.Doc) -> None:
    keys = getattr(doc, "_cited_keys", [])
    if not keys:
        return
    port = int(os.environ.get("BIBLIOGRAPHY_LOCAL_PORT", "23119"))
    token = os.environ.get("BIBLIOGRAPHY_LOCAL_TOKEN", "")
    style = doc.get_metadata("csl-style", "associacao-brasileira-de-normas-tecnicas")
    try:
        for k in keys:
            resolve_citation(k, port=port, token=token)
        bib = build_bibliography(keys, style=style, port=port, token=token)
        if bib.get("bib_file_path") and "bibliography" not in doc.metadata:
            doc.metadata["bibliography"] = pf.MetaString(bib["bib_file_path"])
    except Exception as exc:
        sys.stderr.write(f"[bibliografia_filter] ERRO FATAL: {exc}\n")
        sys.exit(1)


def main(doc: pf.Doc | None = None) -> Any:
    return pf.run_filter(action, prepare=prepare, finalize=finalize, doc=doc)


if __name__ == "__main__":
    main()
