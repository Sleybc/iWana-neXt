import { Allow } from 'class-validator';
import { SubscriberStatus } from '@iwana/shared';

export { TransitionSubscriberStatusSchema } from '@iwana/shared';

export class TransitionSubscriberStatusDto {
  @Allow()
  targetStatus!: SubscriberStatus;

  @Allow()
  reason?: string;
}
