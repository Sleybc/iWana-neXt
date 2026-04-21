import { PartialType } from '@nestjs/swagger';
import { CreateTaxDefinitionDto } from './create-tax-definition.dto';

/** Todos los campos de CreateTaxDefinitionDto son opcionales en Update. */
export class UpdateTaxDefinitionDto extends PartialType(CreateTaxDefinitionDto) {}
