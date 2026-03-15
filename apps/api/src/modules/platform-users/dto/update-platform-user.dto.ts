import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdatePlatformUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Formato de teléfono inválido (E.164)',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}
