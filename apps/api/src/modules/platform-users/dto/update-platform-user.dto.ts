import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

export class ChangePlatformUserLoginEmailDto {
  @IsEmail({}, { message: 'Ingresa un correo de acceso válido.' })
  @MaxLength(255, { message: 'El correo de acceso no puede superar los 255 caracteres.' })
  email: string;

  @IsString({ message: 'Ingresa tu contraseña actual para confirmar el cambio.' })
  @MinLength(10, {
    message: 'La contraseña actual debe tener entre 10 y 128 caracteres.',
  })
  @MaxLength(128, {
    message: 'La contraseña actual debe tener entre 10 y 128 caracteres.',
  })
  currentPassword: string;
}

export class ChangePlatformUserPasswordDto {
  @IsString({ message: 'Ingresa tu contraseña actual para confirmar el cambio.' })
  @MinLength(10, {
    message: 'La contraseña actual debe tener entre 10 y 128 caracteres.',
  })
  @MaxLength(128, {
    message: 'La contraseña actual debe tener entre 10 y 128 caracteres.',
  })
  currentPassword: string;

  @IsString({ message: 'Ingresa una nueva contraseña.' })
  @MinLength(10, {
    message: 'La nueva contraseña debe tener entre 10 y 128 caracteres.',
  })
  @MaxLength(128, {
    message: 'La nueva contraseña debe tener entre 10 y 128 caracteres.',
  })
  newPassword: string;
}
