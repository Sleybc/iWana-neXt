import {
  filterEntriesInSummaryWindow,
  matchesSummaryPreset,
  summaryPresetSignalLabel,
  type SummaryPreset,
} from './summary-presets';
import type { SummaryEntry } from './AuditSummary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const now = new Date().toISOString();

function entry(partial: Partial<SummaryEntry> & { id: string; action: string }): SummaryEntry {
  return {
    entityType: 'User',
    entityId: 'e1',
    userId: 'u1',
    actor: { id: 'u1', type: 'platform', displayName: 'Ana' },
    ipAddress: null,
    oldValue: null,
    newValue: null,
    createdAt: now,
    ...partial,
  };
}

describe('matchesSummaryPreset', () => {
  it('critical: deriveSeverity === critical (DELETE)', () => {
    const e = entry({ id: '1', action: 'DELETE' });
    expect(matchesSummaryPreset(e, 'critical')).toBe(true);
    expect(matchesSummaryPreset(e, 'access')).toBe(false);
  });

  it('critical: LOGIN_FAILED es crítico', () => {
    expect(matchesSummaryPreset(entry({ id: '1', action: 'LOGIN_FAILED' }), 'critical')).toBe(true);
  });

  it('critical: CREATE sin campos sensibles no es crítico', () => {
    expect(matchesSummaryPreset(entry({ id: '1', action: 'CREATE' }), 'critical')).toBe(false);
  });

  it('access: AUTH_ACTIONS', () => {
    expect(matchesSummaryPreset(entry({ id: '1', action: 'LOGIN' }), 'access')).toBe(true);
    expect(matchesSummaryPreset(entry({ id: '2', action: 'LOGOUT' }), 'access')).toBe(true);
    expect(matchesSummaryPreset(entry({ id: '3', action: 'CREATE' }), 'access')).toBe(false);
  });

  it('security: SECURITY_ACTIONS ∪ TENANT_ACTIONS', () => {
    expect(matchesSummaryPreset(entry({ id: '1', action: 'MFA_ENABLED' }), 'security')).toBe(true);
    expect(matchesSummaryPreset(entry({ id: '2', action: 'TENANT_SUSPENDED' }), 'security')).toBe(
      true,
    );
    expect(matchesSummaryPreset(entry({ id: '3', action: 'LOGIN' }), 'security')).toBe(false);
  });

  it('tenants: entityType === Tenant', () => {
    expect(
      matchesSummaryPreset(
        entry({ id: '1', action: 'UPDATE', entityType: 'Tenant', entityId: 't1' }),
        'tenants',
      ),
    ).toBe(true);
    expect(matchesSummaryPreset(entry({ id: '2', action: 'UPDATE' }), 'tenants')).toBe(false);
  });

  it('actors: todas las filas del lote (actividad de actores)', () => {
    expect(matchesSummaryPreset(entry({ id: '1', action: 'LOGIN' }), 'actors')).toBe(true);
    expect(matchesSummaryPreset(entry({ id: '2', action: 'CREATE', userId: null }), 'actors')).toBe(
      true,
    );
  });
});

describe('summaryPresetSignalLabel', () => {
  const cases: Array<[SummaryPreset, string]> = [
    ['critical', PLATFORM_UI_COPY.audit.criticalChanges],
    ['access', PLATFORM_UI_COPY.audit.accesses],
    ['security', PLATFORM_UI_COPY.audit.accessAndSecurity],
    ['tenants', PLATFORM_UI_COPY.audit.companiesWithChanges],
    ['actors', PLATFORM_UI_COPY.audit.whoChanged],
  ];

  it.each(cases)('%s → label de señal canónico', (preset, label) => {
    expect(summaryPresetSignalLabel(preset)).toBe(label);
  });
});

describe('filterEntriesInSummaryWindow', () => {
  it('incluye entradas dentro de la ventana 24h y excluye las anteriores', () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 48 * 3600_000).toISOString();
    const rows = [
      entry({ id: 'in', action: 'LOGIN', createdAt: recent }),
      entry({ id: 'out', action: 'LOGIN', createdAt: old }),
    ];
    const filtered = filterEntriesInSummaryWindow(rows, '24h');
    expect(filtered.map((e) => e.id)).toEqual(['in']);
  });
});
