import {
  describeAuditFieldLabel,
  describePlatformActivityLine,
  shouldOmitAuditFieldInReading,
} from './platform-audit-vocabulary';

describe('describePlatformActivityLine', () => {
  it('arma una frase con verbo y sin enum', () => {
    expect(
      describePlatformActivityLine({
        action: 'UPDATE',
        entityType: 'tenant',
        actor: { displayName: 'María Admin' },
      }),
    ).toBe('María Admin actualizó una empresa');
  });

  it('usa el nombre de la empresa cuando viene en el cambio', () => {
    expect(
      describePlatformActivityLine({
        action: 'CREATE',
        entityType: 'tenant',
        actor: { displayName: 'María Admin' },
        newValue: { name: 'Fibernet Colombia' },
      }),
    ).toBe('María Admin registró Fibernet Colombia');
  });

  it('omite la entidad en inicio y cierre de sesión', () => {
    expect(
      describePlatformActivityLine({
        action: 'LOGIN',
        entityType: 'user',
        actor: { displayName: 'María Admin' },
      }),
    ).toBe('María Admin inició sesión');
  });

  it('no expone id ni correo como sujeto', () => {
    const line = describePlatformActivityLine({
      action: 'UPDATE',
      entityType: 'user',
      actor: { displayName: 'María Admin' },
      newValue: { name: 'ops@empresa.demo', id: 'user-99' },
    });

    expect(line).toBe('María Admin actualizó un usuario interno');
    expect(line).not.toMatch(/user-99|@/);
  });

  it('nombra la verificación en dos pasos sin MFA', () => {
    const line = describePlatformActivityLine({
      action: 'MFA_ENABLED',
      entityType: 'user',
      actor: { displayName: 'María Admin' },
    });

    expect(line).toBe('María Admin activó la verificación en dos pasos');
    expect(line).not.toMatch(/MFA|mfa/);
  });

  it('describe un acceso fallido sin enum', () => {
    expect(
      describePlatformActivityLine({
        action: 'LOGIN_FAILED',
        entityType: 'user',
        actor: { displayName: 'María Admin' },
      }),
    ).toBe('María Admin no pudo iniciar sesión');
  });

  it('pone en marcha una empresa con su nombre', () => {
    expect(
      describePlatformActivityLine({
        action: 'TENANT_PROVISIONED',
        entityType: 'tenant',
        actor: { displayName: 'María Admin' },
        newValue: { name: 'Fibernet Colombia' },
      }),
    ).toBe('María Admin puso en marcha Fibernet Colombia');
  });
});

describe('describeAuditFieldLabel (CA-AUD-02)', () => {
  it('no pinta slug como Slug en Lectura', () => {
    expect(describeAuditFieldLabel('slug', { mode: 'reading' })).toBeNull();
    expect(shouldOmitAuditFieldInReading('slug')).toBe(true);
  });

  it('omite schemaName en Lectura', () => {
    expect(describeAuditFieldLabel('schemaName', { mode: 'reading' })).toBeNull();
  });

  it('usa label de producto para mfaEnabled', () => {
    expect(describeAuditFieldLabel('mfaEnabled')).toBe('Verificación en dos pasos');
  });

  it('mapea campos humanos de identidad', () => {
    expect(describeAuditFieldLabel('firstName')).toBe('Nombre');
    expect(describeAuditFieldLabel('lastName')).toBe('Apellido');
    expect(describeAuditFieldLabel('email')).toBe('Correo');
    expect(describeAuditFieldLabel('isActive')).toBe('Activo');
    expect(describeAuditFieldLabel('password')).toBe('Contraseña');
    expect(describeAuditFieldLabel('role')).toBe('Categoría base');
  });

  it('en Detalle muestra identificador interno para slug', () => {
    expect(describeAuditFieldLabel('slug', { mode: 'detail' })).toBe('Identificador interno');
  });
});
