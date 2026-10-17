#!/usr/bin/env node
/**
 * sync-mcp.mjs — genera la configuración MCP de cada cliente desde una fuente única.
 *
 * Fuente canónica: .agents/mcp/servers.json (ADR-092). Deriva:
 *   - .mcp.json                     (Claude Code; archivo completo)
 *   - .opencode/opencode.json → mcp (OpenCode; solo esa clave, el resto se preserva)
 *
 * Cada servidor declara `clients` y exactamente uno de: `package` (npm, vía pnpm dlx),
 * `command` (argv literal) o `url` (+ `headers`). `{env:VAR}` es la referencia a una
 * variable de entorno; Claude Code la recibe como `${VAR}`.
 *
 * Opcionales solo OpenCode (forma nativa V2 `mcp.servers`; Claude Code los ignora):
 * `timeout` (objeto { startup?, catalog?, execution? } en ms, enteros positivos) y
 * `oauth: false` (solo remoto con header propio, sin discovery OAuth).
 *
 * Claude Code en Windows nativo no resuelve `pnpm.cmd` sin shell: los `package`
 * se lanzan con `cmd /c`. El repo se opera en Windows; el resto de clientes usa argv.
 *
 * Uso: node scripts/sync-mcp.mjs [--check]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import * as prettier from 'prettier';

import { createSurfaceWriter, finish } from './lib/generated-surface.mjs';

const ROOT = join(import.meta.dirname, '..');
const SOURCE = join(ROOT, '.agents', 'mcp', 'servers.json');
const CLAUDE_TARGET = join(ROOT, '.mcp.json');
const OPENCODE_TARGET = join(ROOT, '.opencode', 'opencode.json');
const CLIENTS = new Set(['claude', 'opencode']);

const toClaudeEnv = (value) => value.replace(/\{env:([A-Z0-9_]+)\}/g, '${$1}');

export function validateServer(name, server) {
  const kinds = ['package', 'command', 'url'].filter((key) => key in server);
  if (kinds.length !== 1) {
    throw new Error(`${name}: declara exactamente uno de package, command o url`);
  }
  if (!Array.isArray(server.clients) || server.clients.some((c) => !CLIENTS.has(c))) {
    throw new Error(`${name}: clients debe listar ${[...CLIENTS].join(' / ')}`);
  }
  if (server.package && !/@\d+\.\d+\.\d+$/.test(server.package)) {
    throw new Error(`${name}: package debe fijar una versión exacta (pkg@x.y.z)`);
  }
  if (server.timeout !== undefined) {
    const entries = Object.entries(server.timeout);
    const valid = ['startup', 'catalog', 'execution'];
    if (
      typeof server.timeout !== 'object' ||
      server.timeout === null ||
      entries.length === 0 ||
      entries.some(([key, value]) => !valid.includes(key) || !Number.isInteger(value) || value <= 0)
    ) {
      throw new Error(
        `${name}: timeout debe ser { startup?, catalog?, execution? } en ms enteros positivos`,
      );
    }
  }
  if (server.oauth !== undefined && (typeof server.oauth !== 'boolean' || !('url' in server))) {
    throw new Error(`${name}: oauth solo admite booleano en servidor remoto (url)`);
  }
}

export function toClaude(server) {
  if (server.package) {
    return { command: 'cmd', args: ['/c', 'pnpm', 'dlx', server.package] };
  }
  if (server.command) {
    const [command, ...args] = server.command.map(toClaudeEnv);
    return { command, args };
  }
  const headers = Object.fromEntries(
    Object.entries(server.headers ?? {}).map(([key, value]) => [key, toClaudeEnv(value)]),
  );
  return { type: 'http', url: server.url, ...(server.headers ? { headers } : {}) };
}

export function toOpencode(server) {
  const extra = {
    disabled: false,
    ...(server.timeout ? { timeout: server.timeout } : {}),
  };
  if (server.url) {
    return {
      type: 'remote',
      url: server.url,
      ...extra,
      ...(server.headers ? { headers: server.headers } : {}),
      ...(server.oauth !== undefined ? { oauth: server.oauth } : {}),
    };
  }
  const command = server.package ? ['pnpm', 'dlx', server.package] : server.command;
  return { type: 'local', command, ...extra };
}

export function buildClientConfigs(source) {
  const claude = {};
  const opencode = {};
  for (const name of Object.keys(source.servers).sort()) {
    const server = source.servers[name];
    validateServer(name, server);
    if (server.clients.includes('claude')) claude[name] = toClaude(server);
    if (server.clients.includes('opencode')) opencode[name] = toOpencode(server);
  }
  return { claude: { mcpServers: claude }, opencode };
}

async function formatJson(value, filepath) {
  const options = (await prettier.resolveConfig(filepath)) ?? {};
  // Indentado de entrada: Prettier conserva expandidos los objetos multilínea.
  return prettier.format(JSON.stringify(value, null, 2), { ...options, filepath, parser: 'json' });
}

async function main() {
  const check = process.argv.includes('--check');
  const writer = createSurfaceWriter({ root: ROOT, check });
  const { claude, opencode } = buildClientConfigs(JSON.parse(readFileSync(SOURCE, 'utf8')));

  writer.emit(CLAUDE_TARGET, await formatJson(claude, CLAUDE_TARGET));

  const opencodeConfig = JSON.parse(readFileSync(OPENCODE_TARGET, 'utf8'));
  opencodeConfig.mcp = { servers: opencode };
  writer.emit(OPENCODE_TARGET, await formatJson(opencodeConfig, OPENCODE_TARGET));

  finish({
    label: 'sync-mcp',
    check,
    drift: writer.drift,
    fixCommand: 'pnpm sync:mcp',
    summary: `${Object.keys(claude.mcpServers).length} servidores MCP → .mcp.json, ${Object.keys(opencode).length} → .opencode/opencode.json#mcp.servers`,
  });
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  await main();
}
