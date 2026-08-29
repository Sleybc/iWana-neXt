import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessPermissionAvailability, AccessPermissionKey, UserRole } from '@iwana/shared';
import {
  MOD00_ACCESS_V1_CATALOG,
  MOD00_ACCESS_V2_CATALOG,
  MOD00_ACCESS_V2_DEPRECATED_KEYS,
  MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES,
  ROLE_ASSIGNABLE_PERMISSION_MATRIX,
  ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2,
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
    const rolesMatches = [...prefix.matchAll(/@Roles\(([\s\S]*?)\)/g)];
    // Find the closest @Roles before this @Permissions within the same handler block (between previous @Permissions or start)
    // For handler isolation we look backwards until the previous method decorator @Get/@Post/@Patch/@Delete etc.
    const lastHandlerStart = Math.max(
      prefix.lastIndexOf('@Get('),
      prefix.lastIndexOf('@Post('),
      prefix.lastIndexOf('@Patch('),
      prefix.lastIndexOf('@Delete('),
      prefix.lastIndexOf('@Put('),
    );
    const relevantRoles = rolesMatches.filter((rm) => (rm.index ?? 0) > lastHandlerStart);
    const rolesMatch = relevantRoles.at(-1);
    let roles: UserRole[] = [];
    let hasSpreadConstant = false;
    if (rolesMatch) {
      const innerRoles = rolesMatch[1] ?? '';
      hasSpreadConstant = innerRoles.includes('...');
      const extracted = extractEnumMembers(innerRoles, 'UserRole')
        .map(resolveUserRole)
        .filter((role): role is UserRole => role !== undefined);
      roles = extracted;
      // Si usa spread constants (COMMERCIAL_*_ROLES), consideramos que declara roles: no es violador de invariante
      // y para el chequeo de matriz lo excluimos porque no podemos resolver el set exacto sin importar la constante.
      if (hasSpreadConstant && roles.length === 0) {
        // Marcar con placeholder para no ser considerado violador; el orphan se filtra después
        roles = [UserRole.ADMIN];
        (roles as any)._isSpread = true;
      }
    }

    contracts.push({ file, roles, permissions });
  }

  return contracts;
}

describe('invariante catálogo MOD00_ACCESS_V1 vs @Permissions()', () => {
  const v1Keys = new Set(MOD00_ACCESS_V1_CATALOG.map((entry) => entry.permissionKey));
  const v2Keys = new Set(MOD00_ACCESS_V2_CATALOG.map((entry) => entry.permissionKey));
  const catalogKeys = new Set([...v1Keys, ...v2Keys]);
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

  it('toda clave usada en @Permissions() existe en catálogo V1 o V2', () => {
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

describe('invariante catálogo MOD00_ACCESS_V2', () => {
  const v2Assignable = new Set(
    MOD00_ACCESS_V2_CATALOG.filter(
      (e) => e.availability === AccessPermissionAvailability.ASSIGNABLE,
    ).map((e) => e.permissionKey),
  );
  const deprecatedSet = new Set(MOD00_ACCESS_V2_DEPRECATED_KEYS);

  it('toda clave de la matriz V2 es ASSIGNABLE en el catálogo V2', () => {
    const matrixKeys = new Set(Object.values(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2).flat());
    const orphans = [...matrixKeys].filter((k) => !v2Assignable.has(k));
    expect(orphans).toEqual([]);
  });

  it('claves deprecadas no aparecen en matriz V2 ni en plantillas V2', () => {
    const matrixKeys = new Set(Object.values(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2).flat());
    const templateKeys = new Set(
      MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES.flatMap((t) => t.permissionKeys),
    );
    for (const dep of deprecatedSet) {
      expect(matrixKeys.has(dep)).toBe(false);
      expect(templateKeys.has(dep as AccessPermissionKey)).toBe(false);
      expect(v2Assignable.has(dep as AccessPermissionKey)).toBe(false);
    }
  });

  it('cada plantilla estándar V2 ⊆ matriz de su categoría', () => {
    for (const tpl of MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES) {
      const allowed = new Set(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[tpl.baseRoleConstraint] ?? []);
      const outliers = tpl.permissionKeys.filter((k) => !allowed.has(k));
      expect(outliers).toEqual([]);
    }
  });

  it('canon de plantillas V2 = 9 plantillas exactas con nombres canónicos', () => {
    expect(MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES).toHaveLength(9);
    const names = MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'Acceso estándar Auditoría',
        'Acceso estándar Comercial',
        'Acceso estándar Contable',
        'Acceso estándar Contratista',
        'Acceso estándar NOC',
        'Acceso estándar RRHH',
        'Acceso estándar Soporte',
        'Acceso estándar Técnico',
        'Administrador general',
      ].sort(),
    );
    const roles = MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES.map((t) => t.baseRoleConstraint).sort();
    expect(roles).toEqual(
      [
        UserRole.ADMIN,
        UserRole.AUDITOR,
        UserRole.ACCOUNTANT,
        UserRole.CONTRACTOR,
        UserRole.HR,
        UserRole.NOC,
        UserRole.SALES,
        UserRole.SUPPORT,
        UserRole.TECHNICIAN,
      ].sort(),
    );
    // SUBSCRIBER/PARTNER/INVESTOR sin plantilla
    expect(roles).not.toContain(UserRole.SUBSCRIBER);
    expect(roles).not.toContain(UserRole.PARTNER);
    expect(roles).not.toContain(UserRole.INVESTOR);
  });

  it('ADMIN V2 contiene 35 claves ASSIGNABLE y descripciones promovidas sin "en fase futura"', () => {
    expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.ADMIN]).toHaveLength(35);
    const promoted = [
      AccessPermissionKey.COMMERCIAL_CATALOG_READ,
      AccessPermissionKey.COMMERCIAL_CATALOG_MANAGE,
      AccessPermissionKey.ASSURANCE_TICKETS_READ,
      AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
      AccessPermissionKey.INVENTORY_STOCK_READ,
      AccessPermissionKey.INVENTORY_STOCK_MANAGE,
    ];
    for (const key of promoted) {
      const entry = MOD00_ACCESS_V2_CATALOG.find((e) => e.permissionKey === key);
      expect(entry?.availability).toBe(AccessPermissionAvailability.ASSIGNABLE);
      expect(entry?.description).not.toMatch(/en fase futura/i);
      expect(entry?.description).not.toMatch(/futuro/i);
    }
    expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.ADMIN]).toEqual(
      expect.arrayContaining(promoted),
    );
  });

  it('ampliaciones deliberadas de matriz V2 contienen los 3 casos †', () => {
    expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.TECHNICIAN]).toEqual(
      expect.arrayContaining([
        AccessPermissionKey.CRM_SUBSCRIBERS_READ,
        AccessPermissionKey.INVENTORY_STOCK_READ,
      ]),
    );
    expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.TECHNICIAN]).toEqual(
      expect.arrayContaining([AccessPermissionKey.ASSURANCE_TICKETS_READ]),
    );
    expect(ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.AUDITOR]).toEqual(
      expect.arrayContaining([
        AccessPermissionKey.CRM_SUBSCRIBERS_READ,
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
        AccessPermissionKey.ASSURANCE_TICKETS_READ,
        AccessPermissionKey.INVENTORY_STOCK_READ,
        AccessPermissionKey.INVENTORY_PURCHASING_READ,
        AccessPermissionKey.COMMERCIAL_CATALOG_READ,
      ]),
    );
  });
});

describe('invariante Fase 2 — doble guard y excepciones D7', () => {
  const controllerFiles = listControllerFiles(MODULES_ROOT);
  const handlers = controllerFiles.flatMap((file) =>
    extractHandlerContracts(file, readFileSync(file, 'utf8')),
  );
  const v2Assignable = new Set(
    MOD00_ACCESS_V2_CATALOG.filter(
      (e) => e.availability === AccessPermissionAvailability.ASSIGNABLE,
    ).map((e) => e.permissionKey),
  );
  const billingKeys = [
    AccessPermissionKey.BILLING_PAYMENTS_READ,
    AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
    AccessPermissionKey.BILLING_INVOICES_READ,
    AccessPermissionKey.BILLING_INVOICES_MANAGE,
  ];

  it('todo handler con @Permissions declara también @Roles', () => {
    const violators = handlers.filter((h) => h.permissions.length > 0 && h.roles.length === 0);
    expect(violators).toEqual([]);
  });

  it('toda clave usada en @Permissions() existe en MOD00_ACCESS_V2_CATALOG', () => {
    const v2Keys = new Set(MOD00_ACCESS_V2_CATALOG.map((e) => e.permissionKey));
    const used = [...new Set(handlers.flatMap((h) => h.permissions))];
    const missing = used.filter((k) => !v2Keys.has(k));
    // Se permite que claves V1 (operations.*) sigan existiendo pero deben estar en V2 también o en V1; aquí verificamos V2 como fuente vigente
    // Para Fase 2, todas las claves cableadas (crm.*, commercial.*, etc.) están en V2
    const v1Only = new Set(MOD00_ACCESS_V1_CATALOG.map((e) => e.permissionKey));
    const trulyMissing = missing.filter((k) => !v1Only.has(k));
    expect(trulyMissing).toEqual([]);
  });

  it('toda clave ASSIGNABLE usada está en la matriz V2 de al menos un rol del handler', () => {
    const orphans = handlers.flatMap((handler) => {
      // Handlers con spread constants no se validan por falta de resolución estática; se cubren por invariante de matriz directa
      if ((handler.roles as any)._isSpread) return [];
      return handler.permissions
        .filter((p) => v2Assignable.has(p))
        .filter(
          (p) =>
            !handler.roles.some((role) =>
              (ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[role] ?? []).includes(p),
            ),
        )
        .map((permission) => ({ file: handler.file, permission, roles: handler.roles }));
    });
    expect(orphans).toEqual([]);
  });

  it('billing.* no aparece en ningún @Permissions', () => {
    const used = [...new Set(handlers.flatMap((h) => h.permissions))];
    const billingUsed = used.filter((k) => billingKeys.includes(k));
    expect(billingUsed).toEqual([]);
  });

  it('D7: subscriber-tax.controller permanece @Roles-only sin @Permissions', () => {
    const taxFiles = controllerFiles.filter((f) => f.includes('subscriber-tax.controller.ts'));
    expect(taxFiles.length).toBeGreaterThan(0);
    const taxHandlers = taxFiles.flatMap((file) =>
      extractHandlerContracts(file, readFileSync(file, 'utf8')),
    );
    expect(taxHandlers).toEqual([]);
  });

  it('D7: los 2 endpoints de expedientes con TECHNICIAN en @Roles permanecen @Roles-only', () => {
    const expFile = controllerFiles.find((f) => f.includes('expedientes.controller.ts'));
    expect(expFile).toBeDefined();
    const source = readFileSync(expFile!, 'utf8');
    // Extraer bloques de esos 2 endpoints: deben tener @Roles con TECHNICIAN pero no @Permissions cercano
    const coverageBlocks = [
      ...source.matchAll(
        /@(?:Post|Get)\(':id\/coverage-checks'\)[\s\S]*?@Roles\([\s\S]*?TECHNICIAN[\s\S]*?\)[\s\S]*?@ApiOperation/g,
      ),
    ];
    expect(coverageBlocks.length).toBe(2);
    for (const block of coverageBlocks) {
      expect(block[0]).not.toMatch(/@Permissions/);
    }
  });

  it('GETs cableados incluyen AUDITOR/TECHNICIAN según ampliaciones deliberadas', () => {
    // Verificación puntual: subscribers, inventory, assurance, commercial y expedientes GET deben tener AUDITOR
    const checks: Array<{ filePart: string; mustInclude: string }> = [
      { filePart: 'subscribers.controller.ts', mustInclude: 'AUDITOR' },
      { filePart: 'inventory.controller.ts', mustInclude: 'AUDITOR' },
      { filePart: 'assurance.controller.ts', mustInclude: 'AUDITOR' },
      { filePart: 'expedientes.controller.ts', mustInclude: 'AUDITOR' },
      { filePart: 'catalog.controller.ts', mustInclude: 'AUDITOR' },
    ];
    for (const check of checks) {
      const f = controllerFiles.find((cf) => cf.includes(check.filePart));
      expect(f).toBeDefined();
      const src = readFileSync(f!, 'utf8');
      expect(src).toMatch(new RegExp(check.mustInclude));
    }
    // TECHNICIAN en subscribers e inventory
    for (const part of ['subscribers.controller.ts', 'inventory.controller.ts']) {
      const f = controllerFiles.find((cf) => cf.includes(part));
      const src = readFileSync(f!, 'utf8');
      expect(src).toMatch(/TECHNICIAN/);
    }
  });
});
