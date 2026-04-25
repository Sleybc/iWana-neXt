import { Allow } from 'class-validator';
import { z } from 'zod';
import { DOCUMENT_SUPPORT_STATUS } from '../document-support.types';

export const UpdateDocumentSupportStatusSchema = z.object({
  status: z.enum([
    DOCUMENT_SUPPORT_STATUS.UPLOADED,
    DOCUMENT_SUPPORT_STATUS.OBSERVED,
    DOCUMENT_SUPPORT_STATUS.APPROVED,
    DOCUMENT_SUPPORT_STATUS.REJECTED,
  ]),
  note: z.string().trim().max(500).optional().nullable(),
});

export type UpdateDocumentSupportStatusDto = z.infer<typeof UpdateDocumentSupportStatusSchema>;

export class UpdateDocumentSupportStatusBodyDto {
  @Allow()
  status: UpdateDocumentSupportStatusDto['status'];

  @Allow()
  note?: string | null;
}
