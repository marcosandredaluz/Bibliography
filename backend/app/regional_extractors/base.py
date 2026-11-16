"""
Interface Base para Extratores Bibliográficos (Translators)
Camada: Regional Extractors
Princípio: Interface Segregation (SOLID) & Open-Closed Principle
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class BaseTranslator(ABC):
    """Contrato abstrato que qualquer extrator de base bibliográfica regional deve satisfazer."""

    @property
    @abstractmethod
    def nome(self) -> str:
        """Nome legível da base ou fonte de dados."""
        pass

    @abstractmethod
    def pode_processar(self, identificador_ou_url: str) -> bool:
        """Retorna True se o identificador ou URL for suportado por este extrator."""
        pass

    @abstractmethod
    def extrair_metadados(self, identificador_ou_url: str) -> Optional[Dict[str, Any]]:
        """Extrai os metadados bibliográficos e converte para padrão CSL-JSON normalizado."""
        pass
