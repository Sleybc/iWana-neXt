/**
 * Superficie pura del CLI de recifrado: parseo de flags, resolución de modo y
 * carga de claves. El módulo estaba al 0% de cobertura.
 *
 * `main()` no se prueba aquí: abre `AppDataSource` y llama `process.exit`. Lo
 * que sí se fija es que **importar el módulo no ejecute nada** — antes de la
 * guarda `require.main === module`, un simple import disparaba el recifrado
 * real contra la base configurada.
 *
 * Las claves usadas son constantes de prueba sin valor: patrones hex repetidos,
 * nunca material criptográfico real ni proveniente del entorno.
 */
import {
  parseArgs,
  resolveMode,
  loadKeys,
  CliFlags,
  getMfaTenantTargets,
  validateCliFlags,
  assertRegisteredMfaTenantSchema,
  formatStartupLog,
  logSafeFatalError,
} from './reencrypt-aes';
import {
  PUBLIC_ENCRYPTED_TARGETS,
  TENANT_ENCRYPTED_TARGETS,
} from '../common/crypto/reencrypt-aes.targets';
import { PII_ENCRYPTED_TARGETS } from './reencrypt-aes.pii';
import {
  assertSafeDisposableIntegrationTarget,
  resolveK2ReencryptIntegrationEnabled,
} from './reencrypt-aes.integration-safety';

/** 64 hex con entropía suficiente para no disparar el guard de clave débil. */
const KEY_A = '0123456789abcdef'.repeat(4);
const KEY_B = 'fedcba9876543210'.repeat(4);
/** Entropía nula: el caso que `isWeakMfaEncryptionKeyHex` debe rechazar. */
const KEY_WEAK = '0'.repeat(64);

describe('CLI reencrypt-aes — parseArgs', () => {
  it('sin flags es dry-run: no aplica, no filtra, página 200', () => {
    expect(parseArgs([])).toEqual({
      apply: false,
      verifyActiveOnly: false,
      mfaToPii: false,
      verifyPiiOnly: false,
      pageSize: 200,
      help: false,
    });
  });

  it.each(['--apply', '--write'])('%s activa la escritura', (flag) => {
    expect(parseArgs([flag]).apply).toBe(true);
  });

  it.each(['--help', '-h'])('%s pide ayuda', (flag) => {
    expect(parseArgs([flag]).help).toBe(true);
  });

  it('--verify-active-only se reconoce', () => {
    expect(parseArgs(['--verify-active-only']).verifyActiveOnly).toBe(true);
  });

  it('--mfa-to-pii selecciona el recifrado de objetivos PII', () => {
    expect(parseArgs(['--mfa-to-pii']).mfaToPii).toBe(true);
  });

  it('--verify-pii-only selecciona la verificación PII activa', () => {
    expect(parseArgs(['--verify-pii-only']).verifyPiiOnly).toBe(true);
  });

  it('--schema= recorta espacios alrededor del nombre', () => {
    expect(parseArgs(['--schema=  tenant_demo  ']).schema).toBe('tenant_demo');
  });

  it('--page-size= acepta un entero positivo', () => {
    expect(parseArgs(['--page-size=50']).pageSize).toBe(50);
  });

  it.each(['--page-size=0', '--page-size=-5', '--page-size=abc'])(
    '%s se ignora y conserva el default (una página de 0 no avanzaría nunca)',
    (arg) => {
      expect(parseArgs([arg]).pageSize).toBe(200);
    },
  );

  it('una flag desconocida fuerza la ayuda en vez de continuar a ciegas', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sentinel = '--unknown=synthetic-sensitive-sentinel';

    expect(parseArgs([sentinel]).help).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Flag desconocida'));
    expect(spy.mock.calls.flat().join('\n')).not.toContain(sentinel);

    spy.mockRestore();
  });

  it('acumula varias flags en una sola invocación', () => {
    expect(parseArgs(['--apply', '--schema=tenant_x', '--page-size=10'])).toEqual({
      apply: true,
      verifyActiveOnly: false,
      mfaToPii: false,
      verifyPiiOnly: false,
      schema: 'tenant_x',
      pageSize: 10,
      help: false,
    });
  });
});

describe('CLI reencrypt-aes — validateCliFlags', () => {
  it.each(['--mfa-to-pii', '--verify-pii-only'])(
    '%s se rechaza sin un schema tenant explícito',
    (flag) => {
      expect(validateCliFlags(parseArgs([flag]))).toBe(
        'Los modos PII requieren --schema=<tenant>.',
      );
    },
  );

  it.each(['--mfa-to-pii', '--verify-pii-only'])('%s acepta un schema tenant explícito', (flag) => {
    expect(validateCliFlags(parseArgs([flag, '--schema=tenant_demo']))).toBeNull();
  });

  it('rechaza un schema vacío o el schema público en los modos PII', () => {
    expect(validateCliFlags(parseArgs(['--mfa-to-pii', '--schema=  ']))).toBe(
      'Los modos PII requieren --schema=<tenant>.',
    );
    expect(validateCliFlags(parseArgs(['--verify-pii-only', '--schema=public']))).toBe(
      'Los modos PII solo aceptan un schema tenant.',
    );
    expect(validateCliFlags(parseArgs(['--mfa-to-pii', '--schema=tenant_demo;DROP_SCHEMA']))).toBe(
      'Los modos PII solo aceptan un schema tenant.',
    );
  });

  it('mantiene los modos MFA existentes sin schema obligatorio', () => {
    expect(validateCliFlags(parseArgs([]))).toBeNull();
    expect(validateCliFlags(parseArgs(['--apply']))).toBeNull();
    expect(validateCliFlags(parseArgs(['--verify-active-only']))).toBeNull();
  });

  it('permite public en el ciclo MFA existente y rechaza schemas inválidos sin reflejarlos', () => {
    const sentinel = 'synthetic-invalid-schema-sentinel';
    const invalidSchemaError = validateCliFlags(parseArgs([`--schema=${sentinel}`]));

    expect(validateCliFlags(parseArgs(['--schema=public']))).toBeNull();
    expect(invalidSchemaError).toBe('El valor de --schema no es válido.');
    expect(invalidSchemaError).not.toContain(sentinel);
    expect(validateCliFlags(parseArgs(['--schema=  ']))).toBe('El valor de --schema no es válido.');
  });

  it('no refleja en log ni error un schema explícito sintético no registrado', () => {
    const sentinel = 'tenant_synthetic_unregistered';
    const log = formatStartupLog('dry-run', sentinel);
    let thrown: unknown;
    try {
      assertRegisteredMfaTenantSchema(sentinel, ['tenant_registered']);
    } catch (error) {
      thrown = error;
    }

    expect(log).toContain('schemaFilter=explicit');
    expect(log).not.toContain(sentinel);
    expect(formatStartupLog('dry-run')).toContain('schemaFilter=all');
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toBe('Schema tenant no registrado o no ACTIVE.');
    expect(message).not.toContain(sentinel);
  });
});

describe('CLI reencrypt-aes — errores fatales', () => {
  it('no incluye en la salida el texto crudo del driver o constraint', () => {
    const sentinel = 'synthetic-driver-error-sentinel';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logSafeFatalError(new Error(sentinel));

    const output = spy.mock.calls.flat().join('\n');
    expect(output).toBe('[REENCRYPT] Fatal: fallo inesperado; operación abortada.');
    expect(output).not.toContain(sentinel);
    spy.mockRestore();
  });
});

describe('CLI reencrypt-aes — límites tenant MFA/PII', () => {
  it('excluye del recifrado MFA los objetivos CRM migrados a PII y conserva MFA tenant', () => {
    const piiColumns = new Set(
      PII_ENCRYPTED_TARGETS.map(({ table, column }) => `${table}.${column}`),
    );
    const filteredTargets = getMfaTenantTargets();
    const filteredColumns = filteredTargets.map(({ table, column }) => `${table}.${column}`);
    const overlaps = TENANT_ENCRYPTED_TARGETS.filter(({ table, column }) =>
      piiColumns.has(`${table}.${column}`),
    );

    expect(filteredTargets).toHaveLength(TENANT_ENCRYPTED_TARGETS.length - overlaps.length);
    expect(filteredColumns.every((target) => !piiColumns.has(target))).toBe(true);
    expect(filteredColumns).toContain('users.mfa_secret');
    expect(filteredColumns).toContain('users.email');
    expect(PUBLIC_ENCRYPTED_TARGETS.map(({ table, column }) => `${table}.${column}`)).toContain(
      'platform_users.mfa_secret',
    );
  });

  it.each(['127.0.0.1', 'localhost', '::1'])(
    'acepta la dirección loopback %s para la integración desechable',
    (databaseHost) => {
      expect(() =>
        assertSafeDisposableIntegrationTarget({
          enabled: true,
          databaseName: 'iwana_it_g7_synthetic',
          databaseHost,
        }),
      ).not.toThrow();
    },
  );

  it('usa loopback por defecto y rechaza un host externo antes de conectar', () => {
    expect(() =>
      assertSafeDisposableIntegrationTarget({
        enabled: true,
        databaseName: 'iwana_it_g7_synthetic',
      }),
    ).not.toThrow();

    expect(() =>
      assertSafeDisposableIntegrationTarget({
        enabled: true,
        databaseName: 'iwana_it_g7_synthetic',
        databaseHost: 'external.example.invalid',
      }),
    ).toThrow('La integración K2 solo acepta un DB_HOST loopback.');
  });
});

describe('CLI reencrypt-aes — opt-in de integración K2', () => {
  it('omite K2 sin la bandera propia aunque la base genérica no sea desechable', () => {
    expect(
      resolveK2ReencryptIntegrationEnabled({
        databaseName: 'test',
        databaseHost: 'external.example.invalid',
      }),
    ).toBe(false);
  });

  it('rechaza destinos inseguros cuando el opt-in está activo', () => {
    expect(() =>
      resolveK2ReencryptIntegrationEnabled({
        optIn: 'true',
        databaseName: 'test',
        databaseHost: '127.0.0.1',
      }),
    ).toThrow('La integración K2 solo acepta una DB_NAME iwana_it_g7_* desechable.');

    expect(() =>
      resolveK2ReencryptIntegrationEnabled({
        optIn: 'true',
        databaseName: 'iwana_it_g7_synthetic',
        databaseHost: 'external.example.invalid',
      }),
    ).toThrow('La integración K2 solo acepta un DB_HOST loopback.');
  });

  it('habilita K2 con opt-in explícito y destino desechable loopback', () => {
    expect(
      resolveK2ReencryptIntegrationEnabled({
        optIn: 'true',
        databaseName: 'iwana_it_g7_ci',
        databaseHost: '127.0.0.1',
      }),
    ).toBe(true);
  });
});

describe('CLI reencrypt-aes — resolveMode', () => {
  const base: CliFlags = {
    apply: false,
    verifyActiveOnly: false,
    mfaToPii: false,
    verifyPiiOnly: false,
    pageSize: 200,
    help: false,
  };

  it('sin flags el modo es dry-run (no escribe)', () => {
    expect(resolveMode(base)).toBe('dry-run');
  });

  it('--apply resuelve a apply', () => {
    expect(resolveMode({ ...base, apply: true })).toBe('apply');
  });

  it('--verify-active-only resuelve a verify-active-only', () => {
    expect(resolveMode({ ...base, verifyActiveOnly: true })).toBe('verify-active-only');
  });

  // main() rechaza la combinación, pero si algún día dejara de hacerlo, el modo
  // que NO escribe debe ganar.
  it('verify-active-only gana sobre apply si ambas llegan', () => {
    expect(resolveMode({ ...base, apply: true, verifyActiveOnly: true })).toBe(
      'verify-active-only',
    );
  });
});

describe('CLI reencrypt-aes — loadKeys', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['MFA_ENCRYPTION_KEY'];
    delete process.env['MFA_ENCRYPTION_KEY_PREVIOUS'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falla si MFA_ENCRYPTION_KEY está ausente', () => {
    expect(() => loadKeys()).toThrow(/MFA_ENCRYPTION_KEY ausente, invalida o debil/);
  });

  it('remite al procedimiento seguro del runbook sin recomendar una orden que imprima la clave', () => {
    let thrown: unknown;
    try {
      loadKeys();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md §1');
    expect(message).not.toMatch(/openssl|rand|stdout/iu);
  });

  it('falla si la clave activa no mide 64 hex', () => {
    process.env['MFA_ENCRYPTION_KEY'] = 'abcd';

    expect(() => loadKeys()).toThrow(/MFA_ENCRYPTION_KEY ausente, invalida o debil/);
  });

  it('falla si una clave activa de 64 caracteres contiene un valor no hexadecimal', () => {
    process.env['MFA_ENCRYPTION_KEY'] = `${'a'.repeat(63)}g`;

    expect(() => loadKeys()).toThrow(/MFA_ENCRYPTION_KEY ausente, invalida o debil/);
  });

  it('falla si la clave activa tiene entropía nula', () => {
    process.env['MFA_ENCRYPTION_KEY'] = KEY_WEAK;

    expect(() => loadKeys()).toThrow(/MFA_ENCRYPTION_KEY ausente, invalida o debil/);
  });

  it('sin PREVIOUS devuelve solo la clave activa', () => {
    process.env['MFA_ENCRYPTION_KEY'] = KEY_A;

    const { activeKey, previousKey } = loadKeys();

    expect(activeKey).toHaveLength(32);
    expect(previousKey).toBeNull();
  });

  it('con PREVIOUS válida devuelve ambas claves', () => {
    process.env['MFA_ENCRYPTION_KEY'] = KEY_A;
    process.env['MFA_ENCRYPTION_KEY_PREVIOUS'] = KEY_B;

    const { activeKey, previousKey } = loadKeys();

    expect(activeKey).toHaveLength(32);
    expect(previousKey).toHaveLength(32);
    expect(activeKey.equals(previousKey as Buffer)).toBe(false);
  });

  it('rechaza una PREVIOUS que no sea 64 hex', () => {
    process.env['MFA_ENCRYPTION_KEY'] = KEY_A;
    process.env['MFA_ENCRYPTION_KEY_PREVIOUS'] = 'zz';

    expect(() => loadKeys()).toThrow(/exactamente 64 caracteres hexadecimales/);
  });

  // Asimetría deliberada: rotar DESDE una clave comprometida es el caso de uso.
  it('acepta una PREVIOUS débil y avisa, porque rotar desde ella es el objetivo', () => {
    process.env['MFA_ENCRYPTION_KEY'] = KEY_A;
    process.env['MFA_ENCRYPTION_KEY_PREVIOUS'] = KEY_WEAK;
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const { previousKey } = loadKeys();

    expect(previousKey).toHaveLength(32);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('entropia nula'));

    spy.mockRestore();
  });

  it('ignora espacios alrededor de las claves', () => {
    process.env['MFA_ENCRYPTION_KEY'] = `  ${KEY_A}  `;

    expect(loadKeys().activeKey).toHaveLength(32);
  });
});
