import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PartyType, DocumentTypeParty, PartyContactType, PartyRoleType } from '@iwana/shared';

export interface EnsurePartyInput {
  partyType: PartyType;
  documentType: DocumentTypeParty;
  documentNumber: string;
  displayName: string;
  legalName?: string | null;
  contacts?: Array<{
    type: PartyContactType;
    value: string;
    isPrimary?: boolean;
    metadata?: Record<string, unknown> | null;
  }>;
}

export interface PartyWriteContext {
  manager: EntityManager;
  actorUserId?: string;
}

export interface EnsurePartyResult {
  partyId: string;
  partyRoleId: string;
  partyCreated: boolean;
  roleAdded: boolean;
}

/** Puerto de comando de Parties — dual de IPartyReadPort. Ref: ADR-052 §D2 */
@Injectable()
export abstract class IPartyWritePort {
  abstract ensurePartyWithRole(
    input: EnsurePartyInput,
    role: PartyRoleType,
    ctx: PartyWriteContext,
  ): Promise<EnsurePartyResult>;
}
