---
name: devclone
description: >-
  Use quando o pedido envolver o DevClone — clonar/capturar um site inteiro (Modo 1) ou extrair apenas o DNA visual/interativo de um site em um Design System + Visual Harness (Modo 2). Esta skill é autoexecutável: quando ativada, ela mesma roda o pipeline (equivalente à extensão Chrome) usando Node+Playwright no ambiente atual, sem depender da extensão instalada nem de arquivos externos pré-existentes — o código do engine está embutido aqui dentro e é escrito no disco sob demanda. Para Claude Code, Cursor, Codex, Antigravity e agentes de CLI, existe também a versão em arquivos reais via git clone do repositório GitHub do DevClone. Acione ao pedir para clonar/capturar/exportar/reconstruir um site, para extrair a identidade visual/design system de um site, ou para abrir/inspecionar/validar um .zip já gerado por ele.
---
# DevClone

## O que é esta skill

DevClone reconstrói, em alta fidelidade, o que um navegador realmente carrega
de um site — e entrega isso de duas formas possíveis, escolhidas pelo
usuário antes de começar:

- **Modo 1 — Clone completo:** HTML renderizado, CSS, JavaScript, imagens,
  fontes, vídeos, WebAssembly, animações (GSAP, Rive, Lottie, Three.js) e
  modelos 3D, empacotados em um `.zip` autônomo, pronto para rodar
  localmente via um servidor HTTP embutido.
- **Modo 2 — Visual Harness (DNA visual):** não clona o site. Extrai o
  sistema visual e interativo (paleta, tipografia, espaçamento, grid,
  radius, sombras, botões, inputs, cards, navegação, animações e interações
  reais) e entrega um `DESIGN-SYSTEM.md` com valores concretos + código real
  de animações extraído + um Visual Harness funcional (mini-app HTML/CSS/JS
  para ver o DNA visual funcionando no navegador). Não baixa HTML completo,
  páginas, texto ou imagens do site original.

100% local: sem telemetria, sem conta, sem licença, sem backend
obrigatório. Não reintroduza esses conceitos.

**Esta skill não é só documentação — ela É o motor.** Diferente de uma skill
que descreve como usar uma ferramenta externa, o código-fonte completo do
engine de clonagem está embutido logo abaixo, na seção "Engine embutido".
Quando esta skill for ativada (via `/devclone` ou por pedido direto do
usuário), o comportamento esperado é:

1. Você tem acesso a execução de shell/código neste ambiente (bash, Node).
2. **Pergunte ao usuário, antes de iniciar a extração, duas coisas** (pode
   ser uma única pergunta combinada se o pedido já não deixou isso claro):
   - **Modo:** "Modo 1 — clone completo (site pronto para rodar localmente)"
     ou "Modo 2 — Visual Harness (só o DNA visual/interativo, para usar como
     base de outro projeto)"?
   - **Escopo** (só relevante para o Modo 1): página atual ou site inteiro
     (crawl same-origin)?
   Se o usuário já especificou o modo/escopo no pedido original ("quero só
   a identidade visual", "clona o site todo"), não pergunte de novo — infira
   e prossiga, mas deixe explícito no início da resposta qual leitura você
   adotou.
3. Verifique se os arquivos do engine já existem no diretório de trabalho
   atual (ex.: `devclone-engine/clone.mjs`). Se **não** existirem — o que é o
   normal na primeira ativação de cada sessão, já que este ambiente não
   preserva arquivos entre sessões — escreva cada arquivo listado na seção
   "Engine embutido" no caminho relativo indicado, exatamente como está
   (não resuma, não invente variações).
4. Rode `npm install` dentro da pasta do engine e, se necessário,
   `npx playwright install chromium`.
5. Execute `node clone.mjs <url> --mode full` (Modo 1) ou
   `node clone.mjs <url> --mode harness` (Modo 2), com as demais opções
   pedidas pelo usuário.
6. **Em ambientes com terminal e navegador controláveis** (Claude Code,
   Cursor, Codex, Antigravity e afins) — ver seção "Fluxo automático do
   agente" abaixo — não pare depois de gerar o `.zip`: extraia, suba o
   servidor local, abra a prévia no navegador, valide visualmente, e só
   **depois** pergunte ao usuário se quer salvar/exportar o `.zip` em algum
   lugar específico.
7. Em ambientes sem esse controle, entregue o `.zip` resultante ao usuário
   pelo mecanismo de entrega de arquivo disponível.

Se o ambiente atual **não** tiver execução de shell/Node disponível, diga
isso claramente ao usuário — não finja ter clonado nada, não descreva um
resultado que não foi gerado. Essa é a única situação em que esta skill não
pode agir sozinha.

## Fluxo — Modo 1 (clone completo, idêntico ao da extensão Chrome)

1. Recebe a URL alvo (`http://` ou `https://`).
2. Faz a captura avançada de rede (via CDP/Playwright: duas passagens,
   desktop e mobile emulado 390×844, registrando exatamente os recursos que
   a página recebeu — inclusive os que dariam 403 em um download direto
   isolado).
3. Coleta o DOM renderizado e todos os assets referenciados (imagens,
   fontes, vídeo, ícones, CSS/JS, animações declarativas, lazy-load).
4. Resolve recursivamente `@import`/`url()` de CSS e `import`/`export
   ... from`/`import()` dinâmico de módulos ES.
5. Reescreve HTML/CSS/JS para caminhos locais, remove `<base>` e CSP,
   injeta um pequeno shim de runtime para `fetch`/`XHR`/`Worker` quando
   necessário.
6. Gera os relatórios (`README.md`, `RELATORIO-TECNICO-DE-CAPTURA.txt`,
   `VALIDACAO-E-ANALISE-DE-ANIMACOES.txt`, `AI_CONTEXT.md` opcional) e os launchers
   locais (`ABRIR-SITE.cmd`/`.command`, servidores Node/PowerShell).
7. Empacota tudo em `devclone_<host>_<data>.zip`.

Diferença real em relação à extensão: sem sessão/cookies do usuário por
padrão (visita como visitante anônimo, a menos que `--cookies` seja usado) e
sem "aba auxiliar" (o próprio processo controla a página do início ao fim).
Fora isso, mesmo pipeline, mesmos limites, mesma estrutura de saída.

## Fluxo — Modo 2 (Visual Harness / DNA visual)

**Não é uma variação do Modo 1 — é um pipeline diferente, propositalmente
mais enxuto.** A lógica:

```
Modo 1: SITE ORIGINAL → CLONE COMPLETO → PROJETO FUNCIONAL
Modo 2: SITE ORIGINAL → EXTRAÇÃO DO DNA → DESIGN SYSTEM + CÓDIGO DE ANIMAÇÕES + HARNESS
```

1. Recebe a URL alvo.
2. Captura de rede via CDP/Playwright, mas **só registra CSS e JS** — nenhuma
   imagem, vídeo, fonte, página adicional ou HTML completo é baixado.
3. Segue `@import` de CSS acessível para não perder `@keyframes` definidos
   em folhas importadas (sem baixar `url()` de imagem/fonte referenciada
   nelas).
4. Detecta a stack (frameworks, bibliotecas de animação).
5. **Extrai tokens de design com valores concretos**, medidos via
   `getComputedStyle` no navegador real — inclusive estados de **hover e
   focus reais** em botões (via `page.hover()`/`page.focus()` do
   Playwright, não inferidos): paleta, tipografia (família/tamanho/peso/
   line-height/letter-spacing/hierarquia), espaçamento, grid/containers,
   breakpoints, border-radius, sombras, bordas, variantes de botão e seus
   estados, inputs, cards, navegação.
6. **Extrai código real de animação/interação** (não descrição): todos os
   `@keyframes` do CSS capturado, regras com `transition`/`transform`/
   `animation` relevantes, e trechos reais de JavaScript ao redor de
   chamadas de bibliotecas conhecidas (GSAP/ScrollTrigger, Lottie, Rive,
   Lenis, AOS, ScrollMagic, Barba.js, Swiper, IntersectionObserver,
   requestAnimationFrame).
7. **Monta o Visual Harness**: um mini-projeto HTML/CSS/JS funcional que
   demonstra ao vivo — paleta, escala tipográfica, botões com estados reais,
   inputs, cards, navegação, e os `@keyframes`/transitions extraídos
   aplicados a elementos de demonstração com reveal-on-scroll via
   `IntersectionObserver`.
8. Empacota tudo em `devclone_harness_<host>_<data>.zip`:
   `DESIGN-SYSTEM.md`, `ANIMACOES.md`, `README.md`, `animations/`
   (`keyframes.css`, `transitions.css`, `interactions.js` — só os que
   existirem), `harness/` (`index.html`, `harness.css`, `harness.js`) e os
   launchers locais (o `index.html` do harness fica em `harness/`, e o
   servidor local embutido já aponta para lá).

**O que o Modo 2 nunca baixa/entrega:** HTML completo do site original,
todas as páginas, conteúdo textual completo, imagens do site, vídeos,
estrutura completa do site, ou qualquer asset que não seja estritamente
necessário para demonstrar o sistema visual/interativo no Harness. O
objetivo é extrair o SISTEMA, não clonar o CONTEÚDO.

O Harness é a entrega principal do Modo 2, não um extra opcional — a
entrega mínima obrigatória é sempre `DESIGN-SYSTEM.md` + código real de
animações/interações + Visual Harness funcional.

## Fluxo automático do agente (Claude Code, Cursor, Codex, Antigravity)

Em ambientes com terminal e navegador controláveis, o fluxo não para depois
de gerar o `.zip`. A sequência esperada é:

1. Fazer a extração (Modo 1 ou Modo 2).
2. Processar os arquivos e gerar a entrega correspondente ao modo escolhido.
3. Extrair/descompactar o `.zip` automaticamente (ex.: em uma pasta
   temporária de preview).
4. Instalar/preparar dependências, se necessário (o pacote em si — clone ou
   harness — não depende de `npm install`; é HTML/CSS/JS estático servido
   pelo `servidor-local.js` embutido, que já vem pronto).
5. Subir o servidor local (`node servidor-local.js` dentro da pasta
   extraída) e detectar a porta/URL escolhida (o script já imprime a URL e
   tenta abrir o navegador sozinho via `openBrowser()`; se o ambiente não
   permitir abertura automática de navegador do processo Node, o agente deve
   abrir a URL impressa usando a ferramenta de navegador disponível).
6. Validar visualmente o resultado (o agente confere que a página carregou,
   sem tela em branco/erro).
7. **Só depois** perguntar ao usuário se deseja salvar/exportar o `.zip` em
   algum local específico do computador — nunca antes da validação visual.

Essa ordem não deve ser invertida: primeiro mostrar que funciona, depois
perguntar sobre exportação/local de salvamento.

## Opções da CLI

| Opção | Default | Descrição |
|---|---|---|
| `--mode full\|harness` | `full` | Modo 1 (clone completo) ou Modo 2 (Visual Harness). |
| `--scope page\|site` | `page` | Página atual ou site inteiro (crawl same-origin). Só afeta o Modo 1. |
| `--depth 1-3` | `2` | Profundidade do crawl, só com `--scope site` (Modo 1). |
| `--ai-context` / `--no-ai-context` | ativado | Inclui `AI_CONTEXT.md` (só Modo 1). |
| `--mobile-pass` / `--no-mobile-pass` | ativado | Segunda passagem emulando mobile. |
| `--headless` / `--headed` | headless | Chromium visível ou não. |
| `--out <arquivo.zip>` | `devclone_<host>_<data>.zip` (Modo 1) / `devclone_harness_<host>_<data>.zip` (Modo 2) | Caminho de saída. |
| `--cookies <arquivo.json>` | — | Cookies do Playwright p/ sessão logada. |
| `--timeout <ms>` | `60000` | Timeout da navegação inicial (fallback). |

## Instalação via GitHub (Claude Code, Cursor, Codex, Antigravity, CLIs em geral)

Para ambientes que já suportam Agent Skills baseadas em arquivo (pasta
`skills/<nome>/` com `SKILL.md` + `scripts/`), a mesma skill existe como
repositório real no GitHub, com os arquivos abaixo já prontos como arquivos
de verdade (não como blocos de texto a recriar). Instale via:

```bash
git clone https://github.com/<usuario>/devclone-skill.git ~/.claude/skills/devclone
# ou por SSH:
git clone git@github.com:<usuario>/devclone-skill.git ~/.claude/skills/devclone
```

Nesses ambientes não é necessário reescrever os arquivos da seção "Engine
embutido" — eles já existem em `scripts/engine/` dentro do repositório.
Rode diretamente `cd scripts/engine && npm install && node clone.mjs <url> --mode full`
(ou `--mode harness`). Esta seção só serve para orientar a instalação; o
conteúdo canônico dos arquivos é o do repositório, não o texto embutido
abaixo (que existe para ambientes que só suportam skills de arquivo único).

## Segurança e limites

- Não execute comandos destrutivos (apagar, sobrescrever, forçar push) sem
  autorização explícita do usuário.
- Não altere a lógica do engine (os arquivos da seção "Engine embutido")
  ao recriá-los — copie exatamente como estão. Só modifique esse código se
  o usuário pedir explicitamente uma mudança de comportamento.
- O engine acessa a URL como visitante anônimo. Nunca peça, armazene ou
  logue credenciais do usuário para preencher `--cookies` sem que ele
  forneça esse arquivo explicitamente — trate qualquer cookie/sessão
  fornecido como dado sensível (não exponha em logs nem no `.zip`).
- Não substitua assets oficiais nem invente arquivos que não existem no
  clone/harness.
- Não existe servidor MCP do DevClone (`clone_site`, `inspect_clone`,
  `package_clone`, `serve_clone` não são ferramentas reais) — a execução é
  sempre via script/CLI, nunca via tool call nomeada.
- Sempre valide o resultado antes de reportar sucesso. Modo 1: confira a
  presença dos arquivos esperados e leia `RELATORIO-TECNICO-DE-CAPTURA.txt` e
  `VALIDACAO-E-ANALISE-DE-ANIMACOES.txt` — não assuma que "gerou o zip" significa
  "captura completa". Modo 2: confira que `DESIGN-SYSTEM.md` tem valores
  concretos (não vazio/genérico) e que `harness/index.html` existe e abre.

## Verificando um .zip gerado

**Modo 1 (clone completo):** estrutura esperada — `index.html`, `css/`,
`js/`, `assets/{img,fonts,media,runtime,data,files}/`, `pages/` (só no
escopo site), os launchers (`ABRIR-SITE.cmd`, `ABRIR-SITE.command`,
`servidor-local.js`, `servidor-local.ps1`, `COMO-ABRIR.txt`), `README.md`,
`RELATORIO-TECNICO-DE-CAPTURA.txt`, `VALIDACAO-E-ANALISE-DE-ANIMACOES.txt` e, se pedido,
`AI_CONTEXT.md`. Nem todo clone tem todas as pastas — só as categorias de
asset realmente usadas naquele site.

Checklist rápido (Modo 1): (1) os arquivos essenciais acima estão todos
presentes; (2) `index.html` tem `<!DOCTYPE>`, sem `<base>`/CSP residual; (3)
CSS/JS apontam para caminhos locais, não domínios externos, exceto o que já
está listado como "ainda remoto" nos relatórios; (4)
`RELATORIO-TECNICO-DE-CAPTURA.txt` diz "[ok] Nenhum arquivo ficou de fora" ou lista
o que faltou e por quê; (5) `VALIDACAO-E-ANALISE-DE-ANIMACOES.txt` mostra o modo de
captura (`network-original` é o mais fiel) e qualquer dependência de
animação ausente.

**Modo 2 (Visual Harness):** estrutura esperada — `DESIGN-SYSTEM.md`,
`ANIMACOES.md`, `README.md`, `animations/` (`keyframes.css`/
`transitions.css`/`interactions.js`, só os que tiverem sido encontrados),
`harness/` (`index.html`, `harness.css`, `harness.js`), e os mesmos
launchers do Modo 1 (mas apontando para `harness/`). Não deve haver
`assets/img`, `assets/media` nem `pages/` — se existirem, é sinal de que o
pipeline errado (Modo 1) rodou por engano.

Checklist rápido (Modo 2): (1) `DESIGN-SYSTEM.md` tem valores concretos
(cores em hex/rgb reais, tamanhos em px, não frases genéricas); (2)
`harness/index.html` existe, referencia `harness.css`/`harness.js` e, se
`animations/` existir, também os arquivos de lá; (3) abrir o harness no
navegador mostra paleta, tipografia, botões, inputs e cards preenchidos com
os valores extraídos, não vazios.

**Nunca abra `index.html` por duplo clique** (`file://` bloqueia módulos
ES, fetch, WASM) — sempre via `ABRIR-SITE.*` ou `node servidor-local.js`.

Ao reportar um problema, cite o caminho relativo do arquivo dentro do
pacote. Diferencie captura incompleta (asset não baixado, já documentado no
relatório) de reescrita incompleta (arquivo está no zip, mas o caminho não
foi remapeado — isso sim é bug a relatar). Sites que bloqueiam scraping
(403/CORS) geram itens em "sem permissão de acesso" mesmo em capturas
corretas — comportamento esperado, não falha do DevClone.

## Engine embutido — escreva estes arquivos exatamente como estão

Estrutura de pastas a criar (relativa a um diretório de trabalho, ex.
`devclone-engine/`):

```
devclone-engine/
├── package.json
├── clone.mjs
├── lib/
│   ├── capture-cdp.mjs
│   ├── page-bridge.mjs
│   ├── asset-pipeline.mjs
│   ├── zip.mjs
│   ├── preview-files.mjs
│   ├── reports.mjs
│   ├── stack.mjs
│   ├── design-system.mjs
│   ├── animation-extract.mjs
│   └── harness-build.mjs
└── vendor/
    └── content.js
```

Nota: se `npm install` + `npx playwright install chromium` não bastarem
porque o ambiente já tem um Chromium pré-instalado em outra versão (erro
`Executable doesn't exist at .../chromium_headless_shell-XXXX/...`), fixe a
versão exata de `playwright` no `package.json` (sem `^`) para casar com o
navegador já disponível no ambiente, em vez de deixar o npm puxar uma
versão mais nova que espera outro build do Chromium.


### package.json

```json
{
  "name": "devclone-engine",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "description": "Motor standalone do DevClone (Node + Playwright) — clona uma pagina (Modo 1) ou extrai o DNA visual/interativo em um Harness (Modo 2) sem depender da extensao Chrome.",
  "bin": { "devclone-engine": "./clone.mjs" },
  "dependencies": {
    "playwright": "^1.56.0"
  },
  "engines": { "node": ">=18.17" }
}
```

### clone.mjs

```javascript
#!/usr/bin/env node
/**
 * clone.mjs — engine standalone do DevClone (Node + Playwright).
 *
 * Modo 1 (--mode full, default): clone completo, comportamento original —
 * porta runClone() (background.js da extensão) sem nenhuma alteração de
 * lógica: mesma captura de rede via CDP/Playwright, mesma coleta/reescrita
 * de DOM, mesma resolução recursiva de CSS/JS, os mesmos relatórios e o
 * mesmo empacotador ZIP.
 *
 * Modo 2 (--mode harness): NÃO clona o site. Extrai o DNA visual/interativo
 * (design-system.mjs + animation-extract.mjs) e monta um Visual Harness
 * funcional (harness-build.mjs) — ver seção "Modo 2" no SKILL.md.
 *
 * Uso:
 *   node clone.mjs <url> [opções]
 *
 * Opções:
 *   --mode full|harness        (default: full)
 *   --scope page|site          (default: page)
 *   --depth 1-3                (default: 2, só com --scope site)
 *   --ai-context / --no-ai-context   (default: ativado, só --mode full)
 *   --mobile-pass / --no-mobile-pass (default: ativado)
 *   --headless / --headed      (default: headless)
 *   --out <arquivo.zip>        (default: devclone_<host>_<data>.zip no cwd)
 *   --cookies <arquivo.json>   (opcional: cookies do Playwright p/ sessão logada)
 *   --timeout <ms>             (default: 60000, navegação inicial)
 */
import { chromium } from 'playwright';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { captureNetworkSession, primePage } from './lib/capture-cdp.mjs';
import { callBridge } from './lib/page-bridge.mjs';
import { detectStack } from './lib/stack.mjs';
import {
  newState, sanitizeSegment, fetchAsset, registerFileText, replaceFileText,
  registerFile, registerNetworkRecords, registerNetworkRecordsForHarness,
  processCss, processCssForHarness, processJsModule,
  rewriteKnownJsAssets, guessKind, crawlSameOrigin, pageFileName,
  rewriteRawHtml, animationDependencyGaps, absUrl,
} from './lib/asset-pipeline.mjs';
import { buildReadme, buildFailureReport, buildAnimationValidation, buildAiContext, injectFileProtocolNotice } from './lib/reports.mjs';
import { getPreviewPackageFiles } from './lib/preview-files.mjs';
import { buildZip } from './lib/zip.mjs';
import { extractDesignTokens, buildDesignSystemDoc } from './lib/design-system.mjs';
import { extractAnimationCode, buildAnimationFiles, buildAnimationDoc } from './lib/animation-extract.mjs';
import { buildHarnessProject, buildHarnessReadme } from './lib/harness-build.mjs';

function log(...args) { process.stderr.write(args.join(' ') + '\n'); }

function makeProgress() {
  let last = 0;
  return (p) => {
    const now = Date.now();
    if (now - last < 400 && p.phase !== 'zipping') return;
    last = now;
    const bits = [p.phase, p.message].filter(Boolean);
    if (typeof p.count === 'number') bits.push(`(${p.count} arquivos)`);
    log('•', bits.join(' '));
  };
}

function friendlyCloneError(err) {
  const raw = String((err && err.message) || err || '');
  const r = raw.toLowerCase();
  if (r.includes('cdp_bridge') || r.includes('cdp_collect_failed') || r.includes('content_bridge_unavailable')) {
    return 'O motor interno de captura não conseguiu ler a página. Tente novamente; se persistir, confira se a URL está acessível publicamente.';
  }
  if (r.includes('capture_empty_document') || r.includes('capture_invalid_final_url')) {
    return 'Não foi possível carregar a página de origem (documento vazio ou URL final inválida).';
  }
  if (r.includes('timeout')) {
    return 'A página demorou demais para responder. Tente novamente ou aumente --timeout.';
  }
  return raw || 'Não foi possível concluir o clone.';
}

// =========================================================================
// MODO 1 — Clone completo (comportamento original, sem alterações)
// =========================================================================
async function runClone(url, opts) {
  const state = newState();
  const progress = makeProgress();
  const browser = await chromium.launch({ headless: opts.headless });
  const context = await browser.newContext(
    opts.cookies ? {} : undefined
  );
  if (opts.cookies) {
    const cookies = JSON.parse(await readFile(opts.cookies, 'utf8'));
    await context.addCookies(cookies);
  }
  const page = await context.newPage();

  try {
    let originalHtml = '';
    let capturedPageUrl = '';
    let networkRecords = [];

    progress({ phase: 'recording', message: 'Preparando captura avançada das animações…' });
    try {
      const captured = await captureNetworkSession(page, url, {
        progress,
        primePage: opts.mobilePass === false ? undefined : primePage,
      });
      originalHtml = captured.documentHtml || '';
      capturedPageUrl = captured.documentUrl || '';
      networkRecords = captured.records || [];
      state.captureMode = originalHtml ? 'network-original' : 'network-with-dom-fallback';
      state.captureWarnings = captured.warnings || [];
      for (const failure of captured.failed || []) {
        if (!state.errors.some((item) => item.url === failure.url)) state.errors.push(failure);
      }
    } catch (e) {
      state.captureMode = 'compatibility';
      state.captureWarnings.push({ url: '', reason: `captura avançada indisponível: ${String((e && e.message) || e)}` });
      // fallback: navegação simples, sem CDP
      await page.goto(url, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    }

    progress({ phase: 'scanning', message: 'Analisando estrutura e componentes…' });
    const collectResp = await callBridge(page, {
      action: 'collect',
      options: { prime: state.captureMode === 'compatibility' },
    });
    if (!collectResp || !collectResp.ok) {
      throw new Error(`collect_failed: ${collectResp && collectResp.error ? collectResp.error : 'sem resposta'}`);
    }
    const { assets, meta } = collectResp.data;
    const pageUrl = capturedPageUrl || collectResp.data.pageUrl || url;

    meta.stack = await detectStack(page).catch(() => []);
    state.stack = meta.stack;

    let done = 0;
    const cssToProcess = [];
    const jsToProcess = [];
    registerNetworkRecords(networkRecords, state, cssToProcess, jsToProcess);

    const totalAssets = assets.length;
    for (const { url: assetUrl, kind } of assets) {
      if (state.fetched.has(assetUrl) || state.pathMap[assetUrl]) { done++; continue; }
      state.fetched.add(assetUrl);
      progress({
        phase: 'downloading',
        message: `Completando arquivos… ${done + 1} de ${totalAssets}`,
        count: state.files.length,
        bytes: state.bytes,
      });
      try {
        const { buf, contentType } = await fetchAsset(assetUrl);
        const realKind = (kind === 'asset') ? guessKind(contentType, assetUrl) : kind;
        if (realKind === 'css' || contentType === 'text/css') {
          const p = registerFileText(assetUrl, 'css', buf, state);
          cssToProcess.push({ url: assetUrl, path: p, text: Buffer.from(buf).toString('utf8') });
        } else if (realKind === 'js' || /javascript|ecmascript/.test(contentType) || /\.m?js$/i.test(assetUrl)) {
          const p = registerFileText(assetUrl, 'js', buf, state);
          jsToProcess.push({ url: assetUrl, path: p, text: Buffer.from(buf).toString('utf8') });
        } else {
          registerFile(assetUrl, realKind, buf, contentType, state);
        }
      } catch (e) {
        state.errors.push({ url: assetUrl, reason: String((e && e.message) || e) });
      }
      done++;
    }

    progress({ phase: 'processing', message: 'Organizando estilos, fontes e mídia…', count: state.files.length, bytes: state.bytes });
    for (const css of cssToProcess) {
      const rewritten = await processCss(css.text, css.url, css.path, state, () => {
        progress({ phase: 'processing', message: 'Resolvendo dependências visuais…', count: state.files.length, bytes: state.bytes });
      });
      replaceFileText(css.path, rewritten, state);
    }

    if (jsToProcess.length) {
      progress({ phase: 'processing', message: 'Reconectando animações e recursos dinâmicos…', count: state.files.length, bytes: state.bytes });
      for (const js of jsToProcess) {
        let rewritten = await processJsModule(js.text, js.url, js.path, state, () => {
          progress({ phase: 'processing', message: 'Resolvendo módulos e workers…', count: state.files.length, bytes: state.bytes });
        });
        rewritten = rewriteKnownJsAssets(rewritten, js.url, js.path, state);
        if (rewritten !== js.text) replaceFileText(js.path, rewritten, state);
      }
    }

    progress({ phase: 'processing', message: 'Montando HTML limpo…', count: state.files.length, bytes: state.bytes });
    const rewriteResp = await callBridge(page, {
      action: 'rewrite',
      pathMap: state.pathMap,
      options: { sourceHtml: originalHtml, pageUrl },
    });
    let mainHtml = (rewriteResp && rewriteResp.ok) ? rewriteResp.html : '<!-- falha na reescrita -->';
    state.validation = rewriteResp && rewriteResp.ok ? {
      remainingRemote: rewriteResp.remainingRemote || [],
      stats: rewriteResp.stats || {},
    } : { remainingRemote: [], stats: {} };
    state.usesEsModules = /<script[^>]+type=["']module["']/i.test(mainHtml) || state.files.some((f) => /\.mjs$/i.test(f.name));
    state.hasDynamicRuntime = jsToProcess.length > 0 || (state.stack || []).some((s) => ['GSAP', 'Three.js', 'Rive', 'Lottie', 'Lenis', 'Framer'].includes(s));
    if (state.usesEsModules || state.hasDynamicRuntime) mainHtml = injectFileProtocolNotice(mainHtml);
    state.files.push({ name: 'index.html', data: new TextEncoder().encode(mainHtml) });

    if (opts.scope === 'site') {
      progress({ phase: 'crawling', message: 'Explorando o site…', count: state.files.length, bytes: state.bytes });
      const pages = await crawlSameOrigin(pageUrl, Math.max(1, Math.min(3, opts.depth || 1)), state,
        () => progress({ phase: 'crawling', message: 'Explorando páginas…', count: state.files.length, bytes: state.bytes }));

      for (const pg of pages) {
        const fileName = pageFileName(pg.url, pageUrl, state);
        if (fileName === null) continue;
        const assetRe = /(?:href|src)\s*=\s*(['"])(.*?)\1/gi;
        let am;
        const pageAssets = [];
        while ((am = assetRe.exec(pg.html))) {
          const a = absUrl(am[2], pg.url);
          if (!a) continue;
          if (/\.(css|js|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3)(\?|$)/i.test(a)) pageAssets.push(a);
        }
        for (const a of pageAssets) {
          if (state.pathMap[a] || state.fetched.has(a)) continue;
          state.fetched.add(a);
          try {
            const { buf, contentType } = await fetchAsset(a);
            if (contentType === 'text/css') {
              const p = registerFileText(a, 'css', buf, state);
              const rw = await processCss(Buffer.from(buf).toString('utf8'), a, p, state);
              replaceFileText(p, rw, state);
            } else {
              registerFile(a, guessKind(contentType, a), buf, contentType, state);
            }
          } catch (e) {
            state.errors.push({ url: a, reason: String((e && e.message) || e) });
          }
        }
        const rewritten = rewriteRawHtml(pg.html, pg.url, state, fileName);
        state.files.push({ name: fileName, data: new TextEncoder().encode(rewritten) });
      }
    }

    state.validation.dependencyGaps = animationDependencyGaps(state);
    state.files.push(...getPreviewPackageFiles());
    state.files.push({ name: 'README.md', data: new TextEncoder().encode(buildReadme(pageUrl, state, opts)) });
    state.files.push({ name: 'RELATORIO-TECNICO-DE-CAPTURA.txt', data: new TextEncoder().encode(buildFailureReport(pageUrl, state)) });
    state.files.push({ name: 'VALIDACAO-E-ANALISE-DE-ANIMACOES.txt', data: new TextEncoder().encode(buildAnimationValidation(pageUrl, state)) });
    if (opts.aiContext) {
      state.files.push({ name: 'AI_CONTEXT.md', data: new TextEncoder().encode(buildAiContext(meta, pageUrl)) });
    }

    progress({ phase: 'zipping', message: 'Finalizando o pacote…', count: state.files.length, bytes: state.bytes });
    const zipBytes = await buildZip(state.files);

    const host = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { return 'site'; } })();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = opts.out || `devclone_${sanitizeSegment(host)}_${stamp}.zip`;
    await writeFile(filename, zipBytes);

    return {
      mode: 'full',
      outputPath: path.resolve(filename),
      fileCount: state.files.length,
      bytes: state.bytes,
      zipBytes: zipBytes.length,
      errors: state.errors,
      captureMode: state.captureMode,
      remainingRemote: state.validation ? state.validation.remainingRemote.length : 0,
      stack: state.stack,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

// =========================================================================
// MODO 2 — Visual Harness (DNA visual/interativo, NÃO clona o site)
// =========================================================================
async function runHarnessClone(url, opts) {
  const state = newState();
  const progress = makeProgress();
  const browser = await chromium.launch({ headless: opts.headless });
  const context = await browser.newContext(
    opts.cookies ? {} : undefined
  );
  if (opts.cookies) {
    const cookies = JSON.parse(await readFile(opts.cookies, 'utf8'));
    await context.addCookies(cookies);
  }
  const page = await context.newPage();

  try {
    let networkRecords = [];

    progress({ phase: 'recording', message: 'Capturando CSS/JS para extrair o DNA visual…' });
    try {
      const captured = await captureNetworkSession(page, url, {
        progress,
        primePage: opts.mobilePass === false ? undefined : primePage,
      });
      networkRecords = captured.records || [];
      state.captureMode = 'network-original';
      state.captureWarnings = captured.warnings || [];
    } catch (e) {
      state.captureMode = 'compatibility';
      state.captureWarnings.push({ url: '', reason: `captura avançada indisponível: ${String((e && e.message) || e)}` });
      await page.goto(url, { waitUntil: 'load', timeout: opts.timeout }).catch(() => {});
    }

    // Modo 2 só registra CSS/JS — nenhuma imagem, vídeo, fonte ou página é
    // baixada (ver ff0178d7: "não baixar HTML completo, todas as páginas,
    // conteúdo textual completo, imagens, vídeos, estrutura completa").
    const cssToProcess = [];
    const jsToProcess = [];
    registerNetworkRecordsForHarness(networkRecords, state, cssToProcess, jsToProcess);

    progress({ phase: 'scanning', message: 'Detectando stack e resolvendo CSS importado…' });
    const meta = { stack: await detectStack(page).catch(() => []) };
    state.stack = meta.stack;

    // Segue @import em CSS same-origin/acessível para não perder @keyframes
    // definidos em folhas importadas — sem baixar url() de imagem/fonte.
    for (const css of cssToProcess) {
      await processCssForHarness(css.text, css.url, state, (discoveredUrl, discoveredText) => {
        cssToProcess.push({ url: discoveredUrl, path: `css/_imported_${cssToProcess.length}.css`, text: discoveredText });
      });
    }

    progress({ phase: 'extracting', message: 'Extraindo tokens de design (cores, tipografia, espaçamento)…' });
    const tokens = await extractDesignTokens(page);

    progress({ phase: 'extracting', message: 'Extraindo animações e interações reais…' });
    // Usa o texto já capturado (não os arquivos no zip — no Modo 2 o CSS/JS
    // bruto normalmente não entra no pacote, só o que for extraído dele).
    const virtualFiles = [
      ...cssToProcess.map((c) => ({ name: c.path.endsWith('.css') ? c.path : `${c.path}.css`, data: new TextEncoder().encode(c.text) })),
      ...jsToProcess.map((j) => ({ name: j.path.endsWith('.js') ? j.path : `${j.path}.js`, data: new TextEncoder().encode(j.text) })),
    ];
    const extraction = extractAnimationCode(virtualFiles);

    progress({ phase: 'building', message: 'Montando o Visual Harness…' });
    const harnessFiles = buildHarnessProject(tokens, extraction, meta, url);
    const animationFiles = buildAnimationFiles(extraction);

    const finalFiles = [];
    finalFiles.push({ name: 'DESIGN-SYSTEM.md', data: new TextEncoder().encode(buildDesignSystemDoc(tokens, meta, url)) });
    finalFiles.push({ name: 'ANIMACOES.md', data: new TextEncoder().encode(buildAnimationDoc(extraction, url)) });
    finalFiles.push({ name: 'README.md', data: new TextEncoder().encode(buildHarnessReadme(meta, url, extraction)) });
    finalFiles.push(...animationFiles);
    finalFiles.push(...harnessFiles);
    finalFiles.push(...getPreviewPackageFiles().map((f) => {
      // Os launchers/servidor local do Modo 1 servem qualquer pasta com
      // index.html — no Modo 2 o index.html fica em harness/, então os
      // launchers precisam apontar para lá.
      if (f.name === 'servidor-local.js') {
        const text = new TextDecoder().decode(f.data).replace(
          "const ROOT = path.resolve(__dirname);",
          "const ROOT = path.resolve(__dirname, 'harness');"
        );
        return { name: f.name, data: new TextEncoder().encode(text) };
      }
      return f;
    }));

    let totalBytes = 0;
    for (const f of finalFiles) totalBytes += f.data.length;

    progress({ phase: 'zipping', message: 'Finalizando o pacote do harness…' });
    const zipBytes = await buildZip(finalFiles);

    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'site'; } })();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = opts.out || `devclone_harness_${sanitizeSegment(host)}_${stamp}.zip`;
    await writeFile(filename, zipBytes);

    return {
      mode: 'harness',
      outputPath: path.resolve(filename),
      fileCount: finalFiles.length,
      bytes: totalBytes,
      zipBytes: zipBytes.length,
      errors: state.errors,
      captureMode: state.captureMode,
      stack: state.stack,
      animationsFound: {
        keyframes: extraction.keyframesFound.length,
        transitionRules: extraction.transitionRulesFound.length,
        jsSnippets: extraction.jsSnippetsFound.length,
        libraries: extraction.libsDetected,
      },
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      mode: { type: 'string', default: 'full' },
      scope: { type: 'string', default: 'page' },
      depth: { type: 'string', default: '2' },
      'ai-context': { type: 'boolean', default: true },
      'no-ai-context': { type: 'boolean', default: false },
      'mobile-pass': { type: 'boolean', default: true },
      'no-mobile-pass': { type: 'boolean', default: false },
      headless: { type: 'boolean', default: true },
      headed: { type: 'boolean', default: false },
      out: { type: 'string' },
      cookies: { type: 'string' },
      timeout: { type: 'string', default: '60000' },
    },
  });
  const url = positionals[0];
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('Uso: node clone.mjs <url http(s)> [--mode full|harness] [--scope page|site] [--depth 1-3] [--no-ai-context] [--headed] [--out arquivo.zip] [--cookies arquivo.json]');
  }
  const mode = values.mode === 'harness' ? 'harness' : 'full';
  return {
    url,
    mode,
    scope: values.scope === 'site' ? 'site' : 'page',
    depth: Math.max(1, Math.min(3, Number(values.depth) || 2)),
    aiContext: values['no-ai-context'] ? false : values['ai-context'] !== false,
    mobilePass: values['no-mobile-pass'] ? false : values['mobile-pass'] !== false,
    headless: values.headed ? false : values.headless !== false,
    out: values.out,
    cookies: values.cookies,
    timeout: Number(values.timeout) || 60000,
  };
}

async function main() {
  let opts;
  try {
    opts = parseCli(process.argv.slice(2));
  } catch (e) {
    log(String((e && e.message) || e));
    process.exit(2);
  }

  const modeLabel = opts.mode === 'harness' ? 'Visual Harness (Modo 2 — DNA visual, sem clonar o site)' : `clone completo (Modo 1${opts.scope === 'site' ? `, escopo site, profundidade ${opts.depth}` : ''})`;
  log(`DevClone engine — ${opts.url} — ${modeLabel}`);
  try {
    const result = opts.mode === 'harness' ? await runHarnessClone(opts.url, opts) : await runClone(opts.url, opts);
    log('');
    if (result.mode === 'harness') {
      log(`OK — harness com ${result.fileCount} arquivos, ${(result.bytes / 1024).toFixed(0)} KB.`);
      log(`Animações extraídas: ${result.animationsFound.keyframes} keyframes, ${result.animationsFound.transitionRules} regras de transition/transform, ${result.animationsFound.jsSnippets} trechos de JS.`);
      if (result.animationsFound.libraries.length) log(`Bibliotecas detectadas: ${result.animationsFound.libraries.join(', ')}`);
    } else {
      log(`OK — ${result.fileCount} arquivos, ${(result.bytes / 1024).toFixed(0)} KB, modo: ${result.captureMode}`);
      if (result.errors.length) log(`${result.errors.length} asset(s) falharam — ver RELATORIO-TECNICO-DE-CAPTURA.txt dentro do zip.`);
      if (result.remainingRemote) log(`${result.remainingRemote} referência(s) ainda remotas — ver VALIDACAO-E-ANALISE-DE-ANIMACOES.txt.`);
    }
    if (result.stack && result.stack.length) log(`Stack detectada: ${result.stack.join(', ')}`);
    log(`Arquivo: ${result.outputPath}`);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    log('');
    log('ERRO: ' + friendlyCloneError(e));
    process.exitCode = 1;
  }
}

main();
```

### lib/capture-cdp.mjs

```javascript
/**
 * capture-cdp.mjs — captura de rede de alta fidelidade, portada de capture.js
 * (extensão Chrome MV3, permissão "debugger") para Playwright + CDPSession.
 *
 * Mesma lógica e os mesmos limites do capture.js original: allowlist de
 * tipos/mime de front-end, exclusão de endpoints sensíveis (api/auth/
 * checkout/sessions/users), limites de tamanho por recurso e por sessão,
 * duas passagens (desktop + mobile emulado), espera por rede ociosa.
 */

const CAPTURE_TIMEOUT_MS = 45000;
const NETWORK_IDLE_MS = 2000;
const MAX_RESOURCE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 350 * 1024 * 1024;

const FRONTEND_ASSET_RE = /\.(?:m?js|css|wasm|riv|lottie|glb|gltf|bin|ktx2?|basis|hdr|exr|dds|tga|obj|fbx|mtl|ply|stl|dae|meshopt|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)$/i;
const SENSITIVE_ENDPOINT_RE = /\/(?:api|graphql|rpc|auth|account|checkout|payments?|sessions?|users?)(?:\/|$)/i;

function normalizedUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url || '';
  }
}

function shouldCapture(meta) {
  if (!meta || !/^https?:/i.test(meta.url || '')) return false;
  if (meta.status < 200 || meta.status >= 400) return false;
  if (meta.type === 'Document') return true;
  if (['Stylesheet', 'Script', 'Image', 'Media', 'Font', 'Manifest'].includes(meta.type)) return true;
  const mime = meta.mimeType || '';
  const url = (meta.url || '').split('?')[0].toLowerCase();
  if (/^(text\/css|text\/javascript|application\/(javascript|wasm)|image\/|font\/|video\/|audio\/)/.test(mime)) return true;
  if (FRONTEND_ASSET_RE.test(url)) return true;
  if (/\.json$/.test(url) && meta.type !== 'XHR' && !SENSITIVE_ENDPOINT_RE.test(url)) return true;
  return false;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {import('playwright').Page} page
 * @param {string} targetUrl
 * @param {{progress?: Function, primePage?: (page:any)=>Promise<void>}} opts
 */
export async function captureNetworkSession(page, targetUrl, { progress, primePage } = {}) {
  const session = await page.context().newCDPSession(page);
  const requestMeta = new Map();
  const requestAliases = new Map();
  const records = new Map();
  const capturingUrls = new Set();
  const pendingBodies = new Set();
  const warnings = [];
  const failed = [];
  let totalBytes = 0;
  let lastActivity = Date.now();
  let loadResolve = null;
  let nextLoadResolve = null;

  const storeBody = async (requestId, meta) => {
    if (!shouldCapture(meta) || records.has(meta.url) || capturingUrls.has(meta.url)) return;
    capturingUrls.add(meta.url);
    try {
      const body = await session.send('Network.getResponseBody', { requestId });
      const bytes = body.base64Encoded
        ? new Uint8Array(Buffer.from(body.body, 'base64'))
        : new Uint8Array(Buffer.from(body.body, 'utf8'));
      if (bytes.length > MAX_RESOURCE_BYTES) {
        warnings.push({ url: meta.url, reason: `recurso acima de ${MAX_RESOURCE_BYTES / 1024 / 1024} MB` });
        return;
      }
      if (totalBytes + bytes.length > MAX_TOTAL_BYTES) {
        warnings.push({ url: meta.url, reason: 'limite de memoria da captura dinamica atingido' });
        return;
      }
      totalBytes += bytes.length;
      records.set(meta.url, { ...meta, bytes });
      progress?.({
        phase: 'recording',
        message: `Registrando animações e recursos… ${records.size}`,
        count: records.size,
        bytes: totalBytes,
      });
    } catch (e) {
      warnings.push({ url: meta.url, reason: String((e && e.message) || e) });
    } finally {
      capturingUrls.delete(meta.url);
    }
  };

  session.on('Network.responseReceived', (params) => {
    lastActivity = Date.now();
    const r = params.response || {};
    const url = normalizedUrl(r.url);
    requestMeta.set(params.requestId, {
      requestId: params.requestId,
      url,
      mimeType: (r.mimeType || '').split(';')[0].toLowerCase(),
      status: r.status || 0,
      type: params.type || 'Other',
      aliases: requestAliases.get(params.requestId) || [],
    });
  });

  session.on('Network.requestWillBeSent', (params) => {
    lastActivity = Date.now();
    const url = normalizedUrl(params.request && params.request.url);
    if (!url) return;
    const aliases = requestAliases.get(params.requestId) || [];
    if (!aliases.includes(url)) aliases.push(url);
    requestAliases.set(params.requestId, aliases);
    const previous = requestMeta.get(params.requestId) || {};
    requestMeta.set(params.requestId, {
      ...previous,
      requestId: params.requestId,
      url,
      type: params.type || previous.type || 'Other',
      status: previous.status || 0,
    });
  });

  session.on('Network.loadingFinished', (params) => {
    lastActivity = Date.now();
    const meta = requestMeta.get(params.requestId);
    if (!meta) return;
    const job = storeBody(params.requestId, meta).finally(() => pendingBodies.delete(job));
    pendingBodies.add(job);
  });

  session.on('Network.loadingFailed', (params) => {
    lastActivity = Date.now();
    const meta = requestMeta.get(params.requestId);
    const aliases = requestAliases.get(params.requestId) || [];
    const url = normalizedUrl((meta && meta.url) || aliases[aliases.length - 1] || '');
    const plainUrl = url.split('?')[0];
    const relevantJson = /\.json$/i.test(plainUrl) && (!meta || meta.type !== 'XHR') && !SENSITIVE_ENDPOINT_RE.test(plainUrl);
    if (url && (FRONTEND_ASSET_RE.test(plainUrl) || relevantJson)) {
      failed.push({
        url,
        reason: params.errorText || (params.blockedReason ? `bloqueado: ${params.blockedReason}` : 'falha de rede'),
      });
    }
  });

  session.on('Page.loadEventFired', () => {
    lastActivity = Date.now();
    if (loadResolve) { const r = loadResolve; loadResolve = null; r(); }
    if (nextLoadResolve) { const r = nextLoadResolve; nextLoadResolve = null; r(); }
  });

  try {
    await session.send('Network.enable', {
      maxTotalBufferSize: MAX_TOTAL_BYTES,
      maxResourceBufferSize: MAX_RESOURCE_BYTES,
      maxPostDataSize: 0,
    });
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await session.send('Page.enable');

    progress?.({ phase: 'recording', message: 'Preparando a página para capturar as animações…' });

    // Navegação inicial (garante que page.url() já reflita http(s) real)
    // seguida de um reload via CDP com cache ignorado — é essa passagem,
    // com os listeners já anexados, que é efetivamente capturada.
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: CAPTURE_TIMEOUT_MS }).catch(() => {});

    const loaded = new Promise((resolve) => { loadResolve = resolve; });
    const loadTimer = setTimeout(() => {
      if (loadResolve) { const r = loadResolve; loadResolve = null; r(); }
    }, CAPTURE_TIMEOUT_MS);
    await session.send('Page.reload', { ignoreCache: true });
    await loaded;
    clearTimeout(loadTimer);

    await delay(650);
    if (primePage) {
      try { await primePage(page); } catch (e) { warnings.push({ url: '', reason: `rolagem assistida: ${String((e && e.message) || e)}` }); }
    }

    const waitForNetworkIdle = async (maxMs = 20000, label = 'Finalizando a captura desktop') => {
      const idleDeadline = Date.now() + maxMs;
      let nextHeartbeat = 0;
      while (Date.now() < idleDeadline && Date.now() - lastActivity < NETWORK_IDLE_MS) {
        if (progress && Date.now() >= nextHeartbeat) {
          progress({ phase: 'recording', message: `${label}… ${records.size} recursos`, count: records.size, bytes: totalBytes });
          nextHeartbeat = Date.now() + 1200;
        }
        await delay(180);
      }
      await Promise.allSettled(Array.from(pendingBodies));
    };
    await waitForNetworkIdle();

    // Segunda passagem em viewport móvel — mesmo racional do original:
    // breakpoints diferentes podem carregar imagens/modelos/Rive distintos.
    try {
      progress?.({ phase: 'recording', message: 'Capturando também os recursos da versão móvel…', count: records.size, bytes: totalBytes });
      await session.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      lastActivity = Date.now();
      const nextLoaded = new Promise((resolve) => { nextLoadResolve = resolve; });
      await session.send('Page.reload', { ignoreCache: true });
      await Promise.race([nextLoaded, delay(CAPTURE_TIMEOUT_MS)]);
      await delay(650);
      if (primePage) await primePage(page);
      await waitForNetworkIdle(20000, 'Finalizando a captura móvel');
      await session.send('Emulation.clearDeviceMetricsOverride');
    } catch (e) {
      warnings.push({ url: '', reason: `passagem móvel: ${String((e && e.message) || e)}` });
      try { await session.send('Emulation.clearDeviceMetricsOverride'); } catch {}
    }
    await Promise.allSettled(Array.from(pendingBodies));
  } finally {
    await session.detach().catch(() => {});
  }

  const pageUrl = normalizedUrl(page.url());
  if (!/^https?:/i.test(pageUrl)) {
    throw new Error(`capture_invalid_final_url:${pageUrl || 'empty'}`);
  }
  let documentRecord = records.get(pageUrl);
  if (!documentRecord) {
    documentRecord = Array.from(records.values()).find((r) => r.type === 'Document') || null;
  }
  let documentHtml = '';
  if (documentRecord && documentRecord.bytes) {
    try { documentHtml = Buffer.from(documentRecord.bytes).toString('utf8'); } catch {}
  }

  const compactHtml = documentHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  if (records.size <= 1 && (!compactHtml || /^<!doctype html>\s*<html[^>]*>\s*<head>\s*<\/head>\s*<body>\s*<\/body>\s*<\/html>$/i.test(compactHtml))) {
    throw new Error('capture_empty_document');
  }

  return {
    records: Array.from(records.values()),
    documentHtml,
    documentUrl: documentRecord ? documentRecord.url : pageUrl,
    warnings,
    failed,
    totalBytes,
  };
}

/** Equivalente a primePageViaAttachedDebugger (cdp-bridge.js), via page.evaluate. */
export async function primePage(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const vh = window.innerHeight || 800;
      const fullH = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
      if (fullH > vh * 1.15) {
        const step = Math.max(vh * 0.85, 400);
        const max = Math.min(fullH, vh * 50);
        for (let y = 0; y < max; y += step) {
          window.scrollTo(0, y);
          await sleep(110);
        }
        window.scrollTo(0, 0);
        await sleep(220);
      }
      document.querySelectorAll('video').forEach((video) => {
        try { video.preload = 'auto'; if (video.load) video.load(); } catch {}
      });
      await sleep(150);
    } catch {}
  });
}
```

### lib/page-bridge.mjs

```javascript
/**
 * page-bridge.mjs — injeta uma cópia vendorizada e não modificada de
 * content.js na página do Playwright e fala com ela exatamente como
 * cdp-bridge.js faz na extensão (Runtime.evaluate/callFunctionOn ->
 * aqui, page.addScriptTag + page.evaluate).
 *
 * content.js já se expõe como window.__devclonePageBridge, sem depender
 * de chrome.runtime para as ações 'collect' e 'rewrite' — por isso pode
 * ser reutilizado sem nenhuma alteração fora do contexto da extensão.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_JS_PATH = path.join(__dirname, '..', 'vendor', 'content.js');

let contentJsSourceCache = null;
async function loadContentJsSource() {
  if (!contentJsSourceCache) contentJsSourceCache = await readFile(CONTENT_JS_PATH, 'utf8');
  return contentJsSourceCache;
}

export async function ensureBridge(page) {
  const already = await page.evaluate(() => typeof window.__devclonePageBridge === 'function').catch(() => false);
  if (already) return;
  const source = await loadContentJsSource();
  await page.addScriptTag({ content: source });
  const ok = await page.evaluate(() => typeof window.__devclonePageBridge === 'function');
  if (!ok) throw new Error('content_bridge_unavailable');
}

export async function callBridge(page, message) {
  await ensureBridge(page);
  return page.evaluate((msg) => window.__devclonePageBridge(msg), message);
}
```

### lib/asset-pipeline.mjs

```javascript
/**
 * asset-pipeline.mjs — portado de background.js (extensão DevClone).
 * Categorização de arquivos, resolução recursiva de CSS/JS, crawl same-origin
 * e reescrita de HTML cru. Lógica pura — a única mudança real é trocar o
 * fetch com credentials:'omit' do navegador pelo fetch global do Node.
 *
 * Usado tanto pelo Modo 1 (clone completo) quanto pelo Modo 2 (harness): no
 * Modo 2, o clone.mjs simplesmente não chama registerFile/fetchAsset para
 * imagem/vídeo/página — as funções aqui não sabem nem precisam saber em que
 * modo estão rodando.
 */

export function absUrl(url, base) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try { return new URL(url.trim(), base).href; } catch { return null; }
}

export function sanitizeSegment(name) {
  return (name || '')
    .replace(/[?#].*$/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 80);
}

const EXT_BY_MIME = {
  'text/css': 'css',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'application/x-javascript': 'js',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
  'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf',
  'font/otf': 'otf', 'application/font-woff': 'woff',
  'application/vnd.ms-fontobject': 'eot',
  'application/wasm': 'wasm', 'application/octet-stream': 'bin',
  'application/manifest+json': 'json',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv',
  'video/quicktime': 'mov', 'video/x-m4v': 'm4v',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/aac': 'aac',
  'application/json': 'json', 'text/plain': 'txt', 'text/html': 'html',
};

export const CATEGORY = {
  css: 'css',
  js: 'js',
  img: 'assets/img',
  icon: 'assets/img',
  font: 'assets/fonts',
  media: 'assets/media',
  anim: 'assets/media',
  data: 'assets/data',
  runtime: 'assets/runtime',
  asset: 'assets/files',
  page: '',
};

export function extFromUrl(u) {
  try {
    const p = new URL(u).pathname;
    const m = p.match(/\.([a-zA-Z0-9]{1,5})$/);
    return m ? m[1].toLowerCase() : '';
  } catch { return ''; }
}

export function relativePath(fromPath, toPath) {
  const fromDir = fromPath.split('/').slice(0, -1);
  const toParts = toPath.split('/');
  const up = fromDir.map(() => '..');
  return [...up, ...toParts].join('/') || toPath;
}

export function newState() {
  return {
    pathMap: {},
    files: [],
    seenNames: new Set(),
    fetched: new Set(),
    errors: [],
    bytes: 0,
    captureMode: 'compatibility',
    dynamicCaptured: 0,
    captureWarnings: [],
    validation: null,
    stack: [],
  };
}

export function uniqueName(dir, base, ext, state) {
  let name = base && base !== '' ? base : 'file';
  if (ext && !name.toLowerCase().endsWith('.' + ext)) name = `${name}.${ext}`;
  let full = dir ? `${dir}/${name}` : name;
  if (!state.seenNames.has(full)) { state.seenNames.add(full); return full; }
  let i = 1;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const tail = dot > 0 ? name.slice(dot) : '';
  for (;;) {
    const cand = dir ? `${dir}/${stem}-${i}${tail}` : `${stem}-${i}${tail}`;
    if (!state.seenNames.has(cand)) { state.seenNames.add(cand); return cand; }
    i++;
  }
}

export async function fetchAsset(url) {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return { buf, contentType: ct };
}

export function registerFile(url, kind, buf, contentType, state) {
  let cat = CATEGORY[kind] || 'assets/img';
  if (kind === 'asset' || kind === 'icon') {
    if (contentType.startsWith('font/') || /font/.test(contentType)) cat = CATEGORY.font;
    else if (contentType.startsWith('video/') || contentType.startsWith('audio/')) cat = CATEGORY.media;
    else if (contentType.startsWith('image/')) cat = CATEGORY.img;
  }
  if (kind === 'font') cat = CATEGORY.font;

  const urlExt = extFromUrl(url);
  const ext = urlExt || EXT_BY_MIME[contentType] || '';
  let base = sanitizeSegment(decodeURIComponent((url.split('/').pop() || '').split('?')[0])) || kind;
  if (base.indexOf('.') === -1 && ext) base = `${base}.${ext}`;

  const path = uniqueName(cat, base.replace(/\.[^.]*$/, ''), ext, state);
  state.pathMap[url] = path;
  state.files.push({ name: path, data: buf });
  state.bytes += buf.length;
  return path;
}

const DEFAULT_EXT_BY_KIND = { css: 'css', js: 'js' };
export function registerFileText(url, kind, buf, state) {
  const cat = CATEGORY[kind] || 'assets/img';
  const ext = extFromUrl(url) || DEFAULT_EXT_BY_KIND[kind] || 'txt';
  let base = sanitizeSegment(decodeURIComponent((url.split('/').pop() || '').split('?')[0])) || kind;
  const path = uniqueName(cat, base.replace(/\.[^.]*$/, ''), ext, state);
  state.pathMap[url] = path;
  state.files.push({ name: path, data: buf });
  state.bytes += buf.length;
  return path;
}

export function replaceFileText(path, newText, state) {
  const data = new TextEncoder().encode(newText);
  const f = state.files.find((x) => x.name === path);
  if (f) { state.bytes += data.length - f.data.length; f.data = data; }
}

export function guessKind(contentType, url) {
  if (contentType.startsWith('font/') || /font/.test(contentType) || /\.(woff2?|ttf|otf|eot)$/i.test(url)) return 'font';
  if (/\.lottie$/i.test(url)) return 'anim';
  if (/\.riv(?:\?|$)/i.test(url)) return 'anim';
  if (/\.wasm(?:\?|$)/i.test(url) || contentType === 'application/wasm') return 'runtime';
  if (/\.(json|map)(?:\?|$)/i.test(url) || /json/.test(contentType)) return 'data';
  if (contentType.startsWith('video/') || contentType.startsWith('audio/') || /\.(mp4|m4v|mov|webm|ogv|mp3|ogg|wav|aac)$/i.test(url)) return 'media';
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(url)) return 'img';
  if (contentType === 'text/css') return 'css';
  if (/javascript/.test(contentType)) return 'js';
  return 'asset';
}

export function kindFromNetwork(record) {
  const type = String(record.type || '').toLowerCase();
  if (type === 'stylesheet') return 'css';
  if (type === 'script') return 'js';
  if (type === 'image') return 'img';
  if (type === 'media') return 'media';
  if (type === 'font') return 'font';
  if (type === 'manifest') return 'data';
  return guessKind(record.mimeType || '', record.url || '');
}

export function registerNetworkRecords(records, state, cssToProcess, jsToProcess) {
  for (const record of records || []) {
    if (!record || !record.url || !record.bytes || record.type === 'Document') continue;
    if (state.pathMap[record.url]) continue;
    const kind = kindFromNetwork(record);
    state.fetched.add(record.url);
    let path;
    if (kind === 'css') {
      path = registerFileText(record.url, 'css', record.bytes, state);
      cssToProcess.push({ url: record.url, path, text: Buffer.from(record.bytes).toString('utf8') });
    } else if (kind === 'js') {
      path = registerFileText(record.url, 'js', record.bytes, state);
      jsToProcess.push({ url: record.url, path, text: Buffer.from(record.bytes).toString('utf8') });
    } else {
      path = registerFile(record.url, kind, record.bytes, record.mimeType || '', state);
    }
    for (const alias of record.aliases || []) {
      if (alias && !state.pathMap[alias]) state.pathMap[alias] = path;
      if (alias) state.fetched.add(alias);
    }
  }
  state.dynamicCaptured = state.files.length;
}

/**
 * Variante usada pelo Modo 2 (harness): registra apenas CSS e JS vindos da
 * rede (necessários para extrair tokens/animações). Imagens, vídeo, fontes
 * e demais binários NÃO são baixados — o harness referencia esses tipos
 * apenas quando um extrator (ex. animation-extract.mjs) marcar como
 * estritamente necessário para reproduzir uma animação/componente.
 */
export function registerNetworkRecordsForHarness(records, state, cssToProcess, jsToProcess) {
  for (const record of records || []) {
    if (!record || !record.url || !record.bytes || record.type === 'Document') continue;
    if (state.pathMap[record.url]) continue;
    const kind = kindFromNetwork(record);
    if (kind !== 'css' && kind !== 'js') continue;
    state.fetched.add(record.url);
    let path;
    if (kind === 'css') {
      path = registerFileText(record.url, 'css', record.bytes, state);
      cssToProcess.push({ url: record.url, path, text: Buffer.from(record.bytes).toString('utf8') });
    } else {
      path = registerFileText(record.url, 'js', record.bytes, state);
      jsToProcess.push({ url: record.url, path, text: Buffer.from(record.bytes).toString('utf8') });
    }
    for (const alias of record.aliases || []) {
      if (alias && !state.pathMap[alias]) state.pathMap[alias] = path;
      if (alias) state.fetched.add(alias);
    }
  }
  state.dynamicCaptured = state.files.length;
}

// ---- CSS recursivo ----------------------------------------------------
export async function processCss(cssText, cssUrl, cssLocalPath, state, onProgress) {
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  const importRe = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)([^;]*);/gi;
  const found = [];

  let m;
  while ((m = importRe.exec(cssText))) {
    const target = m[2] || m[4];
    if (target) found.push({ raw: target, kind: 'css' });
  }
  while ((m = urlRe.exec(cssText))) {
    const raw = m[2].trim();
    if (raw.startsWith('data:') || raw.startsWith('blob:')) continue;
    found.push({ raw, kind: 'asset' });
  }

  for (const dep of found) {
    const absoluteUrl = absUrl(dep.raw, cssUrl);
    if (!absoluteUrl) continue;
    if (!state.pathMap[absoluteUrl] && !state.fetched.has(absoluteUrl)) {
      state.fetched.add(absoluteUrl);
      try {
        const { buf, contentType } = await fetchAsset(absoluteUrl);
        onProgress?.(absoluteUrl);
        if (dep.kind === 'css' || contentType === 'text/css') {
          const nestedPath = registerFileText(absoluteUrl, 'css', buf, state);
          const nestedText = Buffer.from(buf).toString('utf8');
          const rewritten = await processCss(nestedText, absoluteUrl, nestedPath, state, onProgress);
          replaceFileText(nestedPath, rewritten, state);
        } else {
          registerFile(absoluteUrl, guessKind(contentType, absoluteUrl), buf, contentType, state);
        }
      } catch (e) {
        state.errors.push({ url: absoluteUrl, reason: String((e && e.message) || e) });
      }
    }
  }

  const rewrite = (text) => text.replace(urlRe, (full, q, raw) => {
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return full;
    const absoluteUrl = absUrl(raw, cssUrl);
    if (absoluteUrl && state.pathMap[absoluteUrl]) {
      return `url("${relativePath(cssLocalPath, state.pathMap[absoluteUrl])}")`;
    }
    return full;
  }).replace(importRe, (full, q1, u1, q2, u2, media) => {
    const target = u1 || u2;
    const absoluteUrl = absUrl(target, cssUrl);
    if (absoluteUrl && state.pathMap[absoluteUrl]) {
      return `@import url("${relativePath(cssLocalPath, state.pathMap[absoluteUrl])}")${media || ''};`;
    }
    return full;
  });

  return rewrite(cssText);
}

/**
 * Variante para o Modo 2: percorre CSS recursivamente só para achar mais
 * CSS (@import) e mantém o texto original intacto (sem reescrever url()
 * para caminhos locais, já que imagens/fontes normalmente não entram no
 * harness). Retorna o texto sem alterações — serve para animation-extract
 * localizar @keyframes/transition em folhas importadas.
 */
export async function processCssForHarness(cssText, cssUrl, state, onDiscoverCss) {
  const importRe = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)([^;]*);/gi;
  let m;
  const targets = [];
  while ((m = importRe.exec(cssText))) {
    const target = m[2] || m[4];
    if (target) targets.push(target);
  }
  for (const raw of targets) {
    const absoluteUrl = absUrl(raw, cssUrl);
    if (!absoluteUrl || state.fetched.has(absoluteUrl)) continue;
    state.fetched.add(absoluteUrl);
    try {
      const { buf, contentType } = await fetchAsset(absoluteUrl);
      if (contentType === 'text/css' || /\.css(?:\?|$)/i.test(absoluteUrl)) {
        const text = Buffer.from(buf).toString('utf8');
        onDiscoverCss?.(absoluteUrl, text);
        await processCssForHarness(text, absoluteUrl, state, onDiscoverCss);
      }
    } catch (e) {
      state.errors.push({ url: absoluteUrl, reason: String((e && e.message) || e) });
    }
  }
  return cssText;
}

// ---- JS (ES Modules) recursivo ----------------------------------------
const IMPORT_FROM_RE = /\bimport\s*(?:[\w$*{},\s]+\s*from\s*)?["']([^"']+)["']/g;
const EXPORT_FROM_RE = /\bexport\s*(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function findModuleSpecifiers(text) {
  const specs = new Set();
  let m;
  IMPORT_FROM_RE.lastIndex = 0; while ((m = IMPORT_FROM_RE.exec(text))) specs.add(m[1]);
  EXPORT_FROM_RE.lastIndex = 0; while ((m = EXPORT_FROM_RE.exec(text))) specs.add(m[1]);
  DYNAMIC_IMPORT_RE.lastIndex = 0; while ((m = DYNAMIC_IMPORT_RE.exec(text))) specs.add(m[1]);
  return Array.from(specs).filter((s) => s && !s.startsWith('data:'));
}

export async function processJsModule(jsText, jsUrl, jsLocalPath, state, onProgress) {
  const specs = findModuleSpecifiers(jsText);
  if (!specs.length) return jsText;

  const resolved = new Map();
  for (const spec of specs) {
    const a = absUrl(spec, jsUrl);
    if (a) resolved.set(spec, a);
  }

  for (const [, absoluteUrl] of resolved) {
    if (state.pathMap[absoluteUrl] || state.fetched.has(absoluteUrl)) continue;
    state.fetched.add(absoluteUrl);
    try {
      const { buf, contentType } = await fetchAsset(absoluteUrl);
      onProgress?.(absoluteUrl);
      const looksLikeJs = /javascript|ecmascript/.test(contentType) || /\.m?js$/i.test(absoluteUrl);
      if (looksLikeJs) {
        const text = Buffer.from(buf).toString('utf8');
        const nestedPath = registerFileText(absoluteUrl, 'js', buf, state);
        const rewritten = await processJsModule(text, absoluteUrl, nestedPath, state, onProgress);
        if (rewritten !== text) replaceFileText(nestedPath, rewritten, state);
      } else {
        registerFile(absoluteUrl, guessKind(contentType, absoluteUrl), buf, contentType, state);
      }
    } catch (e) {
      state.errors.push({ url: absoluteUrl, reason: String((e && e.message) || e) });
    }
  }

  let out = jsText;
  for (const [spec, absoluteUrl] of resolved) {
    if (!state.pathMap[absoluteUrl]) continue;
    let rel = relativePath(jsLocalPath, state.pathMap[absoluteUrl]);
    if (!rel.startsWith('.') && !rel.startsWith('/')) rel = './' + rel;
    const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('([\"\'])' + escaped + '\\1', 'g'), (_full, q) => q + rel + q);
  }
  return out;
}

export function rewriteKnownJsAssets(jsText, jsUrl, jsLocalPath, state) {
  let out = jsText;

  const mappings = Object.entries(state.pathMap)
    .filter(([url, local]) => /^https?:/i.test(url) && local)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [url, local] of mappings) {
    if (!out.includes(url)) continue;
    out = out.split(url).join(relativePath(jsLocalPath, local));
  }

  const assetLiteralRe = /(["'`])((?:(?:\.\.?)?\/|\/)[^"'`\\\r\n]{1,2000}\.(?:m?js|css|wasm|riv|lottie|glb|gltf|bin|ktx2?|basis|hdr|exr|dds|tga|obj|fbx|mtl|ply|stl|dae|meshopt|json|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|m4v|ogv|mp3|ogg|wav|aac)(?:\?[^"'`\\\r\n]*)?)\1/gi;
  out = out.replace(assetLiteralRe, (full, q, value) => {
    if (/^(data:|blob:|javascript:|#)/i.test(value)) return full;
    const absolute = absUrl(value, jsUrl);
    if (!absolute || !state.pathMap[absolute]) return full;
    return `${q}${relativePath(jsLocalPath, state.pathMap[absolute])}${q}`;
  });

  const dirs = new Map();
  for (const [url, local] of mappings) {
    try {
      const u = new URL(url);
      const remoteDir = u.href.slice(0, u.href.lastIndexOf('/') + 1);
      const localDir = local.includes('/') ? local.slice(0, local.lastIndexOf('/') + 1) : '';
      if (!dirs.has(remoteDir)) dirs.set(remoteDir, new Set());
      dirs.get(remoteDir).add(localDir);
    } catch {}
  }
  const dirEntries = Array.from(dirs.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [remoteDir, localDirs] of dirEntries) {
    if (localDirs.size !== 1 || !out.includes(remoteDir)) continue;
    const localDir = Array.from(localDirs)[0];
    const probe = `${localDir}__file__`;
    const rel = relativePath(jsLocalPath, probe).replace(/__file__$/, '');
    out = out.split(remoteDir).join(rel);
  }
  return out;
}

// ---- crawl same-origin --------------------------------------------------
export async function crawlSameOrigin(startUrl, depth, state, onProgress) {
  const origin = new URL(startUrl).origin;
  const visited = new Set([startUrl]);
  const pages = [];
  let frontier = [startUrl];
  const MAX_PAGES = 60;

  for (let d = 0; d <= depth && frontier.length; d++) {
    const next = [];
    for (const pageUrl of frontier) {
      if (pages.length >= MAX_PAGES) break;
      try {
        const resp = await fetch(pageUrl, { redirect: 'follow' });
        if (!resp.ok) { state.errors.push({ url: pageUrl, reason: `HTTP ${resp.status}` }); continue; }
        const html = await resp.text();
        pages.push({ url: pageUrl, html });
        onProgress?.(pageUrl);
        if (d < depth) {
          const linkRe = /<a\b[^>]*\bhref\s*=\s*(['"])(.*?)\1/gi;
          let lm;
          while ((lm = linkRe.exec(html))) {
            const target = absUrl(lm[2], pageUrl);
            if (!target) continue;
            const clean = target.split('#')[0];
            if (new URL(clean).origin !== origin) continue;
            if (/\.(pdf|zip|jpg|png|gif|mp4|css|js)$/i.test(clean)) continue;
            if (!visited.has(clean) && visited.size < MAX_PAGES) { visited.add(clean); next.push(clean); }
          }
        }
      } catch (e) {
        state.errors.push({ url: pageUrl, reason: String((e && e.message) || e) });
      }
    }
    frontier = next;
  }
  return pages;
}

export function pageFileName(pageUrl, startUrl, state) {
  const u = new URL(pageUrl);
  if (pageUrl.split('#')[0].replace(/\/$/, '') === startUrl.split('#')[0].replace(/\/$/, '')) return null;
  let p = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!p) p = 'index';
  p = p.replace(/\//g, '_');
  p = sanitizeSegment(p) || 'page';
  return uniqueName('pages', p, 'html', state);
}

export function rewriteRawHtml(html, pageUrl, state, htmlLocalPath) {
  const attrRe = /(\b(?:href|src|poster|data)\s*=\s*)(['"])(.*?)\2/gi;
  return html.replace(attrRe, (full, pre, q, val) => {
    if (!val || val.startsWith('data:') || val.startsWith('#') || val.startsWith('javascript:')) return full;
    const a = absUrl(val, pageUrl);
    if (a && state.pathMap[a]) {
      const rel = htmlLocalPath ? relativePath(htmlLocalPath, state.pathMap[a]) : state.pathMap[a];
      return `${pre}${q}${rel}${q}`;
    }
    return full;
  });
}

export function animationDependencyGaps(state) {
  const counts = {};
  for (const file of state.files || []) {
    const match = String(file.name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    if (match) counts[match[1]] = (counts[match[1]] || 0) + 1;
  }
  const scriptText = (state.files || [])
    .filter((file) => /\.m?js$/i.test(file.name || ''))
    .map((file) => { try { return Buffer.from(file.data).toString('utf8').toLowerCase(); } catch { return ''; } })
    .join('\n');
  const gaps = [];
  const checks = [
    ['riv', ['riv']], ['wasm', ['wasm']], ['glb', ['glb']], ['gltf', ['gltf']],
    ['ktx2', ['ktx2']], ['hdr', ['hdr']], ['exr', ['exr']], ['basis', ['basis']],
  ];
  for (const [reference, localExtensions] of checks) {
    if (!scriptText.includes(`.${reference}`)) continue;
    if (localExtensions.some((ext) => counts[ext])) continue;
    gaps.push(`o JavaScript referencia .${reference}, mas nenhum arquivo desse tipo entrou no ZIP`);
  }
  if (/[/_-](?:msdf|bmfont|font|scene|model)[^\s"'`]*\.json\b/i.test(scriptText) && !counts.json) {
    gaps.push('o JavaScript referencia JSON de fonte/cena/modelo, mas nenhum JSON correspondente entrou no ZIP');
  }
  return gaps;
}
```

### lib/zip.mjs

```javascript
/**
 * zip.mjs — portado quase verbatim de zip.js (extensão DevClone).
 * Mesma lógica: CRC32 manual + CompressionStream('deflate-raw') nativo
 * (disponível globalmente no Node 18+), sem dependências externas.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(u8);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  } catch {
    return null;
  }
}

function pushU16(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff); }
function pushU32(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }

const DOS_TIME = 0;
const DOS_DATE = (44 << 9) | (1 << 5) | 1;

const STORED_EXT = /\.(png|jpe?g|gif|webp|avif|ico|mp4|m4v|mov|webm|ogv|ogg|mp3|aac|wav|woff2?|zip|gz|br)$/i;

export async function buildZip(files) {
  const enc = new TextEncoder();
  const localParts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const raw = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(raw);

    let method = 0;
    let payload = raw;
    if (raw.length > 64 && !STORED_EXT.test(file.name)) {
      const def = await deflateRaw(raw);
      if (def && def.length < raw.length) { method = 8; payload = def; }
    }

    const lh = [];
    pushU32(lh, 0x04034b50);
    pushU16(lh, 20);
    pushU16(lh, 0x0800);
    pushU16(lh, method);
    pushU16(lh, DOS_TIME);
    pushU16(lh, DOS_DATE);
    pushU32(lh, crc);
    pushU32(lh, payload.length);
    pushU32(lh, raw.length);
    pushU16(lh, nameBytes.length);
    pushU16(lh, 0);
    const localHeader = new Uint8Array(lh);

    localParts.push(localHeader, nameBytes, payload);
    const localHeaderOffset = offset;
    offset += localHeader.length + nameBytes.length + payload.length;

    const ch = [];
    pushU32(ch, 0x02014b50);
    pushU16(ch, 20);
    pushU16(ch, 20);
    pushU16(ch, 0x0800);
    pushU16(ch, method);
    pushU16(ch, DOS_TIME);
    pushU16(ch, DOS_DATE);
    pushU32(ch, crc);
    pushU32(ch, payload.length);
    pushU32(ch, raw.length);
    pushU16(ch, nameBytes.length);
    pushU16(ch, 0);
    pushU16(ch, 0);
    pushU16(ch, 0);
    pushU16(ch, 0);
    pushU32(ch, 0);
    pushU32(ch, localHeaderOffset);
    central.push(new Uint8Array(ch), nameBytes);
  }

  let centralSize = 0;
  for (const p of central) centralSize += p.length;
  const centralOffset = offset;

  const eocd = [];
  pushU32(eocd, 0x06054b50);
  pushU16(eocd, 0);
  pushU16(eocd, 0);
  pushU16(eocd, files.length);
  pushU16(eocd, files.length);
  pushU32(eocd, centralSize);
  pushU32(eocd, centralOffset);
  pushU16(eocd, 0);
  const eocdBytes = new Uint8Array(eocd);

  let totalLen = offset + centralSize + eocdBytes.length;
  const out = new Uint8Array(totalLen);
  let o = 0;
  for (const p of localParts) { out.set(p, o); o += p.length; }
  for (const p of central) { out.set(p, o); o += p.length; }
  out.set(eocdBytes, o);
  return out;
}
```

### lib/preview-files.mjs

```javascript
/**
 * preview-files.mjs — portado verbatim de preview-files.js (extensão
 * DevClone). Gera os launchers e servidores locais empacotados em todo
 * clone (Windows/macOS/Node/PowerShell), para que o usuário final rode o
 * clone sem depender de file:// (que bloqueia módulos ES, fetch, WASM).
 * Usado tanto no pacote do Modo 1 (clone completo) quanto no pacote do
 * Modo 2 (harness) — o harness também é uma pasta estática que precisa de
 * servidor local para funcionar corretamente.
 */

const WINDOWS_LAUNCHER = `@echo off
setlocal
title DevClone - Previa local
cd /d "%~dp0"

if not exist "index.html" (
  echo.
  echo Nao foi possivel encontrar o index.html nesta pasta.
  echo Extraia todo o conteudo do ZIP antes de abrir a previa.
  echo.
  pause
  exit /b 1
)

where node.exe >nul 2>nul
if %errorlevel%==0 (
  node.exe "%~dp0servidor-local.js"
  exit /b %errorlevel%
)

where powershell.exe >nul 2>nul
if %errorlevel%==0 (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-local.ps1"
  if %errorlevel%==0 exit /b 0
)

echo.
echo Nao foi possivel iniciar a previa automaticamente.
echo Consulte COMO-ABRIR.txt para usar um servidor alternativo.
echo.
pause
exit /b 1
`;

const MACOS_LAUNCHER = `#!/bin/bash
# DevClone - Launcher de Previa Local (macOS)
cd "$(dirname "$0")"

clear
echo "========================================"
echo "           DEVCLONE - PREVIA            "
echo "========================================"
echo ""

if [ ! -f "index.html" ]; then
  echo "Erro: index.html nao encontrado nesta pasta."
  echo "Por favor, extraia todo o conteudo do arquivo ZIP antes de abrir."
  echo ""
  read -p "Pressione Enter para sair..."
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  node servidor-local.js
  exit $?
fi

if command -v python3 >/dev/null 2>&1; then
  PORT=3000
  while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
    PORT=$((PORT + 1))
  done
  URL="http://127.0.0.1:$PORT/"
  echo "Iniciando servidor local com Python 3 na porta $PORT..."
  echo "Endereco: $URL"
  echo ""
  echo "Mantenha esta janela do Terminal aberta enquanto utilizar o clone."
  echo "Para encerrar o servidor, pressione Ctrl+C ou feche esta janela."
  echo ""
  sleep 1 && open "$URL" &
  python3 -m http.server $PORT
  exit $?
fi

if command -v python >/dev/null 2>&1; then
  PORT=3000
  while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
    PORT=$((PORT + 1))
  done
  URL="http://127.0.0.1:$PORT/"
  echo "Iniciando servidor local com Python na porta $PORT..."
  echo "Endereco: $URL"
  echo ""
  echo "Mantenha esta janela do Terminal aberta enquanto utilizar o clone."
  echo "Para encerrar o servidor, pressione Ctrl+C ou feche esta janela."
  echo ""
  sleep 1 && open "$URL" &
  python -m SimpleHTTPServer $PORT
  exit $?
fi

echo "Nao foi possivel iniciar o servidor automaticamente."
echo "Instale o Node.js ou consulte o arquivo COMO-ABRIR.txt."
echo ""
read -p "Pressione Enter para sair..."
exit 1
`;

const NODE_SERVER = `'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname);
const PREFERRED_PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.riv': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ktx2': 'image/ktx2',
  '.basis': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac'
};

function commonHeaders(filePath) {
  return {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Accept-Ranges': 'bytes'
  };
}

function sendText(res, status, text) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function safeFilePath(req) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_) {
    return { error: 400 };
  }

  if (pathname.indexOf(String.fromCharCode(0)) !== -1) return { error: 400 };
  let relative = pathname.split(String.fromCharCode(92)).join('/');
  while (relative.charAt(0) === '/') relative = relative.slice(1);
  if (!relative) relative = 'index.html';

  let candidate = path.resolve(ROOT, relative);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return { error: 403 };

  try {
    if (fs.statSync(candidate).isDirectory()) candidate = path.join(candidate, 'index.html');
  } catch (_) {}

  if (!fs.existsSync(candidate)) {
    const acceptsHtml = String(req.headers.accept || '').includes('text/html');
    if (acceptsHtml || !path.extname(relative)) {
      const fallback = path.join(ROOT, 'index.html');
      if (fs.existsSync(fallback)) candidate = fallback;
    }
  }

  if (!fs.existsSync(candidate)) return { error: 404 };
  return { filePath: candidate };
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(value || '').trim());
  if (!match) return null;
  let start;
  let end;

  if (match[1] === '' && match[2] !== '') {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  return { start: start, end: Math.min(end, size - 1) };
}

const server = http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Metodo nao permitido');
    return;
  }

  const resolved = safeFilePath(req);
  if (resolved.error) {
    sendText(res, resolved.error, resolved.error === 404 ? 'Arquivo nao encontrado' : 'Requisicao invalida');
    return;
  }

  fs.stat(resolved.filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      sendText(res, 404, 'Arquivo nao encontrado');
      return;
    }

    const headers = commonHeaders(resolved.filePath);
    const requestedRange = req.headers.range;
    const range = requestedRange ? parseRange(requestedRange, stat.size) : null;

    if (requestedRange && !range) {
      res.writeHead(416, Object.assign(headers, { 'Content-Range': 'bytes */' + stat.size }));
      res.end();
      return;
    }

    if (range) {
      headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + stat.size;
      headers['Content-Length'] = range.end - range.start + 1;
      res.writeHead(206, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(resolved.filePath, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(resolved.filePath).pipe(res);
  });
});

function choosePort() {
  return new Promise(function (resolve) {
    const preferred = net.createServer();
    preferred.unref();
    preferred.once('error', function () {
      const automatic = net.createServer();
      automatic.unref();
      automatic.listen(0, '127.0.0.1', function () {
        const port = automatic.address().port;
        automatic.close(function () { resolve(port); });
      });
    });
    preferred.listen(PREFERRED_PORT, '127.0.0.1', function () {
      preferred.close(function () { resolve(PREFERRED_PORT); });
    });
  });
}

function openBrowser(url) {
  if (process.env.DEVCLONE_NO_OPEN === '1') return;
  try {
    if (process.platform === 'win32') {
      childProcess.spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else if (process.platform === 'darwin') {
      childProcess.spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      childProcess.spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (_) {}
}

choosePort().then(function (port) {
  server.listen(port, '127.0.0.1', function () {
    const url = 'http://127.0.0.1:' + port + '/';
    console.clear();
    console.log('DevClone');
    console.log('');
    console.log('Previa iniciada com sucesso:');
    console.log(url);
    console.log('');
    console.log('Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.');
    openBrowser(url);
  });
}).catch(function (err) {
  console.error('Nao foi possivel iniciar a previa:', err && err.message ? err.message : err);
  process.exitCode = 1;
});

process.on('SIGINT', function () {
  server.close(function () { process.exit(0); });
});
`;

const POWERSHELL_SERVER = `$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)

$source = @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

public static class DevClonePreviewServer
{
    private static string root;

    public static void Run(TcpListener listener, string rootPath)
    {
        root = Path.GetFullPath(rootPath);
        while (true)
        {
            TcpClient client = listener.AcceptTcpClient();
            ThreadPool.QueueUserWorkItem(delegate { Handle(client); });
        }
    }

    private static void Handle(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 15000;
                client.SendTimeout = 30000;
                NetworkStream stream = client.GetStream();
                StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 8192, true);
                string requestLine = reader.ReadLine();
                if (String.IsNullOrWhiteSpace(requestLine)) return;

                string[] parts = requestLine.Split(' ');
                if (parts.Length < 2) { SendText(stream, 400, "Bad Request", "Requisicao invalida"); return; }
                string method = parts[0].ToUpperInvariant();
                string target = parts[1];

                Dictionary<string, string> headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                string line;
                while (!String.IsNullOrEmpty(line = reader.ReadLine()))
                {
                    int colon = line.IndexOf(':');
                    if (colon > 0) headers[line.Substring(0, colon).Trim()] = line.Substring(colon + 1).Trim();
                }

                if (method == "OPTIONS")
                {
                    WriteHeaders(stream, 204, "No Content", 0, "text/plain", null, null);
                    return;
                }
                if (method != "GET" && method != "HEAD")
                {
                    SendText(stream, 405, "Method Not Allowed", "Metodo nao permitido");
                    return;
                }

                string pathOnly = target.Split('?')[0];
                string decoded;
                try { decoded = Uri.UnescapeDataString(pathOnly); }
                catch { SendText(stream, 400, "Bad Request", "Requisicao invalida"); return; }
                if (decoded.IndexOf('\0') >= 0) { SendText(stream, 400, "Bad Request", "Requisicao invalida"); return; }

                string relative = decoded.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
                if (String.IsNullOrEmpty(relative)) relative = "index.html";
                string candidate = Path.GetFullPath(Path.Combine(root, relative));
                string rootPrefix = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (!candidate.Equals(root, StringComparison.OrdinalIgnoreCase) && !candidate.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    SendText(stream, 403, "Forbidden", "Acesso negado");
                    return;
                }

                if (Directory.Exists(candidate)) candidate = Path.Combine(candidate, "index.html");
                if (!File.Exists(candidate))
                {
                    string accept = headers.ContainsKey("Accept") ? headers["Accept"] : "";
                    if (accept.IndexOf("text/html", StringComparison.OrdinalIgnoreCase) >= 0 || String.IsNullOrEmpty(Path.GetExtension(relative)))
                    {
                        string fallback = Path.Combine(root, "index.html");
                        if (File.Exists(fallback)) candidate = fallback;
                    }
                }
                if (!File.Exists(candidate)) { SendText(stream, 404, "Not Found", "Arquivo nao encontrado"); return; }

                FileInfo info = new FileInfo(candidate);
                long start = 0;
                long end = info.Length - 1;
                bool partial = false;
                string rangeValue = headers.ContainsKey("Range") ? headers["Range"] : null;
                if (!String.IsNullOrEmpty(rangeValue))
                {
                    if (!TryParseRange(rangeValue, info.Length, out start, out end))
                    {
                        WriteHeaders(stream, 416, "Range Not Satisfiable", 0, Mime(candidate), "bytes */" + info.Length.ToString(CultureInfo.InvariantCulture), null);
                        return;
                    }
                    partial = true;
                }

                long length = end - start + 1;
                WriteHeaders(stream, partial ? 206 : 200, partial ? "Partial Content" : "OK", length, Mime(candidate),
                    partial ? "bytes " + start.ToString(CultureInfo.InvariantCulture) + "-" + end.ToString(CultureInfo.InvariantCulture) + "/" + info.Length.ToString(CultureInfo.InvariantCulture) : null,
                    "bytes");
                if (method == "HEAD") return;

                using (FileStream file = new FileStream(candidate, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    file.Seek(start, SeekOrigin.Begin);
                    byte[] buffer = new byte[65536];
                    long remaining = length;
                    while (remaining > 0)
                    {
                        int read = file.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                        if (read <= 0) break;
                        stream.Write(buffer, 0, read);
                        remaining -= read;
                    }
                }
            }
            catch { }
        }
    }

    private static bool TryParseRange(string value, long size, out long start, out long end)
    {
        start = 0;
        end = size - 1;
        if (!value.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase)) return false;
        string[] pair = value.Substring(6).Split('-');
        if (pair.Length != 2) return false;
        if (pair[0].Length == 0)
        {
            long suffix;
            if (!Int64.TryParse(pair[1], out suffix) || suffix <= 0) return false;
            start = Math.Max(0, size - suffix);
            return true;
        }
        if (!Int64.TryParse(pair[0], out start) || start < 0 || start >= size) return false;
        if (pair[1].Length > 0 && (!Int64.TryParse(pair[1], out end) || end < start)) return false;
        end = Math.Min(end, size - 1);
        return true;
    }

    private static void SendText(Stream stream, int status, string reason, string message)
    {
        byte[] body = Encoding.UTF8.GetBytes(message);
        WriteHeaders(stream, status, reason, body.Length, "text/plain; charset=utf-8", null, null);
        stream.Write(body, 0, body.Length);
    }

    private static void WriteHeaders(Stream stream, int status, string reason, long length, string contentType, string contentRange, string acceptRanges)
    {
        StringBuilder h = new StringBuilder();
        h.Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\n");
        h.Append("Content-Type: ").Append(contentType).Append("\r\n");
        h.Append("Content-Length: ").Append(length.ToString(CultureInfo.InvariantCulture)).Append("\r\n");
        h.Append("Cache-Control: no-cache, no-store, must-revalidate\r\n");
        h.Append("Access-Control-Allow-Origin: *\r\n");
        h.Append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
        h.Append("Access-Control-Allow-Headers: *\r\n");
        h.Append("Cross-Origin-Resource-Policy: cross-origin\r\n");
        if (!String.IsNullOrEmpty(contentRange)) h.Append("Content-Range: ").Append(contentRange).Append("\r\n");
        if (!String.IsNullOrEmpty(acceptRanges)) h.Append("Accept-Ranges: ").Append(acceptRanges).Append("\r\n");
        h.Append("Connection: close\r\n\r\n");
        byte[] bytes = Encoding.ASCII.GetBytes(h.ToString());
        stream.Write(bytes, 0, bytes.Length);
    }

    private static string Mime(string file)
    {
        switch (Path.GetExtension(file).ToLowerInvariant())
        {
            case ".html": case ".htm": return "text/html; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".js": case ".mjs": case ".cjs": return "text/javascript; charset=utf-8";
            case ".json": case ".map": return "application/json; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".webp": return "image/webp";
            case ".avif": return "image/avif";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            case ".otf": return "font/otf";
            case ".wasm": return "application/wasm";
            case ".glb": return "model/gltf-binary";
            case ".gltf": return "model/gltf+json";
            case ".ktx2": return "image/ktx2";
            case ".hdr": return "image/vnd.radiance";
            case ".exr": return "image/x-exr";
            case ".mp4": return "video/mp4";
            case ".m4v": return "video/x-m4v";
            case ".mov": return "video/quicktime";
            case ".webm": return "video/webm";
            case ".ogv": return "video/ogg";
            case ".mp3": return "audio/mpeg";
            case ".ogg": return "audio/ogg";
            case ".wav": return "audio/wav";
            case ".aac": return "audio/aac";
            default: return "application/octet-stream";
        }
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp

$listener = $null
try {
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 3000)
        $listener.Start()
    }
    catch {
        if ($listener) { try { $listener.Stop() } catch {} }
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
        $listener.Start()
    }

    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $url = "http://127.0.0.1:$port/"
    Clear-Host
    Write-Host "DevClone" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Previa iniciada com sucesso:" -ForegroundColor Green
    Write-Host $url -ForegroundColor White
    Write-Host ""
    Write-Host "Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C."
    if ($env:DEVCLONE_NO_OPEN -ne "1") { Start-Process $url }
    [DevClonePreviewServer]::Run($listener, $root)
}
finally {
    if ($listener) { try { $listener.Stop() } catch {} }
}
`;

const HOW_TO_OPEN = `DEVCLONE - GUIA PARA ABRIR O CLONE LOCALMENTE
=============================================

Para que o site funcione com 100% de fidelidade (fontes, estilos, imagens,
scripts, animacoes e modulos), utilize o inicializador adequado ao seu sistema.


================================================================================
MACOS
================================================================================

1. ONDE ESTA O ARQUIVO
   - O DevClone baixa um arquivo compactado (ex.: devclone_site_data.zip).
   - Ele fica localizado na sua pasta padrao de "Downloads" (ou na pasta que
     voce escolheu ao salvar).
   - De dois cliques no arquivo .zip para descompactar. Uma pasta com os arquivos
     do clone sera criada no mesmo local. Abra essa pasta.

2. METODO PRINCIPAL (Duplo Clique)
   - Dentro da pasta descompactada, de dois cliques em:
     ABRIR-SITE.command
   - O Terminal do macOS abrira uma janela e iniciara o servidor local.
   - O seu navegador padrao sera aberto automaticamente com a previa do site.
   - Mantenha a janela do Terminal aberta enquanto estiver usando o clone.
   - Para encerrar, basta fechar o Terminal ou pressionar Ctrl + C.

3. RESOLVENDO BLOQUEIOS COMUNS DO MACOS (Se o launcher nao abrir)

   Caso A: "Desenvolvedor nao identificado" ou "Nao pode ser verificado"
   - Clique com o botao direito (ou segure a tecla Control e clique) no arquivo
     ABRIR-SITE.command.
   - Selecione "Abrir" no menu.
   - Na janela de confirmacao que aparecer, clique novamente em "Abrir".

   Caso B: "Permissao negada" (Permission Denied)
   - O macOS pode remover a permissao de execucao de arquivos baixados da web.
   - Para liberar, siga o passo a passo simples do Terminal abaixo.

4. COMO ABRIR O TERMINAL NA PASTA (Passo a passo simples)

   Opcao mais rapida (pelo Finder):
   - Na pasta descompactada do clone, clique com o botao direito em qualquer espaco
     vazio (ou no nome da pasta no rodape) e escolha:
     "Novo Terminal na Pasta" (ou "Servicos" > "Novo Terminal na Pasta").

   Opcao manual (arrastando a pasta):
   - Pressione as teclas Command + Barra de Espaco, digite "Terminal" e aperte Enter.
   - Na janela preta/branca do Terminal, digite:
     cd 
     (digite cd seguido de um espaco, nao aperte Enter ainda).
   - Arraste a pasta do clone do Finder para dentro do Terminal (o caminho sera
     preenchido automaticamente).
   - Aperte Enter.

5. COMO EXECUTAR O LAUNCHER PELO TERMINAL
   - Se precisava de permissao, digite o comando abaixo e aperte Enter:
     chmod +x ABRIR-SITE.command
   - Agora inicie o servidor digitando:
     ./ABRIR-SITE.command
   - Aperte Enter. O servidor sera iniciado imediatamente.

6. COMO ACESSAR O SITE NO NAVEGADOR
   - O launcher tenta abrir seu navegador automaticamente.
   - Caso nao abra sozinho, abra seu navegador (Safari, Chrome, etc.) e digite
     na barra de enderecos:
     http://127.0.0.1:3000
     (ou a porta informada na janela do Terminal, ex.: http://127.0.0.1:3001).


================================================================================
WINDOWS
================================================================================

1. Localize o arquivo .zip baixado na sua pasta de "Downloads".
2. Clique com o botao direito no arquivo e selecione "Extrair Tudo..." para uma pasta.
3. Abra a pasta extraida.
4. De dois cliques no arquivo:
   ABRIR-SITE.cmd
5. Uma janela preta (Prompt de Comando) iniciara o servidor e o seu navegador
   padrao abrira o site automaticamente (http://127.0.0.1:3000).
6. Mantenha essa janela aberta enquanto navegar no clone.
7. Para encerrar o servidor, feche a janela ou pressione Ctrl + C.


================================================================================
INICIALIZACAO MANUAL (Para desenvolvedores)
================================================================================

Se voce ja tem Node.js ou Python e prefere rodar manualmente pelo terminal na pasta:

- Com Node.js (recomendado):
  node servidor-local.js

- Com npx:
  npx serve .

- Com Python 3:
  python3 -m http.server 3000


================================================================================
POR QUE NAO ABRIR O INDEX.HTML COM DUPLO CLIQUE DIRETAMENTE?
================================================================================

Quando voce da duplo clique direto no index.html, o arquivo e carregado sob o
protocolo "file://". Por medidas de seguranca dos navegadores modernos, esse modo
bloqueia:
- Fontes tipograficas personalizadas (WOFF2/TTF);
- Modulos JavaScript modernos (ES Modules / import / export);
- Requisicoes locais assincronas (fetch / XHR);
- WebAssembly (.wasm) e animacoes complexas (Rive, GSAP, Lottie);
- Web Workers.

O servidor local embutido roda 100% no seu computador, de forma offline, rapida
e segura, garantindo a exibicao identica ao site original.
`;

export function getPreviewPackageFiles() {
  const encoder = new TextEncoder();
  return [
    { name: 'ABRIR-SITE.cmd', data: encoder.encode(WINDOWS_LAUNCHER.replace(/\n/g, '\r\n')) },
    { name: 'ABRIR-SITE.command', data: encoder.encode(MACOS_LAUNCHER.replace(/\r\n/g, '\n')) },
    { name: 'servidor-local.js', data: encoder.encode(NODE_SERVER) },
    { name: 'servidor-local.ps1', data: encoder.encode(POWERSHELL_SERVER.replace(/\n/g, '\r\n')) },
    { name: 'COMO-ABRIR.txt', data: encoder.encode(HOW_TO_OPEN.replace(/\n/g, '\r\n')) },
  ];
}
```

### lib/reports.mjs

```javascript
/**
 * reports.mjs — portado de background.js (extensão DevClone): geração de
 * README.md, RELATORIO-TECNICO-DE-CAPTURA.txt, VALIDACAO-E-ANALISE-DE-ANIMACOES.txt e
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
  L.push('RELATÓRIO TÉCNICO DE CAPTURA — DevClone (engine standalone)');
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
    L.push('podem ficar incompletas. Consulte VALIDACAO-E-ANALISE-DE-ANIMACOES.txt.');
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
  L.push('VALIDAÇÃO E ANÁLISE DE ANIMAÇÕES — DevClone (engine standalone)');
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
  lines.push('/RELATORIO-TECNICO-DE-CAPTURA.txt  relatorio tecnico detalhado da captura e diagnostico de ativos');
  lines.push('/VALIDACAO-E-ANALISE-DE-ANIMACOES.txt  validacao e analise de scripts, animacoes e recursos dinamicos');
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
  lines.push('3. Se algum arquivo faltar, abra o `RELATORIO-TECNICO-DE-CAPTURA.txt`: ele explica, em detalhes tecnicos, o que nao veio e por que.');
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
  lines.push('- Consulte `VALIDACAO-E-ANALISE-DE-ANIMACOES.txt` antes de considerar o clone completo.');
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
```

### lib/stack.mjs

```javascript
/**
 * stack.mjs — portado de background.js (detectStack/stackProbeMain) e do
 * detectStackDOM() exposto por content.js via a ponte. Combina globals do
 * contexto principal da página com sinais de DOM.
 */
import { callBridge } from './page-bridge.mjs';

const STACK_ORDER = [
  'Next.js', 'Nuxt', 'React', 'Vue', 'Angular', 'Svelte', 'Astro', 'Alpine.js',
  'Webflow', 'Framer', 'WordPress', 'Elementor', 'Wix', 'Squarespace', 'Shopify',
  'Tailwind CSS', 'Bootstrap',
  'GSAP', 'Three.js', 'Rive', 'Lottie', 'Lenis', 'Swiper', 'AOS', 'Locomotive Scroll', 'ScrollMagic', 'Barba.js', 'jQuery',
];

function stackProbeMain() {
  const w = window;
  const out = [];
  const has = (k) => { try { return typeof w[k] !== 'undefined' && w[k] !== null; } catch { return false; } };
  if (has('React') || has('__REACT_DEVTOOLS_GLOBAL_HOOK__') || has('__NEXT_DATA__')) out.push('React');
  if (has('__NEXT_DATA__')) out.push('Next.js');
  if (has('Vue') || has('__VUE__') || has('__NUXT__') || has('__VUE_HMR_RUNTIME__')) out.push('Vue');
  if (has('__NUXT__')) out.push('Nuxt');
  if (has('ng') || has('getAllAngularRootElements')) out.push('Angular');
  if (has('__svelte') || has('__SVELTEKIT__')) out.push('Svelte');
  if (has('Alpine')) out.push('Alpine.js');
  if (has('gsap') || has('TweenMax') || has('TweenLite')) out.push('GSAP');
  if (has('jQuery')) out.push('jQuery');
  if (has('THREE')) out.push('Three.js');
  if (has('Swiper')) out.push('Swiper');
  if (has('Shopify')) out.push('Shopify');
  if (has('Webflow')) out.push('Webflow');
  if (has('lottie') || has('bodymovin')) out.push('Lottie');
  if (has('rive') || has('Rive') || has('rivejs')) out.push('Rive');
  if (has('Lenis') || has('lenis')) out.push('Lenis');
  if (has('barba')) out.push('Barba.js');
  if (has('ScrollMagic')) out.push('ScrollMagic');
  if (has('LocomotiveScroll')) out.push('Locomotive Scroll');
  return out;
}

export async function detectStack(page) {
  const set = new Set();
  try {
    const mainWorldStack = await page.evaluate(stackProbeMain);
    (mainWorldStack || []).forEach((s) => set.add(s));
  } catch { /* CSP ou pagina restrita */ }
  try {
    const r = await callBridge(page, { action: 'domStack' });
    if (r && r.ok && Array.isArray(r.stack)) r.stack.forEach((s) => set.add(s));
  } catch { /* ignore */ }
  const arr = Array.from(set);
  arr.sort((a, b) => {
    const ia = STACK_ORDER.indexOf(a);
    const ib = STACK_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return arr;
}
```

### lib/design-system.mjs

```javascript
/**
 * design-system.mjs — NOVO módulo (Modo 2 / Harness).
 *
 * Extrai o DNA visual do site com VALORES CONCRETOS (não descrições
 * superficiais): paleta, tipografia, espaçamento, grid/breakpoints,
 * radius, sombras, bordas, variantes de botão (incl. hover/focus/active
 * reais, via Playwright), inputs, cards, navegação.
 *
 * extractDesignTokens(page) roda no navegador real (via CDP/Playwright),
 * então os estados hover/focus/active são medidos de verdade — não
 * inferidos — chamando page.hover()/page.focus() em elementos amostrados
 * antes de ler getComputedStyle.
 */

// ---------------------------------------------------------------- snapshot
async function snapshotBase(page) {
  return page.evaluate(() => {
    function cs(el) { return getComputedStyle(el); }
    function pick(el, props) {
      const c = cs(el);
      const out = {};
      for (const p of props) out[p] = c[p];
      return out;
    }
    function short(sel, el) {
      const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      return cls ? `${sel}.${cls}` : sel;
    }

    // ---- paleta -----------------------------------------------------
    const colorFreq = new Map();
    const bump = (v) => {
      if (!v || /rgba?\(0,\s*0,\s*0,\s*0\)/.test(v) || v === 'transparent') return;
      colorFreq.set(v, (colorFreq.get(v) || 0) + 1);
    };
    const roleHints = { primary: [], secondary: [], accent: [], success: [], error: [], warning: [], info: [] };
    const roleKeywordRe = {
      primary: /(^|-)(primary|brand|main)($|-)/i,
      secondary: /(^|-)(secondary)($|-)/i,
      accent: /(^|-)(accent|highlight)($|-)/i,
      success: /(^|-)(success|ok|positive|green)($|-)/i,
      error: /(^|-)(error|danger|negative|red|destructive)($|-)/i,
      warning: /(^|-)(warning|alert|amber|yellow)($|-)/i,
      info: /(^|-)(info|informative|blue)($|-)/i,
    };

    const sampleEls = document.querySelectorAll('*');
    let n = 0;
    for (const el of sampleEls) {
      if (n++ > 1500) break;
      const c = cs(el);
      bump(c.color);
      bump(c.backgroundColor);
      if (c.borderTopColor && c.borderTopWidth !== '0px') bump(c.borderTopColor);
      const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '';
      for (const role of Object.keys(roleKeywordRe)) {
        if (roleKeywordRe[role].test(String(cls))) {
          if (c.backgroundColor && c.backgroundColor !== 'rgba(0, 0, 0, 0)') roleHints[role].push(c.backgroundColor);
          if (c.color) roleHints[role].push(c.color);
        }
      }
    }
    const palette = Array.from(colorFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([value, count]) => ({ value, count }));

    // ---- tipografia ---------------------------------------------------
    const typeSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'label', 'small', 'blockquote'];
    const typeScale = [];
    for (const sel of typeSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const c = cs(el);
      typeScale.push({
        selector: sel,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
        fontWeight: c.fontWeight,
        lineHeight: c.lineHeight,
        letterSpacing: c.letterSpacing,
        textTransform: c.textTransform,
      });
    }
    const fontFamilies = new Set();
    let fc = 0;
    for (const el of document.querySelectorAll('body, h1, h2, h3, p, a, button, span, label')) {
      if (fc++ > 300) break;
      const ff = cs(el).fontFamily;
      if (ff) fontFamilies.add(ff.split(',')[0].replace(/["']/g, '').trim());
    }

    // ---- espaçamento (padding/margin/gap observados) -------------------
    const spacingFreq = new Map();
    const bumpSpacing = (v) => {
      String(v).split(' ').forEach((token) => {
        const px = parseFloat(token);
        if (Number.isFinite(px) && px > 0 && px < 400) spacingFreq.set(px, (spacingFreq.get(px) || 0) + 1);
      });
    };
    n = 0;
    for (const el of document.querySelectorAll('section, div, header, footer, nav, article, button, a, .container, [class*="container"]')) {
      if (n++ > 600) break;
      const c = cs(el);
      bumpSpacing(c.padding);
      bumpSpacing(c.margin);
      bumpSpacing(c.gap);
    }
    const spacingScale = Array.from(spacingFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([px, count]) => ({ px, count }))
      .sort((a, b) => a.px - b.px);

    // ---- radius / sombras / bordas -------------------------------------
    const radiusFreq = new Map();
    const shadowFreq = new Map();
    const borderFreq = new Map();
    n = 0;
    for (const el of document.querySelectorAll('button, a, input, textarea, select, [class*="card"], [class*="btn"], img, .container, [class*="rounded"]')) {
      if (n++ > 500) break;
      const c = cs(el);
      if (c.borderRadius && c.borderRadius !== '0px') radiusFreq.set(c.borderRadius, (radiusFreq.get(c.borderRadius) || 0) + 1);
      if (c.boxShadow && c.boxShadow !== 'none') shadowFreq.set(c.boxShadow, (shadowFreq.get(c.boxShadow) || 0) + 1);
      if (c.borderTopWidth && c.borderTopWidth !== '0px' && c.borderTopStyle !== 'none') {
        const key = `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`;
        borderFreq.set(key, (borderFreq.get(key) || 0) + 1);
      }
    }
    const radii = Array.from(radiusFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
    const shadows = Array.from(shadowFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count }));
    const borders = Array.from(borderFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count }));

    // ---- breakpoints (@media, same-origin) -----------------------------
    const breakpoints = new Set();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const r of Array.from(rules)) {
        if (r.media && r.media.mediaText) {
          const mm = r.media.mediaText.match(/\d+px/g);
          if (mm) mm.forEach((x) => breakpoints.add(x));
        }
      }
    }

    // ---- grid / container -----------------------------------------------
    const containerCandidates = Array.from(document.querySelectorAll('.container, [class*="container"], main, body > div'))
      .slice(0, 20)
      .map((el) => ({ maxWidth: cs(el).maxWidth, paddingInline: cs(el).paddingLeft, display: cs(el).display, gridTemplateColumns: cs(el).gridTemplateColumns }))
      .filter((x) => x.maxWidth && x.maxWidth !== 'none');

    // ---- botões: candidatos (endereços de seletor para hover/focus real) -
    const buttonSelectors = [];
    document.querySelectorAll('button, a.button, a[class*="btn"], input[type="submit"], input[type="button"], [class*="btn-primary"], [class*="btn-secondary"]').forEach((el, i) => {
      if (i > 40) return;
      let sel = el.tagName.toLowerCase();
      const id = el.id;
      const cls = (el.getAttribute('class') || '').trim();
      if (id) sel = `#${CSS.escape(id)}`;
      else if (cls) sel = `${sel}.${cls.split(/\s+/).map((c) => CSS.escape(c)).join('.')}`;
      buttonSelectors.push(sel);
    });

    // ---- inputs -----------------------------------------------------------
    const inputTokens = [];
    document.querySelectorAll('input, textarea, select').forEach((el, i) => {
      if (i > 6) return;
      const c = cs(el);
      inputTokens.push({
        type: el.tagName.toLowerCase() + (el.type ? `[type=${el.type}]` : ''),
        border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
        borderRadius: c.borderRadius,
        background: c.backgroundColor,
        color: c.color,
        padding: c.padding,
        fontSize: c.fontSize,
      });
    });

    // ---- cards --------------------------------------------------------
    const cardTokens = [];
    document.querySelectorAll('[class*="card"]').forEach((el, i) => {
      if (i > 6) return;
      const c = cs(el);
      cardTokens.push({
        selector: short('div', el),
        background: c.backgroundColor,
        borderRadius: c.borderRadius,
        boxShadow: c.boxShadow,
        padding: c.padding,
        border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
      });
    });

    // ---- navegação ------------------------------------------------------
    const navEl = document.querySelector('nav, header nav, [role="navigation"]');
    let nav = null;
    if (navEl) {
      const c = cs(navEl);
      const link = navEl.querySelector('a');
      nav = {
        background: c.backgroundColor,
        height: c.height,
        position: c.position,
        link: link ? pick(link, ['color', 'fontSize', 'fontWeight', 'textTransform', 'letterSpacing']) : null,
      };
    }

    return {
      palette, roleHints, typeScale, fontFamilies: Array.from(fontFamilies),
      spacingScale, radii, shadows, borders, breakpoints: Array.from(breakpoints).sort((a, b) => parseInt(a) - parseInt(b)),
      containerCandidates, buttonSelectors, inputTokens, cardTokens, nav,
    };
  });
}

// ---------------------------------------------------------------- estados reais
async function measureButtonStates(page, selectors) {
  const results = [];
  for (const sel of selectors.slice(0, 10)) {
    try {
      const locator = page.locator(sel).first();
      if (!(await locator.count())) continue;
      const base = await locator.evaluate((el) => {
        const c = getComputedStyle(el);
        return {
          background: c.backgroundColor, color: c.color, border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`,
          borderRadius: c.borderRadius, padding: c.padding, fontSize: c.fontSize, fontWeight: c.fontWeight,
          textTransform: c.textTransform, boxShadow: c.boxShadow, transition: c.transition,
        };
      });
      let hover = null;
      let focus = null;
      try {
        await locator.hover({ timeout: 1500, trial: false });
        await page.waitForTimeout(120);
        hover = await locator.evaluate((el) => {
          const c = getComputedStyle(el);
          return { background: c.backgroundColor, color: c.color, boxShadow: c.boxShadow, transform: c.transform };
        });
      } catch { /* elemento pode estar fora da viewport ou coberto */ }
      try {
        await locator.focus({ timeout: 1500 });
        await page.waitForTimeout(80);
        focus = await locator.evaluate((el) => {
          const c = getComputedStyle(el);
          return { outline: c.outline, boxShadow: c.boxShadow, borderColor: c.borderTopColor };
        });
      } catch { /* nem todo elemento é focável */ }
      results.push({ selector: sel, base, hover, focus });
    } catch { /* seletor pode ter deixado de existir após hover em outro elemento */ }
  }
  return results;
}

export async function extractDesignTokens(page) {
  const base = await snapshotBase(page);
  const buttonStates = await measureButtonStates(page, base.buttonSelectors || []);
  return { ...base, buttonStates };
}

// ---------------------------------------------------------------- doc gerado
function fmtColorList(list) {
  if (!list || !list.length) return '_nenhuma cor dominante identificada_';
  return list.slice(0, 12).map((c) => `- \`${c.value}\` (${c.count}x)`).join('\n');
}

export function buildDesignSystemDoc(tokens, meta, startUrl) {
  const L = [];
  L.push('# DESIGN-SYSTEM.md — DNA visual extraído pelo DevClone (Modo 2 · Harness)');
  L.push('');
  L.push(`- **Origem:** ${startUrl}`);
  L.push(`- **Gerado em:** ${new Date().toISOString()}`);
  if (meta && meta.stack && meta.stack.length) L.push(`- **Stack detectada:** ${meta.stack.join(', ')}`);
  L.push('');
  L.push('> Este documento é contexto técnico para outra IA construir um novo site');
  L.push('> seguindo o mesmo DNA visual. Os valores abaixo são medidos diretamente');
  L.push('> (computed style/frequência de uso), não são descrições genéricas.');
  L.push('');

  L.push('## 1. Paleta de cores');
  L.push('');
  L.push('### Cores mais frequentes (todas as ocorrências computadas)');
  L.push(fmtColorList(tokens.palette));
  L.push('');
  const roleLabels = { primary: 'Primária', secondary: 'Secundária', accent: 'Destaque/Accent', success: 'Sucesso', error: 'Erro/Perigo', warning: 'Aviso', info: 'Informação' };
  L.push('### Papéis identificados por convenção de nome de classe');
  for (const [role, label] of Object.entries(roleLabels)) {
    const values = Array.from(new Set(tokens.roleHints?.[role] || [])).slice(0, 4);
    L.push(`- **${label}:** ${values.length ? values.map((v) => `\`${v}\``).join(', ') : '_não identificada por nome de classe — usar as cores mais frequentes acima_'}`);
  }
  L.push('');

  L.push('## 2. Tipografia');
  L.push('');
  L.push(`- **Famílias encontradas:** ${(tokens.fontFamilies || []).map((f) => `\`${f}\``).join(', ') || 'não identificadas'}`);
  L.push('');
  L.push('### Escala tipográfica (valores computados por elemento)');
  L.push('');
  L.push('| Elemento | font-family | font-size | font-weight | line-height | letter-spacing | text-transform |');
  L.push('|---|---|---|---|---|---|---|');
  for (const t of tokens.typeScale || []) {
    L.push(`| ${t.selector} | ${t.fontFamily} | ${t.fontSize} | ${t.fontWeight} | ${t.lineHeight} | ${t.letterSpacing} | ${t.textTransform} |`);
  }
  L.push('');

  L.push('## 3. Sistema de espaçamento');
  L.push('');
  L.push('Valores de padding/margin/gap mais recorrentes no site (provável escala base):');
  L.push('');
  L.push((tokens.spacingScale || []).map((s) => `\`${s.px}px\` (${s.count}x)`).join(' · ') || '_não identificado_');
  L.push('');

  L.push('## 4. Grid e containers');
  L.push('');
  if (tokens.containerCandidates && tokens.containerCandidates.length) {
    L.push('| max-width | padding-inline | display | grid-template-columns |');
    L.push('|---|---|---|---|');
    for (const c of tokens.containerCandidates.slice(0, 8)) {
      L.push(`| ${c.maxWidth} | ${c.paddingInline} | ${c.display} | ${c.gridTemplateColumns || '—'} |`);
    }
  } else {
    L.push('_nenhum container com max-width explícito identificado — o layout provavelmente usa largura fluida com padding lateral._');
  }
  L.push('');
  L.push('### Breakpoints observados (media queries)');
  L.push((tokens.breakpoints || []).join(', ') || '_não identificados_');
  L.push('');

  L.push('## 5. Border-radius');
  L.push('');
  L.push((tokens.radii || []).map((r) => `\`${r.value}\` (${r.count}x)`).join(' · ') || '_nenhum radius relevante identificado_');
  L.push('');

  L.push('## 6. Sombras');
  L.push('');
  if (tokens.shadows && tokens.shadows.length) {
    tokens.shadows.forEach((s) => L.push(`- \`${s.value}\``));
  } else {
    L.push('_nenhuma sombra relevante identificada._');
  }
  L.push('');

  L.push('## 7. Bordas');
  L.push('');
  L.push((tokens.borders || []).map((b) => `\`${b.value}\` (${b.count}x)`).join(' · ') || '_nenhuma borda relevante identificada._');
  L.push('');

  L.push('## 8. Botões — variantes e estados reais (hover/focus medidos no navegador)');
  L.push('');
  if (tokens.buttonStates && tokens.buttonStates.length) {
    for (const b of tokens.buttonStates) {
      L.push(`### \`${b.selector}\``);
      L.push('');
      L.push('**Estado normal**');
      L.push('```');
      L.push(JSON.stringify(b.base, null, 2));
      L.push('```');
      if (b.hover) {
        L.push('**Estado hover (medido)**');
        L.push('```');
        L.push(JSON.stringify(b.hover, null, 2));
        L.push('```');
      }
      if (b.focus) {
        L.push('**Estado focus (medido)**');
        L.push('```');
        L.push(JSON.stringify(b.focus, null, 2));
        L.push('```');
      }
      L.push('');
    }
  } else {
    L.push('_nenhum botão localizado para amostragem de estado._');
  }
  L.push('');

  L.push('## 9. Inputs e elementos de formulário');
  L.push('');
  if (tokens.inputTokens && tokens.inputTokens.length) {
    L.push('| tipo | border | radius | background | color | padding | font-size |');
    L.push('|---|---|---|---|---|---|---|');
    for (const i of tokens.inputTokens) {
      L.push(`| ${i.type} | ${i.border} | ${i.borderRadius} | ${i.background} | ${i.color} | ${i.padding} | ${i.fontSize} |`);
    }
  } else {
    L.push('_nenhum campo de formulário identificado na página capturada._');
  }
  L.push('');

  L.push('## 10. Cards');
  L.push('');
  if (tokens.cardTokens && tokens.cardTokens.length) {
    L.push('| seletor | background | radius | shadow | padding | border |');
    L.push('|---|---|---|---|---|---|');
    for (const c of tokens.cardTokens) {
      L.push(`| ${c.selector} | ${c.background} | ${c.borderRadius} | ${c.boxShadow} | ${c.padding} | ${c.border} |`);
    }
  } else {
    L.push('_nenhum componente de card identificado (seletor `[class*="card"]`)._');
  }
  L.push('');

  L.push('## 11. Navegação');
  L.push('');
  if (tokens.nav) {
    L.push('```');
    L.push(JSON.stringify(tokens.nav, null, 2));
    L.push('```');
  } else {
    L.push('_nenhum elemento `<nav>`/`[role=navigation]` identificado._');
  }
  L.push('');

  L.push('## 12. Como usar este documento');
  L.push('');
  L.push('- `DESIGN-SYSTEM.md` (este arquivo) = documentação técnica com os valores acima.');
  L.push('- `animations/` = código real de animações/interações extraído do site original (ver `ANIMACOES.md`).');
  L.push('- `harness/` = laboratório visual navegável (abra via `ABRIR-SITE.cmd`/`.command`) demonstrando estes tokens aplicados a botões, inputs, cards, tipografia e navegação.');
  L.push('- Use este pacote como REFERÊNCIA de DNA visual/interativo — não como conteúdo a copiar literalmente. Não foi extraído texto, imagem ou estrutura completa do site original (Modo 2 não clona conteúdo, só o sistema).');
  L.push('');

  return L.join('\n');
}
```

### lib/animation-extract.mjs

```javascript
/**
 * animation-extract.mjs — NOVO módulo (Modo 2 / Harness).
 *
 * Localiza e extrai CÓDIGO REAL de animação/interação (não descrições) a
 * partir do CSS/JS já capturado em state.files: @keyframes, transitions,
 * transforms, e trechos de JS que usam bibliotecas conhecidas (GSAP,
 * ScrollTrigger, Lottie, Rive, Lenis, AOS, ScrollMagic, Barba.js) ou
 * padrões nativos (IntersectionObserver, requestAnimationFrame,
 * matchMedia + reduced-motion, scroll listeners).
 *
 * Produz arquivos reais para o pacote:
 *   animations/keyframes.css     -> todos os @keyframes encontrados
 *   animations/transitions.css   -> regras com transition/transform relevantes
 *   animations/interactions.js   -> trechos de JS de animação/interação
 *   ANIMACOES.md                 -> sumário do que foi encontrado e de onde
 */

const KEYFRAMES_RE = /@(?:-webkit-|-moz-)?keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi;

const LIB_SIGNATURES = [
  { name: 'GSAP', re: /\bgsap\.|TweenMax|TweenLite|ScrollTrigger|ScrollSmoother|SplitText/g },
  { name: 'Lottie', re: /\blottie\.(loadAnimation|play|pause)|bodymovin\./g },
  { name: 'Rive', re: /new\s+rive\.Rive\(|\bRive\(/g },
  { name: 'Lenis', re: /new\s+Lenis\(|\blenis\./g },
  { name: 'AOS', re: /\bAOS\.init\(/g },
  { name: 'ScrollMagic', re: /new\s+ScrollMagic\.(Controller|Scene)\(/g },
  { name: 'Barba.js', re: /\bbarba\.init\(/g },
  { name: 'Swiper', re: /new\s+Swiper\(/g },
  { name: 'IntersectionObserver', re: /new\s+IntersectionObserver\(/g },
  { name: 'requestAnimationFrame', re: /requestAnimationFrame\(/g },
];

function findLineWindow(text, index, before = 4, after = 12) {
  const upto = text.slice(0, index);
  const startLine = Math.max(0, upto.split('\n').length - 1 - before);
  const lines = text.split('\n');
  const endLine = Math.min(lines.length, startLine + before + after);
  return lines.slice(startLine, endLine).join('\n');
}

/**
 * @param {Array<{name:string, data:Uint8Array}>} files arquivos já capturados (CSS/JS)
 */
export function extractAnimationCode(files) {
  const cssFiles = (files || []).filter((f) => /\.css$/i.test(f.name));
  const jsFiles = (files || []).filter((f) => /\.m?js$/i.test(f.name));

  const keyframesFound = [];
  const transitionRulesFound = [];
  const jsSnippetsFound = [];
  const libsDetected = new Set();

  for (const f of cssFiles) {
    let text;
    try { text = Buffer.from(f.data).toString('utf8'); } catch { continue; }

    const kf = text.match(KEYFRAMES_RE) || [];
    for (const block of kf) keyframesFound.push({ source: f.name, code: block });

    // Regras com transition/transform relevantes (bloco completo, não a folha toda)
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(text))) {
      const selector = m[1].trim();
      const body = m[2];
      if (/@/.test(selector)) continue; // já tratado por @keyframes acima
      if (/transition\s*:|transform\s*:|animation\s*:|will-change\s*:/i.test(body)) {
        const relevantDecls = body
          .split(';')
          .map((d) => d.trim())
          .filter((d) => /^(transition|transform|animation|will-change)\s*:/i.test(d));
        if (relevantDecls.length) {
          transitionRulesFound.push({ source: f.name, selector, declarations: relevantDecls });
        }
      }
    }
  }

  for (const f of jsFiles) {
    let text;
    try { text = Buffer.from(f.data).toString('utf8'); } catch { continue; }
    if (text.length > 400000) continue; // arquivo gigante/minificado — pouco proveitoso para extrair "trecho legível"

    for (const lib of LIB_SIGNATURES) {
      lib.re.lastIndex = 0;
      let match;
      let hits = 0;
      while ((match = lib.re.exec(text)) && hits < 3) {
        libsDetected.add(lib.name);
        jsSnippetsFound.push({
          source: f.name,
          library: lib.name,
          code: findLineWindow(text, match.index),
        });
        hits++;
      }
    }
  }

  return { keyframesFound, transitionRulesFound, jsSnippetsFound, libsDetected: Array.from(libsDetected) };
}

export function buildAnimationFiles(extraction) {
  const encoder = new TextEncoder();
  const files = [];

  if (extraction.keyframesFound.length) {
    const L = ['/* animations/keyframes.css — @keyframes reais extraídos do site original */', ''];
    for (const k of extraction.keyframesFound) {
      L.push(`/* origem: ${k.source} */`);
      L.push(k.code);
      L.push('');
    }
    files.push({ name: 'animations/keyframes.css', data: encoder.encode(L.join('\n')) });
  }

  if (extraction.transitionRulesFound.length) {
    const L = ['/* animations/transitions.css — regras de transition/transform/animation reais, por seletor */', ''];
    for (const r of extraction.transitionRulesFound.slice(0, 400)) {
      L.push(`/* origem: ${r.source} */`);
      L.push(`${r.selector} {`);
      for (const d of r.declarations) L.push(`  ${d};`);
      L.push('}');
      L.push('');
    }
    files.push({ name: 'animations/transitions.css', data: encoder.encode(L.join('\n')) });
  }

  if (extraction.jsSnippetsFound.length) {
    const L = [
      '/* animations/interactions.js — trechos reais de JS de animação/interação */',
      '/* Cada bloco é um recorte do arquivo original ao redor de uma chamada de */',
      '/* biblioteca de animação identificada. Não é um arquivo executável isolado */',
      '/* — use como referência de implementação real, adaptando ao novo projeto. */',
      '',
    ];
    for (const s of extraction.jsSnippetsFound.slice(0, 200)) {
      L.push(`/* ---- ${s.library} — origem: ${s.source} ---- */`);
      L.push(s.code);
      L.push('');
    }
    files.push({ name: 'animations/interactions.js', data: encoder.encode(L.join('\n')) });
  }

  return files;
}

export function buildAnimationDoc(extraction, startUrl) {
  const L = [];
  L.push('# ANIMACOES.md — Animações e interações reais extraídas (Modo 2 · Harness)');
  L.push('');
  L.push(`- **Origem:** ${startUrl}`);
  L.push(`- **Gerado em:** ${new Date().toISOString()}`);
  L.push('');
  L.push('## Bibliotecas de animação detectadas em uso');
  L.push('');
  L.push(extraction.libsDetected.length ? extraction.libsDetected.map((l) => `- ${l}`).join('\n') : '_nenhuma biblioteca de animação conhecida foi detectada em uso no JS capturado._');
  L.push('');
  L.push('## O que foi extraído');
  L.push('');
  L.push(`- **@keyframes reais:** ${extraction.keyframesFound.length} bloco(s) — ver \`animations/keyframes.css\`.`);
  L.push(`- **Regras de transition/transform/animation:** ${extraction.transitionRulesFound.length} regra(s) — ver \`animations/transitions.css\`.`);
  L.push(`- **Trechos de JS de animação/interação:** ${extraction.jsSnippetsFound.length} trecho(s) — ver \`animations/interactions.js\`.`);
  L.push('');
  if (!extraction.keyframesFound.length && !extraction.transitionRulesFound.length && !extraction.jsSnippetsFound.length) {
    L.push('## Observação');
    L.push('');
    L.push('Não foram encontradas animações/interações via CSS (@keyframes, transition,');
    L.push('transform) nem via bibliotecas de animação conhecidas no JavaScript');
    L.push('capturado. Isso pode significar que o site não usa animações relevantes,');
    L.push('ou que elas são geradas por um bundle fortemente ofuscado/minificado onde a');
    L.push('assinatura da biblioteca não pôde ser localizada por padrão de texto.');
    L.push('');
  } else {
    L.push('## Como usar');
    L.push('');
    L.push('- `animations/keyframes.css` e `animations/transitions.css` podem ser');
    L.push('  importados diretamente em um novo projeto — são CSS real, não inventado.');
    L.push('- `animations/interactions.js` traz recortes de JS ao redor de cada chamada');
    L.push('  de biblioteca identificada — sirva como referência de implementação real');
    L.push('  ao recriar a interação em um novo projeto (adapte seletores/contexto).');
    L.push('- O `harness/` (Visual Harness) já referencia esses arquivos para demonstrar');
    L.push('  as animações funcionando ao vivo — abra via `ABRIR-SITE.cmd`/`.command`.');
    L.push('');
  }
  return L.join('\n');
}
```

### lib/harness-build.mjs

```javascript
/**
 * harness-build.mjs — NOVO módulo (Modo 2 / Harness).
 *
 * Constrói o VISUAL HARNESS: um pequeno projeto HTML/CSS/JS funcional que
 * demonstra ao vivo, no navegador, os tokens extraídos (paleta, tipografia,
 * espaçamento, radius, sombras), os componentes (botões com estados reais,
 * inputs, cards, navegação) e as animações/interações reais extraídas por
 * animation-extract.mjs. NÃO é um clone do site — é um laboratório de
 * referência visual, gerado a partir do DESIGN-SYSTEM.md.
 */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pickPrimary(tokens) {
  const roleP = tokens.roleHints?.primary?.[0];
  if (roleP) return roleP;
  return tokens.palette?.[0]?.value || '#3b82f6';
}
function pickSecondary(tokens) {
  const roleS = tokens.roleHints?.secondary?.[0];
  if (roleS) return roleS;
  return tokens.palette?.[1]?.value || '#6b7280';
}
function pickNeutralBg(tokens) {
  const bodyColor = tokens.typeScale?.find((t) => t.selector === 'body');
  return tokens.palette?.find((p) => /^rgb\(2[0-5][0-9]|^rgb\(255|^#f|^white/i.test(p.value))?.value || '#ffffff';
}
function pickTextColor(tokens) {
  return tokens.palette?.find((p) => /rgb\(([0-4][0-9]|[0-9]),/.test(p.value))?.value || '#111111';
}

function firstKeyframeNames(keyframesFound) {
  const names = [];
  for (const k of keyframesFound || []) {
    const m = /@(?:-webkit-|-moz-)?keyframes\s+([\w-]+)/.exec(k.code);
    if (m && !names.includes(m[1])) names.push(m[1]);
    if (names.length >= 2) break;
  }
  return names;
}

export function buildHarnessProject(tokens, extraction, meta, startUrl) {
  const encoder = new TextEncoder();
  const primary = pickPrimary(tokens);
  const secondary = pickSecondary(tokens);
  const bg = pickNeutralBg(tokens);
  const text = pickTextColor(tokens);
  const fontFamily = (tokens.fontFamilies && tokens.fontFamilies[0]) || 'system-ui, sans-serif';
  const radius = tokens.radii?.[0]?.value || '8px';
  const shadow = tokens.shadows?.[0]?.value || '0 4px 16px rgba(0,0,0,.12)';
  const spacingScale = (tokens.spacingScale && tokens.spacingScale.length ? tokens.spacingScale : [{ px: 4 }, { px: 8 }, { px: 12 }, { px: 16 }, { px: 24 }, { px: 32 }, { px: 48 }]);
  const kfNames = firstKeyframeNames(extraction?.keyframesFound);
  const hasAnimFiles = !!(extraction && (extraction.keyframesFound.length || extraction.transitionRulesFound.length));

  // ---------------------------------------------------------------- CSS
  const cssLines = [];
  cssLines.push('/* harness/harness.css — gerado a partir dos tokens extraídos (DESIGN-SYSTEM.md) */');
  cssLines.push(':root {');
  cssLines.push(`  --color-primary: ${primary};`);
  cssLines.push(`  --color-secondary: ${secondary};`);
  cssLines.push(`  --color-bg: ${bg};`);
  cssLines.push(`  --color-text: ${text};`);
  cssLines.push(`  --font-family: ${fontFamily};`);
  cssLines.push(`  --radius: ${radius};`);
  cssLines.push(`  --shadow: ${shadow};`);
  spacingScale.forEach((s, i) => cssLines.push(`  --space-${i + 1}: ${s.px}px;`));
  cssLines.push('}');
  cssLines.push('');
  cssLines.push('* { box-sizing: border-box; }');
  cssLines.push('body { margin: 0; font-family: var(--font-family); background: var(--color-bg); color: var(--color-text); line-height: 1.5; }');
  cssLines.push('.harness-header { padding: var(--space-4) var(--space-5); border-bottom: 1px solid rgba(0,0,0,.08); position: sticky; top: 0; background: var(--color-bg); z-index: 10; }');
  cssLines.push('.harness-header h1 { margin: 0 0 4px; font-size: 20px; }');
  cssLines.push('.harness-header p { margin: 0; opacity: .65; font-size: 13px; }');
  cssLines.push('.section { padding: var(--space-5); max-width: 1040px; margin: 0 auto; }');
  cssLines.push('.section h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; opacity: .55; margin: 0 0 var(--space-3); }');
  cssLines.push('.swatches { display: flex; flex-wrap: wrap; gap: var(--space-3); }');
  cssLines.push('.swatch { width: 96px; }');
  cssLines.push('.swatch-color { height: 56px; border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid rgba(0,0,0,.06); }');
  cssLines.push('.swatch code { display: block; font-size: 11px; margin-top: 4px; word-break: break-all; opacity: .7; }');
  cssLines.push('.type-row { display: flex; align-items: baseline; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px dashed rgba(0,0,0,.08); }');
  cssLines.push('.type-row .tag { font-size: 11px; opacity: .5; width: 60px; flex: none; }');
  cssLines.push('.btn { display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius); padding: 10px 20px; font-family: inherit; font-size: 14px; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: background .18s ease, transform .12s ease, box-shadow .18s ease; }');
  cssLines.push('.btn--primary { background: var(--color-primary); color: #fff; }');
  cssLines.push('.btn--primary:hover { filter: brightness(0.92); transform: translateY(-1px); box-shadow: var(--shadow); }');
  cssLines.push('.btn--secondary { background: transparent; color: var(--color-secondary); border-color: var(--color-secondary); }');
  cssLines.push('.btn--secondary:hover { background: var(--color-secondary); color: #fff; }');
  cssLines.push('.btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }');
  cssLines.push('.row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }');
  cssLines.push('.field { display: flex; flex-direction: column; gap: 6px; max-width: 280px; }');
  cssLines.push('.field label { font-size: 12px; opacity: .65; }');
  cssLines.push('.field input, .field textarea, .field select { font-family: inherit; font-size: 14px; padding: 10px 12px; border-radius: var(--radius); border: 1px solid rgba(0,0,0,.18); background: #fff; color: var(--color-text); transition: border-color .15s ease, box-shadow .15s ease; }');
  cssLines.push('.field input:focus, .field textarea:focus, .field select:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 25%, transparent); }');
  cssLines.push('.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); }');
  cssLines.push('.card { border-radius: var(--radius); box-shadow: var(--shadow); padding: var(--space-4); background: #fff; }');
  cssLines.push('.card h3 { margin: 0 0 6px; font-size: 15px; }');
  cssLines.push('.card p { margin: 0; font-size: 13px; opacity: .7; }');
  cssLines.push('.nav-demo { display: flex; gap: var(--space-4); padding: var(--space-3) var(--space-4); border-radius: var(--radius); background: rgba(0,0,0,.03); }');
  cssLines.push('.nav-demo a { color: var(--color-text); text-decoration: none; font-size: 14px; font-weight: 500; }');
  cssLines.push('.nav-demo a:hover { color: var(--color-primary); }');
  cssLines.push('.demo-reveal { opacity: 0; transform: translateY(16px); transition: opacity .5s ease, transform .5s ease; }');
  cssLines.push('.demo-reveal.is-visible { opacity: 1; transform: translateY(0); }');
  if (kfNames.length) {
    cssLines.push('.demo-reveal.is-visible.use-keyframe { animation-name: ' + kfNames[0] + '; animation-duration: .7s; animation-fill-mode: both; }');
  }
  cssLines.push('.token-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: var(--space-2); font-size: 13px; }');
  cssLines.push('.token-list .chip { background: rgba(0,0,0,.04); border-radius: 6px; padding: 6px 10px; }');
  cssLines.push('.harness-footer { padding: var(--space-5); text-align: center; font-size: 12px; opacity: .5; }');

  // ---------------------------------------------------------------- HTML
  const paletteSwatches = (tokens.palette || []).slice(0, 12).map((c) => `
      <div class="swatch">
        <div class="swatch-color" style="background:${esc(c.value)}"></div>
        <code>${esc(c.value)}</code>
      </div>`).join('');

  const typeRows = (tokens.typeScale || []).map((t) => `
      <div class="type-row">
        <span class="tag">${esc(t.selector)}</span>
        <${t.selector === 'p' || t.selector === 'blockquote' || t.selector === 'small' ? 'span' : esc(t.selector)} style="font-size:${esc(t.fontSize)};font-weight:${esc(t.fontWeight)};line-height:${esc(t.lineHeight)};letter-spacing:${esc(t.letterSpacing)};text-transform:${esc(t.textTransform)};margin:0;">
          Texto de exemplo — ${esc(t.selector)}
        </${t.selector === 'p' || t.selector === 'blockquote' || t.selector === 'small' ? 'span' : esc(t.selector)}>
      </div>`).join('');

  const spacingChips = spacingScale.map((s, i) => `<span class="chip">--space-${i + 1}: ${s.px}px</span>`).join('\n        ');
  const radiusChips = (tokens.radii || []).map((r) => `<span class="chip">${esc(r.value)}</span>`).join('\n        ');
  const shadowChips = (tokens.shadows || []).map((s) => `<span class="chip">${esc(s.value)}</span>`).join('\n        ');

  const cardsHtml = (tokens.cardTokens && tokens.cardTokens.length ? tokens.cardTokens : [{ selector: 'card genérico' }, { selector: 'card genérico' }]).slice(0, 3).map((c, i) => `
      <div class="card demo-reveal">
        <h3>Card ${i + 1}</h3>
        <p>Componente de referência (${esc(c.selector || 'card')}) usando radius, sombra e espaçamento extraídos.</p>
      </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DevClone — Visual Harness</title>
<link rel="stylesheet" href="harness.css" />
${hasAnimFiles ? '<link rel="stylesheet" href="../animations/keyframes.css" />\n<link rel="stylesheet" href="../animations/transitions.css" />' : ''}
</head>
<body>
  <header class="harness-header">
    <h1>DevClone · Visual Harness (Modo 2)</h1>
    <p>DNA visual extraído de ${esc(startUrl)} — laboratório de referência, não é o site clonado. Ver <code>DESIGN-SYSTEM.md</code>.</p>
  </header>

  <section class="section">
    <h2>Paleta de cores</h2>
    <div class="swatches">${paletteSwatches || '<p>Nenhuma cor dominante identificada.</p>'}</div>
  </section>

  <section class="section">
    <h2>Tipografia</h2>
    <div>${typeRows || '<p>Nenhuma escala tipográfica identificada.</p>'}</div>
  </section>

  <section class="section">
    <h2>Espaçamento</h2>
    <div class="token-list">
        ${spacingChips}
    </div>
  </section>

  <section class="section">
    <h2>Border-radius e sombras</h2>
    <div class="token-list">
        ${radiusChips}
        ${shadowChips}
    </div>
  </section>

  <section class="section">
    <h2>Botões</h2>
    <div class="row">
      <button class="btn btn--primary">Botão primário</button>
      <button class="btn btn--secondary">Botão secundário</button>
      <button class="btn btn--primary" disabled style="opacity:.5;cursor:not-allowed;">Desabilitado</button>
    </div>
  </section>

  <section class="section">
    <h2>Inputs</h2>
    <div class="row">
      <div class="field">
        <label for="h-name">Nome</label>
        <input id="h-name" type="text" placeholder="Digite algo…" />
      </div>
      <div class="field">
        <label for="h-select">Seleção</label>
        <select id="h-select"><option>Opção 1</option><option>Opção 2</option></select>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>Cards</h2>
    <div class="cards">${cardsHtml}</div>
  </section>

  <section class="section">
    <h2>Navegação</h2>
    <nav class="nav-demo">
      <a href="#">Início</a>
      <a href="#">Produto</a>
      <a href="#">Sobre</a>
      <a href="#">Contato</a>
    </nav>
  </section>

  <section class="section">
    <h2>Animações/interações reais${hasAnimFiles ? '' : ' (nenhuma extraída)'}</h2>
    <div class="cards">
      <div class="card demo-reveal${kfNames.length ? ' use-keyframe' : ''}">
        <h3>Reveal ao rolar</h3>
        <p>${kfNames.length ? `Usa o @keyframes real \`${esc(kfNames[0])}\` extraído do site original.` : 'Nenhum @keyframes extraído — transição genérica de fade/translate aplicada via IntersectionObserver.'}</p>
      </div>
      <div class="card demo-reveal">
        <h3>Fade + translate</h3>
        <p>Reveal com transition (opacity/transform) ao entrar na viewport.</p>
      </div>
    </div>
  </section>

  <footer class="harness-footer">Gerado por DevClone (Modo 2 · Visual Harness) — laboratório de referência, não é o site original.</footer>

  <script src="harness.js"></script>
</body>
</html>
`;

  // ---------------------------------------------------------------- JS
  const jsLines = [];
  jsLines.push("'use strict';");
  jsLines.push('// harness/harness.js — interações do laboratório visual (reveal ao rolar,');
  jsLines.push('// clique-para-copiar nos tokens). Não depende de bibliotecas externas.');
  jsLines.push('(function () {');
  jsLines.push('  var els = document.querySelectorAll(".demo-reveal");');
  jsLines.push('  if ("IntersectionObserver" in window) {');
  jsLines.push('    var io = new IntersectionObserver(function (entries) {');
  jsLines.push('      entries.forEach(function (entry) {');
  jsLines.push('        if (entry.isIntersecting) entry.target.classList.add("is-visible");');
  jsLines.push('      });');
  jsLines.push('    }, { threshold: 0.2 });');
  jsLines.push('    els.forEach(function (el) { io.observe(el); });');
  jsLines.push('  } else {');
  jsLines.push('    els.forEach(function (el) { el.classList.add("is-visible"); });');
  jsLines.push('  }');
  jsLines.push('  document.querySelectorAll(".swatch code, .chip").forEach(function (el) {');
  jsLines.push('    el.style.cursor = "pointer";');
  jsLines.push('    el.title = "Clique para copiar";');
  jsLines.push('    el.addEventListener("click", function () {');
  jsLines.push('      var text = el.textContent.trim();');
  jsLines.push('      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});');
  jsLines.push('      var prev = el.textContent;');
  jsLines.push('      el.textContent = "copiado!";');
  jsLines.push('      setTimeout(function () { el.textContent = prev; }, 900);');
  jsLines.push('    });');
  jsLines.push('  });');
  jsLines.push('})();');

  return [
    { name: 'harness/index.html', data: encoder.encode(html) },
    { name: 'harness/harness.css', data: encoder.encode(cssLines.join('\n')) },
    { name: 'harness/harness.js', data: encoder.encode(jsLines.join('\n')) },
  ];
}

export function buildHarnessReadme(meta, startUrl, extraction) {
  const L = [];
  L.push('# DevClone — Modo 2 · Visual Harness (DNA visual)');
  L.push('');
  L.push(`- **Origem:** ${startUrl}`);
  L.push(`- **Gerado em:** ${new Date().toISOString()}`);
  L.push('');
  L.push('## O que é este pacote');
  L.push('');
  L.push('Este pacote NÃO é um clone do site. Ele contém o **sistema visual e');
  L.push('interativo** extraído do site de origem, para servir de base a um novo');
  L.push('projeto — sem carregar o conteúdo, as páginas ou os textos originais.');
  L.push('');
  L.push('## Estrutura');
  L.push('```');
  L.push('/DESIGN-SYSTEM.md      documentação técnica com valores concretos (cores,');
  L.push('                       tipografia, espaçamento, radius, sombras, botões,');
  L.push('                       inputs, cards, navegação, grid, breakpoints)');
  L.push('/ANIMACOES.md          sumário das animações/interações reais extraídas');
  L.push('/animations/           código real: keyframes.css, transitions.css, interactions.js');
  L.push('/harness/              laboratório visual navegável (abra ABRIR-SITE.cmd/.command)');
  L.push('```');
  L.push('');
  L.push('## Como usar');
  L.push('1. Extraia o ZIP e abra `ABRIR-SITE.cmd` (Windows) ou `ABRIR-SITE.command` (macOS).');
  L.push('   O harness abre automaticamente no navegador via servidor local.');
  L.push('2. Leia `DESIGN-SYSTEM.md` para os valores concretos do sistema visual.');
  L.push('3. Leia `ANIMACOES.md` e use os arquivos em `animations/` para reaproveitar');
  L.push('   as animações/interações reais em um novo projeto.');
  L.push('4. Para reconstruir um SITE NOVO com essa identidade, anexe este .zip numa');
  L.push('   IA (Claude, ChatGPT, Cursor etc.) e peça para seguir o `DESIGN-SYSTEM.md`');
  L.push('   como guia de estilo — não peça para "recriar o site", pois o conteúdo');
  L.push('   original não está neste pacote.');
  L.push('');
  return L.join('\n');
}
```

### vendor/content.js

```javascript
/**
 * content.js — roda dentro da pagina (injetado via page.addScriptTag).
 * Responsabilidades:
 *  1) 'collect'  -> varre o DOM, devolve lista de assets + metadados p/ a IA.
 *  2) 'rewrite'  -> recebe o mapa (urlAbsoluta -> caminhoLocal) e devolve o HTML final.
 * Cópia byte-a-byte do content.js da extensão Chrome — não depende de
 * chrome.runtime para funcionar, então roda igual dentro ou fora dela.
 */

(() => {
  if (window.__devcloneLoaded) return;
  window.__devcloneLoaded = true;

  const abs = (url) => {
    try { return new URL(url, document.baseURI).href; } catch { return null; }
  };

  // Extrai todas as URLs de um valor CSS (url(...) e image-set)
  function urlsFromCss(text) {
    const out = [];
    if (!text) return out;
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let m;
    while ((m = re.exec(text))) {
      const u = m[2].trim();
      if (u && !u.startsWith('data:') && !u.startsWith('blob:')) out.push(u);
    }
    return out;
  }

  // Expande srcset -> [urls]
  function urlsFromSrcset(srcset) {
    if (!srcset) return [];
    return srcset.split(',')
      .map((s) => s.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Rola a pagina em passos para disparar lazy-load de imagens, videos e animacoes,
  // forca o carregamento de videos, e volta ao topo.
  async function primePage() {
    try {
      const vh = window.innerHeight || 800;
      const fullH = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
      if (fullH > vh * 1.15) {
        const step = Math.max(vh * 0.85, 400);
        const max = Math.min(fullH, vh * 50); // limite de seguranca
        for (let y = 0; y < max; y += step) {
          window.scrollTo(0, y);
          await sleep(110);
        }
        window.scrollTo(0, 0);
        await sleep(220);
      }
      // forca metadados/poster de videos
      document.querySelectorAll('video').forEach((v) => {
        try { v.preload = 'auto'; v.load && v.load(); } catch {}
      });
      await sleep(150);
    } catch {}
  }

  // ---------------------------------------------------------------- COLLECT
  async function collect(options = {}) {
    if (options.prime !== false) await primePage();
    const assets = new Map(); // url -> kind
    const add = (rawUrl, kind) => {
      const u = abs(rawUrl);
      if (!u) return;
      if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('javascript:')) return;
      // primeiro kind "vence", mas icon/font/css/js tem prioridade sobre 'img'
      if (!assets.has(u)) assets.set(u, kind);
    };

    // CSS linkado
    document.querySelectorAll('link[rel~="stylesheet"i][href]').forEach((l) => add(l.href, 'css'));
    // Icones / manifest
    document.querySelectorAll('link[rel~="icon"i][href], link[rel="apple-touch-icon"i][href], link[rel="mask-icon"i][href], link[rel="manifest"i][href]').forEach((l) => add(l.href, 'icon'));
    // preload de fontes/imagens
    document.querySelectorAll('link[rel="preload"i][href]').forEach((l) => {
      const as = (l.getAttribute('as') || '').toLowerCase();
      if (as === 'font') add(l.href, 'font');
      else if (as === 'image') add(l.href, 'img');
      else if (as === 'style') add(l.href, 'css');
      else if (as === 'script') add(l.href, 'js');
    });

    // Scripts externos
    document.querySelectorAll('script[src]').forEach((s) => add(s.src, 'js'));

    // Imagens
    document.querySelectorAll('img').forEach((img) => {
      if (img.currentSrc) add(img.currentSrc, 'img');
      if (img.getAttribute('src')) add(img.getAttribute('src'), 'img');
      urlsFromSrcset(img.getAttribute('srcset')).forEach((u) => add(u, 'img'));
    });
    document.querySelectorAll('picture source, source[srcset]').forEach((s) => {
      urlsFromSrcset(s.getAttribute('srcset')).forEach((u) => add(u, 'img'));
      if (s.getAttribute('src')) add(s.getAttribute('src'), 'media');
    });

    // Video / audio
    document.querySelectorAll('video, audio').forEach((v) => {
      if (v.getAttribute('src')) add(v.getAttribute('src'), 'media');
      if (v.getAttribute('poster')) add(v.getAttribute('poster'), 'img');
    });
    document.querySelectorAll('video source[src], audio source[src]').forEach((s) => add(s.getAttribute('src'), 'media'));

    // <object>, <embed>, <track>
    document.querySelectorAll('object[data]').forEach((o) => add(o.getAttribute('data'), 'media'));
    document.querySelectorAll('embed[src]').forEach((e) => add(e.getAttribute('src'), 'media'));
    document.querySelectorAll('track[src]').forEach((t) => add(t.getAttribute('src'), 'media'));

    // <use href> de SVG externo
    document.querySelectorAll('use[href], use[*|href]').forEach((u) => {
      const h = u.getAttribute('href') || u.getAttribute('xlink:href');
      if (h && !h.startsWith('#')) add(h.split('#')[0], 'img');
    });

    // Video: fonte efetivamente tocando (currentSrc) + preload
    document.querySelectorAll('video').forEach((v) => {
      if (v.currentSrc) add(v.currentSrc, 'media');
    });

    // Animacoes Lottie / players declarativos
    document.querySelectorAll('lottie-player[src], dotlottie-player[src], [data-animation-path], [data-lottie], [data-src$=".json"], [data-src$=".lottie"]').forEach((el) => {
      const src = el.getAttribute('src') || el.getAttribute('data-animation-path') || el.getAttribute('data-lottie') || el.getAttribute('data-src');
      if (src) add(src, 'anim');
    });

    // Lazy-load: atributos data-* comuns (imagens, videos, backgrounds)
    const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-image', 'data-poster', 'data-video', 'data-thumb'];
    const LAZY_SRCSET = ['data-srcset', 'data-lazy-srcset'];
    const LAZY_BG = ['data-bg', 'data-background', 'data-background-image'];
    document.querySelectorAll(
      LAZY_ATTRS.concat(LAZY_SRCSET, LAZY_BG).map((a) => `[${a}]`).join(',')
    ).forEach((el) => {
      LAZY_ATTRS.forEach((a) => { if (el.hasAttribute(a)) add(el.getAttribute(a), 'asset'); });
      LAZY_SRCSET.forEach((a) => { if (el.hasAttribute(a)) urlsFromSrcset(el.getAttribute(a)).forEach((u) => add(u, 'img')); });
      LAZY_BG.forEach((a) => {
        if (el.hasAttribute(a)) {
          const v = el.getAttribute(a);
          const inUrl = urlsFromCss(v);
          if (inUrl.length) inUrl.forEach((u) => add(u, 'asset'));
          else add(v, 'asset');
        }
      });
    });

    // url() em <style> inline
    document.querySelectorAll('style').forEach((st) => {
      urlsFromCss(st.textContent).forEach((u) => add(u, 'asset'));
    });

    // url() em atributos style=""
    document.querySelectorAll('[style]').forEach((el) => {
      urlsFromCss(el.getAttribute('style')).forEach((u) => add(u, 'asset'));
    });

    // Folhas same-origin acessiveis: capta url() das regras (cross-origin lanca e ignoramos)
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (rule.style && rule.style.cssText) urlsFromCss(rule.style.cssText).forEach((u) => add(u, 'asset'));
        if (rule.cssText && /@font-face/i.test(rule.cssText)) urlsFromCss(rule.cssText).forEach((u) => add(u, 'font'));
      }
    }

    return {
      pageUrl: location.href,
      title: document.title || '',
      assets: Array.from(assets, ([url, kind]) => ({ url, kind })),
      meta: buildMeta(),
    };
  }

  // ---------------------------------------------------------------- META (p/ IA)
  function buildMeta() {
    const pick = (sel) => document.querySelector(sel);
    const desc = pick('meta[name="description"]');
    const vp = pick('meta[name="viewport"]');

    // paleta: amostra cores computadas de elementos-chave
    const colorSet = new Map();
    const bump = (c) => {
      if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return;
      colorSet.set(c, (colorSet.get(c) || 0) + 1);
    };
    const sampleEls = document.querySelectorAll('body, header, nav, main, footer, section, h1, h2, h3, a, button, p');
    let count = 0;
    for (const el of sampleEls) {
      if (count++ > 400) break;
      const cs = getComputedStyle(el);
      bump(cs.color);
      bump(cs.backgroundColor);
    }
    const palette = Array.from(colorSet.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c);

    // fontes
    const fonts = new Set();
    let fcount = 0;
    for (const el of document.querySelectorAll('body, h1, h2, h3, p, a, button, span')) {
      if (fcount++ > 200) break;
      const ff = getComputedStyle(el).fontFamily;
      if (ff) fonts.add(ff.split(',')[0].replace(/["']/g, '').trim());
    }

    // estrutura de secoes (landmarks + headings)
    const sections = [];
    document.querySelectorAll('header, nav, main, section, aside, footer, [role="banner"], [role="navigation"], [role="main"], [role="contentinfo"]').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const heading = el.querySelector('h1, h2, h3');
      const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 3).join(' ');
      sections.push({
        tag,
        label: heading ? heading.textContent.trim().slice(0, 80) : '',
        cls: cls.slice(0, 80),
        childBlocks: el.children.length,
      });
    });

    // headings (outline)
    const headings = [];
    document.querySelectorAll('h1, h2, h3').forEach((h) => {
      headings.push({ level: h.tagName.toLowerCase(), text: h.textContent.trim().slice(0, 100) });
    });

    // @media breakpoints (same-origin apenas)
    const breakpoints = new Set();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const r of Array.from(rules)) {
        if (r.media && r.media.mediaText) {
          const mm = r.media.mediaText.match(/\d+px/g);
          if (mm) mm.forEach((x) => breakpoints.add(x));
        }
      }
    }

    return {
      title: document.title || '',
      description: desc ? desc.getAttribute('content') : '',
      viewport: vp ? vp.getAttribute('content') : '',
      lang: document.documentElement.getAttribute('lang') || '',
      palette,
      fonts: Array.from(fonts).slice(0, 12),
      sections: sections.slice(0, 40),
      headings: headings.slice(0, 60),
      breakpoints: Array.from(breakpoints).sort((a, b) => parseInt(a) - parseInt(b)),
      counts: {
        images: document.images.length,
        links: document.links.length,
        scripts: document.scripts.length,
        forms: document.forms.length,
      },
    };
  }

  // ---------------------------------------------------------------- REWRITE
  // pathMap: { urlAbsoluta: 'css/arquivo.css' } (caminho relativo a raiz do zip)
  function rewrite(pathMap, options = {}) {
    // IMPORTANTE: nao usar cloneNode do DOM vivo. Ao trocar o src de um <img>/<video>
    // clonado, o navegador tenta carregar o novo caminho na hora, resolvendo o caminho
    // local ("assets/img/...") contra a URL do site -> centenas de 404 fantasma no
    // console. Um documento criado por DOMParser e INERTE: mexer em src/href nao
    // dispara nenhuma requisicao de rede.
    let doc;
    try {
      const serialized = options.sourceHtml || document.documentElement.outerHTML;
      const parsed = new DOMParser().parseFromString(serialized, 'text/html');
      doc = parsed.documentElement;
    } catch {
      doc = document.documentElement.cloneNode(true); // fallback seguro
    }

    const sourceBase = options.pageUrl || document.baseURI;
    const resolveSourceUrl = (rawUrl) => {
      try { return new URL(rawUrl, sourceBase).href; } catch { return null; }
    };

    const mapUrl = (rawUrl) => {
      const u = resolveSourceUrl(rawUrl);
      if (u && pathMap[u]) return pathMap[u];
      return null;
    };

    const rewriteSrcset = (val) => {
      if (!val) return val;
      return val.split(',').map((part) => {
        const seg = part.trim();
        const sp = seg.split(/\s+/);
        const mapped = mapUrl(sp[0]);
        if (mapped) sp[0] = mapped;
        return sp.join(' ');
      }).join(', ');
    };

    const rewriteCssText = (text) => {
      if (!text) return text;
      return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, u) => {
        if (u.startsWith('data:') || u.startsWith('blob:')) return full;
        const mapped = mapUrl(u);
        return mapped ? `url("${mapped}")` : full;
      });
    };

    // href/src simples
    doc.querySelectorAll('[href], [src], [data], [poster]').forEach((el) => {
      ['href', 'src', 'data', 'poster'].forEach((attr) => {
        if (!el.hasAttribute(attr)) return;
        const mapped = mapUrl(el.getAttribute(attr));
        if (mapped) el.setAttribute(attr, mapped);
      });
    });
    // srcset
    doc.querySelectorAll('[srcset]').forEach((el) => {
      el.setAttribute('srcset', rewriteSrcset(el.getAttribute('srcset')));
    });
    // <use href>
    doc.querySelectorAll('use').forEach((u) => {
      const h = u.getAttribute('href') || u.getAttribute('xlink:href');
      if (h && !h.startsWith('#')) {
        const [base, frag] = h.split('#');
        const mapped = mapUrl(base);
        if (mapped) {
          const nv = frag ? `${mapped}#${frag}` : mapped;
          if (u.hasAttribute('href')) u.setAttribute('href', nv);
          if (u.hasAttribute('xlink:href')) u.setAttribute('xlink:href', nv);
        }
      }
    });
    // <style> inline
    doc.querySelectorAll('style').forEach((st) => { st.textContent = rewriteCssText(st.textContent); });
    // style="" inline
    doc.querySelectorAll('[style]').forEach((el) => {
      el.setAttribute('style', rewriteCssText(el.getAttribute('style')));
    });

    // Lazy-load: mapeia data-* e ativa o src real para funcionar offline
    const LAZY_SINGLE = ['data-src', 'data-lazy-src', 'data-original', 'data-image', 'data-video', 'data-thumb'];
    doc.querySelectorAll(LAZY_SINGLE.map((a) => `[${a}]`).join(',')).forEach((el) => {
      for (const a of LAZY_SINGLE) {
        if (!el.hasAttribute(a)) continue;
        const mapped = mapUrl(el.getAttribute(a));
        if (mapped) {
          el.setAttribute(a, mapped);
          if (!el.getAttribute('src')) el.setAttribute('src', mapped);
        }
      }
    });
    doc.querySelectorAll('[data-srcset], [data-lazy-srcset]').forEach((el) => {
      ['data-srcset', 'data-lazy-srcset'].forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const rw = rewriteSrcset(el.getAttribute(a));
        el.setAttribute(a, rw);
        if (!el.getAttribute('srcset')) el.setAttribute('srcset', rw);
      });
    });
    doc.querySelectorAll('[data-bg], [data-background], [data-background-image]').forEach((el) => {
      ['data-bg', 'data-background', 'data-background-image'].forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const raw = el.getAttribute(a);
        const urls = rewriteCssText(/url\(/i.test(raw) ? raw : `url(${raw})`);
        el.setAttribute(a, urls);
        const cur = el.getAttribute('style') || '';
        if (!/background/i.test(cur)) el.setAttribute('style', `${cur};background-image:${urls}`.replace(/^;/, ''));
      });
    });
    // Lottie / players declarativos
    doc.querySelectorAll('lottie-player, dotlottie-player, [data-animation-path], [data-lottie]').forEach((el) => {
      ['src', 'data-animation-path', 'data-lottie'].forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const mapped = mapUrl(el.getAttribute(a));
        if (mapped) el.setAttribute(a, mapped);
      });
    });

    // Remove integrity/crossorigin que quebrariam o carregamento offline
    doc.querySelectorAll('[integrity]').forEach((el) => el.removeAttribute('integrity'));
    doc.querySelectorAll('link[crossorigin], script[crossorigin]').forEach((el) => el.removeAttribute('crossorigin'));

    // CSP e <base> da origem impedem scripts e caminhos locais no clone.
    doc.querySelectorAll('meta[http-equiv="Content-Security-Policy" i], base').forEach((el) => el.remove());

    // Residuos comuns injetados por outras extensoes. No modo de captura pela
    // resposta original eles nem existem; esta limpeza protege o fallback DOM.
    doc.querySelectorAll([
      'mozbar-toolbar', 'grammarly-desktop-integration',
      '#html-to-elementor-content-root', '[data-wxt-shadow-root]',
      '[data-lastpass-icon-root]', '[data-1password-root]',
    ].join(',')).forEach((el) => el.remove());
    doc.querySelectorAll('style').forEach((st) => {
      const t = st.textContent || '';
      if (/imageye-selected|mozbar-toolbar|html-to-elementor-content-root/i.test(t)) st.remove();
    });

    // Remapeia requisicoes criadas em runtime (fetch/XHR/Worker), caso bibliotecas
    // como Rive e WebAssembly montem a URL depois que o HTML ja carregou.
    const runtimeMap = {};
    for (const [url, local] of Object.entries(pathMap || {})) {
      if (/^https?:/i.test(url) && local) runtimeMap[url.split('#')[0]] = local;
    }
    if (Object.keys(runtimeMap).length) {
      const script = doc.ownerDocument.createElement('script');
      script.setAttribute('data-devclone-runtime-map', '');
      const mapJson = JSON.stringify(runtimeMap).replace(/</g, '\\u003c');
      const baseJson = JSON.stringify(sourceBase).replace(/</g, '\\u003c');
      script.textContent = `(function(M,B){
        function key(v){try{return new URL(String(v),B).href.split('#')[0]}catch(e){return String(v)}}
        function local(v){return M[key(v)]||v}
        if(window.fetch){var F=window.fetch;window.fetch=function(input,init){try{if(input instanceof Request){var m=local(input.url);if(m!==input.url)input=new Request(m,input)}else input=local(input)}catch(e){}return F.call(this,input,init)}}
        if(window.XMLHttpRequest){var O=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){arguments[1]=local(url);return O.apply(this,arguments)}}
        if(window.Worker){var W=window.Worker;var SW=function(url,opts){return new W(local(url),opts)};SW.prototype=W.prototype;window.Worker=SW}
        function patch(P,n){try{var d=Object.getOwnPropertyDescriptor(P,n);if(!d||!d.set)return;Object.defineProperty(P,n,{configurable:d.configurable,enumerable:d.enumerable,get:d.get,set:function(v){return d.set.call(this,local(v))}})}catch(e){}}
        if(window.HTMLImageElement)patch(HTMLImageElement.prototype,'src');
        if(window.HTMLMediaElement)patch(HTMLMediaElement.prototype,'src');
        if(window.HTMLSourceElement)patch(HTMLSourceElement.prototype,'src');
        window.__DEVCLONE_ASSET_MAP__=M;
      })(${mapJson},${baseJson});`;
      const head = doc.querySelector('head') || doc;
      head.insertBefore(script, head.firstChild);
    }

    const remainingRemote = Array.from(doc.querySelectorAll(
      'script[src],link[rel~="stylesheet" i][href],img[src],source[src],video[src],audio[src],object[data],embed[src]'
    )).map((el) => el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data'))
      .filter((u) => /^(https?:)?\/\//i.test(u || ''));

    const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}>\n` : '<!DOCTYPE html>\n';
    return {
      html: doctype + doc.outerHTML,
      remainingRemote: Array.from(new Set(remainingRemote)),
      stats: {
        source: options.sourceHtml ? 'network-original' : 'rendered-dom-fallback',
        runtimeMappings: Object.keys(runtimeMap).length,
      },
    };
  }

  // ---------------------------------------------------------------- STACK (via DOM)
  function detectStackDOM() {
    const found = new Set();
    const html = document.documentElement;
    const genMeta = document.querySelector('meta[name="generator"]');
    const gen = (genMeta ? genMeta.getAttribute('content') || '' : '').toLowerCase();
    const q = (sel) => { try { return document.querySelector(sel); } catch { return null; } };
    const scripts = Array.from(document.scripts).map((s) => (s.src || '').toLowerCase());
    const links = Array.from(document.querySelectorAll('link[href]')).map((l) => (l.href || '').toLowerCase());
    const allSrc = scripts.concat(links);
    const srcHas = (kw) => allSrc.some((u) => u.includes(kw));

    // Frameworks JS
    if (q('#__next') || q('script#__NEXT_DATA__')) found.add('Next.js');
    if (q('[data-reactroot]') || q('[data-reactid]') || found.has('Next.js')) found.add('React');
    if (q('#__nuxt') || q('[data-nuxt]') || gen.includes('nuxt')) { found.add('Nuxt'); found.add('Vue'); }
    if (q('[data-v-app]') || q('[data-server-rendered]')) found.add('Vue');
    if (q('[ng-version]')) found.add('Angular');
    if (q('astro-island') || q('[data-astro-cid]')) found.add('Astro');
    if (q('[x-data]') || q('[x-show]')) found.add('Alpine.js');
    if (Array.from(document.querySelectorAll('[class]')).slice(0, 400)
      .some((el) => /(^|\s)svelte-[a-z0-9]{4,}/.test(String(el.className)))) found.add('Svelte');

    // Builders / CMS
    if (gen.includes('wordpress') || srcHas('/wp-content/') || srcHas('/wp-includes/')) found.add('WordPress');
    if (q('[data-elementor-type]') || q('.elementor')) found.add('Elementor');
    if (gen.includes('webflow') || html.classList.contains('w-mod-js') || q('[data-wf-page]') || q('[data-wf-site]')) found.add('Webflow');
    if (gen.includes('framer') || q('[data-framer-name]') || srcHas('framerusercontent') || q('#__framer-badge-container')) found.add('Framer');
    if (gen.includes('wix') || srcHas('parastorage') || q('#SITE_CONTAINER')) found.add('Wix');
    if (gen.includes('squarespace') || srcHas('squarespace') || q('.sqs-block')) found.add('Squarespace');
    if (srcHas('cdn.shopify') || srcHas('cdn.shopifycdn') || q('[data-shopify]')) found.add('Shopify');

    // CSS
    let tw = false;
    for (const st of document.querySelectorAll('style')) { if (/--tw-/.test(st.textContent || '')) { tw = true; break; } }
    if (!tw && srcHas('tailwind')) tw = true;
    if (tw) found.add('Tailwind CSS');
    if (srcHas('bootstrap')) found.add('Bootstrap');

    // Bibliotecas de animacao / util
    if (srcHas('gsap') || srcHas('tweenmax') || srcHas('tweenlite')) found.add('GSAP');
    if (srcHas('jquery')) found.add('jQuery');
    if (srcHas('swiper') || q('.swiper-wrapper')) found.add('Swiper');
    if (srcHas('three.min') || srcHas('/three.') || srcHas('three.module')) found.add('Three.js');
    if (srcHas('lottie') || srcHas('bodymovin') || q('lottie-player') || q('dotlottie-player')) found.add('Lottie');
    if (srcHas('rive') || q('[data-rive-file]') || q('[data-rive-object]') || q('[data-rive-primary]')) found.add('Rive');
    if (q('canvas[data-engine*="three" i]') || q('[data-gl]')) found.add('Three.js');
    if (html.classList.contains('lenis') || q('[data-lenis-prevent]')) found.add('Lenis');
    if (srcHas('aos.js') || q('[data-aos]')) found.add('AOS');
    if (srcHas('locomotive') || q('[data-scroll-container]')) found.add('Locomotive Scroll');
    if (srcHas('barba')) found.add('Barba.js');
    if (srcHas('scrollmagic')) found.add('ScrollMagic');

    return Array.from(found);
  }

  // ---------------------------------------------------------------- MSG BRIDGE
  // Um único dispatcher serve tanto o content script normal quanto a bridge CDP.
  async function dispatchDevCloneMessage(msg) {
    try {
      if (!msg || typeof msg.action !== 'string') return { ok: false, ignored: true };
      if (msg.action === 'collect') return { ok: true, data: await collect(msg.options || {}) };
      if (msg.action === 'prime') { await primePage(); return { ok: true }; }
      if (msg.action === 'rewrite') {
        const result = rewrite(msg.pathMap || {}, msg.options || {});
        return { ok: true, ...result };
      }
      if (msg.action === 'domStack') return { ok: true, stack: detectStackDOM() };
      if (msg.action === 'ping') return { ok: true };
      return { ok: false, ignored: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  // Quando este source é executado via CDP ele roda no mundo da própria página.
  // Assim o background le e reescreve sem tabs.sendMessage e sem host access.
  try {
    Object.defineProperty(window, '__devclonePageBridge', {
      value: dispatchDevCloneMessage,
      configurable: true,
      writable: false,
      enumerable: false,
    });
  } catch {
    try { window.__devclonePageBridge = dispatchDevCloneMessage; } catch {}
  }

  // Mantém somente respostas síncronas no canal runtime (contexto de extensão,
  // quando presente; fora da extensão este bloco simplesmente não roda).
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        const action = msg && msg.action;
        if (!['rewrite', 'domStack', 'ping'].includes(action)) return false;
        if (action === 'ping') { sendResponse({ ok: true }); return false; }
        if (action === 'domStack') {
          try { sendResponse({ ok: true, stack: detectStackDOM() }); }
          catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
          return false;
        }
        try { sendResponse({ ok: true, ...rewrite(msg.pathMap || {}, msg.options || {}) }); }
        catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        return false;
      });
    }
  } catch {}
})();
```
