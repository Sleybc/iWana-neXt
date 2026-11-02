import { CanActivate, ExecutionContext, Injectable, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ContractsService } from '../contracts.service';
import {
  ALLOW_ANONYMIZED_TITULAR_METADATA,
  BLOCKED_TITULAR_GUARD_METADATA,
  type BlockedTitularResolver,
} from './guard-blocked-titular.decorator';

interface GuardedRequest {
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

@Injectable()
export class ContractsBlockedTitularGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly contractsService: ContractsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resolver = this.reflector.get<BlockedTitularResolver>(
      BLOCKED_TITULAR_GUARD_METADATA,
      context.getHandler(),
    );
    if (!resolver) return true;
    const allowAnonymized =
      this.reflector.get<boolean>(ALLOW_ANONYMIZED_TITULAR_METADATA, context.getHandler()) === true;

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const source = resolver.startsWith('body.') ? 'body' : 'params';
    const key = resolver.slice(source.length + 1);
    const rawId = source === 'body' ? request.body?.[key] : request.params?.[key];
    const subscriberId = await new ParseUUIDPipe().transform(
      typeof rawId === 'string' ? rawId : '',
      {
        type: source === 'body' ? 'body' : 'param',
        metatype: String,
        data: key,
      },
    );
    if (resolver === 'params.id') {
      if (allowAnonymized) {
        await this.contractsService.assertContractNotBlocked(subscriberId, {
          allowAnonymized: true,
        });
      } else {
        await this.contractsService.assertContractNotBlocked(subscriberId);
      }
    } else {
      await this.contractsService.assertSubscriberNotBlockedForMutation(subscriberId);
    }
    return true;
  }
}
