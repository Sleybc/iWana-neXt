import type { TenantUsageItem } from '@iwana/shared';
import { summarizeTenantUsage, usageDisplayPercent, usageTone } from './tenant-usage';

const item = (
  name: string,
  activeSubscribers: number | null,
  maxSubscribers: number | null,
): TenantUsageItem => ({
  tenantId: `id-${name}`,
  name,
  activeSubscribers,
  maxSubscribers,
  measuredAt: null,
});

describe('usageTone (dirección v1.2 §8, decisión CTO: el cupo solo avisa)', () => {
  it('ámbar desde 90 %, rojo desde 100 % con la razón exacta', () => {
    expect(usageTone(item('a', 89, 100))).toBe('primary');
    expect(usageTone(item('a', 90, 100))).toBe('warning');
    expect(usageTone(item('a', 96, 100))).toBe('warning');
    // 999/1000 = 99,9 %: ámbar aunque redondeado diría 100 %.
    expect(usageTone(item('a', 999, 1000))).toBe('warning');
    expect(usageTone(item('a', 100, 100))).toBe('error');
    expect(usageTone(item('a', 120, 100))).toBe('error');
  });

  it('cupo 0 con activos es rojo; sin cupo, sin dato y cupo 0 vacío no tienen tono', () => {
    expect(usageTone(item('a', 7, 0))).toBe('error');
    expect(usageTone(item('a', 0, 0))).toBeNull();
    expect(usageTone(item('a', 1200, null))).toBeNull();
    expect(usageTone(item('a', null, 50))).toBeNull();
  });
});

describe('usageDisplayPercent', () => {
  it('trunca hacia abajo: «100 %» solo al alcanzar el cupo', () => {
    expect(usageDisplayPercent(item('a', 999, 1000))).toBe(99);
    expect(usageDisplayPercent(item('a', 2, 3))).toBe(66);
    expect(usageDisplayPercent(item('a', 100, 100))).toBe(100);
    expect(usageDisplayPercent(item('a', 0, 0))).toBeNull();
    expect(usageDisplayPercent(item('a', null, 10))).toBeNull();
  });
});

describe('summarizeTenantUsage (regla única de área y cola de atención)', () => {
  it('ordena por razón exacta, luego sin cupo, «Sin dato» al final; empate por nombre', () => {
    const { rows } = summarizeTenantUsage([
      item('Nueva', null, 50),
      item('Sin Cupo', 1200, null),
      item('Baja', 10, 100),
      item('Casi', 999, 1000),
      item('Llena', 100, 100),
      item('Cerrada', 7, 0),
      item('Alfa', 10, 100),
    ]);
    expect(rows.map((r) => r.name)).toEqual([
      'Cerrada',
      'Llena',
      'Casi',
      'Alfa',
      'Baja',
      'Sin Cupo',
      'Nueva',
    ]);
  });

  it('atención: una por empresa con activos ≥ cupo; llegó o superó', () => {
    const summary = summarizeTenantUsage([
      item('Llena', 100, 100),
      item('Pasada', 101, 100),
      item('Cerrada', 7, 0),
      item('Vacía', 0, 0),
      item('Casi', 99, 100),
      item('Sin Cupo', 1200, null),
      item('Nueva', null, 50),
    ]);
    expect(summary.overQuota.map((o) => [o.item.name, o.kind])).toEqual([
      ['Cerrada', 'exceeded'],
      ['Pasada', 'exceeded'],
      ['Llena', 'reached'],
    ]);
    expect(summary.state).toBe('reached');
  });

  it('estado del área: cerca del cupo sin rojo; despejado sin ámbar', () => {
    expect(summarizeTenantUsage([item('a', 90, 100)]).state).toBe('near');
    expect(summarizeTenantUsage([item('a', 89, 100), item('b', 0, 0)]).state).toBe('clear');
    expect(summarizeTenantUsage(null).state).toBe('clear');
  });
});
