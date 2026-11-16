"""
Módulo de Saúde Pública - Modelos de Dados e Banco Satélite
Armazena metadados de Portarias SUS, PCDTs e Padrões HL7 FHIR sem poluir a tabela core.
"""
import sqlite3
from typing import Dict, Any, Optional

DDL_PORTARIAS_SUS = """
CREATE TABLE IF NOT EXISTS tb_portarias_sus (
    ref_id TEXT PRIMARY KEY,
    numero_norma TEXT NOT NULL,
    tipo_ato TEXT NOT NULL,             -- 'Portaria GM/MS', 'Portaria SAPS', 'Resolução CIT', 'Decreto'
    orgao_origem TEXT NOT NULL,         -- 'Gabinete do Ministro', 'SAPS', 'SAES', 'SVSA', 'ANVISA'
    data_publicacao_dou TEXT,
    secao_dou INTEGER,
    pagina_dou TEXT,
    ementa TEXT,
    codigo_revogacao TEXT,              -- Se foi revogada por ato posterior
    portaria_consolidacao INTEGER,      -- Ex: 1 a 6 (Portaria de Consolidação GM/MS)
    FOREIGN KEY(ref_id) REFERENCES referencias(id) ON DELETE CASCADE
);
"""

DDL_GUIAS_HL7_FHIR = """
CREATE TABLE IF NOT EXISTS tb_guias_hl7_fhir (
    ref_id TEXT PRIMARY KEY,
    sistema_origem TEXT NOT NULL,       -- 'RNDS', 'e-SUS APS', 'SISCAN', 'ConecteSUS'
    versao_fhir TEXT NOT NULL,          -- 'R4', 'STU3'
    perfil_canonical_url TEXT,          -- Ex: 'http://saude.gov.br/fhir/r4/StructureDefinition/BRIndividuo'
    repositorio_git TEXT,               -- Link oficial DATASUS / GitHub
    versao_guia TEXT,                   -- Ex: 'v1.4.2'
    FOREIGN KEY(ref_id) REFERENCES referencias(id) ON DELETE CASCADE
);
"""

def criar_tabelas_saude(db_conn: sqlite3.Connection):
    """Cria tabelas satélites de saúde caso não existam."""
    cursor = db_conn.cursor()
    cursor.execute(DDL_PORTARIAS_SUS)
    cursor.execute(DDL_GUIAS_HL7_FHIR)
    db_conn.commit()

def inserir_portaria_sus(db_conn: sqlite3.Connection, dados: Dict[str, Any]):
    """Insere ou substitui registro de portaria do SUS."""
    query = """
    INSERT OR REPLACE INTO tb_portarias_sus (
        ref_id, numero_norma, tipo_ato, orgao_origem, data_publicacao_dou,
        secao_dou, pagina_dou, ementa, codigo_revogacao, portaria_consolidacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    cursor = db_conn.cursor()
    cursor.execute(query, (
        dados["ref_id"],
        dados.get("numero_norma", ""),
        dados.get("tipo_ato", "Portaria GM/MS"),
        dados.get("orgao_origem", "Ministério da Saúde"),
        dados.get("data_publicacao_dou", ""),
        dados.get("secao_dou", 1),
        dados.get("pagina_dou", ""),
        dados.get("ementa", ""),
        dados.get("codigo_revogacao", None),
        dados.get("portaria_consolidacao", None)
    ))
    db_conn.commit()

def inserir_guia_hl7(db_conn: sqlite3.Connection, dados: Dict[str, Any]):
    """Insere ou substitui registro de guia de interoperabilidade HL7 FHIR."""
    query = """
    INSERT OR REPLACE INTO tb_guias_hl7_fhir (
        ref_id, sistema_origem, versao_fhir, perfil_canonical_url, repositorio_git, versao_guia
    ) VALUES (?, ?, ?, ?, ?, ?)
    """
    cursor = db_conn.cursor()
    cursor.execute(query, (
        dados["ref_id"],
        dados.get("sistema_origem", "RNDS"),
        dados.get("versao_fhir", "R4"),
        dados.get("perfil_canonical_url", ""),
        dados.get("repositorio_git", ""),
        dados.get("versao_guia", "1.0.0")
    ))
    db_conn.commit()
