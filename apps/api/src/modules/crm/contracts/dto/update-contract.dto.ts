import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ContractStatus } from '../../enums/contract-status.enum';

export class UpdateContractDto {
  @ApiPropertyOptional({ enum: ContractStatus })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string | null;
}
