import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AccessPermissionKey, ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { ExecutionOrdersController } from '../execution-orders.controller';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import {
  ROLE_ASSIGNABLE_PERMISSION_MATRIX,
  ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2,
} from '../../access-control/access-control.constants';

/**
 * H6 — Paridad del contratista en `POST :id/unblock`
 * (dictamen sec-eng §H6, ADR-091 §D6 condición 2, spec §8 deuda 5).
 *
 * El defecto: `block` admitía CONTRACTOR en `@Roles` y `unblock` lo excluía,
 * mientras `computeAllowedActions` ofrecía UNBLOCK al contratista asignado.
 * La consola ofrecía lo que el API rechazaba.
 *
 * Este spec fija la paridad en los tres niveles —decorador, permiso sembrado
 * y veredicto del guard— y el test de la divergencia (lo ofrecido == lo
 * aceptado para el mismo actor y estado).
 *
 * Alcance: solo lectura del servicio (`computeAllowedActions`,
 * `assertActorAccess` con `@iwana/db` simulado). No toca
 * `execution-orders.service.ts` (serie T0 en paralelo).
 */

let currentOrder: Record<string, unknown> | null = null;

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    TenantContext: {
      getOrThrow: jest.fn().mockReturnValue({
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
      }),
    },
    runInTenantSchema: jest.fn(
      async (_dataSource: unknown, _schemaName: string, callback: (qr: unknown) => unknown) =>
        callback({
          manager: {
            findOne: jest.fn().mockImplementation(async () => currentOrder),
          },
        }),
    ),
  };
});

// ─── Actores y OT de prueba (sin PII real) ────────────────────────────────────

function contractorActor(sub = 'contractor-001'): JwtPayload {
  return {
    sub,
    email: `${sub}@example.test`,
    role: UserRole.CONTRACTOR,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: `jti-${sub}`,
    type: 'tenant',
  };
}

function technicianActor(sub = 'tech-001'): JwtPayload {
  return {
    sub,
    email: `${sub}@example.test`,
    role: UserRole.TECHNICIAN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: `jti-${sub}`,
    type: 'tenant',
  };
}

function foreignActor(role: UserRole, sub = 'outsider-001'): JwtPayload {
  return {
    sub,
    email: `${sub}@example.test`,
    role,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: `jti-${sub}`,
    type: 'tenant',
  };
}

function blockedOrderAssignedTo(sub: string) {
  return {
    id: 'eo-h6-001',
    tenantId: 'tenant-001',
    executionOrderNumber: 'OTE-H6-001',
    version: 2,
    status: ExecutionOrderStatus.BLOCKED,
    result: null,
    workType: WfmWorkType.INSTALLATION,
    scheduleEventId: '11111111-1111-4111-8111-111111111111',
    plannedWindowStartAt: new Date('2026-09-10T14:00:00.000Z'),
    plannedWindowEndAt: new Date('2026-09-10T16:00:00.000Z'),
    assignedTechnicianId: sub,
    assignedCrewId: null,
    municipality: 'Bogotá',
    sector: 'Centro',
    organizationSiteId: '22222222-2222-4222-8222-222222222222',
    startedAt: new Date('2026-09-10T14:05:00.000Z'),
    closedAt: null,
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
    updatedAt: new Date('2026-09-10T15:00:00.000Z'),
  };
}

function buildRolesContext(actor: JwtPayload, handlerName: 'block' | 'unblock') {
  const handler = ExecutionOrdersController.prototype[
    handlerName as keyof ExecutionOrdersController
  ] as object;
  return {
    getHandler: () => handler,
    getClass: () => ExecutionOrdersController,
    switchToHttp: () => ({
      getRequest: () => ({ user: actor, params: {}, method: 'POST' }),
    }),
  } as never;
}

describe('H6 — paridad del contratista en block/unblock', () => {
  let service: ExecutionOrdersService;
  let rolesGuard: RolesGuard;

  beforeEach(() => {
    service = new ExecutionOrdersService({} as DataSource);
    rolesGuard = new RolesGuard(new Reflector());
    currentOrder = null;
    jest.clearAllMocks();
  });

  // ── Nivel 1: el decorador iguala al par ────────────────────────────────────

  describe('nivel 1 — @Roles de unblock iguala al de block', () => {
    it('block y unblock declaran exactamente el mismo conjunto de roles', () => {
      const reflector = new Reflector();
      const readRoles = (handlerName: 'block' | 'unblock'): string[] => {
        const handler = ExecutionOrdersController.prototype[handlerName] as (
          ...args: never[]
        ) => unknown;
        return (
          reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, ExecutionOrdersController]) ??
          []
        );
      };

      expect(readRoles('unblock')).toEqual(readRoles('block'));
      expect(readRoles('unblock')).toContain(UserRole.CONTRACTOR);
    });
  });

  // ── Nivel 2: el permiso está sembrado para el rol ──────────────────────────

  describe('nivel 2 — permiso EXECUTE sembrado para CONTRACTOR', () => {
    it.each([
      ['V1', ROLE_ASSIGNABLE_PERMISSION_MATRIX],
      ['V2', ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2],
    ])('matriz %s: CONTRACTOR trae OPERATIONS_EXECUTION_ORDERS_EXECUTE', (_label, matrix) => {
      expect(matrix[UserRole.CONTRACTOR]).toContain(
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
      );
      // Paridad con el técnico: el mismo permiso, sin SUPERVISE de más.
      expect(matrix[UserRole.CONTRACTOR]).toContain(
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      );
      expect(matrix[UserRole.CONTRACTOR]).not.toContain(
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
      );
    });
  });

  // ── Nivel 3: el guard resuelve el mismo veredicto en ambos comandos ────────

  describe('nivel 3 — veredicto del guard para contratista asignado en BLOCKED', () => {
    it('RolesGuard acepta a CONTRACTOR en unblock (igual que en block)', () => {
      const actor = contractorActor();

      expect(rolesGuard.canActivate(buildRolesContext(actor, 'unblock'))).toBe(true);
      expect(rolesGuard.canActivate(buildRolesContext(actor, 'block'))).toBe(true);
    });

    it('assertActorAccess resuelve igual para contratista y técnico asignados', async () => {
      currentOrder = blockedOrderAssignedTo('contractor-001');
      await expect(
        service.assertActorAccess('eo-h6-001', contractorActor(), true, true, false),
      ).resolves.toBeUndefined();

      currentOrder = blockedOrderAssignedTo('tech-001');
      await expect(
        service.assertActorAccess('eo-h6-001', technicianActor(), true, true, false),
      ).resolves.toBeUndefined();
    });
  });

  // ── El test de la divergencia: lo ofrecido == lo aceptado ──────────────────

  describe('divergencia política↔endpoint (el test que faltaba)', () => {
    it('contratista asignado en BLOCKED: UNBLOCK ofrecido y aceptado', async () => {
      const actor = contractorActor();
      currentOrder = blockedOrderAssignedTo(actor.sub);

      // Lo ofrecido por la política de UI.
      const offered = service.computeAllowedActions(currentOrder as never, actor);
      expect(offered).toContain('UNBLOCK');

      // Lo aceptado por el endpoint: rol + permiso + ABAC.
      expect(rolesGuard.canActivate(buildRolesContext(actor, 'unblock'))).toBe(true);
      expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX[UserRole.CONTRACTOR]).toContain(
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE,
      );
      await expect(
        service.assertActorAccess('eo-h6-001', actor, true, true, false),
      ).resolves.toBeUndefined();
    });

    it('técnico asignado en BLOCKED: el mismo ofrecido y el mismo aceptado (paridad)', async () => {
      const actor = technicianActor();
      currentOrder = blockedOrderAssignedTo(actor.sub);

      const offered = service.computeAllowedActions(currentOrder as never, actor);
      expect(offered).toContain('UNBLOCK');
      expect(rolesGuard.canActivate(buildRolesContext(actor, 'unblock'))).toBe(true);
      await expect(
        service.assertActorAccess('eo-h6-001', actor, true, true, false),
      ).resolves.toBeUndefined();
    });
  });

  // ── Ningún rol gana alcance ────────────────────────────────────────────────

  describe('sin ampliación de alcance', () => {
    it('contratista NO asignado: sin UNBLOCK ofrecido y ABAC lo rechaza', async () => {
      const actor = contractorActor();
      currentOrder = blockedOrderAssignedTo('tech-001');

      const offered = service.computeAllowedActions(currentOrder as never, actor);
      expect(offered).not.toContain('UNBLOCK');

      await expect(
        service.assertActorAccess('eo-h6-001', actor, true, true, false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([UserRole.SUBSCRIBER, UserRole.PARTNER, UserRole.AUDITOR, UserRole.SALES])(
      'rol ajeno %s: RolesGuard rechaza unblock',
      (role) => {
        expect(() =>
          rolesGuard.canActivate(buildRolesContext(foreignActor(role), 'unblock')),
        ).toThrow(ForbiddenException);
      },
    );

    it.each([UserRole.SUBSCRIBER, UserRole.PARTNER, UserRole.AUDITOR, UserRole.SALES])(
      'rol ajeno %s: RolesGuard rechaza block (el par no se movió)',
      (role) => {
        expect(() =>
          rolesGuard.canActivate(buildRolesContext(foreignActor(role), 'block')),
        ).toThrow(ForbiddenException);
      },
    );
  });
});
