import { useState, useMemo } from 'react';

export function useLibraryFilters(referencias = []) {
  const [busca, setBusca] = useState('');
  const [visao, setVisao] = useState('todas');
  const [tagFiltro, setTagFiltro] = useState(null);
  const [ordem, setOrdem] = useState({ campo: 'ano', desc: true });

  const referenciasFiltradas = useMemo(() => {
    let lista = [...referencias];

    // 1. Filtro por Visão (Status ou Coleção)
    if (visao === 'lixeira') {
      return [];
    } else if (visao.startsWith('col:')) {
      const colId = visao.slice(4);
      lista = lista.filter((r) => (r.colecoes || []).includes(colId));
    } else if (visao !== 'todas') {
      lista = lista.filter((r) => r.status === visao);
    }

    // 2. Filtro por Tag
    if (tagFiltro) {
      lista = lista.filter((r) => (r.tags || []).includes(tagFiltro));
    }

    // 3. Filtro por Busca Textual
    if (busca.trim()) {
      const termos = busca.toLowerCase().trim().split(/\s+/);
      lista = lista.filter((r) => {
        const csl = r.csl || {};
        const textoBusca = [
          csl.title,
          csl['container-title'],
          csl.DOI,
          r.notas,
          (csl.author || []).map((a) => a.family || a.literal || '').join(' '),
          (r.tags || []).join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return termos.every((t) => textoBusca.includes(t));
      });
    }

    // 4. Ordenação
    lista.sort((a, b) => {
      let va = '';
      let vb = '';
      if (ordem.campo === 'ano') {
        va = a.csl?.issued?.['date-parts']?.[0]?.[0] || 0;
        vb = b.csl?.issued?.['date-parts']?.[0]?.[0] || 0;
      } else if (ordem.campo === 'titulo') {
        va = (a.csl?.title || '').toLowerCase();
        vb = (b.csl?.title || '').toLowerCase();
      } else if (ordem.campo === 'autor') {
        va = (a.csl?.author?.[0]?.family || '').toLowerCase();
        vb = (b.csl?.author?.[0]?.family || '').toLowerCase();
      }

      if (va < vb) return ordem.desc ? 1 : -1;
      if (va > vb) return ordem.desc ? -1 : 1;
      return 0;
    });

    return lista;
  }, [referencias, visao, tagFiltro, busca, ordem]);

  return {
    busca,
    setBusca,
    visao,
    setVisao,
    tagFiltro,
    setTagFiltro,
    ordem,
    setOrdem,
    referenciasFiltradas,
  };
}
