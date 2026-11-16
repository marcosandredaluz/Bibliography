"""
Tabelas Satélites de Saúde Pública (SUS, PCDT, HL7 FHIR)
Camada: Plugins / Saúde Pública
"""
import sqlite3
from typing import Dict, Any

DDL_PORTARIAS_SUS = """
CREATE TABLE IF NOT EXISTS tb_portarias_sus (
    ref_id TEXT PRIMARY KEY,
    numero_norma TEXT NOT NULL,
    tipo_ato TEXT NOT NULL,
    orgao_origem TEXT NOT NULL,
    data_publicacao_dou TEXT,
    secao_dou INTEGER,
    pagina_dou TEXT,
    ementa TEXT,
    codigo_revogacao TEXT,
    portaria_consolidacao INTEGER
);
"""

DDL_GUIAS_HL7_FHIR = """
CREATE TABLE IF NOT EXISTS tb_guias_hl7_fhir (
    ref_id TEXT PRIMARY KEY,
    sistema_origem TEXT NOT NULL,
    versao_fhir TEXT NOT NULL,
    perfil_canonical_url TEXT,
    repositorio_git TEXT,
    versao_guia TEXT
);
"""

def criar_tabelas_saude(db_conn: sqlite3.Connection):
    cursor = db_conn.cursor()
    cursor.execute(DDL_PORTARIAS_SUS)
    cursor.execute(DDL_GUIAS_HL7_FHIR)
    db_conn.commit()
