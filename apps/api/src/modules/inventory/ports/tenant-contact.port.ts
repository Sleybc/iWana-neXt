import { Injectable } from '@nestjs/common';

export interface TenantContactInfo {
  contactEmail: string;
  phone: string | null;
  legalName: string | null;
}

/**
 * Port tipado para leer contacto del tenant desde inventory sin importar
 * la entidad Tenant ni tablas del módulo tenant (boundary Modulith).
 */
@Injectable()
export abstract class TenantContactPort {
  abstract getContactInfo(tenantId: string): Promise<TenantContactInfo>;
}
