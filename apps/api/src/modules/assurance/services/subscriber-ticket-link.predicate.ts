import { TicketRequesterType, TicketSubjectType } from '@iwana/shared';
import { Brackets } from 'typeorm';

/**
 * Regla única de vínculo ticket → suscriptor (alias `st` de `support_tickets`): solicitante
 * suscriptor, asunto suscriptor, asunto un contrato suyo o asunto el expediente del que nació
 * (el ticket de instalación automático se ata al expediente, no al suscriptor). La usan el listado de tickets por
 * suscriptor y el puerto `AssuranceSubscriberTicketsReadPort` (franja de visitas, H13).
 */
export function subscriberTicketLinkPredicate(
  subscriberId: string,
  subscriberContractIds: readonly string[],
  subscriberExpedienteId: string | null,
): Brackets {
  return new Brackets((subscriberQuery) => {
    subscriberQuery
      .where(
        '(st.requester_type = :subscriberRequesterType AND st.requester_ref_id = :subscriberId)',
        { subscriberRequesterType: TicketRequesterType.SUBSCRIBER, subscriberId },
      )
      .orWhere('(st.subject_type = :subscriberSubjectType AND st.subject_ref_id = :subscriberId)', {
        subscriberSubjectType: TicketSubjectType.SUBSCRIBER,
        subscriberId,
      });
    if (subscriberContractIds.length > 0) {
      subscriberQuery.orWhere(
        '(st.subject_type = :contractSubjectType AND st.subject_ref_id IN (:...subscriberContractIds))',
        {
          contractSubjectType: TicketSubjectType.CONTRACT,
          subscriberContractIds: [...subscriberContractIds],
        },
      );
    }
    if (subscriberExpedienteId) {
      subscriberQuery.orWhere(
        '(st.subject_type = :expedienteSubjectType AND st.subject_ref_id = :subscriberExpedienteId)',
        { expedienteSubjectType: TicketSubjectType.EXPEDIENTE, subscriberExpedienteId },
      );
    }
  });
}
