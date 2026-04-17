import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SubscribersService } from '../subscribers.service';
import { ExpedienteDiscardedEvent } from '../../expedientes/events/expediente-pipeline.events';

@Injectable()
export class SubscriberCancellationListener {
  private readonly logger = new Logger(SubscriberCancellationListener.name);

  constructor(private readonly subscribersService: SubscribersService) {}

  @OnEvent('crm.expediente.discarded', { async: true })
  async handle(event: ExpedienteDiscardedEvent): Promise<void> {
    const cancelled = await this.subscribersService.cancelProspectFromExpediente(
      event.expedienteId,
      event.reason,
      event.actorUserId,
    );

    if (!cancelled) {
      return;
    }

    this.logger.log(
      `Subscriber ${cancelled.id} cancelado automáticamente por descarte del expediente ${event.expedienteId}`,
    );
  }
}
