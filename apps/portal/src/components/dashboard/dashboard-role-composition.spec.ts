import { UserRole } from '@iwana/shared';
import {
  DASHBOARD_ACTION_REGISTRY,
  DASHBOARD_BLOCK_REGISTRY,
  DASHBOARD_METRIC_REGISTRY,
  DASHBOARD_ROLE_AUTHORIZATION_CEILING,
  DASHBOARD_ROLE_COMPOSITION,
  getDashboardRoleComposition,
  groupDashboardMetricsByDomain,
  isUserRole,
  listCompositionBlockIds,
  resolveDashboardAction,
  resolveDashboardBlock,
  resolveDashboardDataSources,
  resolveDashboardMetric,
  resolvePromotedFoldedBlockIds,
  toLocalDayKey,
  type DashboardActionId,
  type DashboardBlockId,
  type DashboardMetricId,
} from './dashboard-role-composition';

const ALL_ROLES = Object.values(UserRole);

describe('dashboard-role-composition', () => {
  it('cubre exactamente los 12 roles de UserRole sin omitir ninguno', () => {
    expect(ALL_ROLES).toHaveLength(12);
    for (const role of ALL_ROLES) {
      expect(DASHBOARD_ROLE_COMPOSITION[role]).toBeDefined();
      expect(DASHBOARD_ROLE_AUTHORIZATION_CEILING[role]).toBeDefined();
    }
  });

  describe.each(ALL_ROLES)('rol %s', (role) => {
    const composition = getDashboardRoleComposition(role);
    const ceiling = DASHBOARD_ROLE_AUTHORIZATION_CEILING[role];

    it('incluye bloque de identidad (B3) y al menos una tarea o destino útil', () => {
      expect(composition.showOperationalTenantCard).toBe(true);

      const primary = resolveDashboardAction(composition.primaryActionId);
      expect(primary.label.length).toBeGreaterThan(0);
      expect(primary.href.startsWith('/dashboard')).toBe(true);

      const hasQuickActions = listCompositionBlockIds(composition).includes('quick-actions');
      expect(hasQuickActions).toBe(true);
    });

    it('no compone métricas, bloques ni acciones fuera del techo de autorización', () => {
      for (const metricId of composition.metricIds) {
        expect(ceiling.metricIds).toContain(metricId);
      }

      for (const blockId of listCompositionBlockIds(composition)) {
        expect(ceiling.blockIds).toContain(blockId);
      }

      const actionIds: DashboardActionId[] = [composition.primaryActionId];
      if (composition.secondaryActionId) {
        actionIds.push(composition.secondaryActionId);
      }
      for (const actionId of actionIds) {
        expect(ceiling.actionIds).toContain(actionId);
      }
    });

    it('resuelve IDs vía registros tipados con destinos verificables', () => {
      for (const metricId of composition.metricIds) {
        const metric = resolveDashboardMetric(metricId);
        expect(DASHBOARD_METRIC_REGISTRY[metricId]).toBe(metric);
        expect(metric.label.length).toBeGreaterThan(0);
        if (metricId !== 'I-6') {
          expect(metric.buildHref('2026-08-10')).toMatch(/^\/dashboard\//);
        } else {
          expect(metric.buildHref('2026-08-10')).toBeNull();
        }
      }

      for (const blockId of listCompositionBlockIds(composition)) {
        expect(DASHBOARD_BLOCK_REGISTRY[blockId as DashboardBlockId].id).toBe(blockId);
      }

      expect(DASHBOARD_ACTION_REGISTRY[composition.primaryActionId]).toBeDefined();
    });
  });

  it('AUDITOR compone historial minimizado con fuente audit (C-13 / D-SEC-01)', () => {
    const auditor = getDashboardRoleComposition(UserRole.AUDITOR);
    expect(auditor.metricIds).toEqual([]);
    expect(auditor.dominantBlockId).toBeNull();
    expect(listCompositionBlockIds(auditor)).toEqual(['change-history', 'quick-actions']);
    expect(auditor.supportBlockIds).toContain('change-history');
    expect(auditor.primaryActionId).toBe('view-profile');
    expect(DASHBOARD_ROLE_AUTHORIZATION_CEILING[UserRole.AUDITOR].blockIds).toContain(
      'change-history',
    );
    expect(resolveDashboardDataSources(UserRole.AUDITOR)).toEqual(
      expect.arrayContaining(['public-branding', 'audit']),
    );
    expect(resolveDashboardDataSources(UserRole.AUDITOR)).toHaveLength(2);
  });

  it('ADMIN pide el fan-out completo de composición sin inventar fuentes', () => {
    const sources = resolveDashboardDataSources(UserRole.ADMIN);
    expect(sources).toEqual(
      expect.arrayContaining([
        'public-branding',
        'tenant-summary',
        'wfm',
        'assurance',
        'commercial',
        'crm',
        'inventory',
        'audit',
      ]),
    );
    expect(sources).not.toContain('tenant-me');
  });

  it('TECHNICIAN no pide resúmenes operativos no autorizados', () => {
    const sources = resolveDashboardDataSources(UserRole.TECHNICIAN);
    expect(sources).toEqual(['public-branding']);
  });

  it('cada métrica del registro tiene id estable I-1…I-7', () => {
    const ids = Object.keys(DASHBOARD_METRIC_REGISTRY) as DashboardMetricId[];
    expect(ids.sort()).toEqual(['I-1', 'I-2', 'I-3', 'I-4', 'I-5', 'I-6', 'I-7']);
  });

  it('reconoce roles válidos y rechaza valores nulos o desconocidos', () => {
    expect(isUserRole(UserRole.ADMIN)).toBe(true);
    expect(isUserRole(null)).toBe(false);
    expect(isUserRole('ROLE_NOT_REGISTERED')).toBe(false);
  });

  it('resuelve cada definición desde su registro correspondiente', () => {
    for (const definition of Object.values(DASHBOARD_ACTION_REGISTRY)) {
      expect(resolveDashboardAction(definition.id)).toBe(definition);
    }

    for (const definition of Object.values(DASHBOARD_METRIC_REGISTRY)) {
      expect(resolveDashboardMetric(definition.id)).toBe(definition);
    }

    for (const definition of Object.values(DASHBOARD_BLOCK_REGISTRY)) {
      expect(resolveDashboardBlock(definition.id)).toBe(definition);
    }
  });

  it('forma la clave local al pasar al siguiente mes', () => {
    expect(toLocalDayKey(new Date(2026, 0, 31, 23, 59))).toBe('2026-01-31');
    expect(toLocalDayKey(new Date(2026, 1, 1, 0, 1))).toBe('2026-02-01');
  });

  it('ADMIN agrupa B1 en 4 dominios sin fusionar IDs (C-6)', () => {
    const groups = groupDashboardMetricsByDomain(
      getDashboardRoleComposition(UserRole.ADMIN).metricIds,
    );
    expect(groups.map((g) => g.label)).toEqual([
      'Operaciones de campo',
      'Mesa de ayuda',
      'Comercial',
      'Oportunidades',
    ]);
    expect(groups.flatMap((g) => [...g.metricIds])).toEqual([
      'I-1',
      'I-2',
      'I-3',
      'I-4',
      'I-5',
      'I-6',
      'I-7',
    ]);
    expect(DASHBOARD_METRIC_REGISTRY['I-3'].icon).not.toBe(DASHBOARD_METRIC_REGISTRY['I-4'].icon);
    expect(DASHBOARD_METRIC_REGISTRY['I-5'].icon).not.toBe(DASHBOARD_METRIC_REGISTRY['I-6'].icon);
  });

  it('SUPPORT conserva orden de composición dentro de dominios (C-6)', () => {
    const groups = groupDashboardMetricsByDomain(
      getDashboardRoleComposition(UserRole.SUPPORT).metricIds,
    );
    expect(groups.map((g) => g.domainId)).toEqual(['help-desk', 'field-ops']);
    expect(groups.find((g) => g.domainId === 'help-desk')?.metricIds).toEqual(['I-3', 'I-4']);
    expect(groups.find((g) => g.domainId === 'field-ops')?.metricIds).toEqual(['I-1', 'I-2']);
  });

  it('no crea grupos cuando no hay métricas', () => {
    expect(groupDashboardMetricsByDomain([])).toEqual([]);
  });

  it('promueve bloques folded con KPI > 0 y deja el resto plegado (C-11)', () => {
    const result = resolvePromotedFoldedBlockIds({
      foldedBlockIds: ['help-desk', 'commercial-attention', 'inventory'],
      metricValues: { 'I-3': 5, 'I-4': 0, 'I-5': 2, 'I-6': 0 },
    });
    expect(result.promotedBlockIds).toEqual(['commercial-attention', 'help-desk']);
    expect(result.remainingFoldedBlockIds).toEqual(['inventory']);
  });

  it('no promueve un KPI previo cuando su fuente actual está en error', () => {
    const result = resolvePromotedFoldedBlockIds({
      foldedBlockIds: ['commercial-attention', 'help-desk'],
      metricValues: { 'I-3': 4, 'I-5': 3 },
      metricStatuses: { 'I-3': 'success', 'I-5': 'error' },
    });

    expect(result.promotedBlockIds).toEqual(['help-desk']);
    expect(result.remainingFoldedBlockIds).toEqual(['commercial-attention']);
  });

  it('promueve valores success y updating, pero conserva loading y error plegados', () => {
    const result = resolvePromotedFoldedBlockIds({
      foldedBlockIds: ['commercial-attention', 'help-desk'],
      metricValues: { 'I-3': 4, 'I-4': 3, 'I-5': 2, 'I-6': 1 },
      metricStatuses: {
        'I-3': 'success',
        'I-4': 'updating',
        'I-5': 'loading',
        'I-6': 'error',
      },
    });

    expect(result.promotedBlockIds).toEqual(['help-desk']);
    expect(result.remainingFoldedBlockIds).toEqual(['commercial-attention']);
  });
});
