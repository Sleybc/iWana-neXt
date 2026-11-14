import { ContractActivationEventReadPort } from './ports/contract-activation-event-read.port';
import { ContractActivationEventReadAdapter } from '../crm/contracts/contract-activation-event-read.adapter';
// otplib@13 trae ESM (@scure/base), incompatible con el runner CJS de Jest.
jest.mock('otplib', () => ({
  TOTP: jest.fn(),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

import { MODULE_METADATA } from '@nestjs/common/constants';
import { BILLING_BLOCKING_REASONS } from '@iwana/shared';
import { BillingContractReadAdapter } from '../crm/contracts/billing-contract-read.adapter';
import { BillingContractReadModule } from '../crm/contracts/billing-contract-read.module';
import { BillingAccountReadModule } from './billing-account-read.module';
import { BillingModule } from './billing.module';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingAccountReadPort } from './ports/billing-account-read.port';
import { BillingContractReadPort } from './ports/billing-contract-read.port';
import { BillingContractFirstChargePort } from './ports/billing-contract-first-charge.port';
import { BillingContractFirstChargeAdapter } from '../crm/contracts/billing-contract-first-charge.adapter';
import { BillingTitularContactReadPort } from './ports/billing-titular-contact-read.port';
import { BillingTitularContactReadAdapter } from '../crm/contracts/billing-titular-contact-read.adapter';

const meta = (key: string, target: object): unknown[] =>
  (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];

describe('BR-4 composición de módulos y contratos', () => {
  it('BR-4.3 (RS-20) CONTRATO_SIN_CICLO ya no es un motivo de bloqueo', () => {
    expect(BILLING_BLOCKING_REASONS).toEqual([
      'SIN_PRECIO',
      'SIN_TRATAMIENTO_IVA',
      'SIN_DATOS_FISCALES',
    ]);
  });

  it('BR-4.5 (HLD §8.1 c) Billing importa el módulo de lectura de CRM y no la clase del adaptador', () => {
    const imports = meta(MODULE_METADATA.IMPORTS, BillingModule);
    const providers = meta(MODULE_METADATA.PROVIDERS, BillingModule);
    expect(imports).toContain(BillingContractReadModule);
    expect(providers).not.toContain(BillingContractReadAdapter);
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'object' &&
          provider !== null &&
          (provider as { provide?: unknown }).provide === BillingContractReadPort,
      ),
    ).toBe(false);
  });

  it('BR-4.5 BillingContractReadModule provee y exporta solo puertos', () => {
    const providers = meta(MODULE_METADATA.PROVIDERS, BillingContractReadModule);
    const exports = meta(MODULE_METADATA.EXPORTS, BillingContractReadModule);
    // SEC-3 añade el puerto de lectura del outbox de activación y la spec 2026-11-11 el del
    // primer cobro (R3/R4); la spec 2026-11-13 (bloque B) el del correo del titular. Siguen sin
    // exportarse adaptadores.
    expect(exports).toEqual([
      BillingContractReadPort,
      ContractActivationEventReadPort,
      BillingContractFirstChargePort,
      BillingTitularContactReadPort,
    ]);
    expect(providers).toContainEqual(
      expect.objectContaining({
        provide: BillingTitularContactReadPort,
        useExisting: BillingTitularContactReadAdapter,
      }),
    );
    expect(meta(MODULE_METADATA.PROVIDERS, BillingModule)).not.toContain(
      BillingTitularContactReadAdapter,
    );
    expect(providers).toContainEqual(
      expect.objectContaining({
        provide: BillingContractFirstChargePort,
        useExisting: BillingContractFirstChargeAdapter,
      }),
    );
    expect(providers).toContainEqual(
      expect.objectContaining({
        provide: ContractActivationEventReadPort,
        useExisting: ContractActivationEventReadAdapter,
      }),
    );
    expect(providers).toContainEqual(
      expect.objectContaining({
        provide: BillingContractReadPort,
        useExisting: BillingContractReadAdapter,
      }),
    );
  });

  it('BR-4.6 el módulo de lectura de cuenta exporta solo BillingAccountReadPort, sin forwardRef', () => {
    const imports = meta(MODULE_METADATA.IMPORTS, BillingAccountReadModule);
    expect(meta(MODULE_METADATA.EXPORTS, BillingAccountReadModule)).toEqual([
      BillingAccountReadPort,
    ]);
    expect(imports).toEqual([BillingModule]);
    expect(meta(MODULE_METADATA.PROVIDERS, BillingAccountReadModule)).toEqual([
      { provide: BillingAccountReadPort, useExisting: BillingPaymentsService },
    ]);
    expect(
      imports.some((entry) => typeof entry === 'object' && entry !== null && 'forwardRef' in entry),
    ).toBe(false);
  });
});
