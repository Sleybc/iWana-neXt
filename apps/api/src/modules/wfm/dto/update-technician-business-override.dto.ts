import { PartialType } from '@nestjs/swagger';
import { CreateTechnicianBusinessOverrideDto } from './create-technician-business-override.dto';

export class UpdateTechnicianBusinessOverrideDto extends PartialType(
  CreateTechnicianBusinessOverrideDto,
) {}
