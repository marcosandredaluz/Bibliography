import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- Ícones (SVG no estilo "lucide") ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  library: 'M4 19.5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14.5M4 19.5A2.5 2.5 0 0 0 6.5 22H20M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
};

export function Icone({ nome, tam = 16, cheio = false, className = '' }) {
  return (
    <svg
      className={`icone ${className}`}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill={cheio ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={P[nome] || ''} />
    </svg>
  );
}

// ---------- Avisos (toasts) ----------
const CtxAviso = createContext(() => {});
export const useAviso = () => useContext(CtxAviso);

export function ProvedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const avisar = useCallback((texto, tipo = 'info', ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a, { id, texto, tipo }]);
    if (ms) setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), ms);
    return id;
  }, []);
  return (
    <CtxAviso.Provider value={avisar}>
      {children}
      <div className="avisos">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`} onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}>
            {a.texto}
          </div>
        ))}
      </div>
    </CtxAviso.Provider>
  );
}

// ---------- Modal ----------
export function Modal({ titulo, onFechar, children, largura = 560, rodape }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onFechar?.();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <div className="modal" style={{ width: largura }}>
        <div className="modal-topo">
          <h3>{titulo}</h3>
          <button className="btn-icone" onClick={onFechar} title="Fechar">
            <Icone nome="x" />
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------- Campo editável que salva ao sair (blur) ----------
export function Campo({ rotulo, valor, onSalvar, multilinha = false, linhas = 3, placeholder, dica, tipo = 'text' }) {
  const [v, setV] = useState(valor ?? '');
  const original = useRef(valor ?? '');
  useEffect(() => {
    setV(valor ?? '');
    original.current = valor ?? '';
  }, [valor]);
  const salvar = () => {
    if (v !== original.current) {
      original.current = v;
      onSalvar(v);
    }
  };
  const props = {
    value: v,
    placeholder,
    onChange: (e) => setV(e.target.value),
    onBlur: salvar,
    onKeyDown: (e) => {
      if (!multilinha && e.key === 'Enter') e.currentTarget.blur();
    },
  };
  return (
    <label className="campo">
      {rotulo && <span className="campo-rotulo">{rotulo}</span>}
      {multilinha ? <textarea rows={linhas} {...props} /> : <input type={tipo} {...props} />}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  );
}

export function Carregando({ texto = 'Carregando…' }) {
  return (
    <div className="carregando">
      <span className="spinner" /> {texto}
    </div>
  );
}

export function Vazio({ icone = 'book', titulo, children }) {
  return (
    <div className="vazio">
      <Icone nome={icone} tam={40} />
      <h3>{titulo}</h3>
      <div>{children}</div>
    </div>
  );
}
