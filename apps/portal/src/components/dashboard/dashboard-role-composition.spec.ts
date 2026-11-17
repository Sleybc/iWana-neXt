import { UserRole } from '@iwana/shared';
import {
  DASHBOARD_ACTION_REGISTRY,
  DASHBOARD_AREA_REGISTRY,
  DASHBOARD_ATTENTION_SOURCES,
  DASHBOARD_BLOCK_REGISTRY,
  DASHBOARD_METRIC_REGISTRY,
  DASHBOARD_MODULE_HEALTH_REGISTRY,
  DASHBOARD_ROLE_AUTHORIZATION_CEILING,
  DASHBOARD_ROLE_COMPOSITION,
  DASHBOARD_TREND_REGISTRY,
  collectDashboardPartSources,
  getDashboardRoleComposition,
  isUserRole,
  listCompositionBlockIds,
  resolveDashboardAction,
  resolveDashboardBlock,
  resolveDashboardDataSources,
  resolveDashboardMetric,
  resolveDashboardModuleHealth,
  resolveDashboardMetricAccent,
  splitDashboardModuleHealthIds,
  toLocalDayKey,
  type DashboardActionId,
  type DashboardBlockId,
  type DashboardDataSourceId,
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

    it('incluye identidad y al menos un destino útil (CA-V2-01)', () => {
      // La identidad vive en el encabezado. La ficha de empresa queda para los roles sin
      // composición operativa; quien no la tiene compone pulso y cola de atención.
      if (!composition.showOperationalTenantCard) {
        expect(composition.metricIds.length).toBeGreaterThan(0);
        expect(composition.attentionIds.length).toBeGreaterThan(0);
      }

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

      for (const attentionId of composition.attentionIds) {
        expect(ceiling.attentionIds).toContain(attentionId);
      }

      for (const areaId of composition.areaIds) {
        expect(ceiling.areaIds).toContain(areaId);
      }

      expect(composition.metricIds.length).toBeLessThanOrEqual(5);

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
        'today-agenda',
        'assurance',
        'commercial',
        'crm',
        'inventory',
        'audit',
        'subscribers',
        'cutoff',
        'provisioning',
        'replenishment',
        'billing-summary',
        'subscribers-summary',
        'cases-series',
      ]),
    );
    expect(sources).toHaveLength(16);
    expect(sources).not.toContain('tenant-me');
  });

  it('TECHNICIAN no pide resúmenes operativos no autorizados', () => {
    const sources = resolveDashboardDataSources(UserRole.TECHNICIAN);
    expect(sources).toEqual(['public-branding']);
  });

  it('cada métrica del registro tiene id estable I-1…I-7 y P-1…P-3', () => {
    const ids = Object.keys(DASHBOARD_METRIC_REGISTRY) as DashboardMetricId[];
    expect(ids.sort()).toEqual([
      'I-1',
      'I-2',
      'I-3',
      'I-4',
      'I-5',
      'I-6',
      'I-7',
      'P-1',
      'P-2',
      'P-3',
    ]);
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

  it('ADMIN compone el pulso con base activa, recaudo, cartera, casos y visitas (dirección §5.1)', () => {
    const metricIds = getDashboardRoleComposition(UserRole.ADMIN).metricIds;
    expect(metricIds).toEqual(['P-1', 'P-2', 'P-3', 'I-3', 'I-1']);
    expect(DASHBOARD_METRIC_REGISTRY['P-2'].sources).toEqual(['billing-summary']);
    expect(DASHBOARD_METRIC_REGISTRY['P-3'].sources).toEqual(['billing-summary']);
    expect(DASHBOARD_METRIC_REGISTRY['P-1'].sources).toEqual(['subscribers']);
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
    expect(getDashboardRoleComposition(UserRole.SALES).metricIds).toEqual([
      'I-7',
      'P-1',
      'P-2',
      'P-3',
      'I-6',
    ]);
    expect(getDashboardRoleComposition(UserRole.ACCOUNTANT).metricIds).toEqual([
      'P-2',
      'P-3',
      'P-1',
      'I-5',
    ]);
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

  it('cada fila de atención tiene una fuente y el rol que la compone la pide', () => {
    for (const role of ALL_ROLES) {
      const sources = resolveDashboardDataSources(role);
      for (const attentionId of getDashboardRoleComposition(role).attentionIds) {
        expect(sources).toContain(DASHBOARD_ATTENTION_SOURCES[attentionId]);
      }
    }
  });

  it('las áreas de un rol piden la fuente de su módulo', () => {
    for (const role of ALL_ROLES) {
      const sources = resolveDashboardDataSources(role);
      for (const areaId of getDashboardRoleComposition(role).areaIds) {
        for (const source of DASHBOARD_AREA_REGISTRY[areaId].sources) {
          expect(sources).toContain(source);
        }
      }
    }
  });

  it('SUPPORT y ACCOUNTANT no piden fuentes fuera del guard de su endpoint', () => {
    const support = resolveDashboardDataSources(UserRole.SUPPORT);
    // Aprovisionamiento es de ADMIN y NOC; la reposición no se compone para soporte.
    expect(support).not.toContain('provisioning');
    expect(support).not.toContain('replenishment');
    expect(support).not.toContain('subscribers');
    expect(support).not.toContain('commercial');
    expect(support).not.toContain('tenant-summary');

    const accountant = getDashboardRoleComposition(UserRole.ACCOUNTANT);
    expect(accountant.attentionIds).not.toContain('offers-at-risk');
    expect(resolveDashboardDataSources(UserRole.ACCOUNTANT)).toEqual(
      expect.arrayContaining(['commercial', 'subscribers', 'cutoff']),
    );
    expect(resolveDashboardDataSources(UserRole.ACCOUNTANT)).not.toContain('wfm');
  });

  it('solo ADMIN compone los pendientes de configuración', () => {
    for (const role of ALL_ROLES) {
      const has = getDashboardRoleComposition(role).attentionIds.includes('configuration-pending');
      expect(has).toBe(role === UserRole.ADMIN);
    }
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

  it('ADMIN ya no compone chips: la salud de cada módulo vive en su card de área', () => {
    const admin = getDashboardRoleComposition(UserRole.ADMIN);
    expect(admin.moduleHealthIds).toEqual([]);
    expect(admin.areaIds).toEqual([
      'help-desk',
      'scheduling',
      'opportunities',
      'billing',
      'provisioning',
      'inventory',
    ]);
    expect(DASHBOARD_MODULE_HEALTH_REGISTRY.operations.sources).toEqual([]);
    expect(resolveDashboardModuleHealth('scheduling').label).toBe('Programación');
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

/**
 * P3-5 (AI-SEC-ENG, HLD-MOD02 v3.0 §5) · Espejo del guard real del API: roles de tenant que el
 * `@Roles` de cada endpoint admite. Si un controlador cambia, esta tabla se actualiza a mano en
 * el mismo cambio; el techo y la composición nunca piden una fuente fuera de ella.
 */
const API_GUARD_ROLES: Record<DashboardDataSourceId, readonly UserRole[]> = {
  // GET /tenants/public/branding — público.
  'public-branding': Object.values(UserRole),
  // tenant.controller.ts · GET /tenants/me/summary
  'tenant-summary': [UserRole.ADMIN],
  // tenant.controller.ts · GET /tenants/me y /tenants/me/settings
  'tenant-me': [UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT],
  // wfm.controller.ts · GET /wfm/dashboard/summary
  wfm: [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT],
  // wfm.controller.ts · GET /wfm/events
  'today-agenda': [
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
  ],
  // assurance.controller.ts · GET /assurance/dashboard/summary
  assurance: [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.AUDITOR],
  // commercial-dashboard.controller.ts · COMMERCIAL_CATALOG_READ_ROLES + AUDITOR
  commercial: [
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.NOC,
    UserRole.ACCOUNTANT,
    UserRole.AUDITOR,
  ],
  // inventory.controller.ts · GET /inventory/dashboard
  inventory: [
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.AUDITOR,
  ],
  // expedientes.controller.ts · GET /crm/pipeline/summary
  crm: [UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.AUDITOR],
  // audit.controller.ts · GET /audit
  audit: [UserRole.ADMIN, UserRole.AUDITOR],
  // subscribers.controller.ts · GET /crm/subscribers/queue-counts
  subscribers: [
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
  ],
  // billing-cycles.controller.ts · GET /crm/billing-cycles/cutoff-agenda (SUBSCRIBER_READ_ROLES)
  cutoff: [
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
    UserRole.AUDITOR,
  ],
  // network-provisioning.controller.ts · GET /network/provisioning/inbox
  provisioning: [UserRole.ADMIN, UserRole.NOC],
  // inventory.controller.ts · GET /inventory/replenishment/suggestions
  replenishment: [
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.AUDITOR,
  ],
  // N1 · billing-dashboard.controller.ts · GET /billing/dashboard/summary
  'billing-summary': [UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SALES],
  // N2 · subscribers-dashboard.controller.ts · GET /crm/subscribers/dashboard/summary
  'subscribers-summary': [UserRole.ADMIN, UserRole.SALES, UserRole.ACCOUNTANT],
  // N3 · assurance-dashboard-series.controller.ts · GET /assurance/dashboard/series
  'cases-series': [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT],
};

function sourcesOutsideGuard(role: UserRole, sources: Iterable<DashboardDataSourceId>) {
  return Array.from(sources).filter((source) => !API_GUARD_ROLES[source].includes(role));
}

describe('techo de autorización frente al guard del API (P3-5)', () => {
  it.each(ALL_ROLES)('%s: el fan-out solo pide fuentes cuyo guard admite el rol', (role) => {
    expect(sourcesOutsideGuard(role, resolveDashboardDataSources(role))).toEqual([]);
  });

  it.each(ALL_ROLES)('%s: el techo completo no deriva fuentes fuera del guard', (role) => {
    const ceiling = DASHBOARD_ROLE_AUTHORIZATION_CEILING[role];
    expect(sourcesOutsideGuard(role, collectDashboardPartSources(ceiling))).toEqual([]);
  });

  it('el espejo cubre todas las fuentes del fan-out', () => {
    const all = new Set<DashboardDataSourceId>();
    for (const role of ALL_ROLES) {
      for (const source of resolveDashboardDataSources(role)) all.add(source);
      for (const source of collectDashboardPartSources(
        DASHBOARD_ROLE_AUTHORIZATION_CEILING[role],
      )) {
        all.add(source);
      }
    }
    for (const source of all) expect(API_GUARD_ROLES[source]).toBeDefined();
  });

  it('el dinero (N1) lo piden Administradora, Contadora y Ejecutivo comercial (CTO 2026-11-17)', () => {
    const asking = ALL_ROLES.filter((role) =>
      resolveDashboardDataSources(role).includes('billing-summary'),
    );
    expect(asking.sort()).toEqual([UserRole.ACCOUNTANT, UserRole.ADMIN, UserRole.SALES].sort());
  });

  it('SALES compone Recaudo y Cartera, su pestaña y el área de Facturación; cede Planes sin precio a la cola', () => {
    const sales = getDashboardRoleComposition(UserRole.SALES);
    expect(sales.metricIds).toEqual(expect.arrayContaining(['P-2', 'P-3']));
    expect(sales.metricIds).not.toContain('I-5');
    expect(sales.attentionIds).toContain('plans-without-price');
    expect(sales.trendIds).toContain('collections');
    expect(sales.areaIds).toEqual(['opportunities', 'subscribers', 'billing']);
    expect(resolveDashboardDataSources(UserRole.SALES)).toContain('billing-summary');
  });

  it.each([UserRole.SUPPORT, UserRole.NOC])('%s no pide N1 ni compone piezas de dinero', (role) => {
    const composition = getDashboardRoleComposition(role);
    const ceiling = DASHBOARD_ROLE_AUTHORIZATION_CEILING[role];
    expect(resolveDashboardDataSources(role)).not.toContain('billing-summary');
    expect(collectDashboardPartSources(ceiling).has('billing-summary')).toBe(false);
    for (const id of ['P-2', 'P-3'] as const) expect(composition.metricIds).not.toContain(id);
    expect(composition.trendIds).not.toContain('collections');
    expect(composition.areaIds).not.toContain('billing');
  });

  it('N2 lo piden ADMIN, SALES y ACCOUNTANT; N3, ADMIN, NOC y SUPPORT', () => {
    const askingFor = (source: DashboardDataSourceId) =>
      ALL_ROLES.filter((role) => resolveDashboardDataSources(role).includes(source)).sort();
    expect(askingFor('subscribers-summary')).toEqual(
      [UserRole.ADMIN, UserRole.SALES, UserRole.ACCOUNTANT].sort(),
    );
    expect(askingFor('cases-series')).toEqual(
      [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT].sort(),
    );
  });
});

describe('Tendencia por rol (contrato DS de gráficas §6)', () => {
  it.each(ALL_ROLES)('%s: compone solo pestañas de su techo', (role) => {
    const composition = getDashboardRoleComposition(role);
    for (const trendId of composition.trendIds) {
      expect(DASHBOARD_ROLE_AUTHORIZATION_CEILING[role].trendIds).toContain(trendId);
      expect(resolveDashboardDataSources(role)).toContain(DASHBOARD_TREND_REGISTRY[trendId].source);
    }
  });

  it('reparte Suscriptores, Recaudo y Casos según la tabla de roles', () => {
    expect(getDashboardRoleComposition(UserRole.ADMIN).trendIds).toEqual([
      'subscribers',
      'collections',
      'cases',
    ]);
    expect(getDashboardRoleComposition(UserRole.NOC).trendIds).toEqual(['cases']);
    expect(getDashboardRoleComposition(UserRole.SUPPORT).trendIds).toEqual(['cases']);
    expect(getDashboardRoleComposition(UserRole.SALES).trendIds).toEqual([
      'subscribers',
      'collections',
    ]);
    expect(getDashboardRoleComposition(UserRole.ACCOUNTANT).trendIds).toEqual([
      'collections',
      'subscribers',
    ]);
    for (const role of [
      UserRole.TECHNICIAN,
      UserRole.CONTRACTOR,
      UserRole.AUDITOR,
      UserRole.HR,
      UserRole.SUBSCRIBER,
      UserRole.PARTNER,
      UserRole.INVESTOR,
    ]) {
      expect(getDashboardRoleComposition(role).trendIds).toEqual([]);
    }
  });

  it('cada pestaña lee una sola fuente N1–N3', () => {
    expect(DASHBOARD_TREND_REGISTRY.subscribers.source).toBe('subscribers-summary');
    expect(DASHBOARD_TREND_REGISTRY.collections.source).toBe('billing-summary');
    expect(DASHBOARD_TREND_REGISTRY.cases.source).toBe('cases-series');
  });
});
