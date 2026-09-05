import { UserRole } from '@iwana/shared';
import {
  DASHBOARD_ACTION_REGISTRY,
  DASHBOARD_BLOCK_REGISTRY,
  DASHBOARD_METRIC_REGISTRY,
  DASHBOARD_MODULE_HEALTH_REGISTRY,
  DASHBOARD_ROLE_AUTHORIZATION_CEILING,
  DASHBOARD_ROLE_COMPOSITION,
  getDashboardRoleComposition,
  isUserRole,
  listCompositionBlockIds,
  resolveDashboardAction,
  resolveDashboardBlock,
  resolveDashboardDataSources,
  resolveDashboardMetric,
  resolveDashboardModuleHealth,
  resolvePromotedFoldedBlockIds,
  resolveDashboardMetricAccent,
  splitDashboardModuleHealthIds,
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

    it('incluye identidad B3 y al menos un destino útil (CA-V2-01)', () => {
      expect(composition.showOperationalTenantCard).toBe(true);

      const primary = resolveDashboardAction(composition.primaryActionId);
      expect(primary.label.length).toBeGreaterThan(0);
      expect(primary.href.startsWith('/dashboard')).toBe(true);

      const hasModuleHealth = composition.moduleHealthIds.length > 0;
      const hasWorkSurface = listCompositionBlockIds(composition).length > 0;
      const hasProfileDestination = ceiling.actionIds.includes('view-profile');
      expect(hasModuleHealth || hasWorkSurface || hasProfileDestination).toBe(true);
    });

    it('no compone métricas, bloques, salud de módulos ni acciones fuera del techo de autorización', () => {
      for (const metricId of composition.metricIds) {
        expect(ceiling.metricIds).toContain(metricId);
      }

      for (const moduleHealthId of composition.moduleHealthIds) {
        expect(ceiling.moduleHealthIds).toContain(moduleHealthId);
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
    expect(listCompositionBlockIds(auditor)).toEqual(['change-history']);
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

  it('ningún rol incluye el panel Accesos rápidos (CA-CM-09)', () => {
    expect(Object.keys(DASHBOARD_BLOCK_REGISTRY)).not.toContain('quick-actions');
    for (const role of ALL_ROLES) {
      const ids = listCompositionBlockIds(getDashboardRoleComposition(role)) as readonly string[];
      expect(ids).not.toContain('quick-actions');
    }
  });

  it('forma la clave local al pasar al siguiente mes', () => {
    expect(toLocalDayKey(new Date(2026, 0, 31, 23, 59))).toBe('2026-01-31');
    expect(toLocalDayKey(new Date(2026, 1, 1, 0, 1))).toBe('2026-02-01');
  });

  it('ADMIN compone 7 métricas en orden plano I-1…I-7 (U-D5 §3)', () => {
    const metricIds = getDashboardRoleComposition(UserRole.ADMIN).metricIds;
    expect(metricIds).toEqual(['I-1', 'I-2', 'I-3', 'I-4', 'I-5', 'I-6', 'I-7']);
    // Cada par de apariencia similar usa iconos distintos para no confundir la tarjeta.
    expect(DASHBOARD_METRIC_REGISTRY['I-3'].icon).not.toBe(DASHBOARD_METRIC_REGISTRY['I-4'].icon);
    expect(DASHBOARD_METRIC_REGISTRY['I-5'].icon).not.toBe(DASHBOARD_METRIC_REGISTRY['I-6'].icon);
  });

  it('SUPPORT conserva el orden de composición plano sin reordenar por dominio (U-D5 §3)', () => {
    expect(getDashboardRoleComposition(UserRole.SUPPORT).metricIds).toEqual([
      'I-3',
      'I-4',
      'I-1',
      'I-2',
    ]);
  });

  it('NOC, SALES y ACCOUNTANT componen la retícula por filas completa o parcial (U-D5 §3)', () => {
    expect(getDashboardRoleComposition(UserRole.NOC).metricIds).toEqual([
      'I-1',
      'I-2',
      'I-3',
      'I-4',
    ]);
    expect(getDashboardRoleComposition(UserRole.SALES).metricIds).toEqual(['I-5', 'I-6', 'I-7']);
    expect(getDashboardRoleComposition(UserRole.ACCOUNTANT).metricIds).toEqual(['I-5']);
  });

  it('roles sin ficha operativa no componen métricas en B1', () => {
    for (const role of [
      UserRole.TECHNICIAN,
      UserRole.CONTRACTOR,
      UserRole.AUDITOR,
      UserRole.HR,
      UserRole.SUBSCRIBER,
      UserRole.PARTNER,
      UserRole.INVESTOR,
    ]) {
      expect(getDashboardRoleComposition(role).metricIds).toEqual([]);
    }
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

describe('resolveDashboardMetricAccent', () => {
  it('conserva primary y neutral aunque el valor sea 0', () => {
    expect(resolveDashboardMetricAccent({ declared: 'primary', value: 0, hasDelta: false })).toBe(
      'primary',
    );
    expect(
      resolveDashboardMetricAccent({ declared: 'neutral', value: null, hasDelta: false }),
    ).toBe('neutral');
  });

  it('apaga warning/danger sin señal y los conserva con valor o delta', () => {
    expect(resolveDashboardMetricAccent({ declared: 'warning', value: 0, hasDelta: false })).toBe(
      'neutral',
    );
    expect(resolveDashboardMetricAccent({ declared: 'danger', value: null, hasDelta: false })).toBe(
      'neutral',
    );
    expect(resolveDashboardMetricAccent({ declared: 'warning', value: 2, hasDelta: false })).toBe(
      'warning',
    );
    expect(resolveDashboardMetricAccent({ declared: 'danger', value: 0, hasDelta: true })).toBe(
      'danger',
    );
  });

  it('ADMIN compone B1b con siete chips de producto y Operaciones sin fuente', () => {
    const ids = getDashboardRoleComposition(UserRole.ADMIN).moduleHealthIds;
    expect(ids).toEqual([
      'scheduling',
      'help-desk',
      'commercial',
      'opportunities',
      'inventory',
      'configuration',
      'operations',
    ]);
    expect(DASHBOARD_MODULE_HEALTH_REGISTRY.operations.sources).toEqual([]);
    expect(resolveDashboardModuleHealth('scheduling').label).toBe('Programación');
    expect(splitDashboardModuleHealthIds(ids).overflowIds).toEqual([]);
  });

  it('técnico y contratista tienen Programación de navegación y no piden resúmenes en el fan-out', () => {
    expect(getDashboardRoleComposition(UserRole.TECHNICIAN).moduleHealthIds).toEqual([
      'scheduling',
    ]);
    expect(getDashboardRoleComposition(UserRole.CONTRACTOR).moduleHealthIds).toEqual([
      'scheduling',
    ]);
    expect(resolveDashboardDataSources(UserRole.TECHNICIAN)).toEqual(['public-branding']);
  });

  it('vista base no monta B1b', () => {
    for (const role of [
      UserRole.AUDITOR,
      UserRole.HR,
      UserRole.SUBSCRIBER,
      UserRole.PARTNER,
      UserRole.INVESTOR,
    ]) {
      expect(getDashboardRoleComposition(role).moduleHealthIds).toEqual([]);
    }
  });

  it('el overflow recorta Operaciones y conserva los chips con contrato', () => {
    const nine = [
      'scheduling',
      'help-desk',
      'commercial',
      'opportunities',
      'inventory',
      'configuration',
      'operations',
      'scheduling',
      'help-desk',
    ] as const;
    const split = splitDashboardModuleHealthIds(nine);
    expect(split.visibleIds).not.toContain('operations');
    expect(split.overflowIds).toEqual(['operations']);
    expect(split.visibleIds).toHaveLength(8);
  });
});
