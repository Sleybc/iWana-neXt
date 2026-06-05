import { WorkOrderSourceContext } from '@iwana/shared';
import {
  formatSchedulingExpedienteLabel,
  getEventReferenceLabel,
  getSchedulingVisibleDescription,
  getWorkOrderSourceReferenceLabel,
} from './scheduling-ui';

describe('scheduling-ui', () => {
  it('formatea la referencia corta del expediente para operaciones de campo', () => {
    expect(formatSchedulingExpedienteLabel('fcda817a-6340-4b83-bdd3-8bb4caa6cae9')).toBe(
      'FCDA817A',
    );
  });

  it('humaniza descripciones legacy originadas desde CRM', () => {
    expect(
      getSchedulingVisibleDescription(
        'Evento originado desde CRM para el expediente fcda817a-6340-4b83-bdd3-8bb4caa6cae9.',
      ),
    ).toBe('Evento originado desde CRM para la oportunidad FCDA817A.');
  });

  it('muestra referencias cortas para expediente y orden de trabajo CRM', () => {
    expect(
      getEventReferenceLabel({
        ticketId: null,
        contractId: null,
        subscriberId: null,
        expedienteId: 'fcda817a-6340-4b83-bdd3-8bb4caa6cae9',
      } as any),
    ).toBe('Oportunidad FCDA817A');

    expect(
      getWorkOrderSourceReferenceLabel({
        sourceContext: WorkOrderSourceContext.CRM,
        sourceRef: 'fcda817a-6340-4b83-bdd3-8bb4caa6cae9',
      }),
    ).toBe('FCDA817A');
  });
});
