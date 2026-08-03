import { execSync } from 'node:child_process';
import { posix as posixPath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const DEV_PORTS = [3000, 3001, 3002];
const MAX_SWEEPS = 5;
const SWEEP_DELAY_MS = 400;
const repoRoot = process.cwd().replace(/\\/g, '/');
const DEV_PROCESS_MARKERS = [
  { path: `${repoRoot}/apps/api/`, command: 'nest.js start --watch' },
  { path: `${repoRoot}/apps/worker/`, command: 'nest.js start --watch' },
  { path: `${repoRoot}/apps/web/`, command: 'next dev --port 3001' },
  { path: `${repoRoot}/apps/portal/`, command: 'next dev --port 3002' },
];

function parseWindowsPidsFromNetstat(stdout, ports) {
  const pids = new Set();
  const lines = stdout.split(/\r?\n/);

  for (const line of lines) {
    // netstat cambia por idioma del sistema (LISTENING/ESCUCHANDO).
    if (!line.includes('LISTENING') && !line.includes('ESCUCHANDO')) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;

    const localAddress = parts[1] ?? '';
    const pidPart = parts[4] ?? '';
    const maybePort = Number(localAddress.slice(localAddress.lastIndexOf(':') + 1));
    const pid = Number(pidPart);

    if (!Number.isFinite(maybePort) || !ports.includes(maybePort)) continue;
    if (!Number.isFinite(pid) || pid <= 0) continue;

    pids.add(pid);
  }

  return [...pids];
}

function parseWindowsJsonPids(raw) {
  const text = raw.trim();
  if (!text) return [];

  const parsed = JSON.parse(text);
  if (parsed === null || parsed === undefined) return [];
  if (Array.isArray(parsed)) {
    return parsed.map((value) => Number(value)).filter((pid) => Number.isFinite(pid) && pid > 0);
  }

  const one = Number(parsed);
  return Number.isFinite(one) && one > 0 ? [one] : [];
}

function parseUnixPids(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isFinite(pid) && pid > 0);
}

function parseLinuxFuserPids(stdout, port) {
  return stdout
    .replace(`${port}/tcp:`, '')
    .split(/\s+/)
    .map((token) => Number(token.trim()))
    .filter((pid) => Number.isFinite(pid) && pid > 0);
}

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function parsePsEntries(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const matchWithStartIdentity = line.match(
        /^(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)(?:\s+(.*))$/,
      );

      if (matchWithStartIdentity) {
        return {
          pid: Number(matchWithStartIdentity[1]),
          ppid: Number(matchWithStartIdentity[2]),
          startIdentity: matchWithStartIdentity[3],
          command: matchWithStartIdentity[4],
        };
      }

      const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);

      if (!match) {
        return null;
      }

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        command: match[3],
      };
    })
    .filter((entry) => entry && Number.isFinite(entry.pid) && entry.pid > 0);
}

function parseWindowsProcessEntries(raw) {
  const text = raw.trim();
  if (!text) return [];

  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : [parsed];

  return rows
    .map((row) => ({
      pid: Number(row?.pid ?? row?.ProcessId),
      ppid: Number(row?.ppid ?? row?.ParentProcessId),
      startIdentity: String(row?.startIdentity ?? row?.CreationDate ?? '').trim(),
      command: String(row?.command ?? row?.CommandLine ?? '').trim(),
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.pid) &&
        entry.pid > 0 &&
        Number.isFinite(entry.ppid) &&
        entry.ppid >= 0 &&
        entry.command.length > 0,
    );
}

function getUnixProcessTable() {
  const output = execSync('ps -eo pid=,ppid=,lstart=,args=', { encoding: 'utf8' });
  return parsePsEntries(output);
}

function getWindowsProcessTable() {
  const psCommand =
    "$ErrorActionPreference = 'SilentlyContinue'; " +
    "$names = @('node.exe','cmd.exe','powershell.exe','pwsh.exe'); " +
    'Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ' +
    'Where-Object { $_.Name -in $names } | ' +
    "Select-Object @{Name='pid';Expression={$_.ProcessId}},@{Name='ppid';Expression={$_.ParentProcessId}},@{Name='startIdentity';Expression={$_.CreationDate}},@{Name='command';Expression={$_.CommandLine}} | " +
    'ConvertTo-Json -Compress';
  const output = execSync(`powershell -NoProfile -Command "${psCommand}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return parseWindowsProcessEntries(output);
}

export function getProtectedPids(entries, currentPid = process.pid, parentPid = process.ppid) {
  const byPid = new Map(entries.map((entry) => [entry.pid, entry]));
  const protectedPids = new Set([currentPid]);
  let ancestorPid = parentPid;

  while (Number.isFinite(ancestorPid) && ancestorPid > 0 && !protectedPids.has(ancestorPid)) {
    protectedPids.add(ancestorPid);
    ancestorPid = byPid.get(ancestorPid)?.ppid ?? 0;
  }

  return protectedPids;
}

export function normalizeForMatching(value, platform = process.platform) {
  const valueString = String(value);
  if (!valueString) return '';

  const normalized = posixPath.normalize(valueString.replace(/\\/g, '/'));
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function pathOwnsMarker(candidatePath, markerPath, platform) {
  const normalizedCandidatePath = normalizeForMatching(candidatePath, platform);
  const normalizedMarkerPath = normalizeForMatching(markerPath, platform);

  if (!normalizedCandidatePath || !normalizedMarkerPath) return false;

  const markerPrefix = normalizedMarkerPath.endsWith('/')
    ? normalizedMarkerPath
    : `${normalizedMarkerPath}/`;

  return (
    normalizedCandidatePath === normalizedMarkerPath ||
    normalizedCandidatePath.startsWith(markerPrefix)
  );
}

function getCommandTokens(command, { shellEscapes = false } = {}) {
  const tokens = [];
  let token = '';
  let quote = '';
  let tokenStarted = false;
  let ambiguous = false;

  const commandString = String(command ?? '');
  for (let index = 0; index < commandString.length; index += 1) {
    const character = commandString[index];

    if (shellEscapes && character === '\\') {
      const escapedCharacter = commandString[index + 1];
      if (escapedCharacter === undefined) {
        ambiguous = true;
        token += character;
        tokenStarted = true;
        continue;
      }

      // A second backslash can mean either a literal backslash or the start of
      // another escape depending on the shell. Fail closed rather than risk
      // leaving the continuation of a sensitive value in diagnostics.
      if (escapedCharacter === '\\') ambiguous = true;

      token += escapedCharacter;
      tokenStarted = true;
      index += 1;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = '';
      } else {
        token += character;
      }
      tokenStarted = true;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(character)) {
      if (tokenStarted) {
        tokens.push(token);
        token = '';
        tokenStarted = false;
      }
      continue;
    }

    token += character;
    tokenStarted = true;
  }

  if (tokenStarted) tokens.push(token);

  return { tokens, complete: quote === '' && !ambiguous, ambiguous };
}

function getTokenBasename(value) {
  const normalized = String(value ?? '').replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function isNodeExecutable(executable, platform) {
  const normalizedExecutable = normalizeForMatching(executable, platform);
  const executableName = getTokenBasename(normalizedExecutable);

  if (executableName !== 'node' && executableName !== 'node.exe') return false;

  return (
    normalizedExecutable === 'node' ||
    normalizedExecutable === 'node.exe' ||
    normalizedExecutable.startsWith('/') ||
    /^[a-z]:\//i.test(normalizedExecutable)
  );
}

function getStartIdentity(entry) {
  const identity = entry?.startIdentity;
  return identity === undefined || identity === null ? '' : String(identity).trim();
}

function hasStableProcessIdentity(entry) {
  return getStartIdentity(entry).length > 0;
}

export function findRepoWatcherPids(
  entries,
  protectedPids,
  markers = DEV_PROCESS_MARKERS,
  platform = process.platform,
) {
  return entries
    .filter((entry) => !protectedPids.has(entry.pid))
    .filter((entry) =>
      markers.some((marker) => {
        const { tokens: commandTokens, complete } = getCommandTokens(entry.command);
        const { tokens: markerTokens, complete: markerComplete } = getCommandTokens(marker.command);
        if (!complete || !markerComplete || !marker.path || markerTokens.length === 0) {
          return false;
        }

        const commandIsNodeInvocation = isNodeExecutable(commandTokens[0] ?? '', platform);
        const markerIsNodeInvocation = isNodeExecutable(markerTokens[0] ?? '', platform);
        const identityIndex = commandIsNodeInvocation && !markerIsNodeInvocation ? 1 : 0;
        const identityToken = commandTokens[identityIndex] ?? '';
        const markerIdentity = normalizeForMatching(getTokenBasename(markerTokens[0]), platform);
        const commandIdentity = normalizeForMatching(getTokenBasename(identityToken), platform);
        const identityOwnsMarker =
          Boolean(identityToken) &&
          pathOwnsMarker(identityToken, marker.path, platform);

        // La ruta solo puede pertenecer al ejecutable o al script inmediatamente posterior a Node.
        // Verla después de opciones o argumentos no prueba ownership.
        if (!identityOwnsMarker || commandIdentity !== markerIdentity) return false;

        return markerTokens.slice(1).every(
          (markerToken, index) =>
            normalizeForMatching(commandTokens[identityIndex + index + 1] ?? '', platform) ===
            normalizeForMatching(markerToken, platform),
        );
      }),
    )
    .map((entry) => entry.pid);
}

export function classifyDevPids(portPids, repoWatcherPids) {
  const uniquePortPids = [...new Set(portPids)];
  const safePids = [...new Set(repoWatcherPids)];
  const safeSet = new Set(safePids);
  const externalPids = uniquePortPids.filter((pid) => !safeSet.has(pid));

  return { safePids, externalPids };
}

export function planDevPortCleanup(portPids, repoWatcherPids) {
  const { safePids, externalPids } = classifyDevPids(portPids, repoWatcherPids);

  return {
    pidsToKill: safePids,
    externalPids,
    exitCode: externalPids.length > 0 ? 1 : 0,
  };
}

const URI_PATTERN = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s'"`]+/g;
const AUTH_HEADER_PATTERN = /((?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+)\S+/gi;
const REDACTED_COMMAND = '[REDACTED COMMAND]';
const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.+$/;
const SENSITIVE_POWERSHELL_ENV_NAME_PATTERN =
  /(?:^|_)(?:TOKEN|PASSWORD|PASS|SECRET|API_KEY|PRIVATE_KEY|CREDENTIAL)(?:$|_)/i;
const SENSITIVE_LONG_OPTIONS = new Set([
  'pwd',
  'token',
  'password',
  'passwd',
  'secret',
  'api-key',
  'authorization',
  'credential',
  'connection-string',
  'database-url',
  'db-password',
  'dsn',
  'client-secret',
  'private-key',
  'access-key',
  'refresh-token',
  'signing-key',
  'cookie',
  'auth',
  'auth-token',
  'access-token',
  'bearer-token',
  'secret-key',
  'pass',
  'key',
  'user',
]);

const SENSITIVE_OPTION_HINT_PATTERN =
  /(?:^|[-_])(access|bearer|auth|authorization|credential|cookie|dsn|key|pass|passwd|password|private|pwd|secret|signing|token)(?:$|[-_])/;
const UNSUPPORTED_SHELL_SYNTAX_PATTERN = /[;|<>\r\n`]|&&|\$\(/;

function normalizeSensitiveOptionName(name) {
  return String(name ?? '').replace(/_/g, '-').toLowerCase();
}

function looksLikeSensitiveOptionName(name) {
  const normalizedName = normalizeSensitiveOptionName(name);
  return (
    SENSITIVE_LONG_OPTIONS.has(normalizedName) ||
    SENSITIVE_OPTION_HINT_PATTERN.test(normalizedName) ||
    [...SENSITIVE_LONG_OPTIONS].some(
      (alias) =>
        normalizedName.startsWith(`${alias}:`) ||
        normalizedName.startsWith(`${alias}.`) ||
        normalizedName.startsWith(`${alias}/`),
    )
  );
}

function parseSensitiveOption(token) {
  const value = String(token ?? '');
  if (!value.startsWith('-') || value === '-') return null;

  const isHeader =
    value === '-H' ||
    value === '--header' ||
    value === '--headers' ||
    /^--?headers?(?:=|$)/i.test(value);
  if (isHeader) {
    const separator = value.indexOf('=');
    return {
      name: separator >= 0 ? value.slice(0, separator) : value,
      attachedValue: separator >= 0 ? value.slice(separator + 1) : null,
      header: true,
    };
  }

  const shortHeader = value.match(/^-h(?:=(.*)|(.+))$/i);
  if (shortHeader) {
    return {
      name: value.slice(0, 2),
      attachedValue: shortHeader[1] ?? shortHeader[2] ?? null,
      header: true,
    };
  }

  const shortOption = value.match(/^-([pu])(?<attached>.*)$/i);
  if (shortOption) {
    const attachedValue = shortOption.groups.attached || null;
    return {
      name: `-${shortOption[1]}`,
      attachedValue: attachedValue?.startsWith('=') ? attachedValue.slice(1) : attachedValue,
      header: false,
    };
  }

  const longOption = value.match(/^(--?)([^=]+)(?:=(.*))?$/);
  if (!longOption) {
    return looksLikeSensitiveOptionName(value.replace(/^-+/, ''))
      ? { malformed: true }
      : null;
  }

  const optionName = normalizeSensitiveOptionName(longOption[2]);
  if (!looksLikeSensitiveOptionName(optionName)) return null;

  if (!SENSITIVE_LONG_OPTIONS.has(optionName) && SENSITIVE_OPTION_HINT_PATTERN.test(optionName)) {
    return {
      name: `${longOption[1]}${longOption[2]}`,
      attachedValue: longOption[3] ?? null,
      header: false,
    };
  }

  if (!SENSITIVE_LONG_OPTIONS.has(optionName)) {
    return { malformed: true };
  }

  return {
    name: `${longOption[1]}${longOption[2]}`,
    attachedValue: longOption[3] ?? null,
    header: false,
  };
}

function redactUri(token) {
  return String(token).replace(URI_PATTERN, '[URL REDACTED]');
}

function isOptionToken(token) {
  return String(token ?? '').startsWith('-');
}

function getHeaderValueEnd(tokens, startIndex, attachedValue) {
  let headerValue = attachedValue;
  let valueIndex = startIndex;

  if (headerValue === null) {
    headerValue = tokens[valueIndex] ?? null;
    valueIndex += 1;
  }

  if (!headerValue || isOptionToken(headerValue)) return null;

  const separator = headerValue.indexOf(':');
  if (separator < 1) return null;

  const headerName = headerValue.slice(0, separator).toLowerCase();
  const headerContent = headerValue.slice(separator + 1).trim();
  const isAuthorizationHeader =
    headerName === 'authorization' || headerName === 'proxy-authorization';

  if (headerContent) {
    if (isAuthorizationHeader && /^(?:bearer|basic)$/i.test(headerContent)) {
      const endIndex = valueIndex + 1;
      if (
        endIndex > tokens.length ||
        !tokens[valueIndex] ||
        isOptionToken(tokens[valueIndex])
      ) {
        return null;
      }

      return endIndex;
    }

    return valueIndex;
  }

  const additionalTokens = isAuthorizationHeader ? 2 : 1;
  const endIndex = valueIndex + additionalTokens;
  if (
    endIndex > tokens.length ||
    tokens.slice(valueIndex, endIndex).some((token) => !token || isOptionToken(token))
  ) {
    return null;
  }

  return endIndex;
}

function parsePowershellEnvAssignment(tokens, index) {
  const token = String(tokens[index] ?? '');
  const match = token.match(/^\$env:(?<name>[A-Za-z_][A-Za-z0-9_]*)(?<suffix>.*)$/i);
  if (!match) return null;

  const name = match.groups.name;
  const suffix = match.groups.suffix;
  let value = null;
  let valueIndex = index + 1;

  if (suffix === '') {
    const separator = String(tokens[valueIndex] ?? '');
    if (!separator.startsWith('=')) return null;
    value = separator.slice(1);
    valueIndex += 1;
  } else if (suffix.startsWith('=')) {
    value = suffix.slice(1);
  } else {
    return null;
  }

  if (!value) {
    value = tokens[valueIndex] ?? null;
    valueIndex += 1;
  }

  return {
    name: `$env:${name}`,
    sensitive: SENSITIVE_POWERSHELL_ENV_NAME_PATTERN.test(name),
    value,
    nextIndex: valueIndex,
  };
}

function sanitizeProcessCommand(command) {
  const commandString = String(command ?? '');
  if (UNSUPPORTED_SHELL_SYNTAX_PATTERN.test(commandString)) return REDACTED_COMMAND;

  const normalizedCommand = commandString.trim().replace(/\s+/g, ' ');
  if (!normalizedCommand) return '';

  const tokenized = getCommandTokens(normalizedCommand, { shellEscapes: true });
  if (!tokenized.complete || tokenized.ambiguous) {
    return REDACTED_COMMAND;
  }

  const sanitizedTokens = [];
  for (let index = 0; index < tokenized.tokens.length; index += 1) {
    const token = tokenized.tokens[index];

    const powershellAssignment = parsePowershellEnvAssignment(tokenized.tokens, index);
    if (powershellAssignment) {
      if (!powershellAssignment.value) return REDACTED_COMMAND;
      if (powershellAssignment.sensitive) {
        sanitizedTokens.push(`${powershellAssignment.name}=[REDACTED]`);
      }
      index = powershellAssignment.nextIndex - 1;
      continue;
    }

    if (ENV_ASSIGNMENT_PATTERN.test(token)) {
      continue;
    }

    const sensitiveOption = parseSensitiveOption(token);
    if (!sensitiveOption) {
      sanitizedTokens.push(redactUri(token));
      continue;
    }
    if (sensitiveOption.malformed) return REDACTED_COMMAND;

    let consumedValue = sensitiveOption.attachedValue;
    let nextIndex = index + 1;

    if (sensitiveOption.header) {
      nextIndex = getHeaderValueEnd(tokenized.tokens, nextIndex, consumedValue);
      if (nextIndex === null) return REDACTED_COMMAND;
    } else if (consumedValue === null) {
      consumedValue = tokenized.tokens[nextIndex] ?? null;
      nextIndex += 1;
      if (!consumedValue || isOptionToken(consumedValue)) return REDACTED_COMMAND;
    } else if (!consumedValue) {
      return REDACTED_COMMAND;
    }

    sanitizedTokens.push(`${sensitiveOption.name}=[REDACTED]`);
    index = nextIndex - 1;
  }

  return sanitizedTokens
    .join(' ')
    .replace(AUTH_HEADER_PATTERN, '$1[REDACTED]')
    .slice(0, 160);
}

export function formatPidDiagnostic(pid, entries = []) {
  const entry = entries.find((candidate) => candidate.pid === pid);
  const command = sanitizeProcessCommand(entry?.command);

  return command ? `PID ${pid} (${command})` : `PID ${pid}`;
}

export function isSafeRepoWatcherPid(
  pid,
  entries,
  markers = DEV_PROCESS_MARKERS,
  platform = process.platform,
  currentPid = process.pid,
  parentPid = process.ppid,
) {
  const protectedPids = getProtectedPids(entries, currentPid, parentPid);
  return findRepoWatcherPids(entries, protectedPids, markers, platform).includes(pid);
}

export function isSafeRepoWatcherPidForTermination(
  pid,
  discoveryEntries,
  revalidatedEntries,
  markers = DEV_PROCESS_MARKERS,
  platform = process.platform,
  currentPid = process.pid,
  parentPid = process.ppid,
) {
  const discoveryEntry = discoveryEntries.find((entry) => entry.pid === pid);
  const revalidatedEntry = revalidatedEntries.find((entry) => entry.pid === pid);

  if (
    !discoveryEntry ||
    !revalidatedEntry ||
    discoveryEntry.pid !== revalidatedEntry.pid ||
    !hasStableProcessIdentity(discoveryEntry) ||
    !hasStableProcessIdentity(revalidatedEntry) ||
    getStartIdentity(discoveryEntry) !== getStartIdentity(revalidatedEntry) ||
    typeof discoveryEntry.command !== 'string' ||
    discoveryEntry.command.length === 0 ||
    discoveryEntry.command !== revalidatedEntry.command
  ) {
    return false;
  }

  return (
    isSafeRepoWatcherPid(
      pid,
      discoveryEntries,
      markers,
      platform,
      currentPid,
      parentPid,
    ) &&
    isSafeRepoWatcherPid(pid, revalidatedEntries, markers, platform, currentPid, parentPid)
  );
}

export function planRepoWatcherTermination(
  candidatePids,
  discoveryEntries,
  revalidatedEntries,
  markers = DEV_PROCESS_MARKERS,
  platform = process.platform,
  currentPid = process.pid,
  parentPid = process.ppid,
) {
  return [...new Set(candidatePids)].filter((pid) =>
    isSafeRepoWatcherPidForTermination(
      pid,
      discoveryEntries,
      revalidatedEntries,
      markers,
      platform,
      currentPid,
      parentPid,
    ),
  );
}

function formatPidDiagnostics(pids, entries) {
  return pids.map((pid) => formatPidDiagnostic(pid, entries)).join(', ');
}

function getRepoProcessSnapshot() {
  try {
    const entries = process.platform === 'win32' ? getWindowsProcessTable() : getUnixProcessTable();
    const protectedPids = getProtectedPids(entries);

    return {
      entries,
      repoWatcherPids: findRepoWatcherPids(entries, protectedPids),
    };
  } catch {
    return { entries: [], repoWatcherPids: [] };
  }
}

function getPidsUsingPorts(ports) {
  if (process.platform === 'win32') {
    const portsCsv = ports.join(',');
    const psCommand =
      '$ports = @(' +
      portsCsv +
      '); Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ConvertTo-Json -Compress';

    try {
      const output = execSync(`powershell -NoProfile -Command "${psCommand}"`, {
        encoding: 'utf8',
      });
      return parseWindowsJsonPids(output);
    } catch {
      // Fallback defensivo en caso de que Get-NetTCPConnection no esté disponible.
      const output = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      return parseWindowsPidsFromNetstat(output, ports);
    }
  }

  const pidSet = new Set();
  for (const port of ports) {
    if (process.platform === 'linux' && commandExists('fuser')) {
      try {
        const output = execSync(`fuser -n tcp ${port} 2>/dev/null`, { encoding: 'utf8' });
        for (const pid of parseLinuxFuserPids(output, port)) {
          pidSet.add(pid);
        }
        continue;
      } catch {
        // Si fuser no encuentra resultados para un puerto, probamos el fallback.
      }
    }

    try {
      const output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });
      for (const pid of parseUnixPids(output)) {
        pidSet.add(pid);
      }
    } catch {
      // Si lsof no devuelve resultados para un puerto, seguimos con el siguiente.
    }
  }
  return [...pidSet];
}

function killPid(pid) {
  if (pid === process.pid) return;

  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    return;
  }

  process.kill(pid, 'SIGKILL');
}

async function main() {
  let foundAnyPid = false;

  for (let sweep = 1; sweep <= MAX_SWEEPS; sweep += 1) {
    const portPids = getPidsUsingPorts(DEV_PORTS);
    const processSnapshot = getRepoProcessSnapshot();
    const { pidsToKill, externalPids, exitCode } = planDevPortCleanup(
      portPids,
      processSnapshot.repoWatcherPids,
    );

    if (exitCode !== 0) {
      process.exitCode = exitCode;
      console.warn(
        `No se detienen procesos externos en puertos de desarrollo: ${formatPidDiagnostics(externalPids, processSnapshot.entries)}.`,
      );
    }

    if (pidsToKill.length === 0) {
      if (!foundAnyPid && exitCode === 0) {
        console.log('No hay procesos ocupando puertos de desarrollo (3000, 3001, 3002).');
      }
      return;
    }

    foundAnyPid = true;
    console.log(
      `Liberando puertos de desarrollo (barrido ${sweep}/${MAX_SWEEPS}). PIDs de watchers: ${pidsToKill.join(', ')}`,
    );

    for (const pid of pidsToKill) {
      try {
        const latestProcessSnapshot = getRepoProcessSnapshot();
        if (
          !planRepoWatcherTermination(
            [pid],
            processSnapshot.entries,
            latestProcessSnapshot.entries,
          ).includes(pid)
        ) {
          console.warn(`Se omite PID ${pid}: ya no es un watcher seguro del repositorio.`);
          continue;
        }

        killPid(pid);
        console.log(`PID ${pid} detenido.`);
      } catch {
        console.warn(`No fue posible detener PID ${pid}.`);
      }
    }

    await delay(SWEEP_DELAY_MS);
  }

  const remainingPortPids = getPidsUsingPorts(DEV_PORTS);
  const remainingProcessSnapshot = getRepoProcessSnapshot();
  const {
    pidsToKill: remainingSafePids,
    externalPids: remainingExternalPids,
    exitCode,
  } = planDevPortCleanup(remainingPortPids, remainingProcessSnapshot.repoWatcherPids);

  if (exitCode !== 0) {
    process.exitCode = exitCode;
    console.warn(
      `No se detienen procesos externos en puertos de desarrollo: ${formatPidDiagnostics(remainingExternalPids, remainingProcessSnapshot.entries)}.`,
    );
  }

  if (remainingSafePids.length > 0 || remainingExternalPids.length > 0) {
    console.warn(
      `Persisten procesos en puertos de desarrollo tras ${MAX_SWEEPS} barridos: ${[
        ...remainingSafePids,
        ...remainingExternalPids,
      ].join(', ')}`,
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
const isMainModule = invokedPath ? import.meta.url === pathToFileURL(invokedPath).href : false;

if (isMainModule) {
  await main();
}
