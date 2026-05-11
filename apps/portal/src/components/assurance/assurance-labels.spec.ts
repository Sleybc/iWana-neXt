import { SlaBreachStatus, TicketStatus, TicketType } from '@iwana/shared';
import {
  getAssuranceSlaStatusLabel,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketTypeLabel,
} from './assurance-labels';

describe('assurance-labels', () => {
  it('mapea labels del dominio a copy en español y sentence case', () => {
    expect(getAssuranceTicketTypeLabel(TicketType.INTERNAL_SUPPORT)).toBe('Soporte interno');
    expect(getAssuranceTicketStatusLabel(TicketStatus.FIELD_SERVICE_REQUESTED)).toBe(
      'Trabajo de campo solicitado',
    );
  });

  it('mapea estados SLA sin exponer enums crudos al usuario final', () => {
    expect(getAssuranceSlaStatusLabel(SlaBreachStatus.RESOLUTION_BREACHED)).toBe(
      'Resolución vencida',
    );
  });
});
