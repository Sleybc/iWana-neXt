import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessPermissionAvailability, AccessPermissionKey, UserRole } from '@iwana/shared';
import {
  MOD00_ACCESS_V1_CATALOG,
  ROLE_ASSIGNABLE_PERMISSION_MATRIX,
} from './access-control.constants';

const MODULES_ROOT = join(__dirname, '..');

interface HandlerContract {
  file: string;
  roles: UserRole[];
  permissions: AccessPermissionKey[];
}

function listControllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listControllerFiles(fullPath);
    }
    return entry.name.endsWith('.controller.ts') ? [fullPath] : [];
  });
}

function resolvePermissionKey(member: string): AccessPermissionKey {
  const value = AccessPermissionKey[member as keyof typeof AccessPermissionKey];
  if (!value) {
    throw new Error(`AccessPermissionKey.${member} no existe en el enum`);
  }
  return value;
}

function resolveUserRole(member: string): UserRole | undefined {
  return UserRole[member as keyof typeof UserRole];
}

function extractEnumMembers(inner: string, enumName: string): string[] {
  return [...inner.matchAll(new RegExp(`${enumName}\\.([A-Z0-9_]+)`, 'g'))].map(
    (match) => match[1] ?? '',
  );
}

function extractHandlerContracts(file: string, source: string): HandlerContract[] {
  const contracts: HandlerContract[] = [];
  const permissionRegex = /@Permissions\(([\s\S]*?)\)/g;

  for (const match of source.matchAll(permissionRegex)) {
    const inner = match[1] ?? '';
    const permissions = extractEnumMembers(inner, 'AccessPermissionKey').map(resolvePermissionKey);
    const prefix = source.slice(0, match.index ?? 0);
    const rolesMatch = [...prefix.matchAll(/@Roles\(([\s\S]*?)\)/g)].at(-1);
    const roles = rolesMatch
      ? extractEnumMembers(rolesMatch[1] ?? '', 'UserRole')
          .map(resolveUserRole)
          .filter((role): role is UserRole => role !== undefined)
      : [];

    contracts.push({ file, roles, permissions });
  }

  return contracts;
}

describe('invariante catálogo MOD00_ACCESS_V1 vs @Permissions()', () => {
  const catalogKeys = new Set(MOD00_ACCESS_V1_CATALOG.map((entry) => entry.permissionKey));
  const assignableKeys = new Set(
    MOD00_ACCESS_V1_CATALOG.filter(
      (entry) => entry.availability === AccessPermissionAvailability.ASSIGNABLE,
    ).map((entry) => entry.permissionKey),
  );
  const controllerFiles = listControllerFiles(MODULES_ROOT);
  const handlers = controllerFiles.flatMap((file) =>
    extractHandlerContracts(file, readFileSync(file, 'utf8')),
  );
  const usedPermissionKeys = [...new Set(handlers.flatMap((handler) => handler.permissions))];

  it('escanea controladores de apps/api con @Permissions()', () => {
    expect(controllerFiles.length).toBeGreaterThan(0);
    expect(handlers.length).toBeGreaterThan(0);
    expect(usedPermissionKeys).toEqual(
      expect.arrayContaining([
        AccessPermissionKey.OPERATIONS_TASKS_READ,
        AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
      ]),
    );
  });

  it('toda clave usada en @Permissions() existe en MOD00_ACCESS_V1_CATALOG', () => {
    const missing = usedPermissionKeys.filter((key) => !catalogKeys.has(key));
    expect(missing).toEqual([]);
  });

  it('toda clave ASSIGNABLE de un @Permissions() está en la matriz de al menos un rol del handler', () => {
    const orphans = handlers.flatMap((handler) =>
      handler.permissions
        .filter((permission) => assignableKeys.has(permission))
        .filter((permission) => {
          if (handler.roles.length === 0) {
            return true;
          }
          return !handler.roles.some((role) =>
            (ROLE_ASSIGNABLE_PERMISSION_MATRIX[role] ?? []).includes(permission),
          );
        })
        .map((permission) => ({ file: handler.file, permission, roles: handler.roles })),
    );

    expect(orphans).toEqual([]);
  });

  it('el baseline ADMIN incluye operations.tasks.read y operations.tasks.manage', () => {
    const adminBaseline = ROLE_ASSIGNABLE_PERMISSION_MATRIX[UserRole.ADMIN] ?? [];
    expect(adminBaseline).toEqual(
      expect.arrayContaining([
        AccessPermissionKey.OPERATIONS_TASKS_READ,
        AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
      ]),
    );
  });

  it('la matriz asignable cubre tareas según roles del controlador vigente', () => {
    const readAndManage = [
      AccessPermissionKey.OPERATIONS_TASKS_READ,
      AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
    ];
    const operationalRoles = [UserRole.NOC, UserRole.SUPPORT, UserRole.SALES, UserRole.TECHNICIAN];

    for (const role of operationalRoles) {
      expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX[role]).toEqual(
        expect.arrayContaining(readAndManage),
      );
    }

    expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX[UserRole.CONTRACTOR]).toEqual(
      expect.arrayContaining([AccessPermissionKey.OPERATIONS_TASKS_READ]),
    );
    expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX[UserRole.CONTRACTOR]).not.toContain(
      AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
    );

    for (const role of [UserRole.ACCOUNTANT, UserRole.HR, UserRole.AUDITOR]) {
      expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX[role]).not.toContain(
        AccessPermissionKey.OPERATIONS_TASKS_READ,
      );
      expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX[role]).not.toContain(
        AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
      );
    }
  });
});
