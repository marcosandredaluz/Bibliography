import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Impede que soltar um arquivo fora da área de importação abra o PDF na janela.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { temErro: false, erro: null };
  }
  static getDerivedStateFromError(error) {
    try {
      const splash = document.getElementById('splash-screen');
      if (splash) splash.remove();
    } catch {}
    return { temErro: true, erro: error };
  }
  componentDidCatch(error, errorInfo) {
    try {
      const splash = document.getElementById('splash-screen');
      if (splash) splash.remove();
    } catch {}
    console.error('Erro na aplicação capturado pelo ErrorBoundary:', error, errorInfo);
  }
  render() {
    if (this.state.temErro) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#0f172a',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 580,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 30,
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 14 }}>⚠️</div>
            <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>Recuperação de Inicialização</h2>
            <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
              Ocorreu um imprevisto durante o carregamento da interface. Você pode recarregar a aplicação com segurança.
            </p>
            {this.state.erro && (
              <pre
                style={{
                  background: '#0b1120',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#f87171',
                  textAlign: 'left',
                  overflowX: 'auto',
                  marginBottom: 20,
                }}
              >
                {this.state.erro.message || String(this.state.erro)}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                🔄 Recarregar Aplicativo
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
