import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { TenantContext } from '@iwana/db';
import {
  BILLING_INSTALLATION_CLOSED_JOB_NAME,
  TenantStatus,
  canonicalizeBillingInstallationClosedEvent,
  type BillingInstallationClosedEvent,
} from '@iwana/shared';
import type { TenantLifecycleReadPort } from '../../tenant/ports/tenant-lifecycle-read.port';
import type { BillingInstallationBreakdownService } from './billing-installation-breakdown.service';
import {
  BillingInstallationConsumptionProcessor,
  InstallationContractPendingError,
  WITHOUT_CONTRACT_MAX_ATTEMPTS,
  verifySignedBillingInstallationEvent,
} from './billing-installation-consumption.processor';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ACTIVE_KEY = Buffer.alloc(32, 3).toString('base64');
const PREVIOUS_KEY = Buffer.alloc(32, 4).toString('base64');

const event: BillingInstallationClosedEvent = {
  eventId: 'e0000000-0000-4000-8000-000000000001',
  executionOrderId: 'a0000000-0000-4000-8000-000000000001',
  aggregateVersion: 3,
  occurredAt: '2026-11-13T15:00:00.000Z',
};

function sign(key: string, tenantId = TENANT_ID, envelope = event): string {
  return createHmac('sha256', Buffer.from(key, 'base64'))
    .update(canonicalizeBillingInstallationClosedEvent(tenantId, envelope))
    .digest('hex');
}

// Sin respaldo en process.env: el entorno de la suite no debe aportar claves.
const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

function job(
  data: unknown,
  name = BILLING_INSTALLATION_CLOSED_JOB_NAME,
  retry: { attemptsMade?: number; attempts?: number } = {},
): Job<unknown> {
  return {
    name,
    data,
    attemptsMade: retry.attemptsMade ?? 0,
    opts: { attempts: retry.attempts ?? 8 },
  } as unknown as Job<unknown>;
}

describe('verifySignedBillingInstallationEvent', () => {
  it('acepta la firma con la clave activa o con la anterior', () => {
    const cfg = config({
      INTERNAL_QUEUE_SIGNING_KEY: ACTIVE_KEY,
      INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS: PREVIOUS_KEY,
    });
    for (const key of [ACTIVE_KEY, PREVIOUS_KEY]) {
      const signed = { tenantId: TENANT_ID, envelope: event, signature: sign(key) };
      expect(verifySignedBillingInstallationEvent(signed, cfg)).toEqual(signed);
    }
  });

  it('rechaza una firma alterada, otro tenant o un envelope cambiado', () => {
    const cfg = config({ INTERNAL_QUEUE_SIGNING_KEY: ACTIVE_KEY });
    const signature = sign(ACTIVE_KEY);
    const candidates = [
      { tenantId: TENANT_ID, envelope: event, signature: sign(PREVIOUS_KEY) },
      { tenantId: '20000000-0000-4000-8000-000000000002', envelope: event, signature },
      { tenantId: TENANT_ID, envelope: { ...event, aggregateVersion: 4 }, signature },
    ];
    for (const candidate of candidates) {
      expect(() => verifySignedBillingInstallationEvent(candidate, cfg)).toThrow(
        UnrecoverableError,
      );
    }
  });

  it('no acepta la firma de la cola de red (separación de dominio)', () => {
    const cfg = config({ INTERNAL_QUEUE_SIGNING_KEY: ACTIVE_KEY });
    const networkCanonical = JSON.stringify({ envelope: event, tenantId: TENANT_ID });
    const signature = createHmac('sha256', Buffer.from(ACTIVE_KEY, 'base64'))
      .update(networkCanonical)
      .digest('hex');
    expect(() =>
      verifySignedBillingInstallationEvent(
        { tenantId: TENANT_ID, envelope: event, signature },
        cfg,
      ),
    ).toThrow(UnrecoverableError);
  });

  it('rechaza forma inválida, campos extra y clave ausente o corta', () => {
    const cfg = config({ INTERNAL_QUEUE_SIGNING_KEY: ACTIVE_KEY });
    expect(() => verifySignedBillingInstallationEvent(null, cfg)).toThrow(UnrecoverableError);
    expect(() =>
      verifySignedBillingInstallationEvent(
        {
          tenantId: TENANT_ID,
          envelope: { ...event, subscriberId: 'x' },
          signature: sign(ACTIVE_KEY),
        },
        cfg,
      ),
    ).toThrow(UnrecoverableError);
    const signed = { tenantId: TENANT_ID, envelope: event, signature: sign(ACTIVE_KEY) };
    expect(() => verifySignedBillingInstallationEvent(signed, config({}))).toThrow(
      'INTERNAL_QUEUE_SIGNING_KEY ausente.',
    );
    expect(() =>
      verifySignedBillingInstallationEvent(
        signed,
        config({ INTERNAL_QUEUE_SIGNING_KEY: Buffer.alloc(8).toString('base64') }),
      ),
    ).toThrow('INTERNAL_QUEUE_SIGNING_KEY inválida.');
  });
});

describe('BillingInstallationConsumptionProcessor', () => {
  const activeTenant = {
    id: TENANT_ID,
    slug: 'acme',
    schemaName: 'tenant_acme',
    status: TenantStatus.ACTIVE,
    deletedAt: null,
  };
  let tenants: { findTenantLifecycleById: jest.Mock };
  let breakdowns: { capture: jest.Mock };
  let processor: BillingInstallationConsumptionProcessor;
  const signed = () => ({ tenantId: TENANT_ID, envelope: event, signature: sign(ACTIVE_KEY) });

  beforeEach(() => {
    tenants = { findTenantLifecycleById: jest.fn().mockResolvedValue(activeTenant) };
    breakdowns = { capture: jest.fn().mockResolvedValue('recorded') };
    processor = new BillingInstallationConsumptionProcessor(
      config({ INTERNAL_QUEUE_SIGNING_KEY: ACTIVE_KEY }),
      tenants as unknown as TenantLifecycleReadPort,
      breakdowns as unknown as BillingInstallationBreakdownService,
    );
  });

  it('registra el consumo dentro del contexto del tenant verificado', async () => {
    breakdowns.capture.mockImplementation(async () => {
      expect(TenantContext.getOrThrow()).toMatchObject({
        tenantId: TENANT_ID,
        schemaName: 'tenant_acme',
      });
      return 'recorded';
    });

    await expect(processor.process(job(signed()))).resolves.toBe('recorded');
    expect(tenants.findTenantLifecycleById).toHaveBeenCalledWith(TENANT_ID);
    expect(breakdowns.capture).toHaveBeenCalledWith(event.executionOrderId);
  });

  it.each(['existing', 'notApplicable', 'withoutSubscriber'] as const)(
    'devuelve el resultado %s sin fallar (no se reintenta)',
    async (outcome) => {
      breakdowns.capture.mockResolvedValue(outcome);
      await expect(processor.process(job(signed()))).resolves.toBe(outcome);
    },
  );

  describe('H-5: sin contrato todavía', () => {
    beforeEach(() => breakdowns.capture.mockResolvedValue('withoutContract'));

    it.each([0, 1])(
      'el intento %i falla de forma recuperable para que BullMQ reintente con backoff',
      async (attemptsMade) => {
        const failure = processor.process(job(signed(), undefined, { attemptsMade }));
        await expect(failure).rejects.toBeInstanceOf(InstallationContractPendingError);
        await expect(failure).rejects.not.toBeInstanceOf(UnrecoverableError);
      },
    );

    it(`al intento ${WITHOUT_CONTRACT_MAX_ATTEMPTS} descarta con log y sin fallar`, async () => {
      const warn = jest
        .spyOn((processor as unknown as { logger: { warn: () => void } }).logger, 'warn')
        .mockImplementation(() => undefined);
      await expect(
        processor.process(
          job(signed(), undefined, { attemptsMade: WITHOUT_CONTRACT_MAX_ATTEMPTS - 1 }),
        ),
      ).resolves.toBe('withoutContract');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('descartado sin contrato'));
    });

    it('respeta un trabajo con menos intentos configurados: con uno, descarta de inmediato', async () => {
      await expect(
        processor.process(job(signed(), undefined, { attemptsMade: 0, attempts: 1 })),
      ).resolves.toBe('withoutContract');
    });
  });

  it('un nombre de trabajo desconocido es no recuperable y no lee el tenant', async () => {
    await expect(processor.process(job(signed(), 'otro'))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(tenants.findTenantLifecycleById).not.toHaveBeenCalled();
  });

  it('una firma inválida es no recuperable y no lee el tenant', async () => {
    await expect(
      processor.process(job({ ...signed(), signature: sign(PREVIOUS_KEY) })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(tenants.findTenantLifecycleById).not.toHaveBeenCalled();
    expect(breakdowns.capture).not.toHaveBeenCalled();
  });

  it.each([
    ['inexistente', null],
    ['inactivo', { ...activeTenant, status: TenantStatus.SUSPENDED }],
    ['eliminado', { ...activeTenant, deletedAt: new Date() }],
  ])('tenant %s: no recuperable y sin registro', async (_label, tenant) => {
    tenants.findTenantLifecycleById.mockResolvedValue(tenant);
    await expect(processor.process(job(signed()))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(breakdowns.capture).not.toHaveBeenCalled();
  });

  it('un fallo técnico del registro se propaga para que BullMQ reintente', async () => {
    breakdowns.capture.mockRejectedValue(new Error('conexión perdida'));
    const failure = processor.process(job(signed()));
    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(UnrecoverableError);
  });
});
