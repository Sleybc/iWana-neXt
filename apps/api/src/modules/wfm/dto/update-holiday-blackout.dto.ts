import { PartialType } from '@nestjs/swagger';
import { CreateHolidayBlackoutDto } from './create-holiday-blackout.dto';

export class UpdateHolidayBlackoutDto extends PartialType(CreateHolidayBlackoutDto) {}
