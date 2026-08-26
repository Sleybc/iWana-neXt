import { InstallationRule } from '@iwana/shared';
import type { PlanCatalogItem } from '@/lib/api-client';
import {
  columnHasData,
  loadPlanCatalogColumnPrefs,
  persistPlanCatalogColumnPrefs,
  resolveVisibleColumns,
  type PlanCatalogColumnPref,
} from './plan-catalog-columns';

function buildPlan(overrides: Partial<PlanCatalogItem> = {}): PlanCatalogItem {
  return {
    id: 'plan-1',
    name: 'Hogar 300',
    technology: 'GPON',
    installationRule: InstallationRule.ON_DEMAND,
    downloadSpeedMbps: 300,
    uploadSpeedMbps: 300,
    basePrice: 89900,
    installationFee: 50000,
    currentPrice: '89900',
    isActive: true,
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-02T11:00:00.000Z',
    ...overrides,
  };
}

describe('plan-catalog-columns', () => {
  describe('columnHasData', () => {
    it('description es true si algún plan tiene texto', () => {
      expect(
        columnHasData('description', [
          buildPlan({ description: null }),
          buildPlan({ description: 'Fibra hogar' }),
        ]),
      ).toBe(true);
    });

    it('description es false si todos están vacíos', () => {
      expect(
        columnHasData('description', [
          buildPlan({ description: null }),
          buildPlan({ description: '   ' }),
        ]),
      ).toBe(false);
    });

    it('technology es true con nombre de tecnología', () => {
      expect(columnHasData('technology', [buildPlan({ technology: 'GPON' })])).toBe(true);
    });

    it('technology es false si está vacío o N/A', () => {
      expect(columnHasData('technology', [buildPlan({ technology: 'N/A' })])).toBe(false);
      expect(columnHasData('technology', [buildPlan({ technology: '  ' })])).toBe(false);
    });
  });

  describe('resolveVisibleColumns', () => {
    it('incluye plan siempre y las columnas core por defecto', () => {
      expect(resolveVisibleColumns([buildPlan({ description: null })], {}, false)).toEqual([
        'plan',
        'speed',
        'price',
        'installation',
        'status',
        'technology',
      ]);
    });

    it('auto-on de description si hay texto; auto-off si todos null', () => {
      expect(resolveVisibleColumns([buildPlan({ description: 'Hogar' })], {}, false)).toContain(
        'description',
      );
      expect(resolveVisibleColumns([buildPlan({ description: null })], {}, false)).not.toContain(
        'description',
      );
    });

    it('override true/false gana al auto', () => {
      const withDescription = [buildPlan({ description: 'Hogar' })];
      expect(resolveVisibleColumns(withDescription, { description: false }, false)).not.toContain(
        'description',
      );
      expect(
        resolveVisibleColumns([buildPlan({ description: null })], { description: true }, false),
      ).toContain('description');
    });

    it('created y updated solo aparecen con override true', () => {
      const rows = [buildPlan()];
      expect(resolveVisibleColumns(rows, {}, false)).not.toContain('created');
      expect(resolveVisibleColumns(rows, {}, false)).not.toContain('updated');
      expect(resolveVisibleColumns(rows, { created: true, updated: true }, false)).toEqual(
        expect.arrayContaining(['created', 'updated']),
      );
    });

    it('plan siempre está; actions solo si canEdit', () => {
      expect(resolveVisibleColumns([buildPlan()], {}, false)).not.toContain('actions');
      expect(resolveVisibleColumns([buildPlan()], {}, true)).toContain('actions');
      expect(
        resolveVisibleColumns(
          [buildPlan()],
          { plan: false } as Record<string, PlanCatalogColumnPref>,
          true,
        )[0],
      ).toBe('plan');
    });

    it('apagar una columna core la oculta', () => {
      expect(resolveVisibleColumns([buildPlan()], { speed: false }, false)).not.toContain('speed');
    });
  });

  describe('persistencia', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it('carga defaults cuando no hay storage', () => {
      expect(loadPlanCatalogColumnPrefs()).toEqual({});
    });

    it('redondea prefs válidas y descarta basura', () => {
      persistPlanCatalogColumnPrefs({ description: true, speed: false });
      expect(loadPlanCatalogColumnPrefs()).toEqual({ description: true, speed: false });

      window.localStorage.setItem('iwana.portal.commercial.plan-table-columns', '{not-json');
      expect(loadPlanCatalogColumnPrefs()).toEqual({});
    });
  });
});
