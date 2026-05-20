import { PartialType } from '@nestjs/swagger';
import { CreateOperatingSiteDto } from './create-operating-site.dto';

export class UpdateOperatingSiteDto extends PartialType(CreateOperatingSiteDto) {}
