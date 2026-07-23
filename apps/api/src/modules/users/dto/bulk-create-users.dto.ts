import { z } from 'zod';
import { DocumentType, isTenantAssignableRole, UserRole } from '@iwana/shared';
import { USER_FIELD_MAX, USER_PHONE_E164_PATTERN } from './user-field-constraints';

/**
 * Esquema Zod de bulkCreate — mismos límites que CreateUserDto (class-validator).
 * No migrar a class-validator en esta ola (decisión EM-ARCH H-10).
 */
export const BulkCreateUserItemSchema = z
  .object({
    email: z.string().email('Email inválido').max(USER_FIELD_MAX.email),
    // Los roles de plataforma no son asignables desde el CRUD del tenant (H-01).
    role: z
      .nativeEnum(UserRole, { errorMap: () => ({ message: 'Rol inválido' }) })
      .refine(isTenantAssignableRole, {
        message: 'El rol indicado no puede asignarse a un usuario del tenant.',
      }),
    firstName: z.string().max(USER_FIELD_MAX.firstName).optional(),
    lastName: z.string().max(USER_FIELD_MAX.lastName).optional(),
    phone: z
      .string()
      .max(USER_FIELD_MAX.phone)
      .regex(USER_PHONE_E164_PATTERN, 'Teléfono debe estar en formato E.164 (ej: +573001234567)')
      .optional(),
    jobTitle: z.string().max(USER_FIELD_MAX.jobTitle).optional(),
    documentType: z.nativeEnum(DocumentType).optional(),
    documentNumber: z.string().max(USER_FIELD_MAX.documentNumber).optional(),
    isOperationalResource: z.boolean().optional(),
  })
  .strict();

export const BulkCreateUsersRequestSchema = z
  .object({
    users: z
      .array(BulkCreateUserItemSchema)
      .min(1, 'Debe haber al menos un usuario')
      .max(100, 'Máximo 100 usuarios por lote'),
  })
  .strict();

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
