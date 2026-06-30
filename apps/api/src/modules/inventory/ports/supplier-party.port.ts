import { Injectable } from '@nestjs/common';
import { PartyContactType, PartyRoleType, PartyStatus } from '@iwana/shared';
import { IPartyReadPort, PartyContactSnapshot } from '../../parties/ports/party-read.port';

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

@Injectable()
export abstract class SupplierPartyPort {
  abstract getSupplierSummary(partyRefId: string): Promise<SupplierPartySummary | null>;
  abstract searchSuppliers(
    query?: string,
    page?: number,
  ): Promise<{ data: SupplierPartyListItem[]; total: number; page: number; limit: number }>;
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
    const primaryEmail = this.pickContact(contacts, PartyContactType.EMAIL);
    const primaryPhone = this.pickContact(contacts, PartyContactType.PHONE);
    const primaryAddress = this.pickContact(contacts, PartyContactType.ADDRESS);
    const primaryContact = primaryEmail?.value ?? primaryPhone?.value ?? null;
    const city = this.extractCity(primaryAddress);

    return {
      partyRefId: party.id,
      displayName: party.displayName,
      primaryContact,
      phone: primaryPhone?.value ?? null,
      email: primaryEmail?.value ?? null,
      city,
      status: party.status,
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
    contacts: PartyContactSnapshot[],
    type: PartyContactType,
  ): PartyContactSnapshot | null {
    return (
      contacts.find((contact) => contact.type === type && contact.isPrimary) ??
      contacts.find((contact) => contact.type === type) ??
      null
    );
  }

  private extractCity(addressContact: PartyContactSnapshot | null): string | null {
    if (!addressContact) {
      return null;
    }

    const metadata = (
      addressContact as PartyContactSnapshot & {
        metadata?: Record<string, unknown> | null;
      }
    ).metadata;

    const metadataCity = metadata?.city;
    if (typeof metadataCity === 'string' && metadataCity.trim().length > 0) {
      return metadataCity.trim();
    }

    return addressContact.value?.trim() || null;
  }
}
