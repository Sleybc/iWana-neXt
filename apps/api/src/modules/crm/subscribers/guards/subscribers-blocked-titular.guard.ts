import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { SubscribersService } from '../subscribers.service';
import {
  BLOCKED_TITULAR_GUARD_METADATA,
  type BlockedTitularResolver,
} from './guard-blocked-titular.decorator';

interface GuardedRequest {
  params?: Record<string, string | undefined>;
}

@Injectable()
export class SubscribersBlockedTitularGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscribersService: SubscribersService,
    private readonly privacyMarksReadPort: IPrivacyMarksReadPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resolver = this.reflector.get<BlockedTitularResolver>(
      BLOCKED_TITULAR_GUARD_METADATA,
      context.getHandler(),
    );
    if (!resolver) return true;

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const rawId = request.params?.[resolver.slice('params.'.length)];
    const subscriberId = await new ParseUUIDPipe().transform(rawId ?? '', {
      type: 'param',
      metatype: String,
      data: 'id',
    });
    const subscriber = await this.subscribersService.findById(subscriberId);
    if (subscriber.anonymizedAt != null || !subscriber.partyId) return true;

    const marks = await this.privacyMarksReadPort.activeMarks([subscriber.partyId]);
    if ((marks[subscriber.partyId] ?? []).includes('DATOS_BLOQUEADOS')) {
      throw new ConflictException({
        code: 'PRIVACY_DATA_BLOCKED',
        message: 'Los datos de este titular están bloqueados para edición.',
      });
    }
    return true;
  }
}
