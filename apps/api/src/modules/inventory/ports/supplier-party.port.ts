import { Injectable } from '@nestjs/common';
import {
  DocumentTypeParty,
  PartyContactType,
  PartyRoleType,
  PartyStatus,
  PartyType,
} from '@iwana/shared';
import { IPartyReadPort } from '../../parties/ports/party-read.port';
import { PartyIdentitySnapshot } from '../../parties/ports/party-write.port';

export interface SupplierPartySummary {
  partyRefId: string;
  displayName: string;
  primaryContact: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: PartyStatus;
}

export interface SupplierPartyListItem {
  partyRefId: string;
  displayName: string;
  status: PartyStatus;
}

/** Coincidencia de identidad por documento — habilita la reutilizacion real en el alta (A2). */
export interface SupplierIdentityMatch {
  partyRefId: string;
  partyType: PartyType;
  documentType: DocumentTypeParty;
  displayName: string;
  legalName: string | null;
  summary: SupplierPartySummary;
}

/** Contacto minimo para componer un resumen — comun a lectura por id y a la identidad transaccional. */
interface SummaryContactInput {
  type: PartyContactType;
  value: string;
  isPrimary: boolean;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export abstract class SupplierPartyPort {
  abstract getSupplierSummary(partyRefId: string): Promise<SupplierPartySummary | null>;
  /** Carga resúmenes de múltiples proveedores en dos queries (batch), eliminando el N+1 del listado. */
  abstract getSupplierSummariesBatch(
    partyRefIds: string[],
  ): Promise<Map<string, SupplierPartySummary>>;
  /**
   * Resuelve, en una sola consulta, qué referencias corresponden a terceros existentes con rol
   * SUPPLIER activo en MOD08. Guarda de invitación: un `partyRefId` arbitrario no puede convertirse
   * en proveedor invitado solo por ser un UUID bien formado.
   */
  abstract filterActiveSupplierRefs(partyRefIds: string[]): Promise<Set<string>>;
  abstract searchSuppliers(
    query?: string,
    page?: number,
  ): Promise<{ data: SupplierPartyListItem[]; total: number; page: number; limit: number }>;
  /**
   * Compone el resumen a partir de la identidad leida dentro de la transaccion del alta,
   * sin abrir una conexion nueva (evita el defecto A1: `party` null en el response de create).
   */
  abstract summaryFromIdentity(identity: PartyIdentitySnapshot): SupplierPartySummary;
  /** Busca un tercero por (tipo, numero) de documento para reutilizar su identidad (A2). */
  abstract findIdentityByDocument(
    documentType: DocumentTypeParty,
    documentNumber: string,
  ): Promise<SupplierIdentityMatch | null>;
}

@Injectable()
export class SupplierPartyPortAdapter extends SupplierPartyPort {
  private static readonly SEARCH_LIMIT = 20;

  constructor(private readonly partyReadPort: IPartyReadPort) {
    super();
  }

  async getSupplierSummary(partyRefId: string): Promise<SupplierPartySummary | null> {
    const party = await this.partyReadPort.getById(partyRefId);
    if (!party) {
      return null;
    }

    const contacts = await this.partyReadPort.listContacts(partyRefId);
    return this.composeSummary(party.id, party.displayName, party.status, contacts);
  }

  async getSupplierSummariesBatch(
    partyRefIds: string[],
  ): Promise<Map<string, SupplierPartySummary>> {
    if (partyRefIds.length === 0) return new Map();
    const [parties, contactsMap] = await Promise.all([
      this.partyReadPort.getByIds(partyRefIds),
      this.partyReadPort.listContactsForIds(partyRefIds),
    ]);
    const result = new Map<string, SupplierPartySummary>();
    for (const party of parties) {
      const contacts = contactsMap.get(party.id) ?? [];
      result.set(
        party.id,
        this.composeSummary(party.id, party.displayName, party.status, contacts),
      );
    }
    return result;
  }

  async filterActiveSupplierRefs(partyRefIds: string[]): Promise<Set<string>> {
    if (partyRefIds.length === 0) return new Set();
    const resolved = await this.partyReadPort.filterPartyIdsByActiveRole(
      PartyRoleType.SUPPLIER,
      partyRefIds,
    );
    return new Set(resolved);
  }

  summaryFromIdentity(identity: PartyIdentitySnapshot): SupplierPartySummary {
    return this.composeSummary(
      identity.partyId,
      identity.displayName,
      identity.status,
      identity.contacts,
    );
  }

  async findIdentityByDocument(
    documentType: DocumentTypeParty,
    documentNumber: string,
  ): Promise<SupplierIdentityMatch | null> {
    const party = await this.partyReadPort.findByDocument(documentType, documentNumber);
    if (!party) {
      return null;
    }

    const contacts = await this.partyReadPort.listContacts(party.id);
    const summary = this.composeSummary(party.id, party.displayName, party.status, contacts);

    return {
      partyRefId: party.id,
      partyType: party.partyType,
      documentType: party.documentType,
      displayName: party.displayName,
      legalName: party.legalName,
      summary,
    };
  }

  private composeSummary(
    partyRefId: string,
    displayName: string,
    status: PartyStatus,
    contacts: SummaryContactInput[],
  ): SupplierPartySummary {
    const primaryEmail = this.pickContact(contacts, PartyContactType.EMAIL);
    const primaryPhone = this.pickContact(contacts, PartyContactType.PHONE);
    const primaryAddress = this.pickContact(contacts, PartyContactType.ADDRESS);
    const primaryContact = primaryEmail?.value ?? primaryPhone?.value ?? null;
    const city = this.extractCity(primaryAddress);

    return {
      partyRefId,
      displayName,
      primaryContact,
      phone: primaryPhone?.value ?? null,
      email: primaryEmail?.value ?? null,
      city,
      status,
    };
  }

  async searchSuppliers(
    query?: string,
    page = 1,
  ): Promise<{ data: SupplierPartyListItem[]; total: number; page: number; limit: number }> {
    const result = await this.partyReadPort.searchByRole(PartyRoleType.SUPPLIER, {
      ...(query ? { search: query } : {}),
      page,
      limit: SupplierPartyPortAdapter.SEARCH_LIMIT,
    });

    return {
      ...result,
      data: result.data.map((party) => ({
        partyRefId: party.id,
        displayName: party.displayName,
        status: party.status,
      })),
    };
  }

  private pickContact(
    contacts: SummaryContactInput[],
    type: PartyContactType,
  ): SummaryContactInput | null {
    return (
      contacts.find((contact) => contact.type === type && contact.isPrimary) ??
      contacts.find((contact) => contact.type === type) ??
      null
    );
  }

  private extractCity(addressContact: SummaryContactInput | null): string | null {
    if (!addressContact) {
      return null;
    }

    const metadata = addressContact.metadata;
    const metadataCity = metadata?.city;
    if (typeof metadataCity === 'string' && metadataCity.trim().length > 0) {
      return metadataCity.trim();
    }

    return addressContact.value?.trim() || null;
  }
}
