import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NETWORK_ERROR_CODES } from '@iwana/shared';

function readTypeScriptSources(directory: string): Array<{ path: string; source: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readTypeScriptSources(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) return [];
    return [{ path, source: readFileSync(path, 'utf8') }];
  });
}

describe('MOD13 — errores HTTP y frontera CRM', () => {
  it('solo emite códigos HTTP del contrato cerrado fuera del consumidor del inbox', () => {
    const sources = readTypeScriptSources(join(__dirname, '..')).filter(
      ({ path }) => !path.endsWith('network-execution-event.processor.ts'),
    );
    const emittedCodes = new Set(
      sources.flatMap(({ source }) =>
        [...source.matchAll(/\bcode\s*:\s*['"]([A-Z][A-Z0-9_]*)['"]/gu)].map(
          (match) => match[1] as string,
        ),
      ),
    );
    const allowedCodes = new Set<string>([...NETWORK_ERROR_CODES, 'FORBIDDEN', 'VALIDATION_ERROR']);

    expect(emittedCodes.has('NETWORK_POOL_EXHAUSTED')).toBe(true);
    expect(emittedCodes.has('NETWORK_NOT_IN_ROUTER')).toBe(true);
    expect([...emittedCodes].filter((code) => !allowedCodes.has(code))).toEqual([]);
  });

  it('CRM importa el módulo estrecho que solo publica el puerto comercial de MOD13', () => {
    const crmModuleSource = readFileSync(join(__dirname, '../../crm/crm.module.ts'), 'utf8');
    const commercialStatusModuleSource = readFileSync(
      join(__dirname, '../network-commercial-status.module.ts'),
      'utf8',
    );
    const exportsBlock = commercialStatusModuleSource.match(/exports:\s*\[([^\]]*)\]/)?.[1] ?? '';

    expect(crmModuleSource).toContain('NetworkCommercialStatusModule');
    expect(crmModuleSource).not.toMatch(/from ['"][^'"]*network\.module['"]/u);
    expect(exportsBlock.trim()).toBe('SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT');
    expect(commercialStatusModuleSource).toContain('ServiceProvisioningCommercialStatusAdapter');
  });
});
