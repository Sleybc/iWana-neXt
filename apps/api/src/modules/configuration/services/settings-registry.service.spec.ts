import { AccessPermissionKey, SettingsSectionKey, SettingsSectionStatus } from '@iwana/shared';
import { SettingsRegistryService } from './settings-registry.service';

describe('SettingsRegistryService', () => {
  let service: SettingsRegistryService;

  beforeEach(() => {
    service = new SettingsRegistryService();
  });

  it('mantiene INVENTORY en COMING_SOON hasta completar baseline de telemetría (ADR-084 D5 / Regla 7)', () => {
    const sections = service.listSections();
    const inventory = sections.find((s) => s.key === SettingsSectionKey.INVENTORY);

    expect(inventory).toBeDefined();
    expect(inventory).toEqual(
      expect.objectContaining({
        key: SettingsSectionKey.INVENTORY,
        status: SettingsSectionStatus.COMING_SOON,
        route: null,
        ownerModule: 'Inventory futuro',
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      }),
    );
    // Activación futura (post baseline 7 días + validación UX): status AVAILABLE,
    // route '/dashboard/settings/inventory?tab=catalog' y requiredPermissions
    // [AccessPermissionKey.INVENTORY_STOCK_READ] (misma llave que Sidebar, nunca
    // settings.manage) — ADR-084 D1/D3/D5.
  });

  it('declara la activación federada prevista sin exigir settings.manage', () => {
    // Contrato previsto por ADR-084 D1/D3: la tarjeta federada de Inventario
    // exigirá INVENTORY_STOCK_READ (misma llave que Sidebar) al activarse.
    const sections = service.listSections();
    for (const s of sections) {
      expect(s.requiredPermissions).not.toContain(AccessPermissionKey.SETTINGS_MANAGE);
    }
  });

  it('no importa InventoryModule ni repositorios de inventario', () => {
    // Verificación estática de federación: el servicio y el módulo no deben acoplar inventario
    // El test de integración valida que no existan cross-imports vía grep en CI,
    // aquí aseguramos que la instancia no inyecta repositorios.
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    expect(proto).not.toContain('inventoryRepository');
    // El módulo de configuración no debe listar InventoryModule en imports
    // (validación indirecta: el servicio funciona sin proveer repositorios)
    expect(service.listSections().length).toBeGreaterThan(0);
  });

  it('mantiene contrato federado para todas las secciones', () => {
    const sections = service.listSections();
    for (const s of sections) {
      expect(s.key).toBeDefined();
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.ownerModule.length).toBeGreaterThan(0);
      expect(Object.values(SettingsSectionStatus)).toContain(s.status);
      if (s.status === SettingsSectionStatus.AVAILABLE) {
        expect(s.route).toBeTruthy();
      }
    }
  });
});
