import React, { createContext, useContext, useMemo } from 'react';
import ptBrPack from './locales/pt-BR.json';
import enPack from './locales/en.json';

export const IDIOMAS_INTERFACE = [
  { id: 'pt-BR', nome: 'Português (Brasil)', sigla: 'PT', bandeira: '🇧🇷' },
  { id: 'en', nome: 'English (International)', sigla: 'EN', bandeira: '🇺🇸' },
];

const PACOTES = {
  'pt-BR': ptBrPack,
  en: enPack,
};

function buscarChaveAninhada(obj, caminho) {
  if (!obj || !caminho) return undefined;
  const partes = String(caminho).split('.');
  let atual = obj;
  for (const p of partes) {
    if (atual && typeof atual === 'object' && Object.prototype.hasOwnProperty.call(atual, p)) {
      atual = atual[p];
    } else {
      return undefined;
    }
  }
  return typeof atual === 'string' ? atual : undefined;
}

const I18nContext = createContext({
  idioma: 'pt-BR',
  ehEn: false,
  alternarIdioma: () => {},
  mudarIdioma: () => {},
  t: (k, varsOrFallback) => (typeof varsOrFallback === 'string' ? varsOrFallback : k),
  tr: (pt, en) => pt,
  fmtNum: (n) => Number(n || 0).toLocaleString('pt-BR'),
  fmtData: (d, opts) => new Date(d).toLocaleString('pt-BR', opts),
});

export function I18nProvider({ idioma = 'pt-BR', aoMudarIdioma, children }) {
  const idiomaAtivo = idioma === 'en' ? 'en' : 'pt-BR';
  const pacoteAtivo = PACOTES[idiomaAtivo] || ptBrPack;
  const ehEn = idiomaAtivo === 'en';

  const valor = useMemo(() => {
    const t = (chave, varsOuFallback = null) => {
      let bruto =
        buscarChaveAninhada(pacoteAtivo, chave) ??
        buscarChaveAninhada(ptBrPack, chave) ??
        (typeof varsOuFallback === 'string' ? varsOuFallback : chave);
      if (varsOuFallback && typeof varsOuFallback === 'object') {
        for (const [k, v] of Object.entries(varsOuFallback)) {
          bruto = bruto.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
        }
      }
      return bruto;
    };

    const tr = (ptTexto, enFallback = null) => {
      if (!ehEn) return ptTexto;
      const deDicionario = enPack?.phrases?.[ptTexto];
      if (typeof deDicionario === 'string' && deDicionario.length > 0) {
        return deDicionario;
      }
      return typeof enFallback === 'string' && enFallback.length > 0 ? enFallback : ptTexto;
    };

    const fmtNum = (n) => {
      const num = Number(n);
      if (Number.isNaN(num)) return String(n ?? '');
      return num.toLocaleString(ehEn ? 'en-US' : 'pt-BR');
    };

    const fmtData = (d, opts) => {
      try {
        return new Date(d).toLocaleString(ehEn ? 'en-US' : 'pt-BR', opts);
      } catch {
        return String(d ?? '');
      }
    };

    return {
      idioma: idiomaAtivo,
      ehEn,
      alternarIdioma: () => aoMudarIdioma?.(ehEn ? 'pt-BR' : 'en'),
      mudarIdioma: (novo) => aoMudarIdioma?.(novo === 'en' ? 'en' : 'pt-BR'),
      t,
      tr,
      fmtNum,
      fmtData,
    };
  }, [idiomaAtivo, pacoteAtivo, ehEn, aoMudarIdioma]);

  return <I18nContext.Provider value={valor}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
