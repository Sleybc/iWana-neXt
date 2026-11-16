import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';

import * as db from '../index';
import { TicketCommentAttachment } from './ticket-comment-attachment.entity';

/** Alineación entidad ↔ DDL de la migración tenant 212 (spec MOD09 adjuntos en tickets §2.1). */
const EXPECTED_COLUMNS: ReadonlyArray<{ property: string; ddl: string }> = [
  { property: 'id', ddl: 'id' },
  { property: 'tenantId', ddl: 'tenant_id' },
  { property: 'ticketId', ddl: 'ticket_id' },
  { property: 'commentId', ddl: 'comment_id' },
  { property: 'mediaAssetId', ddl: 'media_asset_id' },
  { property: 'filename', ddl: 'filename' },
  { property: 'contentType', ddl: 'content_type' },
  { property: 'sizeBytes', ddl: 'size_bytes' },
  { property: 'uploadedByUserId', ddl: 'uploaded_by_user_id' },
  { property: 'externalId', ddl: 'external_id' },
  { property: 'importBatchId', ddl: 'import_batch_id' },
  { property: 'createdAt', ddl: 'created_at' },
];

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, '..', 'migrations', 'tenant', '212_ticket_comment_attachments.ts'),
  'utf8',
);

function columnName(property: string): string | undefined {
  if (property === 'id') {
    const generated = getMetadataArgsStorage().generations.find(
      (arg) => arg.target === TicketCommentAttachment && arg.propertyName === 'id',
    );
    return generated ? 'id' : undefined;
  }
  const column = getMetadataArgsStorage().columns.find(
    (arg) => arg.target === TicketCommentAttachment && arg.propertyName === property,
  );
  return column?.options.name ?? column?.propertyName;
}

describe('TicketCommentAttachment — alineación entidad ↔ DDL (212)', () => {
  it('se exporta desde @iwana/db', () => {
    expect(db.TicketCommentAttachment).toBe(TicketCommentAttachment);
  });

  it('mapea a ticket_comment_attachments sin schema (tenant por search_path)', () => {
    const table = getMetadataArgsStorage().tables.find(
      (arg) => arg.target === TicketCommentAttachment,
    );
    expect(table?.name).toBe('ticket_comment_attachments');
    expect(table?.schema).toBeUndefined();
  });

  it.each(EXPECTED_COLUMNS)(
    'mapea $property a "$ddl" y la columna existe en el DDL',
    ({ property, ddl }) => {
      expect(columnName(property)).toBe(ddl);
      expect(MIGRATION_SOURCE).toMatch(new RegExp(`\\n\\s+${ddl} `, 'u'));
    },
  );

  it('declara exactamente las columnas del DDL', () => {
    const declared = getMetadataArgsStorage()
      .columns.filter((arg) => arg.target === TicketCommentAttachment)
      .map((arg) => arg.propertyName)
      .sort();
    expect(declared).toEqual(EXPECTED_COLUMNS.map((c) => c.property).sort());
  });
});
