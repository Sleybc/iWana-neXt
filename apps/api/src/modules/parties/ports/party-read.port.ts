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
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  department: string | null;
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

export interface PartySearchResult {
  data: PartySnapshot[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export abstract class IPartyReadPort {
  abstract getById(id: string): Promise<PartySnapshot | null>;
  abstract getByIds(ids: string[]): Promise<PartySnapshot[]>;
  abstract findByDocument(
    documentType: DocumentTypeParty,
    documentNumber: string,
  ): Promise<PartySnapshot | null>;
  abstract searchByRole(
    role: PartyRoleType,
    options: {
      search?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<PartySearchResult>;
  abstract listRoles(partyId: string): Promise<PartyRoleSnapshot[]>;
  /**
   * Filtra, en una sola consulta, los ids que corresponden a un tercero existente (no eliminado)
   * con el rol indicado en estado ACTIVE. Guarda de existencia/rol para consumidores externos
   * que reciben referencias `partyRefId` desde el borde HTTP.
   */
  abstract filterPartyIdsByActiveRole(role: PartyRoleType, partyIds: string[]): Promise<string[]>;
  abstract listContacts(partyId: string): Promise<PartyContactSnapshot[]>;
  abstract listContactsForIds(partyIds: string[]): Promise<Map<string, PartyContactSnapshot[]>>;
}
