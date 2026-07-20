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
import { parseArgs, resolveMode, loadKeys, CliFlags } from './reencrypt-aes';

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

    expect(parseArgs(['--borrar-todo']).help).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Flag desconocida'));

    spy.mockRestore();
  });

  it('acumula varias flags en una sola invocación', () => {
    expect(parseArgs(['--apply', '--schema=tenant_x', '--page-size=10'])).toEqual({
      apply: true,
      verifyActiveOnly: false,
      schema: 'tenant_x',
      pageSize: 10,
      help: false,
    });
  });
});

describe('CLI reencrypt-aes — resolveMode', () => {
  const base: CliFlags = {
    apply: false,
    verifyActiveOnly: false,
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

  it('falla si la clave activa no mide 64 hex', () => {
    process.env['MFA_ENCRYPTION_KEY'] = 'abcd';

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
