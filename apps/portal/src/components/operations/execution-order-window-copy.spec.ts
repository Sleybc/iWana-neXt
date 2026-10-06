import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionOrderStatus } from '@iwana/shared';
import { getExecutionOrderWindowAbsence } from './execution-order-window-copy';

const OPEN_STATUSES = [
  ExecutionOrderStatus.CREATED,
  ExecutionOrderStatus.ASSIGNED,
  ExecutionOrderStatus.EN_ROUTE,
  ExecutionOrderStatus.IN_PROGRESS,
  ExecutionOrderStatus.BLOCKED,
];
const TERMINAL_STATUSES = [
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
];

describe('getExecutionOrderWindowAbsence (E4, contrato de tablas v1.2 §7.2)', () => {
  it.each(OPEN_STATUSES)('%s -> «Por programar» con la ayuda aprobada', (status) => {
    expect(getExecutionOrderWindowAbsence(status)).toEqual({
      label: 'Por programar',
      help: 'Esta orden no tiene una ventana planificada. Coordina su programación con el equipo de programación.',
    });
  });

  it.each(TERMINAL_STATUSES)('%s -> «Sin ventana planificada» sin ayuda', (status) => {
    expect(getExecutionOrderWindowAbsence(status)).toEqual({
      label: 'Sin ventana planificada',
      help: null,
    });
  });

  it('cubre todos los estados del enum: ninguno queda sin semántica', () => {
    const covered = new Set<string>([...OPEN_STATUSES, ...TERMINAL_STATUSES]);
    expect(new Set(Object.values(ExecutionOrderStatus))).toEqual(covered);
  });

  it('la ayuda no invita a reclamar la orden', () => {
    const help = getExecutionOrderWindowAbsence(ExecutionOrderStatus.CREATED).help ?? '';
    expect(help).not.toMatch(/reclam|tomar|asígnate|autoasign/i);
  });
});

describe('fuente única del copy de ventana nula', () => {
  const dir = __dirname;
  const sources = readdirSync(dir)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.spec\.tsx?$/.test(file))
    .map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8') }));

  const filesWith = (fragment: string) =>
    sources
      .filter(({ text }) => text.includes(fragment))
      .map(({ file }) => file)
      .sort();

  it.each(['Por programar', 'Sin ventana planificada', 'Coordina su programación'])(
    '«%s» se declara solo en execution-order-window-copy.ts',
    (fragment) => {
      expect(filesWith(fragment)).toEqual(
        expect.arrayContaining(['execution-order-window-copy.ts']),
      );
      // Los comentarios de cabecera pueden citarlo; ninguna pantalla lo duplica en JSX.
      const jsxFiles = sources
        .filter(({ file }) => file.endsWith('.tsx'))
        .filter(({ text }) => new RegExp(`['"\`>]${fragment}`).test(text))
        .map(({ file }) => file);
      expect(jsxFiles).toEqual([]);
    },
  );

  it('la tabla y el resumen consumen la misma fuente', () => {
    expect(filesWith("from './execution-order-window-copy'")).toEqual(
      expect.arrayContaining(['ExecutionOrdersTable.tsx', 'ExecutionOrderSummary.tsx']),
    );
  });
});
