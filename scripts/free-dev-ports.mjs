import { execSync } from 'node:child_process';

const DEV_PORTS = [3000, 3001, 3002];

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
    return parsed
      .map((value) => Number(value))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
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

function getPidsUsingPorts(ports) {
  if (process.platform === 'win32') {
    const portsCsv = ports.join(',');
    const psCommand =
      "$ports = @(" +
      portsCsv +
      "); Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ConvertTo-Json -Compress";

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

function main() {
  const pids = getPidsUsingPorts(DEV_PORTS);

  if (pids.length === 0) {
    console.log('No hay procesos ocupando puertos de desarrollo (3000, 3001, 3002).');
    return;
  }

  console.log(`Liberando puertos de desarrollo. PIDs detectados: ${pids.join(', ')}`);

  for (const pid of pids) {
    try {
      killPid(pid);
      console.log(`PID ${pid} detenido.`);
    } catch {
      console.warn(`No fue posible detener PID ${pid}.`);
    }
  }
}

main();