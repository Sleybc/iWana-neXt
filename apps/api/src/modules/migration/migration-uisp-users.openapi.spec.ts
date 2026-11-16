import {
  MIGRATION_IMPORTABLE_USER_ROLES,
  MIGRATION_SOURCE_CHECK_RESULTS,
  UserRole,
} from '@iwana/shared';
import {
  MIGRATION_BATCH_SUMMARY_OPENAPI,
  MIGRATION_MAPPING_CREATE_OPENAPI,
  MIGRATION_MAPPING_UPDATE_OPENAPI,
} from './migration-openapi.schemas';
import {
  MIGRATION_SOURCE_CONNECTION_OPENAPI,
  MIGRATION_SOURCE_ERROR_DESCRIPTIONS,
  MIGRATION_UISP_USER_OPENAPI,
  MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS,
  MIGRATION_UISP_USERS_RESOLVE_OPENAPI,
} from './migration-uisp-users.openapi';

type Schema = {
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  nullable?: boolean;
  description?: string;
};

const prop = (schema: unknown, ...path: string[]): Schema =>
  path.reduce<Schema>((node, key) => {
    const next = key === '[]' ? node.items : node.properties?.[key];
    if (!next) throw new Error(`OpenAPI sin ${path.join('.')}`);
    return next;
  }, schema as Schema);

describe('OpenAPI de usuarios de UISP (correcciones de revisión)', () => {
  it('promotionProcessing es requerido y nullable en el resumen del lote', () => {
    expect(MIGRATION_BATCH_SUMMARY_OPENAPI.required).toContain('promotionProcessing');
    const field = prop(MIGRATION_BATCH_SUMMARY_OPENAPI, 'promotionProcessing');
    expect(field.nullable).toBe(true);
    expect(field.enum).toContain(null);
  });

  it('role del resolve acepta todos los UserRole (como el contrato) y documenta el 422', () => {
    const role = prop(MIGRATION_UISP_USERS_RESOLVE_OPENAPI, 'items', '[]', 'role');
    expect(role.enum).toEqual(Object.values(UserRole));
    expect(role.description).toMatch(/422 MIGRATION_USER_ROLE_NOT_ALLOWED/u);
    for (const importable of MIGRATION_IMPORTABLE_USER_ROLES) {
      expect(role.description).toContain(importable);
    }
  });

  it('enums nullables incluyen null (OpenAPI 3.0)', () => {
    const proposed = prop(MIGRATION_UISP_USER_OPENAPI, 'proposedRole');
    expect(proposed.nullable).toBe(true);
    expect(proposed.enum).toEqual([...Object.values(UserRole), null]);
    const check = prop(MIGRATION_SOURCE_CONNECTION_OPENAPI, 'lastCheckResult');
    expect(check.enum).toEqual([...MIGRATION_SOURCE_CHECK_RESULTS, null]);
  });

  it('targetRef de equivalencias menciona USUARIO', () => {
    expect(prop(MIGRATION_MAPPING_CREATE_OPENAPI, 'targetRef').description).toMatch(/USUARIO/u);
    expect(prop(MIGRATION_MAPPING_UPDATE_OPENAPI, 'targetRef').description).toMatch(/USUARIO/u);
  });

  it('documenta el código de fila ya revisada, el motivo SIN_COINCIDENCIA y el 409 sin conexión', () => {
    expect(MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS.resolved).toMatch(
      /^MIGRATION_UISP_USER_ALREADY_RESOLVED/u,
    );
    expect(MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS.unprocessable).toMatch(
      /details\.reason = SIN_COINCIDENCIA/u,
    );
    expect(MIGRATION_SOURCE_ERROR_DESCRIPTIONS.notConfigured).toMatch(/409/u);
  });

  it('documenta targetUserId (solo ENLAZAR) y el motivo USUARIO_NO_VALIDO', () => {
    const target = prop(MIGRATION_UISP_USERS_RESOLVE_OPENAPI, 'items', '[]', 'targetUserId');
    expect(target).toMatchObject({ type: 'string', format: 'uuid' });
    expect(target.description).toMatch(/ENLAZAR/u);
    expect(prop(MIGRATION_UISP_USERS_RESOLVE_OPENAPI, 'items', '[]').required).toEqual([
      'id',
      'action',
    ]);
    expect(MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS.unprocessable).toMatch(
      /details\.reason = USUARIO_NO_VALIDO/u,
    );
  });
});
