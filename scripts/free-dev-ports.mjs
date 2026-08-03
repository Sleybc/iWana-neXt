import { execSync } from 'node:child_process';
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
  { command: 'node scripts/dev.mjs' },
  { command: 'sh -c node scripts/dev.mjs' },
  { command: '--filter @iwana/api dev' },
  { command: '--filter @iwana/worker dev' },
  { command: '--filter @iwana/web dev' },
  { command: '--filter @iwana/portal dev' },
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
  const output = execSync('ps -eo pid=,ppid=,args=', { encoding: 'utf8' });
  return parsePsEntries(output);
}

function getWindowsProcessTable() {
  const psCommand =
    "$ErrorActionPreference = 'SilentlyContinue'; " +
    "$names = @('node.exe','cmd.exe','powershell.exe','pwsh.exe'); " +
    'Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ' +
    'Where-Object { $_.Name -in $names } | ' +
    "Select-Object @{Name='pid';Expression={$_.ProcessId}},@{Name='ppid';Expression={$_.ParentProcessId}},@{Name='command';Expression={$_.CommandLine}} | " +
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

function normalizeForMatching(value) {
  return String(value).replace(/\\/g, '/').toLowerCase();
}

export function findRepoWatcherPids(entries, protectedPids, markers = DEV_PROCESS_MARKERS) {
  return entries
    .filter((entry) => !protectedPids.has(entry.pid))
    .filter((entry) =>
      markers.some((marker) => {
        const normalizedCommand = normalizeForMatching(entry.command);
        const normalizedMarkerCommand = normalizeForMatching(marker.command);

        if (marker.path && !normalizedCommand.includes(normalizeForMatching(marker.path))) {
          return false;
        }

        return normalizedCommand.includes(normalizedMarkerCommand);
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

function getRepoWatcherPids() {
  try {
    const entries = process.platform === 'win32' ? getWindowsProcessTable() : getUnixProcessTable();
    const protectedPids = getProtectedPids(entries);

    return findRepoWatcherPids(entries, protectedPids);
  } catch {
    return [];
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
    execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
    return;
  }

  process.kill(pid, 'SIGKILL');
}

async function main() {
  let foundAnyPid = false;

  for (let sweep = 1; sweep <= MAX_SWEEPS; sweep += 1) {
    const portPids = getPidsUsingPorts(DEV_PORTS);
    const repoWatcherPids = getRepoWatcherPids();
    const { safePids, externalPids } = classifyDevPids(portPids, repoWatcherPids);

    if (externalPids.length > 0) {
      console.warn(
        `No se detienen procesos externos en puertos de desarrollo: ${externalPids.join(', ')}.`,
      );
    }

    if (safePids.length === 0) {
      if (externalPids.length > 0) {
        process.exitCode = 1;
      }
      if (!foundAnyPid && externalPids.length === 0) {
        console.log('No hay procesos ocupando puertos de desarrollo (3000, 3001, 3002).');
      }
      return;
    }

    foundAnyPid = true;
    console.log(
      `Liberando puertos de desarrollo (barrido ${sweep}/${MAX_SWEEPS}). PIDs de watchers: ${safePids.join(', ')}`,
    );

    for (const pid of safePids) {
      try {
        killPid(pid);
        console.log(`PID ${pid} detenido.`);
      } catch {
        console.warn(`No fue posible detener PID ${pid}.`);
      }
    }

    await delay(SWEEP_DELAY_MS);
  }

  const remainingPortPids = getPidsUsingPorts(DEV_PORTS);
  const remainingRepoWatcherPids = getRepoWatcherPids();
  const {
    safePids: remainingSafePids,
    externalPids: remainingExternalPids,
  } = classifyDevPids(remainingPortPids, remainingRepoWatcherPids);

  if (remainingExternalPids.length > 0) {
    console.warn(
      `No se detienen procesos externos en puertos de desarrollo: ${remainingExternalPids.join(', ')}.`,
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
