// Configurações locais do programa (ficam no notebook, fora da nuvem).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const arquivo = () => path.join(app.getPath('userData'), 'config.json');

const PADRAO = {
  libraryPath: null,
  estilo: 'associacao-brasileira-de-normas-tecnicas',
  idioma: 'pt-BR',
  tema: 'claro',
  projetosRecentes: [],
};

function carregar() {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo(), 'utf8'));
    return {
      ...PADRAO,
      ...dados,
      projetosRecentes: Array.isArray(dados.projetosRecentes) ? dados.projetosRecentes : [],
    };
  } catch {
    return { ...PADRAO };
  }
}

function salvar(cfg) {
  fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
  fs.writeFileSync(arquivo(), JSON.stringify(cfg, null, 2), 'utf8');
}

function registrarProjetoRecente(caminho, nomeCustomizado) {
  if (!caminho) return [];
  const normalizado = path.resolve(caminho);
  const cfg = carregar();
  const nome = nomeCustomizado || path.basename(normalizado) || 'Projeto';
  let lista = Array.isArray(cfg.projetosRecentes) ? cfg.projetosRecentes : [];
  lista = lista.filter((p) => p && path.resolve(p.caminho) !== normalizado);
  lista.unshift({
    nome,
    caminho: normalizado,
    ultimoAcesso: new Date().toISOString(),
  });
  cfg.projetosRecentes = lista.slice(0, 15);
  salvar(cfg);
  return cfg.projetosRecentes;
}

function removerProjetoRecente(caminho) {
  if (!caminho) return [];
  const normalizado = path.resolve(caminho);
  const cfg = carregar();
  let lista = Array.isArray(cfg.projetosRecentes) ? cfg.projetosRecentes : [];
  cfg.projetosRecentes = lista.filter((p) => p && path.resolve(p.caminho) !== normalizado);
  salvar(cfg);
  return cfg.projetosRecentes;
}

function sugestoesDePasta() {
  const home = os.homedir();
  const out = [];
  const oneDrive = process.env.OneDrive || process.env.OneDriveCommercial || path.join(home, 'OneDrive');
  if (oneDrive && fs.existsSync(oneDrive)) {
    try {
      const entradas = fs.readdirSync(oneDrive, { withFileTypes: true });
      for (const e of entradas) {
        if (e.isDirectory()) {
          const nome = e.name;
          // Pastas acadêmicas ou de pesquisa do usuário no OneDrive
          if (/tcc|bibliografia|sus|saude|ppg|fpp|puc|doutorado|nit|artigo/i.test(nome) || !/^\.|videos|music|fotos|imagens|camera/i.test(nome)) {
            out.push({ nome, caminho: path.join(oneDrive, nome) });
          }
        }
      }
    } catch {}
  }
  for (const letra of ['C', 'D', 'E', 'G']) {
    for (const sub of ['BIBLIOGRAFIA', 'Meu Drive\\Bibliografia']) {
      const p = `${letra}:\\${sub}`;
      if (fs.existsSync(p)) out.push({ nome: `${letra}: ${path.basename(p)}`, caminho: p });
    }
  }
  return out;
}

function obterProjetosRecentes() {
  const cfg = carregar();
  let lista = Array.isArray(cfg.projetosRecentes) ? cfg.projetosRecentes : [];
  
  // Se houver menos de 10 projetos na lista histórica, completa com pastas acadêmicas detectadas
  if (lista.length < 10) {
    const existentes = new Set(lista.map((x) => path.resolve(x.caminho).toLowerCase()));
    if (cfg.libraryPath && !existentes.has(path.resolve(cfg.libraryPath).toLowerCase())) {
      lista.unshift({
        nome: path.basename(cfg.libraryPath),
        caminho: path.resolve(cfg.libraryPath),
        ultimoAcesso: new Date().toISOString()
      });
      existentes.add(path.resolve(cfg.libraryPath).toLowerCase());
    }

    const sugestoes = sugestoesDePasta();
    for (const s of sugestoes) {
      const norm = path.resolve(s.caminho).toLowerCase();
      if (!existentes.has(norm) && fs.existsSync(s.caminho)) {
        lista.push({
          nome: s.nome,
          caminho: path.resolve(s.caminho),
          ultimoAcesso: null,
          autoDetectado: true
        });
        existentes.add(norm);
        if (lista.length >= 10) break;
      }
    }
  }

  // Garante limite de até 10 projetos no retorno
  return lista.slice(0, 10);
}

module.exports = { carregar, salvar, registrarProjetoRecente, removerProjetoRecente, sugestoesDePasta, obterProjetosRecentes };
