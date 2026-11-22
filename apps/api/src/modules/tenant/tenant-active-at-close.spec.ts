import { TenantStatus } from '@iwana/shared';
import type { EntityStatusEvent } from '../audit/interfaces/entity-lifecycle.interface';
import {
  bogotaMonthClose,
  reconstructActiveAtClose,
  type TenantCurrentState,
} from './tenant-active-at-close';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

const ev = (
  entityId: string,
  action: string,
  status: string | null,
  at: string,
): EntityStatusEvent => ({ entityId, action, status, at: new Date(at) });

const tenant = (id: string, status: TenantStatus, createdAt: string): TenantCurrentState => ({
  id,
  status,
  createdAt: new Date(createdAt),
});

/** Agosto–noviembre 2026; noviembre es el mes en curso. */
const MONTHS = ['2026-08', '2026-09', '2026-10', '2026-11'];

describe('bogotaMonthClose', () => {
  it('el cierre de un mes es la medianoche de Bogotá del 1 del mes siguiente (05:00 UTC)', () => {
    expect(bogotaMonthClose('2026-10').toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(bogotaMonthClose('2026-12').toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });
});

describe('reconstructActiveAtClose', () => {
  it('el mes en curso es el valor de hoy, aunque no haya historia', () => {
    const result = reconstructActiveAtClose({
      months: ['2026-11'],
      events: [],
      tenants: [tenant(A, TenantStatus.ACTIVE, '2020-01-01T00:00:00Z')],
      currentActive: 7,
    });
    expect(result).toEqual([7]);
  });

  it('sigue los cambios de estado auditados mes a mes', () => {
    const result = reconstructActiveAtClose({
      months: MONTHS,
      events: [
        ev(A, 'CREATE', 'PROVISIONING', '2026-07-10T12:00:00Z'),
        // Activación auditada (el aprovisionador hoy no la registra; ver reconstructActiveAtClose).
        ev(A, 'UPDATE', 'ACTIVE', '2026-07-20T12:00:00Z'),
        ev(A, 'UPDATE', 'SUSPENDED', '2026-09-15T12:00:00Z'),
        ev(A, 'UPDATE', 'ACTIVE', '2026-10-15T12:00:00Z'),
      ],
      tenants: [tenant(A, TenantStatus.ACTIVE, '2026-07-10T12:00:00Z')],
      currentActive: 1,
    });
    expect(result).toEqual([1, 0, 1, 1]);
  });

  it('empresa creada a mitad del periodo: 0 antes de existir, cuenta desde su activación auditada', () => {
    const result = reconstructActiveAtClose({
      months: MONTHS,
      events: [
        ev(A, 'CREATE', 'PROVISIONING', '2026-07-01T12:00:00Z'),
        ev(A, 'UPDATE', 'ACTIVE', '2026-07-02T12:00:00Z'),
        ev(B, 'CREATE', 'PROVISIONING', '2026-09-10T12:00:00Z'),
        ev(B, 'UPDATE', 'ACTIVE', '2026-09-11T12:00:00Z'),
      ],
      tenants: [
        tenant(A, TenantStatus.ACTIVE, '2026-07-01T12:00:00Z'),
        tenant(B, TenantStatus.ACTIVE, '2026-09-10T12:00:00Z'),
      ],
      currentActive: 2,
    });
    expect(result).toEqual([1, 2, 2, 2]);
  });

  it('empresa retirada: marcada deja de contar; purgada (sin fila en tenants) tampoco cuenta', () => {
    const result = reconstructActiveAtClose({
      months: MONTHS,
      events: [
        ev(A, 'UPDATE', 'ACTIVE', '2026-07-02T12:00:00Z'),
        ev(B, 'UPDATE', 'ACTIVE', '2026-07-02T12:00:00Z'),
        ev(A, 'DELETE', null, '2026-09-05T12:00:00Z'),
        ev(B, 'UPDATE', 'INACTIVE', '2026-09-06T12:00:00Z'),
        ev(B, 'TENANT_DELETION_CLOCK_SET', 'MARKED_FOR_DELETION', '2026-09-07T12:00:00Z'),
        ev(B, 'TENANT_PURGE_COMPLETED', null, '2026-10-07T12:00:00Z'),
      ],
      tenants: [tenant(A, TenantStatus.MARKED_FOR_DELETION, '2026-07-01T12:00:00Z')],
      currentActive: 0,
    });
    expect(result).toEqual([2, 0, 0, 0]);
  });

  it('empresa sin eventos antes del cierre (anterior a la auditoría) → null, nunca 0', () => {
    const result = reconstructActiveAtClose({
      months: MONTHS,
      events: [ev(A, 'UPDATE', 'SUSPENDED', '2026-09-20T12:00:00Z')],
      tenants: [tenant(A, TenantStatus.SUSPENDED, '2025-01-01T00:00:00Z')],
      currentActive: 0,
    });
    // Agosto: sin historia; desde septiembre, el evento auditado fija el estado.
    expect(result).toEqual([null, 0, 0, 0]);
  });

  it('una sola empresa sin historia anula el mes aunque las demás se conozcan', () => {
    const result = reconstructActiveAtClose({
      months: ['2026-10', '2026-11'],
      events: [ev(A, 'UPDATE', 'ACTIVE', '2026-07-02T12:00:00Z')],
      tenants: [
        tenant(A, TenantStatus.ACTIVE, '2026-07-01T12:00:00Z'),
        tenant(B, TenantStatus.ACTIVE, '2024-01-01T00:00:00Z'),
      ],
      currentActive: 2,
    });
    expect(result).toEqual([null, 2]);
  });

  it('en aprovisionamiento al cierre y activa hoy sin evento de activación → null (activación no auditada)', () => {
    const result = reconstructActiveAtClose({
      months: MONTHS,
      events: [ev(A, 'CREATE', 'PROVISIONING', '2026-08-31T23:00:00Z')],
      tenants: [tenant(A, TenantStatus.ACTIVE, '2026-08-31T23:00:00Z')],
      currentActive: 1,
    });
    // Julio no está en la serie; agosto en adelante: no se sabe cuándo se activó.
    expect(result).toEqual([null, null, null, 1]);
  });

  it('en aprovisionamiento al cierre y hoy fallida o reintentada después → no activa al cierre', () => {
    const result = reconstructActiveAtClose({
      months: MONTHS,
      events: [
        ev(A, 'CREATE', 'PROVISIONING', '2026-08-10T12:00:00Z'),
        ev(B, 'CREATE', 'PROVISIONING', '2026-08-10T12:00:00Z'),
        // Reintento auditado en octubre: nunca estuvo ACTIVE antes (ACTIVE no vuelve a aprovisionar).
        ev(B, 'UPDATE', 'PROVISIONING', '2026-10-03T12:00:00Z'),
        ev(B, 'UPDATE', 'ACTIVE', '2026-10-04T12:00:00Z'),
      ],
      tenants: [
        tenant(A, TenantStatus.PROVISIONING_FAILED, '2026-08-10T12:00:00Z'),
        tenant(B, TenantStatus.ACTIVE, '2026-08-10T12:00:00Z'),
      ],
      currentActive: 1,
    });
    expect(result).toEqual([0, 0, 1, 1]);
  });

  it('borde de mes en Bogotá: un cambio a las 23:59 del 31 hora Bogotá cuenta en ese mes; a las 00:00 del 1, en el siguiente', () => {
    const result = reconstructActiveAtClose({
      months: MONTHS,
      events: [
        ev(A, 'UPDATE', 'ACTIVE', '2026-07-01T12:00:00Z'),
        ev(B, 'UPDATE', 'ACTIVE', '2026-07-01T12:00:00Z'),
        // 31-ago 23:59:59.999 Bogotá = 1-sep 04:59:59.999 UTC: suspendida al cierre de agosto.
        ev(A, 'UPDATE', 'SUSPENDED', '2026-09-01T04:59:59.999Z'),
        // 1-sep 00:00 Bogotá = 1-sep 05:00 UTC: aún activa al cierre de agosto.
        ev(B, 'UPDATE', 'SUSPENDED', '2026-09-01T05:00:00.000Z'),
      ],
      tenants: [
        tenant(A, TenantStatus.SUSPENDED, '2026-07-01T00:00:00Z'),
        tenant(B, TenantStatus.SUSPENDED, '2026-07-01T00:00:00Z'),
      ],
      currentActive: 0,
    });
    expect(result).toEqual([1, 0, 0, 0]);
  });

  it('el CREATE auditado un instante después del createdAt real cuenta desde createdAt', () => {
    const result = reconstructActiveAtClose({
      months: ['2026-08', '2026-09'],
      events: [
        // Interceptor fire-and-forget: el log llega tras el cierre de agosto.
        ev(A, 'CREATE', 'PROVISIONING', '2026-09-01T05:00:00.020Z'),
      ],
      tenants: [tenant(A, TenantStatus.PROVISIONING, '2026-09-01T04:59:59.990Z')],
      currentActive: 0,
    });
    expect(result).toEqual([0, 0]);
  });

  it('una entidad purgada cuyo primer evento visible es posterior al cierre y no es CREATE → null', () => {
    const result = reconstructActiveAtClose({
      months: ['2026-08', '2026-09'],
      events: [ev(C, 'DELETE', null, '2026-09-10T12:00:00Z')],
      tenants: [],
      currentActive: 0,
    });
    expect(result).toEqual([null, 0]);
  });

  it('una entidad purgada creada después del cierre no existía: 0', () => {
    const result = reconstructActiveAtClose({
      months: ['2026-08', '2026-09'],
      events: [
        ev(C, 'CREATE', 'PROVISIONING', '2026-09-10T12:00:00Z'),
        ev(C, 'DELETE', null, '2026-09-11T12:00:00Z'),
        ev(C, 'TENANT_PURGE_COMPLETED', null, '2026-09-20T12:00:00Z'),
      ],
      tenants: [],
      currentActive: 0,
    });
    expect(result).toEqual([0, 0]);
  });

  it('ignora entity_id que no son UUID (rutas sin :id) y estados desconocidos', () => {
    const result = reconstructActiveAtClose({
      months: ['2026-10', '2026-11'],
      events: [
        ev('unknown', 'DELETE', null, '2026-10-02T12:00:00Z'),
        ev(A, 'UPDATE', 'ACTIVE', '2026-09-01T12:00:00Z'),
        ev(A, 'UPDATE', 'READY', '2026-10-02T12:00:00Z'),
      ],
      tenants: [tenant(A, TenantStatus.ACTIVE, '2026-09-01T00:00:00Z')],
      currentActive: 1,
    });
    expect(result).toEqual([1, 1]);
  });
});
