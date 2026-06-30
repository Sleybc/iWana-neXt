import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SubscriberStatus } from '@iwana/shared';
import { SubscribersService } from '../subscribers.service';
import { ExpedienteActivatedEvent } from '../../expedientes/events/expediente-pipeline.events';
import { SubscriberActivatedEvent } from '../events/subscriber-activated.event';

@Injectable()
export class SubscriberActivationListener {
  private readonly logger = new Logger(SubscriberActivationListener.name);

  constructor(
    private readonly subscribersService: SubscribersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('crm.expediente.activated', { async: true })
  async handle(event: ExpedienteActivatedEvent): Promise<void> {
    const updated = await this.subscribersService.activateFromExpediente(
      event.expedienteId,
      event.actorUserId,
    );

    if (!updated) {
      return;
    }

    this.eventEmitter.emit(
      'crm.subscriber.activated',
      new SubscriberActivatedEvent(
        event.tenantId,
        event.schemaName,
        updated.id,
        event.expedienteId,
        SubscriberStatus.ACTIVE,
      ),
    );

    this.logger.log(
      `Subscriber ${updated.id} activado automáticamente para expediente ${event.expedienteId}`,
    );
  }
}
