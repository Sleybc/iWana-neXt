import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePlatformUserBootstrapDto {
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @MaxLength(128)
  @Matches(/[A-Z]/, { message: 'Debe contener al menos una mayúscula' })
  @Matches(/[a-z]/, { message: 'Debe contener al menos una minúscula' })
  @Matches(/\d/, { message: 'Debe contener al menos un número' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Debe contener al menos un carácter especial' })
  password: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  confirmPassword: string;
}
