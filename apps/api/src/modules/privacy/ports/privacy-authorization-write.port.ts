import { EntityManager } from 'typeorm';
import { ConsentChannel, DataPurpose } from '@iwana/shared';

export type PrivacyAuthorizationWriteInput = {
  partyId: string;
  purpose: DataPurpose;
  granted: boolean;
  legalTextId: string | null;
  capturedAt?: string;
  sourceRef?: string;
  evidenceMediaId?: string;
  actorId: string;
} & (
  | { kind?: 'GRANT' | 'REVOCATION'; channel: ConsentChannel }
  | { kind: 'LEGACY_IMPORT'; channel: string }
);

export abstract class IPrivacyAuthorizationWritePort {
  abstract record(
    input: PrivacyAuthorizationWriteInput,
    ctx: { ip: string | null; userAgent: string | null; manager: EntityManager },
  ): Promise<{ authorizationId: string; created: boolean }>;
}
