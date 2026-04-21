import { OmitType, PartialType } from '@nestjs/swagger';
import { z } from 'zod';
import { CreateTaxDefinitionDto, CreateTaxDefinitionSchema } from './create-tax-definition.dto';

/** Schema Zod para validación en boundary de servicio en operaciones de actualización. */
export const UpdateTaxDefinitionSchema = CreateTaxDefinitionSchema.omit({ code: true }).partial();

export type UpdateTaxDefinitionInput = z.infer<typeof UpdateTaxDefinitionSchema>;

/** Todos los campos de CreateTaxDefinitionDto excepto 'code' son opcionales en Update.
 *  El código es un identificador de negocio inmutable. */
export class UpdateTaxDefinitionDto extends PartialType(
  OmitType(CreateTaxDefinitionDto, ['code'] as const),
) {}
