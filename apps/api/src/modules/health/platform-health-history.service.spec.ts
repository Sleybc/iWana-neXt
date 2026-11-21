import {
  bogotaDate,
  buildHistoryDays,
  historyDates,
  PlatformHealthHistoryService,
} from './platform-health-history.service';

describe('PlatformHealthHistoryService', () => {
  // 2026-11-21 03:00 UTC = 2026-11-20 22:00 en Bogotá.
  const now = new Date('2026-11-21T03:00:00.000Z');

  it('usa el día calendario de Bogotá', () => {
    expect(bogotaDate(now)).toBe('2026-11-20');
    expect(bogotaDate(new Date('2026-11-21T05:00:00.000Z'))).toBe('2026-11-21');
  });

  it('arma 30 días del más antiguo al actual', () => {
    const dates = historyDates(now);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-10-22');
    expect(dates[29]).toBe('2026-11-20');
  });

  it('un día sin muestras queda sin dato (null), nunca disponible', () => {
    const [day] = buildHistoryDays(['2026-11-20'], []);
    expect(day?.components).toEqual({
      api: { samples: 0, availability: null },
      db: { samples: 0, availability: null },
      redis: { samples: 0, availability: null },
    });
  });

  it('calcula OK / muestras por componente y respeta el API no medido', () => {
    const [day] = buildHistoryDays(
      ['2026-11-20'],
      [
        {
          day: '2026-11-20',
          api_samples: 0,
          api_ok: 0,
          db_samples: 4,
          db_ok: 4,
          redis_samples: 4,
          redis_ok: 3,
        },
      ],
    );
    expect(day?.components.api).toEqual({ samples: 0, availability: null });
    expect(day?.components.db).toEqual({ samples: 4, availability: 1 });
    expect(day?.components.redis).toEqual({ samples: 4, availability: 0.75 });
  });

  it('getHistory consulta la ventana de 30 días y devuelve la última muestra de colas', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          day: '2026-11-20',
          api_samples: 2,
          api_ok: 1,
          db_samples: 2,
          db_ok: 2,
          redis_samples: 2,
          redis_ok: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          sampled_at: new Date('2026-11-21T02:55:00.000Z'),
          queues: [
            { name: 'search-index', waiting: 2, failed: 1, oldestWaitingSeconds: 40 },
            { name: 'refresh-token-purge', waiting: 0, failed: 0, oldestWaitingSeconds: null },
            { waiting: 1 },
          ],
        },
      ]);
    const service = new PlatformHealthHistoryService({ query } as never);

    const history = await service.getHistory(now);

    const [, params] = query.mock.calls[0] as [string, Date[]];
    expect(params[0]?.toISOString()).toBe('2026-10-22T05:00:00.000Z');
    expect(params[1]?.toISOString()).toBe('2026-11-21T05:00:00.000Z');
    expect(history.days).toHaveLength(30);
    expect(history.days[29]?.components.api).toEqual({ samples: 2, availability: 0.5 });
    expect(history.days[0]?.components.db.availability).toBeNull();
    expect(history.queues).toEqual([
      { name: 'search-index', waiting: 2, failed: 1, oldestWaitingSeconds: 40 },
      { name: 'refresh-token-purge', waiting: 0, failed: 0, oldestWaitingSeconds: null },
    ]);
    expect(history.queuesSampledAt).toBe('2026-11-21T02:55:00.000Z');
    expect(history.generatedAt).toBe(now.toISOString());
  });

  it('sin muestras: colas vacías y queuesSampledAt null', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const history = await new PlatformHealthHistoryService({ query } as never).getHistory(now);
    expect(history.queues).toEqual([]);
    expect(history.queuesSampledAt).toBeNull();
    expect(history.days.every((day) => day.components.redis.availability === null)).toBe(true);
  });

  it('propaga el error de la base (la UI muestra error con Reintentar)', async () => {
    const query = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(
      new PlatformHealthHistoryService({ query } as never).getHistory(now),
    ).rejects.toThrow('db down');
  });
});
