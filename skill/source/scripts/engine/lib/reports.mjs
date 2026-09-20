/**
 * reports.mjs — portado de background.js (extensão DevClone): geração de
 * README.md, RELATORIO-DE-CAPTURA.txt, VALIDACAO-DE-ANIMACOES.txt e
 * AI_CONTEXT.md para o Modo 1 (clone completo). Lógica pura de formatação
 * de texto. Os relatórios do Modo 2 (harness) ficam em harness-build.mjs.
 */

function categorizeUrl(url) {
  const u = url.toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|webp|avif|gif|svg|ico|bmp)$/.test(u)) return 'imagens';
  if (/\.(mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)$/.test(u)) return 'videos';
  if (/\.(woff2?|ttf|otf|eot)$/.test(u)) return 'fontes';
  if (/\.(css)$/.test(u)) return 'estilos';
  if (/\.(js|mjs)$/.test(u)) return 'scripts';
  return 'outros';
}

function friendlyReason(reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('403') || r.includes('401') || r.includes('cors') || r.includes('opaque')) {
    return 'sem permissão de acesso (o site bloqueou o download deste arquivo)';
  }
  if (r.includes('404') || r.includes('410')) {
    return 'não encontrado (o link pode ter expirado ou mudado de lugar)';
  }
  if (/\b5\d\d\b/.test(r)) {
    return 'o servidor do arquivo estava com problema no momento';
  }
  if (r.includes('network') || r.includes('failed to fetch') || r.includes('timeout')) {
    return 'falha de conexão durante a captura';
  }
  return reason || 'motivo não identificado';
}

export function buildFailureReport(startUrl, state) {
  const total = state.files.length;
  const fails = state.errors || [];
  const remaining = (state.validation && state.validation.remainingRemote) || [];
  const dependencyGaps = (state.validation && state.validation.dependencyGaps) || [];
  const L = [];
  L.push('RELATÓRIO DE CAPTURA — DevClone (engine standalone)');
  L.push('========================================');
  L.push('');
  L.push(`Site clonado : ${startUrl}`);
  L.push(`Data         : ${new Date().toLocaleString('pt-BR')}`);
  L.push('');
  L.push('RESUMO');
  L.push('------');
  L.push(`Modo de captura: ${state.captureMode === 'network-original' ? 'avancado (rede real + HTML original)' : 'compatibilidade'}`);
  L.push(`Recursos obtidos da execucao real: ${state.dynamicCaptured || 0}`);
  L.push(`[ok] ${total} arquivos capturados com sucesso.`);
  if (!fails.length && !remaining.length && !dependencyGaps.length) {
    L.push('[ok] Nenhum arquivo ficou de fora. Captura completa!');
    L.push('');
    return L.join('\n');
  }
  if (fails.length) L.push(`[!]  ${fails.length} arquivo(s) nao puderam ser baixados (lista abaixo).`);
  if (remaining.length) L.push(`[!]  ${remaining.length} referencia(s) ativa(s) continuam externas.`);
  if (dependencyGaps.length) L.push(`[!]  ${dependencyGaps.length} dependencia(s) citada(s) pelos controladores nao foram localizadas.`);
  L.push('');
  const criticalScripts = fails.filter((e) => /\.(m?js)(\?|$)/i.test(e.url || ''));
  if (criticalScripts.length) {
    L.push('[CRITICO] Um ou mais scripts ativos nao foram obtidos. Animacoes ou interacoes');
    L.push('podem ficar incompletas. Consulte VALIDACAO-DE-ANIMACOES.txt.');
  } else {
    L.push('Os itens abaixo nao foram obtidos. O impacto depende da funcao de cada arquivo.');
  }
  L.push('');

  const groups = {};
  for (const e of fails) {
    const cat = categorizeUrl(e.url);
    (groups[cat] = groups[cat] || []).push(e);
  }
  const order = ['imagens', 'videos', 'fontes', 'estilos', 'scripts', 'outros'];
  const titulo = {
    imagens: 'IMAGENS', videos: 'VIDEOS E MIDIA', fontes: 'FONTES',
    estilos: 'ESTILOS (CSS)', scripts: 'SCRIPTS', outros: 'OUTROS ARQUIVOS',
  };
  if (fails.length) {
    L.push('O QUE FALTOU, POR TIPO');
    L.push('----------------------');
    for (const cat of order) {
      const items = groups[cat];
      if (!items || !items.length) continue;
      L.push('');
      L.push(`${titulo[cat]} — ${items.length} arquivo(s)`);
      for (const it of items.slice(0, 500)) {
        const name = decodeURIComponent((it.url.split('/').pop() || it.url).split('?')[0]).slice(0, 90);
        L.push(`  - ${name}`);
        L.push(`      motivo: ${friendlyReason(it.reason)}`);
        L.push(`      link:   ${it.url}`);
      }
    }
  }
  if (remaining.length) {
    L.push('');
    L.push('REFERENCIAS ATIVAS AINDA EXTERNAS');
    L.push('--------------------------------');
    remaining.forEach((u) => L.push(`- ${u}`));
  }
  if (dependencyGaps.length) {
    L.push('');
    L.push('DEPENDENCIAS DE ANIMACAO AUSENTES');
    L.push('--------------------------------');
    dependencyGaps.forEach((item) => L.push(`- ${item}`));
  }
  L.push('');
  L.push('POR QUE ISSO ACONTECE');
  L.push('---------------------');
  L.push('- "sem permissao de acesso": o servidor bloqueou o download por protecao.');
  L.push('- "nao encontrado": o arquivo nao existe mais naquele endereco.');
  L.push('- "falha de conexao": instabilidade de rede no momento da captura.');
  L.push('');
  L.push('O QUE VOCE PODE FAZER');
  L.push('---------------------');
  L.push('1. Tente clonar de novo mais tarde — falhas de rede costumam se resolver.');
  L.push('2. Ao reconstruir o site com IA, os arquivos faltantes podem ser trocados');
  L.push('   por equivalentes. Descreva no prompt o que faltou (ex.: "a imagem do');
  L.push('   topo nao veio, gere uma parecida").');
  L.push('3. Se for um video ou imagem essencial, baixe-o manualmente pelo link');
  L.push('   acima (botao direito na pagina original > salvar).');
  L.push('');
  return L.join('\n');
}

export function buildAnimationValidation(startUrl, state) {
  const L = [];
  const remaining = (state.validation && state.validation.remainingRemote) || [];
  const stats = (state.validation && state.validation.stats) || {};
  const dependencyGaps = (state.validation && state.validation.dependencyGaps) || [];
  const criticalErrors = state.errors.filter((e) => /\.(m?js|wasm|riv|json)(\?|$)/i.test(e.url || ''));
  L.push('VALIDACAO DE ANIMACOES - DevClone (engine standalone)');
  L.push('================================================');
  L.push('');
  L.push(`Origem: ${startUrl}`);
  L.push(`Fonte do HTML: ${stats.source || state.captureMode}`);
  L.push(`Recursos registrados durante a execucao: ${state.dynamicCaptured || 0}`);
  L.push(`Mapeamentos usados pelo runtime local: ${stats.runtimeMappings || 0}`);
  L.push(`Stack observada: ${(state.stack || []).join(', ') || 'nao identificada'}`);
  L.push('');
  L.push('RESULTADO');
  L.push('---------');
  if (state.captureMode === 'network-original' && !criticalErrors.length && !remaining.length && !dependencyGaps.length) {
    L.push('[ok] HTML original preservado e dependencias de animacao observadas foram incorporadas.');
  } else {
    if (state.captureMode !== 'network-original') L.push('[!] A captura avancada nao ficou disponivel; foi usado o DOM renderizado.');
    if (criticalErrors.length) L.push(`[!] ${criticalErrors.length} controlador(es) ou arquivo(s) de runtime falharam.`);
    if (remaining.length) L.push(`[!] ${remaining.length} referencia(s) ativa(s) continuam externas.`);
    if (dependencyGaps.length) L.push(`[!] ${dependencyGaps.length} tipo(s) de dependencia citados no JavaScript nao apareceram no ZIP.`);
  }
  L.push('');
  L.push('IMPORTANTE');
  L.push('----------');
  L.push('Execute por http://localhost. Abrir index.html por duplo clique usa file:// e');
  L.push('pode bloquear modulos, fetch, WASM, workers, Rive e outras animacoes modernas.');
  if (remaining.length) {
    L.push('');
    L.push('REFERENCIAS ATIVAS QUE CONTINUAM REMOTAS');
    L.push('----------------------------------------');
    remaining.forEach((u) => L.push(`- ${u}`));
  }
  if (criticalErrors.length) {
    L.push('');
    L.push('FALHAS CRITICAS');
    L.push('---------------');
    criticalErrors.forEach((e) => L.push(`- ${e.url} — ${e.reason}`));
  }
  if (dependencyGaps.length) {
    L.push('');
    L.push('DEPENDENCIAS CITADAS, MAS AUSENTES');
    L.push('--------------------------------');
    dependencyGaps.forEach((item) => L.push(`- ${item}`));
  }
  if (state.captureWarnings && state.captureWarnings.length) {
    L.push('');
    L.push('AVISOS TECNICOS DA CAPTURA');
    L.push('--------------------------');
    state.captureWarnings.slice(0, 100).forEach((e) => L.push(`- ${e.url || 'captura'} — ${e.reason}`));
  }
  L.push('');
  return L.join('\n');
}

export function buildReadme(startUrl, state, opts) {
  const total = state.files.length;
  const kb = (state.bytes / 1024).toFixed(1);
  const lines = [];
  lines.push('# DevClone (engine standalone) — Clone de alta fidelidade');
  lines.push('');
  lines.push(`- **Origem:** ${startUrl}`);
  lines.push(`- **Gerado em:** ${new Date().toISOString()}`);
  lines.push(`- **Escopo:** ${opts.scope === 'site' ? `site (profundidade ${opts.depth})` : 'pagina atual'}`);
  if (state.stack && state.stack.length) lines.push(`- **Stack detectada:** ${state.stack.join(', ')}`);
  lines.push(`- **Arquivos:** ${total}  •  **Tamanho (descompactado):** ${kb} KB`);
  lines.push(`- **Captura:** ${state.captureMode === 'network-original' ? 'rede real + HTML original' : 'modo de compatibilidade'}`);
  lines.push('');
  lines.push('## Estrutura');
  lines.push('```');
  lines.push('/index.html          pagina principal (HTML renderizado)');
  lines.push('/css/                folhas de estilo');
  lines.push('/js/                 scripts');
  lines.push('/assets/img/         imagens, icones, SVGs');
  lines.push('/assets/fonts/       fontes web');
  lines.push('/assets/media/       video/audio');
  lines.push('/assets/runtime/     WASM e runtimes binarios');
  lines.push('/assets/data/        JSON, manifests e dados de animacao');
  lines.push('/pages/              outras paginas (modo site inteiro)');
  lines.push('/AI_CONTEXT.md       briefing para reconstrucao por IA');
  lines.push('/RELATORIO-DE-CAPTURA.txt  o que veio e o que faltou (linguagem simples)');
  lines.push('/VALIDACAO-DE-ANIMACOES.txt  verificacao de scripts e recursos dinamicos');
  lines.push('```');
  lines.push('');
  lines.push('## Como usar');
  lines.push('1. No Windows, extraia o ZIP e de dois cliques em `ABRIR-SITE.cmd`.');
  lines.push('   No macOS, de dois cliques em `ABRIR-SITE.command`. O launcher inicia');
  lines.push('   o servidor local, escolhe uma porta disponivel e abre o navegador');
  lines.push('   automaticamente. Nao abra `index.html` diretamente: o protocolo');
  lines.push('   `file://` bloqueia fetch, WASM, workers, Rive, modulos JavaScript e');
  lines.push('   varias animacoes modernas.');
  lines.push('2. Para recriar numa IA, abra o `AI_CONTEXT.md`: o topo traz um **prompt pronto** para colar (com a stack e a paleta ja preenchidas). Anexe este .zip na sua ferramenta (Lovable, v0, Bolt, Cursor, Claude, ChatGPT etc.) e cole o prompt.');
  lines.push('3. Se algum arquivo faltar, abra o `RELATORIO-DE-CAPTURA.txt`: ele explica, em linguagem simples, o que nao veio e por que.');
  lines.push('');
  lines.push('## Como este clone foi gerado');
  lines.push('Este pacote foi produzido pelo engine standalone do DevClone (script Node +');
  lines.push('Playwright), que porta a mesma lógica da extensão Chrome — captura de rede');
  lines.push('via CDP, coleta de DOM, reescrita de HTML/CSS/JS e empacotamento — para rodar');
  lines.push('fora do navegador, sem precisar da extensão instalada.');
  lines.push('');
  lines.push('## Limitacoes conhecidas');
  lines.push('- Captura apenas o **front-end entregue ao navegador**. Backend, banco e APIs privadas nao sao acessiveis.');
  lines.push('- Backend, banco, login privado, WebSocket e APIs autenticadas continuam pertencendo ao servidor original.');
  lines.push('- Sem sessão/cookies de usuário: o engine vê a página como um visitante anônimo veria — conteúdo que só aparece logado não é capturado, a menos que credenciais sejam fornecidas ao Playwright separadamente.');
  lines.push('- DRM, streaming protegido e recursos que nem a pagina original conseguiu carregar nao podem ser incorporados.');
  lines.push('- Consulte `VALIDACAO-DE-ANIMACOES.txt` antes de considerar o clone completo.');
  if (state.usesEsModules) {
    lines.push('- Modulos JavaScript modernos precisam do `ABRIR-SITE.cmd`/`.command`; o duplo clique no `index.html` usa `file://` e bloqueia recursos.');
  }
  if (state.errors.length) {
    lines.push('');
    lines.push(`## Assets que falharam (${state.errors.length})`);
    for (const e of state.errors.slice(0, 200)) lines.push(`- ${e.url} — ${e.reason}`);
  } else {
    lines.push('');
    lines.push('## Assets que falharam');
    lines.push('Nenhum. Captura completa.');
  }
  lines.push('');
  return lines.join('\n');
}

function buildMasterPrompt(meta, startUrl) {
  const stack = (meta.stack && meta.stack.length) ? meta.stack.join(', ') : 'nao identificada';
  const palette = (meta.palette && meta.palette.length) ? meta.palette.slice(0, 6).join(', ') : 'ver AI_CONTEXT.md';
  const fonts = (meta.fonts && meta.fonts.length) ? meta.fonts.slice(0, 4).join(', ') : 'ver AI_CONTEXT.md';
  const bps = (meta.breakpoints && meta.breakpoints.length) ? meta.breakpoints.join(', ') : 'mobile / tablet / desktop';
  const P = [];
  P.push('# ▶ COMECE AQUI — cole este prompt na sua IA');
  P.push('');
  P.push('> Anexe o `.zip` (ou arraste a pasta descompactada) na sua ferramenta de IA favorita');
  P.push('> — Lovable, v0, Bolt, Cursor, Replit, Claude ou ChatGPT — e cole o texto abaixo.');
  P.push('');
  P.push('---');
  P.push('');
  P.push('Você é um engenheiro front-end sênior. Vou te entregar a **exportação estática de um site já existente** (arquivos HTML, CSS, JS e assets: imagens, fontes, ícones e mídia), gerada por um engine de clonagem. No pacote há um `AI_CONTEXT.md` com a stack, a paleta, a tipografia e a estrutura de seções da página.');
  P.push('');
  P.push(`- **Site de origem:** ${startUrl}`);
  P.push(`- **Stack detectada na origem:** ${stack}`);
  P.push(`- **Paleta principal:** ${palette}`);
  P.push(`- **Tipografia:** ${fonts}`);
  P.push(`- **Breakpoints:** ${bps}`);
  P.push('');
  P.push('**Objetivo:** reconstruir este site como um projeto limpo, editável e responsivo — fiel ao visual original, mas com código organizado que eu consiga evoluir.');
  P.push('');
  P.push('Faça nesta ordem:');
  P.push('1. Leia o `AI_CONTEXT.md` e o `index.html` para entender layout, seções, paleta e fontes.');
  P.push('2. Recrie a página **seção por seção** (header, hero, conteúdo, rodapé) mantendo posição, proporções, espaçamentos, cores e tipografia o mais próximo possível do original.');
  P.push('3. Use os **assets do pacote** (`/assets`, `/css`, `/js`). Referencie as imagens, ícones, fontes e vídeos que vieram junto — não invente novos.');
  P.push('4. Estruture em **componentes reutilizáveis** (usando a stack que eu indicar, ou a padrão do seu ambiente). Priorize HTML semântico e acessibilidade: foco visível, `alt` nas imagens, bom contraste.');
  P.push('5. Deixe **responsivo**, respeitando os breakpoints acima.');
  P.push('6. **Mantenha os textos e o conteúdo reais** que estão no clone.');
  P.push('7. Onde houver formulário, login, busca ou dados que dependam de backend, deixe a interface pronta e marque com `TODO` — não invente backend.');
  P.push('');
  P.push('Regras:');
  P.push('- Não adicione seções, páginas ou recursos que não existem no original.');
  P.push('- Na dúvida sobre algum detalhe, siga o que o `AI_CONTEXT.md` descreve.');
  P.push('- Entregue código limpo, com comentários onde ajudarem.');
  P.push('');
  P.push('Depois de reconstruir fielmente, aplique as mudanças que eu quero:');
  P.push('');
  P.push('```');
  P.push('[DESCREVA AQUI O QUE VOCÊ QUER MUDAR]');
  P.push('Exemplos:');
  P.push('- Trocar a paleta para as cores da minha marca (#______, #______).');
  P.push('- Reescrever o texto do hero para: "____________".');
  P.push('- Remover a seção de preços e adicionar uma seção de depoimentos.');
  P.push('- Adaptar o conteúdo para o meu produto: ____________.');
  P.push('```');
  P.push('');
  P.push('Comece confirmando em 2-3 linhas o que você entendeu do site e da stack; depois mãos à obra.');
  P.push('');
  P.push('---');
  P.push('');
  return P.join('\n');
}

export function buildAiContext(meta, startUrl) {
  const L = [];
  L.push(buildMasterPrompt(meta, startUrl));
  L.push('# Briefing para reconstrucao por IA');
  L.push('');
  L.push('Voce recebeu um clone **estatico** de uma pagina web. Use esta descricao como');
  L.push('REFERENCIA de layout e estilo para reconstruir a interface como componentes na');
  L.push('ferramenta/stack de sua preferencia. Nao trate os arquivos como import direto — o');
  L.push('objetivo e recriar fielmente o visual e a estrutura, com codigo limpo.');
  L.push('');
  L.push('## Identidade da pagina');
  L.push(`- **URL de origem:** ${startUrl}`);
  if (meta.title) L.push(`- **Titulo:** ${meta.title}`);
  if (meta.description) L.push(`- **Descricao:** ${meta.description}`);
  if (meta.lang) L.push(`- **Idioma:** ${meta.lang}`);
  if (meta.viewport) L.push(`- **Viewport:** ${meta.viewport}`);
  L.push('');
  if (meta.stack && meta.stack.length) {
    L.push('## Stack detectada');
    L.push('Tecnologias identificadas na pagina de origem (use como pista para a reconstrucao):');
    meta.stack.forEach((s) => L.push(`- ${s}`));
    L.push('');
  }
  if (meta.palette && meta.palette.length) {
    L.push('## Paleta de cores (mais frequentes)');
    meta.palette.forEach((c) => L.push(`- \`${c}\``));
    L.push('');
  }
  if (meta.fonts && meta.fonts.length) {
    L.push('## Tipografia');
    meta.fonts.forEach((f) => L.push(`- ${f}`));
    L.push('');
  }
  if (meta.breakpoints && meta.breakpoints.length) {
    L.push('## Breakpoints observados');
    L.push(meta.breakpoints.join(', '));
    L.push('');
  }
  if (meta.sections && meta.sections.length) {
    L.push('## Estrutura / secoes (na ordem do DOM)');
    meta.sections.forEach((s, i) => {
      const label = s.label ? ` — "${s.label}"` : '';
      const cls = s.cls ? ` [class: ${s.cls}]` : '';
      L.push(`${i + 1}. <${s.tag}>${label}${cls} · ${s.childBlocks} blocos filhos`);
    });
    L.push('');
  }
  if (meta.headings && meta.headings.length) {
    L.push('## Outline de titulos');
    meta.headings.forEach((h) => L.push(`- ${h.level.toUpperCase()}: ${h.text}`));
    L.push('');
  }
  if (meta.counts) {
    L.push('## Contagem de elementos');
    L.push(`- Imagens: ${meta.counts.images} · Links: ${meta.counts.links} · Scripts: ${meta.counts.scripts} · Formularios: ${meta.counts.forms}`);
    L.push('');
  }
  L.push('## Instrucao sugerida para a IA');
  L.push('> Reconstrua esta pagina como uma interface responsiva, seguindo a paleta, a');
  L.push('> tipografia e a ordem de secoes acima. Priorize semantica, acessibilidade e');
  L.push('> codigo limpo. Consulte os arquivos HTML/CSS do clone para detalhes visuais.');
  L.push('');
  return L.join('\n');
}

export function injectFileProtocolNotice(html) {
  const banner = `
<script>(function(){
  try {
    if (location.protocol !== 'file:') return;
    var b = document.createElement('div');
    b.textContent = 'Este clone precisa do servidor local incluido no pacote. Feche esta aba e de dois cliques em ABRIR-SITE.cmd.';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0a0d14;color:#eef1f7;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;padding:10px 44px 10px 14px;box-shadow:0 -4px 20px rgba(0,0,0,.35)';
    var x = document.createElement('button');
    x.textContent = '\\u2715';
    x.setAttribute('aria-label','Fechar aviso');
    x.style.cssText = 'position:absolute;right:8px;top:6px;background:transparent;border:0;color:#9aa4b6;font-size:15px;cursor:pointer;padding:4px 8px;line-height:1';
    x.onclick = function(){ b.remove(); };
    b.appendChild(x);
    (document.body || document.documentElement).appendChild(b);
  } catch (e) {}
})();</script>
`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, banner + '</body>');
  return html + banner;
}
