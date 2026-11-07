import { Injectable } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import {
  readTenantColumns,
  tableExists,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';

@Injectable()
export class SupplierProfileReadAdapter {
  async hasSupplierProfile(partyId: string, qr: QueryRunner): Promise<boolean> {
    const columns = await readTenantColumns(qr);
    if (!tableExists(columns, 'supplier_profiles')) return false;

    const rows = (await qr.query(
      'SELECT EXISTS (SELECT 1 FROM supplier_profiles WHERE party_ref_id::text = $1::text) AS linked',
      [partyId],
    )) as Array<{ linked: boolean }>;
    return rows[0]?.linked === true;
  }
}
