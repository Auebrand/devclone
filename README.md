# DevClone

## Agent Skill para clonagem e engenharia reversa visual de interfaces

DevClone é uma Agent Skill criada para capturar páginas e sites, reconstruir experiências web localmente e extrair o DNA visual e interativo de interfaces para uso em fluxos de desenvolvimento com IA.

O projeto público é focado na **DevClone Skill**. A distribuição comercial da extensão de navegador é mantida separadamente e não faz parte deste repositório público.

## O que a DevClone Skill faz

A Skill possui dois modos principais.

### 01 — Full Clone

Captura uma página ou site e gera uma versão local funcional.

O pipeline pode trabalhar com:

- HTML renderizado
- CSS
- JavaScript
- imagens
- fontes
- vídeos e áudio
- WebAssembly
- Lottie
- Rive
- GSAP e outras animações detectáveis
- assets 3D
- módulos ES
- recursos carregados dinamicamente

O resultado é empacotado em um `.zip` preparado para execução local.

### 02 — Visual DNA / Visual Harness

Extrai o sistema visual e interativo de uma interface sem entregar o conteúdo completo do site original.

Pode identificar:

- paleta de cores
- tipografia
- escala de tamanhos
- espaçamentos
- containers e grids
- breakpoints
- bordas e arredondamentos
- sombras
- componentes
- botões e estados
- inputs
- navegação
- transições
- animações
- interações observadas

O resultado inclui valores concretos, documentação do Design System, código de animações/interações encontradas e um **Visual Harness funcional**.

## Agent Skill

A DevClone Skill segue o formato de Agent Skills baseado em `SKILL.md` e scripts auxiliares.

Estrutura principal:

```text
skill/
├── devclone.skill
└── source/
    ├── SKILL.md
    ├── claude-web/
    │   └── devclone-SKILL.md
    └── scripts/
        └── engine/
            ├── clone.mjs
            ├── package.json
            ├── lib/
            └── vendor/
```

A Skill pode ser utilizada em ambientes compatíveis com Agent Skills, incluindo fluxos com **Claude Code, Codex, Cursor e Antigravity**, entre outros ambientes compatíveis.

## Instalação pelo repositório

Clone o projeto:

```bash
git clone https://github.com/Auebrand/devclone.git
cd devclone
```

A Skill está em:

```text
skill/source/
```

Para ambientes que utilizam uma pasta local de Skills, copie ou vincule essa pasta para o diretório de Skills utilizado pelo ambiente.

Exemplo de instalação em um diretório de Skills:

```bash
mkdir -p ~/.agents/skills
cp -R skill/source ~/.agents/skills/devclone
```

O caminho exato pode variar conforme o agente/IDE.

## Execução do engine

O engine standalone utiliza Node.js + Playwright.

```bash
cd skill/source/scripts/engine
npm install
npx playwright install chromium
```

Modo 1:

```bash
node clone.mjs https://example.com --mode full
```

Modo 2:

```bash
node clone.mjs https://example.com --mode harness
```

## Arquitetura

```text
DevClone
└── Agent Skill
    ├── SKILL.md
    ├── Portable Skill Artifact
    └── Node.js + Playwright Engine
        ├── Mode 1 — Full Clone
        └── Mode 2 — Visual DNA / Harness
```

O engine é modular e possui componentes para captura via CDP/Playwright, resolução de assets, análise de stack, extração de Design System, análise de animações, construção do Harness, relatórios, preview e empacotamento.

## Privacidade e execução local

O projeto foi desenvolvido para processamento local:

- sem conta obrigatória;
- sem telemetria proprietária;
- sem backend proprietário obrigatório;
- captura diretamente a página alvo a partir do ambiente de execução;
- processamento e empacotamento acontecem localmente.

Sites com mecanismos de proteção, autenticação, CSP ou bloqueios anti-bot podem limitar o que pode ser capturado.

## Estrutura do repositório

```text
DEVCLONE/
├── skill/
│   ├── devclone.skill
│   └── source/
├── docs/
├── README.md
├── LICENSE
└── .gitignore
```

## Comunidade

[DevClone on ClaudeMarket](https://claudemarket.ai/)

## Licença

DevClone é distribuído sob uma licença Source-Available.

**Free to use. Not free to resell.**

Consulte o arquivo [LICENSE](LICENSE) para os termos completos.

## GitHub

[https://github.com/Auebrand/devclone](https://github.com/Auebrand/devclone)