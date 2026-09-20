# DevClone

Extensão para Google Chrome projetada para captura e clonagem completa de páginas e aplicações web diretamente no navegador, gerando pacotes `.zip` autônomos e prontos para execução local.

---

## O que é o DevClone?

O **DevClone** é uma extensão Chrome (Manifest V3) que reconstrói a estrutura visual e interativa de páginas web em tempo de execução. Ao contrário de ferramentas convencionais que apenas salvam o HTML inicial, o DevClone captura os recursos reais carregados e processados pelo navegador — incluindo CSS, JavaScript, imagens, fontes, vídeos, módulos WebAssembly, animações e modelos 3D.

Cada clone é empacotado em um arquivo `.zip` autônomo, acompanhado de servidores locais integrados para inicialização imediata no **macOS** e **Windows**, sem necessidade de instalação manual de dependências.

---

## Principais Recursos

- **Captura Fiel em Tempo de Execução**: Coleta o estado vivo da página e de seus nós no DOM.
- **Captura Avançada via DevTools Protocol (CDP)**: Grava requisições de rede reais, contornando bloqueios de CORS e headers protegidos.
- **Empacotador ZIP Nativo**: Utiliza fluxos nativos de compressão do navegador (`CompressionStream`) sem dependências externas.
- **Detecção de Stack**: Identifica frameworks e bibliotecas (React, Next.js, Vue, Nuxt, Tailwind CSS, GSAP, Three.js, Swiper, etc.).
- **Launchers Multiplataforma**:
  - `ABRIR-SITE.command` para macOS (com fallbacks para Node.js e Python).
  - `ABRIR-SITE.cmd` para Windows (com fallbacks para Node.js e PowerShell).
  - `servidor-local.js` como servidor HTTP embutido para visualização com suporte a ES Modules.
- **Guia para Recriação com IA**: Gera automaticamente um arquivo com o contexto técnico estruturado da página para reprodução em ferramentas de IA.

---

## Como Instalar a Extensão

1. Baixe ou clone este repositório para o seu computador.
2. Abra o Google Chrome e acesse `chrome://extensions`.
3. No canto superior direito, ative a opção **Modo do desenvolvedor**.
4. Clique no botão **Carregar sem compactação** (*Load unpacked*).
5. Selecione a pasta raiz deste projeto (`DEVCLONE`).
6. O ícone do DevClone será exibido na barra de ferramentas do Chrome.

---

## Como Usar

1. Navegue até a página que deseja clonar em uma aba normal do navegador (`http://` ou `https://`).
2. Clique no ícone do **DevClone** para abrir o popup.
3. Escolha as opções de captura:
   - **Escopo**: *Página atual* ou *Site inteiro*.
   - **Guia para recriar com IA**: Ativado (*recomendado*) para incluir documentação técnica da página.
4. Clique em **CLONAR SITE**.
5. Mantenha a aba aberta enquanto o DevClone processa e realiza a captura.
6. O download do arquivo `.zip` iniciará automaticamente ao término.

---

## Como Executar o Clone Gerado

1. Extraia o conteúdo do arquivo `.zip` gerado para uma pasta no seu computador.
2. Inicie a prévia local:
   - **No macOS**: Dê dois cliques em `ABRIR-SITE.command` (ou execute `node servidor-local.js` no terminal).
   - **No Windows**: Dê dois cliques em `ABRIR-SITE.cmd`.
3. O launcher iniciará um servidor HTTP local automaticamente e abrirá o clone no seu navegador padrão.

> **Importante**: Não abra o arquivo `index.html` diretamente via duplo clique (protocolo `file://`), pois navegadores modernos bloqueiam o carregamento de fontes, módulos JavaScript, web workers e requisições assíncronas locais. Sempre utilize o launcher ou um servidor HTTP local.

---

## Estado Atual do Projeto

O DevClone é atualmente uma extensão Chrome totalmente autônoma, sem dependências externas, sem telemetria e sem necessidade de conexão com servidores de autenticação ou licenciamento. Todo o processamento ocorre localmente na máquina do usuário.
