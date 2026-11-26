import {
  MIGRATION_ENTITIES,
  MIGRATION_FILE_REJECTION_REASONS,
  MIGRATION_OBSERVATIONS,
  MIGRATION_REJECTION_REASONS,
  MIGRATION_REVERT_BLOCK_REASONS,
  MIGRATION_ERROR_CODES,
  MIGRATION_TICKET_ATTACHMENT_SKIP_REASONS,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import {
  MIGRATION_ENTITY_LABELS,
  MIGRATION_FILE_REJECTION_LABELS,
  MIGRATION_MAPPING_KIND_LABELS,
  MIGRATION_OBSERVATION_LABELS,
  MIGRATION_REJECTION_REASON_LABELS,
  MIGRATION_REVERT_BLOCK_LABELS,
  MIGRATION_TICKET_ATTACHMENT_SKIP_LABELS,
  externalClientLabel,
  mappingActionsFor,
  migrationBatchStatusPresentation,
  migrationErrorMessage,
  migrationPendingValueLabel,
  revertBlockedDetail,
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
    [
      'adjuntos de tickets no importados',
      MIGRATION_TICKET_ATTACHMENT_SKIP_REASONS,
      MIGRATION_TICKET_ATTACHMENT_SKIP_LABELS,
    ],
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

  it('el detalle de la API solo acompaña al bloqueo por tickets o adjuntos posteriores', () => {
    const tickets = [{ motivo: 'TICKET_POSTERIOR' as const, cantidad: 1 }];
    const blocked = new ApiError(409, 'MIGRATION_REVERT_BLOCKED', ' Quita los adjuntos. ');
    expect(revertBlockedDetail(blocked, tickets)).toBe('Quita los adjuntos.');
    expect(revertBlockedDetail(blocked, [{ motivo: 'PAGO_POSTERIOR', cantidad: 1 }])).toBeNull();
    expect(
      revertBlockedDetail(new ApiError(409, 'MIGRATION_REVERT_BLOCKED', '  '), tickets),
    ).toBeNull();
    expect(revertBlockedDetail(new ApiError(409, 'OTRO', 'x'), tickets)).toBeNull();
    expect(revertBlockedDetail(new Error('x'), tickets)).toBeNull();
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
    const sized = (name: string, megabytes: number) => {
      const file = zip(name);
      Object.defineProperty(file, 'size', { value: Math.round(megabytes * 1024 * 1024) });
      return file;
    };
    // Un cliente con años de historial (27,7 MB real) ya entra.
    expect(validateMigrationFiles([sized('client-export-22.zip', 27.7)])).toBeNull();
    expect(validateMigrationFiles([sized('grande.zip', 100.1)])).toBe(
      '«grande.zip» supera 100 MB.',
    );
    expect(
      validateMigrationFiles([sized('a.zip', 90), sized('b.zip', 90), sized('c.zip', 30)]),
    ).toBe('Los archivos suman más de 200 MB: divídelos en varios lotes.');
    expect(validateMigrationFiles([zip('cliente.ZIP')])).toBeNull();
  });

  it('muestra el cliente externo sin el prefijo interno', () => {
    expect(externalClientLabel('uisp:client:123')).toBe('Cliente 123 de UISP');
  });
  it.each(MIGRATION_ERROR_CODES)('traduce el código %s sin usar el respaldo', (code) => {
    expect(migrationErrorMessage(new ApiError(400, code, 'x'), 'RESPALDO')).not.toBe('RESPALDO');
  });

  it('usuarios de UISP: tipo, observación y errores con vocabulario sin tecnicismos', () => {
    expect(MIGRATION_MAPPING_KIND_LABELS.USUARIO).toBe('Usuario');
    expect(MIGRATION_OBSERVATION_LABELS.USUARIO_UISP_SIN_ENLAZAR).toBe(
      'Usuarios de UISP sin enlazar',
    );
    expect(mappingActionsFor('USUARIO')).toEqual(['EQUIVALE']);
    const message = (code: string) => migrationErrorMessage(new ApiError(400, code, 'x'), 'f');
    expect(message('MIGRATION_SOURCE_UNREACHABLE')).toBe(
      'No pudimos conectar con UISP. Revisa la dirección.',
    );
    expect(message('MIGRATION_SOURCE_UNAUTHORIZED')).toBe('UISP rechazó la clave de aplicación.');
    expect(message('MIGRATION_SOURCE_NOT_CONFIGURED')).toBe(
      'Configura primero la conexión con UISP.',
    );
    expect(message('MIGRATION_USER_ROLE_NOT_ALLOWED')).toBe(
      'Ese rol no se puede asignar a un usuario importado.',
    );
    expect(message('MIGRATION_UISP_USER_NOT_FOUND')).toBe(
      'Ese usuario de UISP ya no está en la lista.',
    );
  });

  it('una promoción fallida se presenta como «Promoción fallida»', () => {
    expect(migrationBatchStatusPresentation('CARGADO', 'COMPLETADO', 'FALLIDO')).toEqual({
      label: 'Promoción fallida',
      variant: 'error',
    });
  });
});

describe('migrationPendingValueLabel', () => {
  it('prefiere el nombre; el ciclo como día y el método sin nombre con un código corto', () => {
    expect(
      migrationPendingValueLabel({
        kind: 'METODO_PAGO',
        externalValue: 'abc',
        externalLabel: 'Efectivo',
      }),
    ).toBe('Efectivo');
    expect(
      migrationPendingValueLabel({ kind: 'CICLO', externalValue: '15', externalLabel: null }),
    ).toBe('Día 15 del mes');
    expect(
      migrationPendingValueLabel({
        kind: 'METODO_PAGO',
        externalValue: '4145b5f5-3bbc-45e3-8fc5-9cda970c62fb',
        externalLabel: null,
      }),
    ).toBe('Método de UISP sin nombre (4145b5f5)');
    expect(
      migrationPendingValueLabel({ kind: 'PLAN', externalValue: '7', externalLabel: null }),
    ).toBe('7');
  });
});
