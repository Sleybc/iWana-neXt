import type { SubscriberListItem } from '@iwana/shared';
import {
  assertAllowedTarget,
  parseSubscriberPhoneReadinessArgs,
  runSubscriberPhoneReadiness,
  type SubscriberPhoneReadinessReport,
  type SubscriberPhoneReadinessRuntime,
} from './report-subscriber-phone-readiness';

const TENANT_ID = '0b6f3c1e-4a8d-4c2f-9e3a-2d7b5f1a9c01';
const TENANT_SLUG = 'readiness-unit';

// Valores sintéticos: ninguno pertenece a una persona real.
const SYNTHETIC = {
  normalizablePhone: '300 000 0001',
  notNormalizablePhone: '12',
  normalizableAltPhone: '(310) 000-0002',
  normalizableWhatsapp: '+57 320 000 0003',
  notNormalizableWhatsapp: 'sin-numero',
  hiddenPhone: '3150000004',
  blockedPhone: '3160000005',
  noPrefixPhone: '3170000006',
};

const SUBSCRIBER_IDS = {
  phoneOnly: 'aaaaaaaa-0000-4000-8000-000000000001',
  altFallback: 'aaaaaaaa-0000-4000-8000-000000000002',
  whatsappOnly: 'aaaaaaaa-0000-4000-8000-000000000003',
  invalidWhatsapp: 'aaaaaaaa-0000-4000-8000-000000000004',
  allNull: 'aaaaaaaa-0000-4000-8000-000000000005',
  anonymized: 'aaaaaaaa-0000-4000-8000-000000000006',
  blocked: 'aaaaaaaa-0000-4000-8000-000000000007',
};

const PRODUCTION_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DB_HOST: 'db.internal.example.test',
  DB_USER: 'iwana_app',
  DB_PASSWORD: 'unit-test-placeholder',
  DB_NAME: 'iwana',
};

const EPHEMERAL_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  IWANA_DB_INTEGRATION_AVAILABLE: 'true',
  DB_HOST: 'localhost',
  DB_NAME: 'test',
};

type ListItemFixture = Pick<
  SubscriberListItem,
  'id' | 'phone' | 'altContactPhone' | 'whatsapp' | 'privacyRestricted' | 'anonymizedAt'
>;

function listItem(overrides: Partial<ListItemFixture> & Pick<ListItemFixture, 'id'>) {
  return {
    phone: null,
    altContactPhone: null,
    whatsapp: null,
    privacyRestricted: false,
    anonymizedAt: null,
    firstName: 'Nombre sintético',
    ...overrides,
  } as unknown as SubscriberListItem;
}

const DEFAULT_SUBSCRIBERS: SubscriberListItem[] = [
  // Llamar y WhatsApp por `phone` (WhatsApp usa el fallback a phone).
  listItem({ id: SUBSCRIBER_IDS.phoneOnly, phone: SYNTHETIC.normalizablePhone }),
  // Llamar cae a altContactPhone; WhatsApp no tiene candidato válido.
  listItem({
    id: SUBSCRIBER_IDS.altFallback,
    phone: SYNTHETIC.notNormalizablePhone,
    altContactPhone: SYNTHETIC.normalizableAltPhone,
  }),
  // Solo WhatsApp.
  listItem({ id: SUBSCRIBER_IDS.whatsappOnly, whatsapp: SYNTHETIC.normalizableWhatsapp }),
  // WhatsApp poblado pero no normalizable.
  listItem({ id: SUBSCRIBER_IDS.invalidWhatsapp, whatsapp: SYNTHETIC.notNormalizableWhatsapp }),
  // Todo nulo o en blanco.
  listItem({ id: SUBSCRIBER_IDS.allNull, phone: '   ' }),
  // Anonimizado: la proyección ya oculta los campos, pero la acción tampoco debe contarse.
  listItem({
    id: SUBSCRIBER_IDS.anonymized,
    phone: SYNTHETIC.hiddenPhone,
    anonymizedAt: '2026-01-01T00:00:00.000Z',
  }),
  // Bloqueado: cuenta en el campo, nunca en las acciones.
  listItem({ id: SUBSCRIBER_IDS.blocked, phone: SYNTHETIC.blockedPhone, privacyRestricted: true }),
];

interface FakeRuntimeOptions {
  countryCode?: string | null;
  subscribers?: SubscriberListItem[];
  pageSize?: number;
  schemaValid?: boolean;
}

function createFakeRuntime(options: FakeRuntimeOptions = {}) {
  const subscribers = options.subscribers ?? DEFAULT_SUBSCRIBERS;
  const pageSize = options.pageSize ?? 100;
  const totalPages = Math.max(1, Math.ceil(subscribers.length / pageSize));
  const tenantRow = {
    id: TENANT_ID,
    slug: TENANT_SLUG,
    schema_name: 'tenant_readiness_unit',
    country_code: options.countryCode === undefined ? 'CO' : options.countryCode,
  };
  const query = jest.fn().mockResolvedValue([tenantRow]);
  const findAll = jest.fn(async ({ page }: { page?: number }) => {
    const current = page ?? 1;
    return {
      data: subscribers.slice((current - 1) * pageSize, current * pageSize),
      total: subscribers.length,
      meta: { totalPages },
    };
  });
  const contexts: Array<{ tenantId: string; schemaName: string; tenantSlug: string }> = [];
  const run = jest.fn(
    async (
      context: { tenantId: string; schemaName: string; tenantSlug: string },
      fn: () => Promise<void>,
    ) => {
      contexts.push(context);
      return fn();
    },
  );
  const close = jest.fn().mockResolvedValue(undefined);
  const runtime = {
    dataSource: { query },
    subscribersService: { findAll },
    tenantContext: { run },
    isValidSchemaName: jest.fn(() => options.schemaValid ?? true),
    project: jest.fn((subscriber: unknown) => subscriber as SubscriberListItem),
    close,
  } as unknown as SubscriberPhoneReadinessRuntime;
  return { runtime, query, findAll, run, close, contexts };
}

async function runCapturing(
  argv: string[],
  env: NodeJS.ProcessEnv,
  fake = createFakeRuntime(),
  ephemeralTest?: { schemaName: string },
) {
  const chunks: string[] = [];
  const createRuntime = jest.fn(async () => fake.runtime);
  await runSubscriberPhoneReadiness({
    argv,
    env,
    write: (chunk) => chunks.push(chunk),
    createRuntime,
    ...(ephemeralTest ? { ephemeralTest } : {}),
  });
  return { stdout: chunks.join(''), createRuntime, fake };
}

function parseReports(stdout: string): SubscriberPhoneReadinessReport[] {
  return (JSON.parse(stdout) as { reports: SubscriberPhoneReadinessReport[] }).reports;
}

describe('assertAllowedTarget — binario (sin opciones)', () => {
  it('acepta producción y staging con base remota y rol de aplicación', () => {
    expect(() => assertAllowedTarget(PRODUCTION_ENV)).not.toThrow();
    expect(() => assertAllowedTarget({ ...PRODUCTION_ENV, NODE_ENV: 'staging' })).not.toThrow();
  });

  it.each([undefined, 'development', 'test', 'local'])('rechaza NODE_ENV=%s', (nodeEnv) => {
    expect(() => assertAllowedTarget({ ...PRODUCTION_ENV, NODE_ENV: nodeEnv })).toThrow(
      /no admite desarrollo/u,
    );
  });

  it.each(['localhost', '127.0.0.1', '::1', 'iwana_postgres_dev', 'db-dev', 'LOCALHOST '])(
    'rechaza el host local %s',
    (host) => {
      expect(() => assertAllowedTarget({ ...PRODUCTION_ENV, DB_HOST: host })).toThrow(
        /desarrollo local/u,
      );
    },
  );

  it('rechaza una base cuyo nombre termina en dev', () => {
    expect(() => assertAllowedTarget({ ...PRODUCTION_ENV, DB_NAME: 'iwana_dev' })).toThrow(
      /desarrollo local/u,
    );
  });

  it.each(['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'])('rechaza la falta de %s', (key) => {
    expect(() => assertAllowedTarget({ ...PRODUCTION_ENV, [key]: ' ' })).toThrow(
      /configuración explícita/u,
    );
  });

  it('rechaza el rol iwana_readonly', () => {
    expect(() => assertAllowedTarget({ ...PRODUCTION_ENV, DB_USER: 'iwana_readonly' })).toThrow(
      /iwana_readonly/u,
    );
  });

  it('ninguna variable de entorno abre el binario a la base del job de integración', () => {
    expect(() =>
      assertAllowedTarget({
        ...EPHEMERAL_ENV,
        DB_USER: 'iwana_app',
        DB_PASSWORD: 'unit-test-placeholder',
      }),
    ).toThrow(/no admite desarrollo/u);
    expect(() =>
      assertAllowedTarget({
        ...PRODUCTION_ENV,
        DB_HOST: 'localhost',
        IWANA_DB_INTEGRATION_AVAILABLE: 'true',
      }),
    ).toThrow(/desarrollo local/u);
  });
});

describe('assertAllowedTarget — modo de prueba efímera (solo inyectable)', () => {
  it('acepta la base del job de integración con NODE_ENV=test y la bandera de disponibilidad', () => {
    expect(() => assertAllowedTarget(EPHEMERAL_ENV, { allowEphemeralTest: true })).not.toThrow();
    expect(() =>
      assertAllowedTarget(
        { ...EPHEMERAL_ENV, DB_NAME: 'iwana_it_phone_01' },
        { allowEphemeralTest: true },
      ),
    ).not.toThrow();
  });

  it.each(['development', 'production', undefined])('rechaza NODE_ENV=%s', (nodeEnv) => {
    expect(() =>
      assertAllowedTarget({ ...EPHEMERAL_ENV, NODE_ENV: nodeEnv }, { allowEphemeralTest: true }),
    ).toThrow(/prueba integrada/u);
  });

  it('rechaza si falta IWANA_DB_INTEGRATION_AVAILABLE=true', () => {
    expect(() =>
      assertAllowedTarget(
        { ...EPHEMERAL_ENV, IWANA_DB_INTEGRATION_AVAILABLE: undefined },
        { allowEphemeralTest: true },
      ),
    ).toThrow(/prueba integrada/u);
  });

  it.each(['iwana', 'iwana_dev', 'produccion', ''])('rechaza DB_NAME=%s', (dbName) => {
    expect(() =>
      assertAllowedTarget({ ...EPHEMERAL_ENV, DB_NAME: dbName }, { allowEphemeralTest: true }),
    ).toThrow(/base de integración/u);
  });

  it('sigue rechazando el rol iwana_readonly', () => {
    expect(() =>
      assertAllowedTarget(
        { ...EPHEMERAL_ENV, DB_USER: 'iwana_readonly' },
        { allowEphemeralTest: true },
      ),
    ).toThrow(/iwana_readonly/u);
  });
});

describe('runSubscriberPhoneReadiness', () => {
  it('no carga el runtime cuando la guarda rechaza el destino', async () => {
    const createRuntime = jest.fn();
    await expect(
      runSubscriberPhoneReadiness({
        argv: ['--tenant=readiness-unit'],
        env: { ...PRODUCTION_ENV, NODE_ENV: 'development' },
        write: jest.fn(),
        createRuntime,
      }),
    ).rejects.toThrow(/no admite desarrollo/u);
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it('imprime la ayuda sin evaluar guardas ni cargar el runtime', async () => {
    const { stdout, createRuntime } = await runCapturing(['--help'], {});
    expect(stdout).toContain('--all-active-tenants');
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it('cuenta normalizables, no normalizables, nulos y fallbacks por campo y acción', async () => {
    const { stdout, fake } = await runCapturing(['--tenant=readiness-unit'], PRODUCTION_ENV);
    const [report] = parseReports(stdout);

    expect(report).toEqual({
      tenantId: TENANT_ID,
      tenantSlug: TENANT_SLUG,
      countryPrefixAvailable: true,
      subscribersScanned: 7,
      fields: {
        // phoneOnly, altFallback, anonymized y blocked están poblados; el blanco no cuenta.
        phone: { populated: 4, normalizable: 3, notNormalizable: 1, normalizablePercent: 75 },
        altContactPhone: {
          populated: 1,
          normalizable: 1,
          notNormalizable: 0,
          normalizablePercent: 100,
        },
        whatsapp: { populated: 2, normalizable: 1, notNormalizable: 1, normalizablePercent: 50 },
      },
      // Llamar: phoneOnly (phone) + altFallback (altContactPhone).
      // WhatsApp: phoneOnly (fallback phone) + whatsappOnly. Anonimizado y bloqueado excluidos.
      actions: { callSubscribers: 2, whatsappSubscribers: 2 },
    });
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(fake.query).toHaveBeenCalledWith(expect.stringContaining('slug = $2'), [
      'ACTIVE',
      'readiness-unit',
    ]);
    expect(fake.contexts).toEqual([
      { tenantId: TENANT_ID, schemaName: 'tenant_readiness_unit', tenantSlug: TENANT_SLUG },
    ]);
  });

  it('pagina hasta recorrer todas las páginas del servicio', async () => {
    const fake = createFakeRuntime({ pageSize: 3 });
    const { stdout } = await runCapturing(['--tenant=readiness-unit'], PRODUCTION_ENV, fake);
    expect(fake.findAll).toHaveBeenCalledTimes(3);
    expect(parseReports(stdout)[0]?.subscribersScanned).toBe(7);
  });

  it('sin prefijo de país mide los campos pero no calcula acciones', async () => {
    const fake = createFakeRuntime({
      countryCode: null,
      subscribers: [
        listItem({ id: SUBSCRIBER_IDS.phoneOnly, phone: SYNTHETIC.noPrefixPhone }),
        listItem({ id: SUBSCRIBER_IDS.whatsappOnly, whatsapp: SYNTHETIC.normalizableWhatsapp }),
      ],
    });
    const { stdout } = await runCapturing(['--tenant=readiness-unit'], PRODUCTION_ENV, fake);
    const [report] = parseReports(stdout);
    expect(report?.countryPrefixAvailable).toBe(false);
    expect(report?.fields.phone).toEqual({
      populated: 1,
      normalizable: 0,
      notNormalizable: 1,
      normalizablePercent: 0,
    });
    expect(report?.fields.whatsapp.normalizable).toBe(1);
    expect(report?.fields.altContactPhone.normalizablePercent).toBeNull();
    expect(report?.actions).toEqual({ callSubscribers: 0, whatsappSubscribers: 0 });
  });

  it('la salida no contiene teléfonos, IDs ni nombres de suscriptor', async () => {
    const { stdout } = await runCapturing(['--tenant=readiness-unit'], PRODUCTION_ENV);
    const digitsOnly = (value: string) => value.replace(/\D/gu, '');

    // Valores de menos de 7 caracteres (p. ej. «12») no son discriminantes frente a un UUID.
    for (const value of Object.values(SYNTHETIC)) {
      if (value.length >= 7) expect(stdout).not.toContain(value);
      const digits = digitsOnly(value);
      if (digits.length >= 7) expect(stdout).not.toContain(digits);
    }
    for (const id of Object.values(SUBSCRIBER_IDS)) expect(stdout).not.toContain(id);
    expect(stdout).not.toContain('Nombre sintético');
    expect(stdout).not.toMatch(/\+\d{7,15}/u);
    expect(stdout).not.toMatch(/\d{7,}/u);
  });

  it('cierra el runtime aunque falle la medición', async () => {
    const fake = createFakeRuntime();
    fake.findAll.mockRejectedValueOnce(new Error('fallo sintético'));
    await expect(runCapturing(['--tenant=readiness-unit'], PRODUCTION_ENV, fake)).rejects.toThrow(
      'fallo sintético',
    );
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('rechaza un tenant con schema inválido', async () => {
    const fake = createFakeRuntime({ schemaValid: false });
    await expect(runCapturing(['--tenant=readiness-unit'], PRODUCTION_ENV, fake)).rejects.toThrow(
      /schema inválido/u,
    );
  });

  describe('destino efímero inyectado', () => {
    it('mide el schema efímero con el tenant resuelto, solo en modo de prueba', async () => {
      const fake = createFakeRuntime();
      const { stdout } = await runCapturing(['--tenant=readiness-unit'], EPHEMERAL_ENV, fake, {
        schemaName: 'tenant_phone_readiness_abc123',
      });
      expect(fake.contexts).toEqual([
        {
          tenantId: TENANT_ID,
          schemaName: 'tenant_phone_readiness_abc123',
          tenantSlug: TENANT_SLUG,
        },
      ]);
      expect(JSON.parse(stdout)).toMatchObject({ readOnly: true, environment: 'test' });
    });

    it('no acepta el destino efímero fuera del job de integración', async () => {
      const fake = createFakeRuntime();
      await expect(
        runCapturing(['--tenant=readiness-unit'], PRODUCTION_ENV, fake, {
          schemaName: 'tenant_phone_readiness_abc123',
        }),
      ).rejects.toThrow(/prueba integrada/u);
    });

    it('exige --tenant y un schema efímero con prefijo tenant_', async () => {
      await expect(
        runCapturing(['--all-active-tenants'], EPHEMERAL_ENV, createFakeRuntime(), {
          schemaName: 'tenant_phone_readiness_abc123',
        }),
      ).rejects.toThrow(/--tenant/u);
      await expect(
        runCapturing(['--tenant=readiness-unit'], EPHEMERAL_ENV, createFakeRuntime(), {
          schemaName: 'public',
        }),
      ).rejects.toThrow(/schema efímero/u);
    });
  });
});

describe('parseSubscriberPhoneReadinessArgs', () => {
  it('exige exactamente un selector de tenant', () => {
    expect(() => parseSubscriberPhoneReadinessArgs([])).toThrow(/exactamente uno/u);
    expect(() => parseSubscriberPhoneReadinessArgs(['--tenant=a', '--all-active-tenants'])).toThrow(
      /exactamente uno/u,
    );
  });

  it('rechaza argumentos desconocidos sin repetir su valor', () => {
    expect(() => parseSubscriberPhoneReadinessArgs(['--phone=3000000001'])).toThrow(
      'Argumento desconocido: --phone',
    );
  });
});
