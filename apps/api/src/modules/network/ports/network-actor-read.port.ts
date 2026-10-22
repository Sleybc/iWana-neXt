import { Injectable } from '@nestjs/common';
import type { ActorRefDto } from '@iwana/shared';

@Injectable()
export abstract class NetworkActorReadPort {
  abstract findByIds(schemaName: string, ids: string[]): Promise<ActorRefDto[]>;
}
