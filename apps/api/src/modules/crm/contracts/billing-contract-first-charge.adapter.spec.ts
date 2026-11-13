import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '@iwana/db';
import { calculateNitVerificationDigit } from '@iwana/shared';
import { createFiscalDocumentCrypto } from '../../../common/crypto/fiscal-document.util';
import { BillingContractFirstChargeAdapter } from './billing-contract-first-charge.adapter';

const query = jest.fn();
jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    runInTenantSchema: jest.fn(
      async (_ds: unknown, _schema: string, work: (qr: unknown) => unknown) =>
        work({ query, manager: { query } }),
    ),
  };
});

describe('BillingContractFirstChargeAdapter', () => {
  const contractId = randomUUID();
  const tenant = { tenantId: randomUUID(), schemaName: 'tenant_unit', tenantSlug: 'unit' };
  const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
  const catalog = { createSnapshot: jest.fn(), getItemVatTreatments: jest.fn() };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '78'.repeat(32),
    MFA_ENCRYPTION_KEY: '78'.repeat(32),
    NODE_ENV: 'test',
  });
  const crypto = createFiscalDocumentCrypto(config);
  const adapter = new BillingContractFirstChargeAdapter(
    {} as never,
    settings as never,
    catalog as never,
    audit as never,
    config,
  );
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(tenant, fn);
  const anchorRow = (overrides: Record<string, unknown> = {}) => ({
    contract_id: contractId,
    status: 'ACTIVE',
    start_date: null,
    status_changed_at: null,
    event_start: null,
    anonymized: false,
    ...overrides,
  });

  beforeEach(() => {
    query.mockReset();
    catalog.createSnapshot.mockReset();
    catalog.getItemVatTreatments.mockReset().mockResolvedValue([]);
    audit.logWithin.mockClear();
  });

  describe('findActivationAnchor', () => {
    it('prefiere el evento, luego start_date y luego status_changed_at en la zona del tenant', async () => {
      query.mockResolvedValueOnce([
        anchorRow({ event_start: '2026-10-20', start_date: '2026-09-01' }),
      ]);
      expect(await run(() => adapter.findActivationAnchor(contractId))).toMatchObject({
        date: '2026-10-20',
        source: 'ACTIVATION_EVENT',
      });

      query.mockResolvedValueOnce([anchorRow({ event_start: 'basura', start_date: '2026-09-01' })]);
      expect(await run(() => adapter.findActivationAnchor(contractId))).toMatchObject({
        date: '2026-09-01',
        source: 'START_DATE',
      });

      // 2026-10-31 03:00 UTC es todavía 30 de octubre en Bogotá.
      query.mockResolvedValueOnce([anchorRow({ status_changed_at: '2026-10-31T03:00:00Z' })]);
      expect(await run(() => adapter.findActivationAnchor(contractId))).toMatchObject({
        date: '2026-10-30',
        source: 'STATUS_CHANGED_AT',
      });

      query.mockResolvedValueOnce([anchorRow()]);
      expect(await run(() => adapter.findActivationAnchor(contractId))).toEqual({
        contractId,
        status: 'ACTIVE',
        date: null,
        source: null,
      });
    });

    it('null si no existe o el titular está anonimizado', async () => {
      query.mockResolvedValueOnce([]);
      expect(await run(() => adapter.findActivationAnchor(contractId))).toBeNull();
      query.mockResolvedValueOnce([anchorRow({ anonymized: true })]);
      expect(await run(() => adapter.findActivationAnchor(contractId))).toBeNull();
    });
  });

  describe('freezeInstallationFeeIfMissing', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      installation_fee: null,
      plan_id: '34648e27-4540-4529-a089-3e3b4fb23bd5',
      segment: 'RESIDENTIAL',
      anonymized: false,
      ...overrides,
    });

    it('no toca un valor ya congelado, incluido 0', async () => {
      query.mockResolvedValueOnce([row({ installation_fee: '0.00' })]);
      expect(await run(() => adapter.freezeInstallationFeeIfMissing(contractId, 'u'))).toEqual({
        outcome: 'ALREADY_SET',
        amount: '0.00',
      });
      expect(catalog.createSnapshot).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('UNRESOLVED si el plan no tiene precio vigente', async () => {
      query.mockResolvedValueOnce([row()]);
      catalog.createSnapshot.mockRejectedValueOnce(new NotFoundException());
      expect(await run(() => adapter.freezeInstallationFeeIfMissing(contractId, 'u'))).toEqual({
        outcome: 'UNRESOLVED',
        amount: null,
      });
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('congela el vigente, sube la versión y audita', async () => {
      query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([[], 1]);
      catalog.createSnapshot.mockResolvedValueOnce({ installationFee: 50000 });
      expect(await run(() => adapter.freezeInstallationFeeIfMissing(contractId, 'u'))).toEqual({
        outcome: 'FROZEN',
        amount: '50000.00',
      });
      expect(query.mock.calls[1]?.[0]).toContain('updated_at = GREATEST');
      expect(query.mock.calls[1]?.[0]).toContain(
        'installation_vat_snapshot = COALESCE(installation_vat_snapshot, $4::jsonb)',
      );
      const params = query.mock.calls[1]?.[1] as unknown[];
      expect(params.slice(0, 3)).toEqual([contractId, tenant.tenantId, '50000.00']);
      // Spec MOD14 2026-11-12 R2/D2: sin tratamiento propio en el plan, STANDARD 19 %.
      expect(JSON.parse(params[3] as string)).toMatchObject({
        treatment: 'STANDARD',
        legalBasis: 'ET_468',
        ratePercent: 19,
        source: 'DEFAULT',
      });
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Contract',
          oldValue: { installationFee: null },
          newValue: { installationFee: '50000.00', reason: 'PRIMER_COBRO_CONTRATO_HEREDADO' },
        }),
        expect.anything(),
      );
    });

    it('falla si otra escritura fijó el cargo entre la lectura y la actualización', async () => {
      query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([[], 0]);
      catalog.createSnapshot.mockResolvedValueOnce({ installationFee: 50000 });
      await expect(
        run(() => adapter.freezeInstallationFeeIfMissing(contractId, 'u')),
      ).rejects.toThrow('cambió');
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('404 si el contrato no existe o el titular está anonimizado', async () => {
      query.mockResolvedValueOnce([]);
      await expect(
        run(() => adapter.freezeInstallationFeeIfMissing(contractId, 'u')),
      ).rejects.toBeInstanceOf(NotFoundException);
      query.mockResolvedValueOnce([row({ anonymized: true })]);
      await expect(
        run(() => adapter.freezeInstallationFeeIfMissing(contractId, 'u')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('freezeFiscalDataIfMissing (R7)', () => {
    const SYNTHETIC_DOCUMENT = '1000000001';
    const row = (overrides: Record<string, unknown> = {}) => ({
      fiscal_name: null,
      fiscal_address: null,
      has_document: false,
      business_name: null,
      full_name: 'Titular Sintético',
      address: 'Calle sintética 1',
      document_number_encrypted: crypto.encrypt(SYNTHETIC_DOCUMENT)!.encrypted,
      nit: null,
      anonymized: false,
      ...overrides,
    });

    it('congela nombre, documento recifrado con HMAC y dirección; audita sin valores', async () => {
      query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([[], 1]);

      const result = await run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u'));

      expect(result).toEqual({
        outcome: 'FROZEN',
        frozenFields: ['NAME', 'DOCUMENT', 'ADDRESS'],
        missingFields: [],
      });
      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toContain('updated_at = GREATEST');
      expect(params.slice(0, 4)).toEqual([
        contractId,
        tenant.tenantId,
        'Titular Sintético',
        'Calle sintética 1',
      ]);
      expect(params[4]).not.toContain(SYNTHETIC_DOCUMENT);
      expect(crypto.decrypt(params[4] as string)).toBe(SYNTHETIC_DOCUMENT);
      expect(params[5]).toMatch(/^[0-9a-f]{64}$/u);
      const entry = audit.logWithin.mock.calls[0]?.[0];
      expect(JSON.stringify(entry)).not.toContain(SYNTHETIC_DOCUMENT);
      expect(JSON.stringify(entry)).not.toContain('Calle');
      expect(entry).toMatchObject({
        entityType: 'Contract',
        newValue: {
          fiscalFieldsFrozen: ['NAME', 'DOCUMENT', 'ADDRESS'],
          reason: 'PRIMER_COBRO_CONTRATO_HEREDADO',
        },
      });
    });

    it('usa la razón social y el NIT de la persona jurídica si no hay documento cifrado', async () => {
      query
        .mockResolvedValueOnce([
          row({
            business_name: 'Empresa Sintética SAS',
            document_number_encrypted: null,
            nit: '900000001',
            fiscal_address: 'Ya congelada',
          }),
        ])
        .mockResolvedValueOnce([[], 1]);

      const result = await run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u'));

      expect(result.frozenFields).toEqual(['NAME', 'DOCUMENT']);
      const params = query.mock.calls[1]?.[1] as unknown[];
      expect(params[2]).toBe('Empresa Sintética SAS');
      expect(params[3]).toBeNull();
      expect(crypto.decrypt(params[4] as string)).toBe('900000001');
    });

    describe('persona jurídica: congela su NIT con DV aunque tenga documento cifrado', () => {
      const SYNTHETIC_NIT = '900000001';
      const DV = calculateNitVerificationDigit(SYNTHETIC_NIT);
      const juridica = (overrides: Record<string, unknown> = {}) =>
        row({
          person_type: 'JURIDICA',
          business_name: 'Empresa Sintética SAS',
          nit: SYNTHETIC_NIT,
          nit_verification_digit: DV,
          fiscal_address: 'Ya congelada',
          ...overrides,
        });
      const frozenDocument = async (overrides: Record<string, unknown>) => {
        query.mockResolvedValueOnce([juridica(overrides)]).mockResolvedValueOnce([[], 1]);
        const result = await run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u'));
        const params = query.mock.calls[1]?.[1] as unknown[] | undefined;
        return {
          result,
          plain: params?.[4] ? crypto.decrypt(params[4] as string) : null,
          hmac: params?.[5],
        };
      };

      it('NIT con DV válido → `base-DV`, con HMAC y sin valores en la auditoría', async () => {
        const { result, plain, hmac } = await frozenDocument({});
        expect(result.frozenFields).toEqual(['NAME', 'DOCUMENT']);
        expect(plain).toBe(`${SYNTHETIC_NIT}-${DV}`);
        expect(hmac).toBe(crypto.encrypt(`${SYNTHETIC_NIT}-${DV}`)!.hmac);
        expect(JSON.stringify(audit.logWithin.mock.calls)).not.toContain(SYNTHETIC_NIT);
      });

      it('NIT guardado como `base-DV` sin columna de DV → el mismo `base-DV`', async () => {
        const { plain } = await frozenDocument({
          nit: `${SYNTHETIC_NIT}-${DV}`,
          nit_verification_digit: null,
        });
        expect(plain).toBe(`${SYNTHETIC_NIT}-${DV}`);
      });

      it('NIT sin DV registrado → la base sola', async () => {
        const { plain } = await frozenDocument({ nit_verification_digit: null });
        expect(plain).toBe(SYNTHETIC_NIT);
      });

      it('DV que no corresponde o NIT con formato inválido → no congela el documento', async () => {
        for (const overrides of [
          { nit_verification_digit: String((Number(DV) + 1) % 10) },
          { nit: '1234567890123456', nit_verification_digit: null },
        ]) {
          query.mockReset();
          query.mockResolvedValueOnce([juridica(overrides)]).mockResolvedValueOnce([[], 1]);
          const result = await run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u'));
          expect(result).toEqual({
            outcome: 'FROZEN',
            frozenFields: ['NAME'],
            missingFields: ['DOCUMENT'],
          });
          expect((query.mock.calls[1]?.[1] as unknown[])[4]).toBeNull();
        }
      });

      it('sin NIT cae al documento cifrado del suscriptor', async () => {
        const { plain } = await frozenDocument({ nit: null, nit_verification_digit: null });
        expect(plain).toBe(SYNTHETIC_DOCUMENT);
      });
    });

    it('ALREADY_SET sin escribir si el contrato ya tiene los tres campos', async () => {
      query.mockResolvedValueOnce([
        row({ fiscal_name: 'X', fiscal_address: 'Y', has_document: true }),
      ]);
      expect(await run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u'))).toEqual({
        outcome: 'ALREADY_SET',
        frozenFields: [],
        missingFields: [],
      });
      expect(query).toHaveBeenCalledTimes(1);
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('UNRESOLVED si el suscriptor no tiene con qué completar, o el documento es ilegible', async () => {
      query.mockResolvedValueOnce([
        row({
          full_name: null,
          address: '   ',
          document_number_encrypted: 'no-es-un-cifrado',
        }),
      ]);
      expect(await run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u'))).toEqual({
        outcome: 'UNRESOLVED',
        frozenFields: [],
        missingFields: ['NAME', 'DOCUMENT', 'ADDRESS'],
      });
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('no congela valores que no caben en las columnas del contrato', async () => {
      query
        .mockResolvedValueOnce([row({ full_name: 'N'.repeat(201), address: 'A'.repeat(256) })])
        .mockResolvedValueOnce([[], 1]);
      const result = await run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u'));
      expect(result).toEqual({
        outcome: 'FROZEN',
        frozenFields: ['DOCUMENT'],
        missingFields: ['NAME', 'ADDRESS'],
      });
    });

    it('404 si no existe o el titular está anonimizado; error si la actualización no aplica', async () => {
      query.mockResolvedValueOnce([]);
      await expect(
        run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u')),
      ).rejects.toBeInstanceOf(NotFoundException);
      query.mockResolvedValueOnce([row({ anonymized: true })]);
      await expect(
        run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u')),
      ).rejects.toBeInstanceOf(NotFoundException);
      query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([[], 0]);
      await expect(run(() => adapter.freezeFiscalDataIfMissing(contractId, 'u'))).rejects.toThrow(
        'No se pudieron congelar',
      );
    });
  });
});
