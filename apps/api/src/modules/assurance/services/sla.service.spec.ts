import { SlaService } from './sla.service';
import { SlaBreachStatus, TicketStatus } from '@iwana/shared';

describe('SlaService', () => {
  let service: SlaService;

  beforeEach(() => {
    service = new SlaService(null as any);
  });

  describe('deriveBreachStatus', () => {
    it('debe priorizar RESOLUTION_BREACHED sobre FIRST_RESPONSE_BREACHED cuando ambos están violados', () => {
      // Arrange: ticket cerrado con ambas SLA violadas
      const createdAt = new Date('2025-01-10T10:00:00Z');
      const slaFirstResponseAt = new Date('2025-01-10T12:00:00Z'); // 2 horas después
      const slaResolveByAt = new Date('2025-01-11T10:00:00Z'); // 1 día después
      const firstRespondedAt = new Date('2025-01-10T14:00:00Z'); // 4 horas después — violación
      const resolvedAt = new Date('2025-01-12T10:00:00Z'); // 2 días después — violación

      const ticket = {
        createdAt,
        status: TicketStatus.RESOLVED,
        slaFirstResponseAt,
        slaResolveByAt,
        firstRespondedAt,
        resolvedAt,
      };

      // Act
      const result = service.deriveBreachStatus(ticket);

      // Assert: debe retornar RESOLUTION_BREACHED, no FIRST_RESPONSE_BREACHED
      expect(result).toBe(SlaBreachStatus.RESOLUTION_BREACHED);
    });

    it('debe retornar FIRST_RESPONSE_BREACHED cuando solo la primera respuesta está violada', () => {
      // Arrange: ticket cerrado con solo primera respuesta violada
      const createdAt = new Date('2025-01-10T10:00:00Z');
      const slaFirstResponseAt = new Date('2025-01-10T12:00:00Z');
      const slaResolveByAt = new Date('2025-01-11T10:00:00Z');
      const firstRespondedAt = new Date('2025-01-10T14:00:00Z'); // violación
      const resolvedAt = new Date('2025-01-11T09:00:00Z'); // OK

      const ticket = {
        createdAt,
        status: TicketStatus.RESOLVED,
        slaFirstResponseAt,
        slaResolveByAt,
        firstRespondedAt,
        resolvedAt,
      };

      // Act
      const result = service.deriveBreachStatus(ticket);

      // Assert
      expect(result).toBe(SlaBreachStatus.FIRST_RESPONSE_BREACHED);
    });

    it('debe retornar RESOLUTION_BREACHED cuando solo la resolución está violada', () => {
      // Arrange: ticket cerrado con solo resolución violada
      const createdAt = new Date('2025-01-10T10:00:00Z');
      const slaFirstResponseAt = new Date('2025-01-10T12:00:00Z');
      const slaResolveByAt = new Date('2025-01-11T10:00:00Z');
      const firstRespondedAt = new Date('2025-01-10T11:00:00Z'); // OK
      const resolvedAt = new Date('2025-01-12T10:00:00Z'); // violación

      const ticket = {
        createdAt,
        status: TicketStatus.RESOLVED,
        slaFirstResponseAt,
        slaResolveByAt,
        firstRespondedAt,
        resolvedAt,
      };

      // Act
      const result = service.deriveBreachStatus(ticket);

      // Assert
      expect(result).toBe(SlaBreachStatus.RESOLUTION_BREACHED);
    });

    it('debe retornar OK cuando ninguna SLA está violada', () => {
      // Arrange: ticket cerrado con ambas SLA cumplidas
      const createdAt = new Date('2025-01-10T10:00:00Z');
      const slaFirstResponseAt = new Date('2025-01-10T12:00:00Z');
      const slaResolveByAt = new Date('2025-01-11T10:00:00Z');
      const firstRespondedAt = new Date('2025-01-10T11:00:00Z'); // OK
      const resolvedAt = new Date('2025-01-11T09:00:00Z'); // OK

      const ticket = {
        createdAt,
        status: TicketStatus.RESOLVED,
        slaFirstResponseAt,
        slaResolveByAt,
        firstRespondedAt,
        resolvedAt,
      };

      // Act
      const result = service.deriveBreachStatus(ticket);

      // Assert
      expect(result).toBe(SlaBreachStatus.OK);
    });
  });
});
