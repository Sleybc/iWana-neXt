import { Injectable } from '@nestjs/common';
import { AccessPermissionKey, SettingsSectionKey, SettingsSectionStatus } from '@iwana/shared';
import { SettingsSectionDto } from '../dto/settings-section.dto';

@Injectable()
export class SettingsRegistryService {
  listSections(): SettingsSectionDto[] {
    return [
      {
        key: SettingsSectionKey.ORGANIZATION,
        label: 'Perfil empresarial y organización',
        description:
          'Concentra perfil empresarial, configuración operativa base y sedes registradas.',
        ownerModule: 'MOD00 / Organización',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/organization',
        requiredPermissions: [
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.ORGANIZATION_SITES_READ,
        ],
      },
      {
        key: SettingsSectionKey.ACCESS,
        label: 'Perfiles y autenticación',
        description: 'Consulta perfiles, permisos y políticas de autenticación.',
        ownerModule: 'MOD00 / Access control',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/access',
        requiredPermissions: [
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.ACCESS_PERMISSIONS_READ,
        ],
      },
      {
        key: SettingsSectionKey.BRANDING,
        label: 'Marca',
        description: 'Gestiona la identidad visual y los activos corporativos.',
        ownerModule: 'Tenant / Branding',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/branding',
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
      {
        key: SettingsSectionKey.CALENDAR,
        label: 'Calendario operativo y jornadas',
        description:
          'Centraliza horarios de empresa, horarios por sede, cierres, aperturas, ventana técnica y eventualidades operativas puntuales.',
        ownerModule: 'MOD00 / Organización + MOD09 / WFM',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/calendar',
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
      {
        key: SettingsSectionKey.BILLING,
        label: 'Facturación',
        description:
          'Queda reservado para el módulo owner cuando exponga configuración federada real.',
        ownerModule: 'Billing futuro',
        status: SettingsSectionStatus.COMING_SOON,
        route: null,
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
      {
        key: SettingsSectionKey.INVENTORY,
        label: 'Inventario',
        description:
          'Se mostrará cuando el owner de inventario publique contratos reales de settings.',
        ownerModule: 'Inventory futuro',
        status: SettingsSectionStatus.COMING_SOON,
        route: null,
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
      {
        key: SettingsSectionKey.INTEGRATIONS,
        label: 'Integraciones',
        description:
          'Agrupará configuraciones federadas cuando existan owners y contratos aprobados.',
        ownerModule: 'Integrations futuro',
        status: SettingsSectionStatus.COMING_SOON,
        route: null,
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
    ];
  }
}
