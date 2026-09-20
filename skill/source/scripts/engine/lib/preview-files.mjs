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

const HOW_TO_OPEN = `DEVCLONE - COMO ABRIR O PACOTE
=====================================

Para obter o funcionamento completo (clone completo ou harness visual),
utilize o launcher correspondente ao seu sistema operacional.

WINDOWS
-------
1. Extraia todo o conteudo do ZIP para uma pasta.
2. Abra a pasta extraida.
3. De dois cliques em:
   ABRIR-SITE.cmd
4. O navegador sera aberto automaticamente.
5. Mantenha a janela do servidor aberta enquanto estiver usando o pacote.
6. Para encerrar, feche a janela do servidor ou pressione Ctrl+C.

MACOS
-----
1. Extraia todo o conteudo do ZIP para uma pasta.
2. Abra a pasta extraida.
3. De dois cliques em:
   ABRIR-SITE.command
4. Caso o macOS peca confirmacao de seguranca na primeira execucao:
   - Clique com o botao direito no arquivo ABRIR-SITE.command e selecione "Abrir";
   - Ou abra o Terminal na pasta e digite: chmod +x ABRIR-SITE.command
5. O navegador sera aberto automaticamente.
6. Mantenha o Terminal aberto enquanto estiver usando o pacote.
7. Para encerrar, feche o Terminal ou utilize Ctrl+C.

USO MANUAL
----------
Se voce ja possui o Node.js ou Python instalado e prefere iniciar manualmente pelo terminal:

Com Node.js:
  node servidor-local.js

Com npx:
  npx serve .

Com Python 3:
  python3 -m http.server 3000

POR QUE O DUPLO CLIQUE NO INDEX.HTML NAO E O METODO PRINCIPAL?
-------------------------------------------------------------
Sites modernos utilizam ES Modules, fetch, WebAssembly, Workers, WebGL e fontes que
sao bloqueados pelas politicas de seguranca do navegador quando abertos diretamente
pelo protocolo file://. O servidor local roda 100% no seu computador, de forma segura
e offline.
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
