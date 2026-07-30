import { HealthController } from './health.controller';
import type { PlatformRelayTelemetry } from '../tasks/services/execution-order-projection-convergence.service';

const telemetry: PlatformRelayTelemetry = {
  outboxDepth: 4,
  oldestPendingAgeSeconds: 37,
  dlqSize: 1,
  reconciliationDiscrepancies: 2,
  lastScanAt: '2026-07-30T12:00:00.000Z',
  lagDistributionSeconds: {
    count: 4,
    minSeconds: 1,
    p50Seconds: 10,
    p95Seconds: 37,
    p99Seconds: 37,
    maxSeconds: 37,
  },
  lagThresholds: { degradedSeconds: null, stoppedSeconds: null },
  lagThresholdStatus: 'sin umbral aprobado',
};

describe('HealthController', () => {
  it('mantiene el contrato base y agrega telemetría real del relay', async () => {
    const controller = new HealthController(
      { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as never,
      { ping: jest.fn().mockResolvedValue('PONG') } as never,
      { getPlatformRelayTelemetry: jest.fn().mockResolvedValue(telemetry) } as never,
    );

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: expect.any(String),
      relay: telemetry,
    });
  });

  it('no degrada DB/Redis por una telemetría no disponible', async () => {
    const controller = new HealthController(
      { query: jest.fn().mockResolvedValue([]) } as never,
      { ping: jest.fn().mockResolvedValue('PONG') } as never,
      {
        getPlatformRelayTelemetry: jest.fn().mockRejectedValue(new Error('tabla ausente')),
      } as never,
    );

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: expect.any(String),
      relay: { status: 'unavailable', reason: 'telemetry_unavailable' },
    });
  });
});
