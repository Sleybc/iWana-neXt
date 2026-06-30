import { PersonType, CustomerSegment, VatTreatment } from '@iwana/shared';

/**
 * Evento emitido cuando se crea un suscriptor a partir de un expediente CLIENTE_ACTIVO.
 * Permite que otros módulos reaccionen (Billing, Provisioning, etc.).
 */
export class SubscriberCreatedEvent {
  constructor(
    public readonly subscriberId: string,
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly expedienteId: string,
    public readonly personType: PersonType,
    public readonly customerSegment: CustomerSegment,
    public readonly vatTreatment: VatTreatment,
  ) {}
}
