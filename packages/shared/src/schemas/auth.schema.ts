// packages/shared/src/schemas/auth.schema.ts
import { z } from 'zod';
import { USER_FIELD_MAX, USER_PASSWORD_MIN } from '../constants/user-field-constraints';

/**
 * Schemas Zod para formularios de autenticación.
 * Usados con react-hook-form + @hookform/resolvers/zod.
 * Mensajes de error en español colombiano.
 */

export const loginSchema = z.object({
  email: z.string().min(1, 'El correo es requerido').email('Ingresa un correo electrónico válido'),
  password: z
    .string()
    .min(1, 'La contraseña es requerida')
    .min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const mfaVerifySchema = z.object({
  code: z
    .string()
    .length(6, 'El código debe tener exactamente 6 dígitos')
    .regex(/^\d{6}$/, 'El código solo puede contener dígitos'),
});

export type MfaVerifyFormValues = z.infer<typeof mfaVerifySchema>;

/**
 * Política única de cambio de contraseña (P-14, Ola 2): idéntica a la del
 * servidor (`ChangePasswordDto` + `password-policy.ts`). `currentPassword`
 * solo exige campo no vacío: se verifica contra el hash y una credencial
 * legada corta debe poder cambiarse.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: z
      .string()
      .min(
        USER_PASSWORD_MIN,
        `La nueva contraseña debe tener al menos ${USER_PASSWORD_MIN} caracteres`,
      )
      .max(
        USER_FIELD_MAX.password,
        `La nueva contraseña debe tener como máximo ${USER_FIELD_MAX.password} caracteres`,
      )
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[a-z]/, 'Debe contener al menos una minúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número')
      .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
    confirmPassword: z.string().min(1, 'Confirma tu nueva contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export const createBootstrapPasswordSchema = z
  .object({
    email: z
      .string()
      .min(1, 'El correo es requerido')
      .email('Ingresa un correo electrónico válido'),
    password: z
      .string()
      .min(10, 'La contraseña debe tener al menos 10 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[a-z]/, 'Debe contener al menos una minúscula')
      .regex(/\d/, 'Debe contener al menos un número')
      .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
    confirmPassword: z.string().min(1, 'Confirma tu nueva contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type CreateBootstrapPasswordFormValues = z.infer<typeof createBootstrapPasswordSchema>;
