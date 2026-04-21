import { Injectable } from '@nestjs/common';
import {
  PartyType,
  DocumentTypeParty,
  PartyStatus,
  PartyRoleType,
  PartyRoleStatus,
  PartyContactType,
} from '@iwana/shared';

/** Snapshot inmutable de un Party — no expone entidad TypeORM. Ref: ADR-029 §D4 */
export interface PartySnapshot {
  id: string;
  partyType: PartyType;
  documentType: DocumentTypeParty;
  documentNumber: string;
  displayName: string;
  legalName: string | null;
  status: PartyStatus;
}

export interface PartyRoleSnapshot {
  id: string;
  role: PartyRoleType;
  status: PartyRoleStatus;
  validFrom: Date;
  validTo: Date | null;
}

export interface PartyContactSnapshot {
  id: string;
  type: PartyContactType;
  value: string;
  isPrimary: boolean;
}

@Injectable()
export abstract class IPartyReadPort {
  abstract getById(id: string): Promise<PartySnapshot | null>;
  abstract findByDocument(
    documentType: DocumentTypeParty,
    documentNumber: string,
  ): Promise<PartySnapshot | null>;
  abstract listRoles(partyId: string): Promise<PartyRoleSnapshot[]>;
  abstract listContacts(partyId: string): Promise<PartyContactSnapshot[]>;
}
