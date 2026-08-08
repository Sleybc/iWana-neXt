import { DropPlatformUsersEmailHash1784419210000 } from '../public/022_drop_platform_users_email_hash';
import { DropPiiSha256HashColumns1090000000000 } from '../tenant/109_drop_pii_sha256_hash_columns';
import {
  describeContractEnvResidualWarning,
  describeDeferredMigration,
  envValueIsTrue,
  filterDeferredMigrations,
  isMigrationDeferred,
  shouldWarnContractEnvResidual,
} from './deferred-migration.util';

describe('envValueIsTrue', () => {
  it('rechaza valores ausentes, vacíos o no booleanos', () => {
    expect(envValueIsTrue(undefined)).toBe(false);
    expect(envValueIsTrue('')).toBe(false);
    expect(envValueIsTrue('false')).toBe(false);
    expect(envValueIsTrue('0')).toBe(false);
    expect(envValueIsTrue('si')).toBe(false);
  });

  it('acepta true/1/yes/on con trim y sin importar mayúsculas (hallazgo SEC)', () => {
    expect(envValueIsTrue('true')).toBe(true);
    expect(envValueIsTrue('TRUE')).toBe(true);
    expect(envValueIsTrue('True')).toBe(true);
    expect(envValueIsTrue('1')).toBe(true);
    expect(envValueIsTrue(' yes ')).toBe(true);
    expect(envValueIsTrue('on')).toBe(true);
  });
});

describe('isMigrationDeferred', () => {
  it('no difiere una migración sin deferredBy', () => {
    expect(isMigrationDeferred({}, {})).toBe(false);
  });

  it('difiere salvo que la variable sea exactamente el literal "true"', () => {
    const migration = { deferredBy: 'IWANA_APPLY_PII_CONTRACT' };

    expect(isMigrationDeferred(migration, {})).toBe(true);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: '' })).toBe(true);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: '0' })).toBe(true);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'true' })).toBe(false);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'TRUE' })).toBe(true);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: '1' })).toBe(true);
  });

  it('solo el literal "true" habilita un contract destructivo', () => {
    const migration = { deferredBy: 'IWANA_APPLY_PII_CONTRACT' };

    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'true' })).toBe(false);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'TRUE' })).toBe(true);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: '1' })).toBe(true);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'yes' })).toBe(true);
    expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'on' })).toBe(true);
  });

  it('el aviso nombra la migración y la variable que la habilita', () => {
    const message = describeDeferredMigration('Mig123', 'IWANA_APPLY_PII_CONTRACT');

    expect(message).toContain('Mig123');
    expect(message).toContain('IWANA_APPLY_PII_CONTRACT=true');
  });

  it('el aviso incluye la gobernanza de ventana 2 (concern F-2)', () => {
    const message = describeDeferredMigration('Mig123', 'IWANA_APPLY_PII_CONTRACT');

    expect(message).toContain('no debe volverse permanente');
    expect(message).toContain('planifique la ventana 2');
  });
});

describe('aviso F-3 (env residual del contract)', () => {
  it('no advierte si quedan contracts pendientes', () => {
    expect(shouldWarnContractEnvResidual(1, { IWANA_APPLY_PII_CONTRACT: 'true' })).toBe(false);
  });

  it('advierte si la variable quedó activa sin contracts pendientes', () => {
    expect(shouldWarnContractEnvResidual(0, { IWANA_APPLY_PII_CONTRACT: 'true' })).toBe(true);
  });

  it('no advierte si la variable no está activa', () => {
    expect(shouldWarnContractEnvResidual(0, {})).toBe(false);
  });

  it('reconoce valores truthy alternativos en el aviso', () => {
    expect(shouldWarnContractEnvResidual(0, { IWANA_APPLY_PII_CONTRACT: 'TRUE' })).toBe(true);
  });

  it('el texto del aviso ordena retirar la variable', () => {
    const message = describeContractEnvResidualWarning('IWANA_APPLY_PII_CONTRACT');

    expect(message).toContain('IWANA_APPLY_PII_CONTRACT');
    expect(message).toContain('retire la variable del entorno');
  });
});

describe('filterDeferredMigrations', () => {
  const deferred = [
    { name: 'DropPlatformUsersEmailHash1784419210000', envVar: 'IWANA_APPLY_PII_CONTRACT' },
    { name: 'DropPiiSha256HashColumns1090000000000', envVar: 'IWANA_APPLY_PII_CONTRACT' },
  ];

  it('conserva las diferidas que aún no constan aplicadas', () => {
    const result = filterDeferredMigrations(deferred, new Set<string>());

    expect(result).toEqual(deferred);
  });

  it('descarta la diferida ya registrada tras la ventana 2 (falso pendiente)', () => {
    const applied = new Set<string>(['DropPlatformUsersEmailHash1784419210000']);

    const result = filterDeferredMigrations(deferred, applied);

    expect(result).toEqual([deferred[1]]);
  });

  it('no anuncia nada cuando el contract ya se aplicó completo', () => {
    const applied = new Set<string>(deferred.map(({ name }) => name));

    expect(filterDeferredMigrations(deferred, applied)).toEqual([]);
  });
});

describe('contract SEC-P1 diferido en ambos schemas', () => {
  it('tenant 109 y pública 022 comparten la misma variable', () => {
    // Aplicar solo una de las dos dejaría el rollback a medias: los digests de
    // tenant y los de plataforma tienen que sobrevivir o caer juntos.
    const tenant = new DropPiiSha256HashColumns1090000000000();
    const publicMigration = new DropPlatformUsersEmailHash1784419210000();

    expect(tenant.deferredBy).toBe('IWANA_APPLY_PII_CONTRACT');
    expect(publicMigration.deferredBy).toBe(tenant.deferredBy);
  });

  it('la 108 no está diferida: el expand debe aplicarse siempre', () => {
    expect(
      isMigrationDeferred(new DropPiiSha256HashColumns1090000000000(), {
        IWANA_APPLY_PII_CONTRACT: 'true',
      }),
    ).toBe(false);
  });
});
