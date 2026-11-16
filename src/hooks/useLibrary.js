import { useState, useEffect, useCallback } from 'react';

export function useLibrary(avisar) {
  const [bib, setBib] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [projetosRecentes, setProjetosRecentes] = useState([]);

  const carregarEstado = useCallback(async () => {
    try {
      setCarregando(true);
      const estado = await window.api.bib.estado();
      setBib(estado);
      const listaProjetos = await window.api.config.projetosRecentes?.();
      setProjetosRecentes(listaProjetos || []);
    } catch (e) {
      avisar?.(`Erro ao carregar biblioteca: ${e.message}`, 'erro');
    } finally {
      setCarregando(false);
    }
  }, [avisar]);

  useEffect(() => {
    carregarEstado();
  }, [carregarEstado]);

  const atualizarRef = useCallback(
    async (id, patch) => {
      try {
        const atualizada = await window.api.bib.atualizar(id, patch);
        setBib((ant) => {
          if (!ant) return ant;
          const novas = (ant.refs || ant.referencias || []).map((r) => (r.id === id ? atualizada : r));
          return { ...ant, refs: novas, referencias: novas };
        });
        return atualizada;
      } catch (e) {
        avisar?.(`Erro ao atualizar referência: ${e.message}`, 'erro');
        throw e;
      }
    },
    [avisar]
  );

  const excluirRefs = useCallback(
    async (ids) => {
      try {
        await window.api.bib.excluir(ids);
        const idsSet = new Set(ids);
        setBib((ant) => {
          if (!ant) return ant;
          const filtradas = (ant.refs || ant.referencias || []).filter((r) => !idsSet.has(r.id));
          return { ...ant, refs: filtradas, referencias: filtradas };
        });
      } catch (e) {
        avisar?.(`Erro ao excluir referências: ${e.message}`, 'erro');
        throw e;
      }
    },
    [avisar]
  );

  const alternarProjeto = useCallback(
    async (caminho, nome) => {
      try {
        setCarregando(true);
        const novoEstado = await window.api.config.alternarProjeto(caminho, nome);
        setBib(novoEstado);
        const lista = await window.api.config.projetosRecentes();
        setProjetosRecentes(lista || []);
        avisar?.(`Projeto "${nome || 'selecionado'}" ativado com sucesso!`, 'sucesso');
        return novoEstado;
      } catch (e) {
        avisar?.(`Erro ao alternar projeto: ${e.message}`, 'erro');
        throw e;
      } finally {
        setCarregando(false);
      }
    },
    [avisar]
  );

  return {
    bib,
    setBib,
    carregando,
    projetosRecentes,
    recarregar: carregarEstado,
    atualizarRef,
    excluirRefs,
    alternarProjeto,
  };
}
