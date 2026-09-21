---
name: devclone
description: >-
  Use quando o pedido envolver o DevClone — clonar/capturar um site inteiro
  (Modo 1) ou extrair apenas o DNA visual/interativo de um site em um Design
  System + Visual Harness (Modo 2). O engine (Node + Playwright) já existe
  como arquivos reais em scripts/engine/ neste repositório — não precisa ser
  reescrito a cada ativação. Acione ao pedir para clonar/capturar/exportar/
  reconstruir um site, para extrair a identidade visual/design system de um
  site, ou para abrir/inspecionar/validar um .zip já gerado por ele.
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

**Diferente da versão de skill de conta (single-file), aqui o engine já
existe como arquivos reais** em `scripts/engine/` dentro deste repositório
— não precisa ser reescrito no disco a cada ativação. Quando esta skill for
ativada, o comportamento esperado é:

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
3. Rode `cd scripts/engine && npm install` (e, se necessário,
   `npx playwright install chromium`) na primeira vez que a skill for usada
   neste ambiente/clone do repositório.
4. Execute `node clone.mjs <url> --mode full` (Modo 1) ou
   `node clone.mjs <url> --mode harness` (Modo 2), com as demais opções
   pedidas pelo usuário.
5. **Em ambientes com terminal e navegador controláveis** (Claude Code,
   Cursor, Codex, Antigravity e afins) — ver seção "Fluxo automático do
   agente" abaixo — não pare depois de gerar o `.zip`: extraia, suba o
   servidor local, abra a prévia no navegador, valide visualmente, e só
   **depois** pergunte ao usuário se quer salvar/exportar o `.zip` em algum
   lugar específico.
6. Em ambientes sem esse controle, entregue o `.zip` resultante ao usuário
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

## Instalação

```bash
git clone https://github.com/<usuario>/devclone-skill.git ~/.claude/skills/devclone
# ou por SSH:
git clone git@github.com:<usuario>/devclone-skill.git ~/.claude/skills/devclone
```

Depois, na primeira execução:

```bash
cd ~/.claude/skills/devclone/scripts/engine
npm install
# se necessário:
npx playwright install chromium
```

Nota: se `npm install` + `npx playwright install chromium` não bastarem
porque o ambiente já tem um Chromium pré-instalado em outra versão (erro
`Executable doesn't exist at .../chromium_headless_shell-XXXX/...`), fixe a
versão exata de `playwright` no `package.json` (sem `^`) para casar com o
navegador já disponível no ambiente, em vez de deixar o npm puxar uma
versão mais nova que espera outro build do Chromium.

## Segurança e limites

- Não execute comandos destrutivos (apagar, sobrescrever, forçar push) sem
  autorização explícita do usuário.
- Não altere a lógica do engine (arquivos em `scripts/engine/`) sem que o
  usuário peça explicitamente uma mudança de comportamento.
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
`servidor-local.js`, `servidor-local.ps1`, `PASSO-A-PASSO.txt`), `README.md`,
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

## Estrutura do repositório

```
devclone-skill/
├── SKILL.md                    (este arquivo)
└── scripts/
    └── engine/
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

O conteúdo canônico do engine é o dos arquivos reais em `scripts/engine/`
— não há blocos de código embutidos neste `SKILL.md` (essa versão é para
ambientes com Agent Skills baseadas em arquivo; a versão de skill de conta,
single-file, é uma entrega separada).
