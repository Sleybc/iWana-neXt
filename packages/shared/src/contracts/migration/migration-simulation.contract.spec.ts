import { BILLING_PAYMENT_METHODS } from '../billing/billing-constants';
import * as queuePayloads from '../queue-payloads';
import {
  MIGRATION_MAPPING_TARGET_FORMAT,
  MigrationBatchCountsSchema,
  MigrationMappingCreateSchema,
  MigrationPromoteAcceptedSchema,
  MigrationPromoteJobSchema,
  MigrationPurgeTenantJobSchema,
  MigrationSimulateJobSchema,
  migrationMappingTargetError,
} from './migration-import.contract';

const uuid = '69000000-0000-4000-8000-000000000001';

const validCounts = {
  procesamiento: 'COMPLETADO',
  archivos: { recibidos: 2, leidos: 1, rechazados: { ZIP_INVALIDO: 1 } },
  entidades: { SUSCRIPTOR: { leidos: 1, validos: 1, rechazados: 0 } },
  observaciones: {},
  tareasSinFuente: 0,
  pendientesEquivalencia: [
    { kind: 'PLAN', externalValue: '7', externalLabel: 'Plan 7', occurrences: 2 },
  ],
  procesadoEn: '2026-11-12T10:00:00.000Z',
};

describe('Contrato de la simulación y las equivalencias UISP (ADR-110 bloque B)', () => {
  describe('counts', () => {
    it('acepta un informe parcial por entidad, motivo y observación', () => {
      expect(MigrationBatchCountsSchema.safeParse(validCounts).success).toBe(true);
    });

    it('rechaza claves fuera del catálogo, negativos y campos extra', () => {
      for (const bad of [
        { ...validCounts, entidades: { CLIENTE: { leidos: 1, validos: 1, rechazados: 0 } } },
        { ...validCounts, tareasSinFuente: -1 },
        { ...validCounts, archivos: { ...validCounts.archivos, extra: 1 } },
        { ...validCounts, nombre: 'Ana' },
        { ...validCounts, procesamiento: 'EN_CURSO' },
      ]) {
        expect(MigrationBatchCountsSchema.safeParse(bad).success).toBe(false);
      }
    });
  });

  describe('equivalencias', () => {
    it('METODO_PAGO deriva del catálogo de Billing', () => {
      for (const method of BILLING_PAYMENT_METHODS) {
        expect(MIGRATION_MAPPING_TARGET_FORMAT.METODO_PAGO.test(method)).toBe(true);
        expect(migrationMappingTargetError('METODO_PAGO', 'EQUIVALE', method)).toBeNull();
      }
      expect(migrationMappingTargetError('METODO_PAGO', 'EQUIVALE', 'BITCOIN')).toBe(
        'MIGRATION_MAPPING_TARGET_INVALID',
      );
      expect(MIGRATION_MAPPING_TARGET_FORMAT.METODO_PAGO.test('EFECTIVOX')).toBe(false);
    });

    it('solo las etiquetas admiten DESCARTAR o NOTA, y sin destino', () => {
      expect(migrationMappingTargetError('ETIQUETA', 'DESCARTAR', null)).toBeNull();
      expect(migrationMappingTargetError('ETIQUETA', 'NOTA', uuid)).toBe(
        'MIGRATION_MAPPING_TARGET_INVALID',
      );
      expect(migrationMappingTargetError('PLAN', 'DESCARTAR', null)).toBe(
        'MIGRATION_MAPPING_TARGET_INVALID',
      );
      expect(migrationMappingTargetError('PLAN', 'EQUIVALE', uuid)).toBeNull();
      expect(migrationMappingTargetError('CICLO', 'EQUIVALE', '29')).toBe(
        'MIGRATION_MAPPING_TARGET_INVALID',
      );
      expect(migrationMappingTargetError('CICLO', 'EQUIVALE', '28')).toBeNull();
    });

    it('el alta valida tipo y acción del catálogo', () => {
      expect(
        MigrationMappingCreateSchema.safeParse({
          kind: 'PLAN',
          externalValue: '7',
          action: 'EQUIVALE',
          targetRef: uuid,
        }).success,
      ).toBe(true);
      expect(
        MigrationMappingCreateSchema.safeParse({
          kind: 'OTRO',
          externalValue: '7',
          action: 'EQUIVALE',
        }).success,
      ).toBe(false);
    });
  });

  it('respuesta 202 de la promoción: id y CARGADO, nada más', () => {
    expect(MigrationPromoteAcceptedSchema.parse({ id: uuid, status: 'CARGADO' })).toEqual({
      id: uuid,
      status: 'CARGADO',
    });
    expect(
      MigrationPromoteAcceptedSchema.safeParse({ id: uuid, status: 'PROMOVIDO' }).success,
    ).toBe(false);
  });

  it('queue-payloads re-exporta los esquemas de los jobs de importación', () => {
    expect(queuePayloads.MigrationSimulateJobSchema).toBe(MigrationSimulateJobSchema);
    expect(queuePayloads.MigrationPurgeTenantJobSchema).toBe(MigrationPurgeTenantJobSchema);
    expect(queuePayloads.MigrationPromoteJobSchema).toBe(MigrationPromoteJobSchema);
  });
});
