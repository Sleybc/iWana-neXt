/**
 * Permiso del endpoint de equipos del suscriptor (spec 2026-11-16 §1 D4, CA-2; S-2 de sec-eng).
 *
 * El spec HTTP del controlador mockea PermissionsGuard (siempre true), así que nada fijaba el
 * permiso. Aquí se fijan los metadatos del handler real y se ejecutan los guards reales
 * (PermissionsGuard y RolesGuard) con un Reflector real sobre ese handler: un usuario
 * autenticado sin INVENTORY_STOCK_READ recibe 403.
 */
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { PERMISSIONS_KEY } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import type { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { InventoryController } from '../inventory.controller';

const proto = InventoryController.prototype as unknown as Record<string, object>;
const handler = proto['getSubscriberEquipment']!;
const loansHandler = proto['listLoans']!;

function contextFor(user: { sub: string; role: string; type: 'tenant' }): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => InventoryController,
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        params: { subscriberRefId: '00000000-0000-4000-8000-000000000001' },
        body: {},
        query: {},
      }),
    }),
  } as unknown as ExecutionContext;
}

function permissionsGuard(granted: AccessPermissionKey[]) {
  const service = {
    getEffectivePermissionsForUser: jest.fn().mockResolvedValue(granted),
  } as unknown as EffectivePermissionsService;
  return { guard: new PermissionsGuard(new Reflector(), service), service };
}

describe('GET inventory/subscribers/:subscriberRefId/equipment — permiso (D4, CA-2)', () => {
  it('declara @Permissions(INVENTORY_STOCK_READ) y solo ese permiso', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      AccessPermissionKey.INVENTORY_STOCK_READ,
    ]);
  });

  it('declara los mismos roles que /inventory/loans (D6)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
    expect(roles).toEqual(Reflect.getMetadata(ROLES_KEY, loansHandler));
    expect([...roles].sort()).toEqual(
      [
        UserRole.ADMIN,
        UserRole.NOC,
        UserRole.SUPPORT,
        UserRole.TECHNICIAN,
        UserRole.AUDITOR,
      ].sort(),
    );
  });

  it('403 para un usuario autenticado sin INVENTORY_STOCK_READ (guard real, S-2)', async () => {
    const { guard, service } = permissionsGuard([
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    ]);
    const context = contextFor({ sub: 'user-synthetic', role: UserRole.SUPPORT, type: 'tenant' });
    const result = guard.canActivate(context);
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    expect(service.getEffectivePermissionsForUser).toHaveBeenCalledWith(
      'user-synthetic',
      undefined,
    );
  });

  it('permite el acceso con INVENTORY_STOCK_READ (guard real)', async () => {
    const { guard } = permissionsGuard([AccessPermissionKey.INVENTORY_STOCK_READ]);
    await expect(
      guard.canActivate(
        contextFor({ sub: 'user-synthetic', role: UserRole.AUDITOR, type: 'tenant' }),
      ),
    ).resolves.toBe(true);
  });

  it('RolesGuard real: un rol fuera de la lista recibe 403 y uno de la lista pasa', () => {
    const guard = new RolesGuard(new Reflector());
    const outsider = UserRole.SALES;
    expect(Reflect.getMetadata(ROLES_KEY, handler) as string[]).not.toContain(outsider);
    expect(() =>
      guard.canActivate(contextFor({ sub: 'user-synthetic', role: outsider, type: 'tenant' })),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        contextFor({ sub: 'user-synthetic', role: UserRole.TECHNICIAN, type: 'tenant' }),
      ),
    ).toBe(true);
  });
});
