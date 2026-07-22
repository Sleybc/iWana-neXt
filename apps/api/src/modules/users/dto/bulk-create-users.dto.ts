import { z } from 'zod';
import { DocumentType, isTenantAssignableRole, UserRole } from '@iwana/shared';

export const BulkCreateUserItemSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  // Los roles de plataforma no son asignables desde el CRUD del tenant (H-01).
  role: z
    .nativeEnum(UserRole, { errorMap: () => ({ message: 'Rol inválido' }) })
    .refine(isTenantAssignableRole, {
      message: 'El rol indicado no puede asignarse a un usuario del tenant.',
    }),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z
    .string()
    .regex(/^\+\d{7,15}$/, 'Teléfono debe estar en formato E.164 (ej: +573001234567)')
    .optional(),
  jobTitle: z.string().max(150).optional(),
  documentType: z.nativeEnum(DocumentType).optional(),
  documentNumber: z.string().max(30).optional(),
  isOperationalResource: z.boolean().optional(),
});

export const BulkCreateUsersRequestSchema = z.object({
  users: z
    .array(BulkCreateUserItemSchema)
    .min(1, 'Debe haber al menos un usuario')
    .max(100, 'Máximo 100 usuarios por lote'),
});

export type BulkCreateUserItem = z.infer<typeof BulkCreateUserItemSchema>;
export type BulkCreateUsersRequest = z.infer<typeof BulkCreateUsersRequestSchema>;

export interface BulkCreateUsersSucceededItem {
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  temporaryPassword: string;
  createdAt: string;
}

export interface BulkCreateUsersFailedItem {
  rowIndex: number;
  email: string;
  reason: string;
}

export interface BulkCreateUsersResponse {
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  succeeded: BulkCreateUsersSucceededItem[];
  failed: BulkCreateUsersFailedItem[];
}
