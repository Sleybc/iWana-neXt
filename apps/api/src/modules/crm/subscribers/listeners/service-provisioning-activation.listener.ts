import { Inject, Injectable, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ExpedienteStatus, SubscriberStatus } from '@iwana/shared';
import { TenantContext } from '@iwana/db';
import { ExpedienteService } from '../../expedientes/expediente.service';
import { SubscribersService } from '../subscribers.service';
import {
  SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT,
  type ServiceProvisioningCommercialStatusPort,
} from '../../ports/service-provisioning-commercial-status.port';
import { ServiceProvisioningActivatedEvent } from '../../../network/events/service-provisioning-activated.event';
import { NetworkActivationListenerError } from '../../../network/events/network-activation-listener.error';
import { hasRealContact } from '../subscriber-contact.util';
import { ContractPendingSignatureService } from '../../pending-signature/contract-pending-signature.service';

const SYSTEM_ACTOR = 'network-worker';

@Injectable()
export class ServiceProvisioningActivationListener {
  constructor(
    private readonly expedienteService: ExpedienteService,
    private readonly subscribersService: SubscribersService,
    @Inject(SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT)
    private readonly commercialStatusPort: ServiceProvisioningCommercialStatusPort,
    // Opcional para conservar el armado de 3 dependencias del inventario W0; en la app
    // siempre lo provee ContractPendingSignatureReadModule.
    @Optional()
    private readonly pendingSignature?: ContractPendingSignatureService,
  ) {}

  @OnEvent('network.service-provisioning.activated', { suppressErrors: false })
  async handle(event: ServiceProvisioningActivatedEvent): Promise<void> {
    try {
      const context = TenantContext.getOrThrow();
      if (context.tenantId !== event.tenantId || context.schemaName !== event.schemaName) {
        throw new Error('El evento de activación no coincide con el contexto tenant.');
      }

      if (!event.expedienteId) {
        await this.commercialStatusPort.record(
          event.serviceProvisioningId,
          'BLOCKED',
          'NO_EXPEDIENTE',
        );
        return;
      }

      try {
        await this.expedienteService.transitionStatus(
          event.expedienteId,
          { targetStatus: ExpedienteStatus.CLIENTE_ACTIVO },
          SYSTEM_ACTOR,
        );
      } catch (error) {
        if (this.isContactRequired(error)) {
          await this.commercialStatusPort.record(
            event.serviceProvisioningId,
            'BLOCKED',
            'CONTACT_REQUIRED',
          );
          return;
        }
        throw error;
      }

      const subscriber = await this.subscribersService.findByExpedienteId(event.expedienteId);
      if (!subscriber || !hasRealContact(subscriber)) {
        await this.commercialStatusPort.record(
          event.serviceProvisioningId,
          'BLOCKED',
          'CONTACT_REQUIRED',
        );
        return;
      }

      if (subscriber.status === SubscriberStatus.ACTIVE) {
        // ADR-109 D3: servicio aprovisionado con contrato en DRAFT (sin firma) queda BLOCKED.
        if (
          event.contractId &&
          this.pendingSignature &&
          (await this.pendingSignature.isContractUnsigned(event.contractId))
        ) {
          await this.commercialStatusPort.record(
            event.serviceProvisioningId,
            'BLOCKED',
            'CONTRACT_UNSIGNED',
          );
          return;
        }
        await this.commercialStatusPort.record(event.serviceProvisioningId, 'DONE', null);
        return;
      }

      await this.commercialStatusPort.record(
        event.serviceProvisioningId,
        'BLOCKED',
        'FISCAL_INCOMPLETE',
      );
    } catch (error) {
      if (error instanceof NetworkActivationListenerError) throw error;
      throw new NetworkActivationListenerError('CRM_LISTENER_FAILED', { cause: error });
    }
  }

  private isContactRequired(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const response = (error as { response?: unknown }).response;
    if (typeof response !== 'object' || response === null) return false;
    return (response as { code?: unknown }).code === 'EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED';
  }
}
