import type { TitularWriteReference } from './titular-write-reference';
import type { QueryRunner } from 'typeorm';
import { Injectable } from '@nestjs/common';

/** Referencia de un ticket a un titular CRM (solicitante o relacionado). */
export type CrmTicketPartyLookup = TitularWriteReference;

/**
 * Proyección mínima de un titular para el detalle de un ticket (MOD10, R4).
 * - AVAILABLE: nombre servido (puede ser nulo si el registro no tiene nombre).
 * - PROTECTED: titular suprimido o con DATOS_BLOQUEADOS vigente; nombre siempre nulo.
 * - NOT_FOUND: referencia no UUID, inexistente o borrada.
 */
export interface CrmTicketPartySnapshot {
  type: CrmTicketPartyLookup['type'];
  id: string;
  state: 'AVAILABLE' | 'PROTECTED' | 'NOT_FOUND';
  displayName: string | null;
  /** Ficha a la que enlazar; para CONTRACT es el suscriptor titular. */
  profile: { kind: 'SUBSCRIBER' | 'EXPEDIENTE'; id: string } | null;
}

export interface CrmSubscriberSummarySnapshot {
  id: string;
  status: string;
  fullName: string;
}

/** Puerto de lectura CRM para módulos que necesitan una proyección del suscriptor. */
@Injectable()
export abstract class CrmSubscriberReadPort {
  abstract assertWritableReferences(
    references: TitularWriteReference[],
    qr: QueryRunner,
  ): Promise<void>;

  /**
   * Resuelve nombre visible y ficha de las referencias de un ticket dentro de la
   * transacción del llamante (`qr`), aplicando supresión y DATOS_BLOQUEADOS sin
   * excepción por permiso. Descarta referencias no UUID antes de consultar. Lanza si las
   * marcas de privacidad no se pueden verificar: el llamante debe ocultar el nombre.
   */
  abstract resolveTicketParties(
    references: CrmTicketPartyLookup[],
    qr: QueryRunner,
  ): Promise<CrmTicketPartySnapshot[]>;

  /**
   * Suscriptores cuyo nombre visible contiene `term` (sin distinguir mayúsculas), para buscar
   * tickets por cliente (MOD10 bandeja §3 K). Corre con el `qr` del llamante. Nunca devuelve
   * borrados, suprimidos ni titulares con DATOS_BLOQUEADOS (misma regla que
   * `resolveTicketParties`). Como mucho `TICKET_REQUESTER_SEARCH_LIMIT` ids.
   */
  abstract findTicketRequesterIdsByName(term: string, qr: QueryRunner): Promise<string[]>;

  abstract findSummaryByExpedienteId(
    expedienteId: string,
  ): Promise<CrmSubscriberSummarySnapshot | null>;

  abstract listContractIds(
    tenantId: string,
    schemaName: string,
    subscriberId: string,
  ): Promise<string[]>;

  abstract findExpedienteId(
    tenantId: string,
    schemaName: string,
    subscriberId: string,
  ): Promise<string | null>;

  abstract findExistingSubscriberIds(
    tenantId: string,
    schemaName: string,
    subscriberIds: string[],
  ): Promise<string[]>;
}
