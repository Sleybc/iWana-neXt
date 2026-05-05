import { Injectable } from '@nestjs/common';

export interface CrmActorSnapshot {
  id: string;
  name: string | null;
  role: string | null;
}

@Injectable()
export abstract class CrmActorReadPort {
  abstract findById(schemaName: string, actorId: string): Promise<CrmActorSnapshot | null>;

  abstract findByIds(schemaName: string, actorIds: string[]): Promise<CrmActorSnapshot[]>;
}
