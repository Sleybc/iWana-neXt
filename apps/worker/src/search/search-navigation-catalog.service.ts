import { Injectable } from '@nestjs/common';

export interface SearchNavigationCatalogItem {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  route: string;
  order: number;
}

@Injectable()
export class SearchNavigationCatalogService {
  list(): SearchNavigationCatalogItem[] {
    return [
      {
        id: 'dashboard',
        title: 'Dashboard',
        description: 'Resumen operativo de la plataforma',
        keywords: ['inicio', 'resumen', 'metricas', 'panel'],
        route: '/dashboard',
        order: 1,
      },
      {
        id: 'tenants',
        title: 'Empresas',
        description: 'Administración de empresas del sistema',
        keywords: ['empresas', 'tenants', 'clientes', 'configuracion empresa'],
        route: '/tenants',
        order: 2,
      },
      {
        id: 'users',
        title: 'Usuarios',
        description: 'Gestión interna de usuarios por empresa',
        keywords: ['usuarios', 'accesos', 'credenciales', 'roles'],
        route: '/users',
        order: 3,
      },
      {
        id: 'audit-logs',
        title: 'Registros de auditoría',
        description: 'Historial técnico y operativo del sistema',
        keywords: ['auditoria', 'logs', 'historial', 'trazabilidad'],
        route: '/audit-logs',
        order: 4,
      },
      {
        id: 'settings',
        title: 'Configuración',
        description: 'Parámetros globales y perfil de plataforma',
        keywords: ['configuracion', 'ajustes', 'perfil', 'seguridad'],
        route: '/settings',
        order: 5,
      },
    ];
  }
}
