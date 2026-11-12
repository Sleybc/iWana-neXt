import {
  MIGRATION_ENTITIES,
  MIGRATION_FILE_REJECTION_REASONS,
  MIGRATION_OBSERVATIONS,
  MIGRATION_REJECTION_REASONS,
  MIGRATION_REVERT_BLOCK_REASONS,
  MIGRATION_ERROR_CODES,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import {
  MIGRATION_ENTITY_LABELS,
  MIGRATION_FILE_REJECTION_LABELS,
  MIGRATION_OBSERVATION_LABELS,
  MIGRATION_REJECTION_REASON_LABELS,
  MIGRATION_REVERT_BLOCK_LABELS,
  externalClientLabel,
  mappingActionsFor,
  migrationBatchStatusPresentation,
  migrationErrorMessage,
  revertBlockersFromError,
  validateMigrationFiles,
} from './migration-labels';

const CODE_PATTERN = /[A-Z]{2,}_[A-Z]/;

describe('vocabulario de importaciones', () => {
  it.each([
    ['entidades', MIGRATION_ENTITIES, MIGRATION_ENTITY_LABELS],
    ['motivos de rechazo', MIGRATION_REJECTION_REASONS, MIGRATION_REJECTION_REASON_LABELS],
    ['rechazos de archivo', MIGRATION_FILE_REJECTION_REASONS, MIGRATION_FILE_REJECTION_LABELS],
    ['observaciones', MIGRATION_OBSERVATIONS, MIGRATION_OBSERVATION_LABELS],
    ['bloqueos de reversión', MIGRATION_REVERT_BLOCK_REASONS, MIGRATION_REVERT_BLOCK_LABELS],
  ] as const)('traduce todos los %s sin códigos internos', (_name, codes, labels) => {
    for (const code of codes) {
      const label = (labels as Record<string, string>)[code];
      expect(label).toBeTruthy();
      expect(label).not.toMatch(CODE_PATTERN);
    }
  });

  it('el procesamiento en curso o fallido prevalece sobre el estado del lote', () => {
    expect(migrationBatchStatusPresentation('SIMULADO', 'PENDIENTE').label).toBe('Procesando');
    expect(migrationBatchStatusPresentation('SIMULADO', 'FALLIDO').label).toBe(
      'Procesamiento fallido',
    );
    expect(migrationBatchStatusPresentation('CONCILIADO', 'COMPLETADO').label).toBe('Conciliado');
    expect(migrationBatchStatusPresentation('CARGADO', 'COMPLETADO').label).toBe('Promoviendo');
  });

  it('solo las etiquetas admiten descartar o nota', () => {
    expect(mappingActionsFor('PLAN')).toEqual(['EQUIVALE']);
    expect(mappingActionsFor('ETIQUETA')).toEqual(['EQUIVALE', 'DESCARTAR', 'NOTA']);
  });

  it('lee los bloqueos válidos del 409 y descarta los demás', () => {
    const error = new ApiError(409, 'MIGRATION_REVERT_BLOCKED', 'x', {
      blockers: [
        { motivo: 'PAGO_POSTERIOR', cantidad: 3 },
        { motivo: 'INVENTADO', cantidad: 1 },
      ],
    });
    expect(revertBlockersFromError(error)).toEqual([{ motivo: 'PAGO_POSTERIOR', cantidad: 3 }]);
    expect(revertBlockersFromError(new ApiError(409, 'OTRO', 'x'))).toEqual([]);
    expect(revertBlockersFromError(new Error('x'))).toEqual([]);
  });

  it('traduce los códigos de error y usa el respaldo para lo desconocido', () => {
    expect(migrationErrorMessage(new ApiError(409, 'MIGRATION_BATCH_PURGED', 'x'), 'f')).toMatch(
      /retención/,
    );
    expect(migrationErrorMessage(new ApiError(403, 'FORBIDDEN', 'x'), 'f')).toMatch(/permiso/);
    expect(migrationErrorMessage(new Error('x'), 'Respaldo')).toBe('Respaldo');
  });

  it('valida cantidad, tipo y tamaño de los ZIP antes de subir', () => {
    const zip = (name: string, size = 10) =>
      new File([new Uint8Array(size)], name, { type: 'application/zip' });
    expect(validateMigrationFiles([])).toMatch(/al menos un archivo/);
    expect(validateMigrationFiles([zip('a.txt')])).toBe('«a.txt» no es un archivo ZIP.');
    expect(validateMigrationFiles(Array.from({ length: 21 }, (_, i) => zip(`${i}.zip`)))).toMatch(
      /máximo 20/,
    );
    const big = zip('grande.zip');
    Object.defineProperty(big, 'size', { value: 25 * 1024 * 1024 + 1 });
    expect(validateMigrationFiles([big])).toBe('«grande.zip» supera 25 MB.');
    expect(validateMigrationFiles([zip('cliente.ZIP')])).toBeNull();
  });

  it('muestra el cliente externo sin el prefijo interno', () => {
    expect(externalClientLabel('uisp:client:123')).toBe('Cliente 123 de UISP');
  });
  it.each(MIGRATION_ERROR_CODES)('traduce el código %s sin usar el respaldo', (code) => {
    expect(migrationErrorMessage(new ApiError(400, code, 'x'), 'RESPALDO')).not.toBe('RESPALDO');
  });

  it('una promoción fallida se presenta como «Promoción fallida»', () => {
    expect(migrationBatchStatusPresentation('CARGADO', 'COMPLETADO', 'FALLIDO')).toEqual({
      label: 'Promoción fallida',
      variant: 'error',
    });
  });
});
