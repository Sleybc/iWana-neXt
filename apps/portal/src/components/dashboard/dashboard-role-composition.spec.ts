import { UserRole } from '@iwana/shared';
import {
  DASHBOARD_ACTION_REGISTRY,
  DASHBOARD_BLOCK_REGISTRY,
  DASHBOARD_METRIC_REGISTRY,
  DASHBOARD_ROLE_AUTHORIZATION_CEILING,
  DASHBOARD_ROLE_COMPOSITION,
  getDashboardRoleComposition,
  listCompositionBlockIds,
  resolveDashboardAction,
  resolveDashboardDataSources,
  resolveDashboardMetric,
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

  it('AUDITOR conserva vista base sin historial hasta aprobación de seguridad', () => {
    const auditor = getDashboardRoleComposition(UserRole.AUDITOR);
    expect(auditor.metricIds).toEqual([]);
    expect(auditor.dominantBlockId).toBeNull();
    expect(listCompositionBlockIds(auditor)).toEqual(['quick-actions']);
    expect(auditor.primaryActionId).toBe('view-profile');
    expect(resolveDashboardDataSources(UserRole.AUDITOR)).toEqual(['public-branding']);
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
});
