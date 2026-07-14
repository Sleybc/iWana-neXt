import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  PartyType,
  DocumentTypeParty,
  PartyContactType,
  PartyRoleType,
  PartyStatus,
} from '@iwana/shared';

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
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  department?: string | null;
}

export interface PartyWriteContext {
  manager: EntityManager;
  actorUserId?: string;
}

/**
 * Contacto de la identidad leido dentro de la MISMA transaccion que asegura el Party.
 * Permite componer el resumen de identidad sin abrir una conexion nueva (que no veria
 * datos aun no confirmados). Ref: ADR-052 §D3, remediacion A1.
 */
export interface PartyIdentityContactSnapshot {
  type: PartyContactType;
  value: string;
  isPrimary: boolean;
  metadata?: Record<string, unknown> | null;
}

/**
 * Snapshot de identidad del Party asegurado, leido dentro del EntityManager transaccional
 * del llamante. Los modulos consumidores lo mapean a su propio resumen sin tocar tablas `party*`.
 */
export interface PartyIdentitySnapshot {
  partyId: string;
  displayName: string;
  legalName: string | null;
  partyType: PartyType;
  documentType: DocumentTypeParty;
  status: PartyStatus;
  contacts: PartyIdentityContactSnapshot[];
}

export interface EnsurePartyResult {
  partyId: string;
  partyRoleId: string;
  partyCreated: boolean;
  roleAdded: boolean;
  /** Identidad leida en la transaccion del alta — evita el defecto A1 (`party` null). */
  identity: PartyIdentitySnapshot;
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
