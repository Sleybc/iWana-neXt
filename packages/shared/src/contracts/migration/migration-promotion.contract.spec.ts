import { BILLING_DOCUMENT_STATUSES, BillingDocumentResponseSchema } from '../billing';
import {
  MIGRATION_REJECTION_REASONS,
  MigrationPromoteJobSchema,
  MigrationReconciliationReportSchema,
  MigrationRevertBlockerSchema,
  MigrationRevertResultSchema,
} from './migration-import.contract';
import { SubscriberDocumentSchema } from '../crm/subscriber-documents';

const uuid = '69000000-0000-4000-8000-000000000001';

describe('Contrato de la promoción UISP (ADR-110 bloque C)', () => {
  it('el job de promoción solo lleva identificadores (sin PII ni campos extra)', () => {
    expect(
      MigrationPromoteJobSchema.safeParse({
        version: 1,
        tenantId: uuid,
        batchId: uuid,
        actorId: uuid,
      }).success,
    ).toBe(true);
    expect(
      MigrationPromoteJobSchema.safeParse({
        version: 1,
        tenantId: uuid,
        batchId: uuid,
        actorId: uuid,
        documento: '1000000001',
      }).success,
    ).toBe(false);
  });

  it('la conciliación solo admite montos con dos decimales e identificadores', () => {
    const report = {
      resultado: 'CON_DIFERENCIAS',
      titulares: 1,
      conciliados: 0,
      diferencias: [
        {
          subscriberId: uuid,
          externalId: 'uisp:client:1',
          facturado: { uisp: '240.00', iwana: '240.00' },
          pagado: { uisp: '160.00', iwana: '0.00' },
          saldo: { uisp: '80.00', iwana: '-240.00' },
        },
      ],
      calculadoEn: '2026-11-12T00:00:00.000Z',
    };
    expect(MigrationReconciliationReportSchema.safeParse(report).success).toBe(true);
    expect(
      MigrationReconciliationReportSchema.safeParse({
        ...report,
        diferencias: [{ ...report.diferencias[0], nombre: 'Titular' }],
      }).success,
    ).toBe(false);
  });

  it('bloqueos y resultado de la reversión', () => {
    expect(
      MigrationRevertBlockerSchema.safeParse({ motivo: 'PAGO_POSTERIOR', cantidad: 1 }).success,
    ).toBe(true);
    expect(
      MigrationRevertBlockerSchema.safeParse({ motivo: 'PAGO_POSTERIOR', cantidad: 0 }).success,
    ).toBe(false);
    expect(
      MigrationRevertResultSchema.safeParse({
        id: uuid,
        status: 'REVERTIDO',
        retirados: { SUSCRIPTOR: 1 },
        etiquetasRetiradas: 0,
      }).success,
    ).toBe(true);
    expect(MIGRATION_REJECTION_REASONS).toEqual(
      expect.arrayContaining([
        'DATOS_OBLIGATORIOS_AUSENTES',
        'SIN_CONTRATO_ASOCIADO',
        'ARCHIVO_AUSENTE',
      ]),
    );
  });

  it('MOD14 admite IMPORTADO sin periodo y con número de origen', () => {
    expect(BILLING_DOCUMENT_STATUSES).toContain('IMPORTADO');
    const shape = BillingDocumentResponseSchema.shape;
    expect(shape.periodId.safeParse(null).success).toBe(true);
    expect(shape.periodStart.safeParse(null).success).toBe(true);
    expect(shape.externalNumber.safeParse('UISP-1').success).toBe(true);
  });

  it('el soporte del suscriptor no expone el nombre del archivo', () => {
    const base = {
      id: uuid,
      subscriberId: uuid,
      kind: 'PDF',
      contentType: 'application/pdf',
      sizeBytes: 10,
      origin: 'IMPORTADO',
      visibility: 'INTERNA',
      documentDate: null,
      createdAt: '2026-11-12T00:00:00.000Z',
    };
    expect(SubscriberDocumentSchema.safeParse(base).success).toBe(true);
    expect(SubscriberDocumentSchema.safeParse({ ...base, fileName: 'cedula.pdf' }).success).toBe(
      false,
    );
  });
});
