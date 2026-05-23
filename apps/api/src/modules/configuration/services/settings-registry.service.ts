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
          'Concentra perfil empresarial, configuración operativa base, sedes y horario institucional del tenant.',
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
        label: 'Usuarios y acceso',
        description: 'Consulta perfiles, permisos y gobierno básico de acceso tenant-aware.',
        ownerModule: 'MOD00 / Access control',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/access',
        requiredPermissions: [
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.ACCESS_PERMISSIONS_READ,
        ],
      },
      {
        key: SettingsSectionKey.SECURITY,
        label: 'Seguridad',
        description:
          'Consolida políticas visibles del tenant sin mover ownership de Auth ni Users.',
        ownerModule: 'Auth / Users',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/security',
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
      {
        key: SettingsSectionKey.BRANDING,
        label: 'Marca',
        description: 'Gestiona identidad visual y activos corporativos del tenant autenticado.',
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
        key: SettingsSectionKey.COMMERCIAL,
        label: 'Comercial',
        description:
          'El owner existe, pero el contrato de configuración federada aún no está expuesto.',
        ownerModule: 'MOD06 / Comercial',
        status: SettingsSectionStatus.NOT_CONFIGURED,
        route: null,
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
      {
        key: SettingsSectionKey.BILLING,
        label: 'Billing',
        description:
          'Queda reservado para el módulo owner cuando exponga configuración federada real.',
        ownerModule: 'Billing futuro',
        status: SettingsSectionStatus.COMING_SOON,
        route: null,
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
      {
        key: SettingsSectionKey.INVENTORY,
        label: 'Inventory',
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
