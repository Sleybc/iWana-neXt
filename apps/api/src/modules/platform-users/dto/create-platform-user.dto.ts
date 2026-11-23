import { ApiProperty } from '@nestjs/swagger';
import { PlatformRole } from '@iwana/shared';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePlatformUserDto {
  @ApiProperty({ format: 'email', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ enum: PlatformRole })
  @IsEnum(PlatformRole)
  role: PlatformRole;
}

export class CreatedPlatformUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Contraseña de arranque devuelta únicamente al crear la cuenta.' })
  temporaryPassword: string;
}

export class CreatePlatformUserResponseDto {
  @ApiProperty({ type: CreatedPlatformUserDto })
  data: CreatedPlatformUserDto;
}
