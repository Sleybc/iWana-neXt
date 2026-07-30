import { TenantContext } from '@iwana/db';
import type { TenantContextPayload } from '@iwana/db';
import type { NextFunction, Request, Response } from 'express';

const TENANT_CONTEXT_BY_TEST_TOKEN: Readonly<Record<string, TenantContextPayload>> = {
  'Bearer support-token': {
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    tenantSlug: 'tenant-001',
  },
  'Bearer tech-token': {
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    tenantSlug: 'tenant-001',
  },
  'Bearer tech-002-token': {
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    tenantSlug: 'tenant-001',
  },
  'Bearer coordinator-token': {
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    tenantSlug: 'tenant-001',
  },
  'Bearer coordinator-readonly-token': {
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    tenantSlug: 'tenant-001',
  },
  'Bearer contractor-token': {
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    tenantSlug: 'tenant-001',
  },
  'Bearer contractor-tenantb-token': {
    tenantId: 'tenant-002',
    schemaName: 'tenant_002',
    tenantSlug: 'tenant-002',
  },
};

/**
 * Reproduce el resultado verificado del JWT del mock de autenticación antes de
 * entrar al pipeline de guards. No lee el tenant desde headers de entrada ni
 * ofrece fallback de plataforma; un token no reconocido deja el contexto
 * ausente para que el guard de autenticación rechace la petición.
 */
export const createVerifiedTenantContextMiddleware =
  () =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const tenantContext = TENANT_CONTEXT_BY_TEST_TOKEN[req.headers.authorization ?? ''];

    if (!tenantContext) {
      next();
      return;
    }

    TenantContext.run(tenantContext, next);
  };
