'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createBootstrapPasswordSchema =
  exports.changePasswordSchema =
  exports.mfaVerifySchema =
  exports.loginSchema =
    void 0;
// packages/shared/src/schemas/auth.schema.ts
const zod_1 = require('zod');
/**
 * Schemas Zod para formularios de autenticación.
 * Usados con react-hook-form + @hookform/resolvers/zod.
 * Mensajes de error en español colombiano.
 */
exports.loginSchema = zod_1.z.object({
  email: zod_1.z
    .string()
    .min(1, 'El correo es requerido')
    .email('Ingresa un correo electrónico válido'),
  password: zod_1.z
    .string()
    .min(1, 'La contraseña es requerida')
    .min(8, 'La contraseña debe tener al menos 8 caracteres'),
});
exports.mfaVerifySchema = zod_1.z.object({
  code: zod_1.z
    .string()
    .length(6, 'El código debe tener exactamente 6 dígitos')
    .regex(/^\d{6}$/, 'El código solo puede contener dígitos'),
});
exports.changePasswordSchema = zod_1.z
  .object({
    currentPassword: zod_1.z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: zod_1.z
      .string()
      .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número')
      .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
    confirmPassword: zod_1.z.string().min(1, 'Confirma tu nueva contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
exports.createBootstrapPasswordSchema = zod_1.z
  .object({
    email: zod_1.z
      .string()
      .min(1, 'El correo es requerido')
      .email('Ingresa un correo electrónico válido'),
    password: zod_1.z
      .string()
      .min(10, 'La contraseña debe tener al menos 10 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[a-z]/, 'Debe contener al menos una minúscula')
      .regex(/\d/, 'Debe contener al menos un número')
      .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
    confirmPassword: zod_1.z.string().min(1, 'Confirma tu nueva contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
//# sourceMappingURL=auth.schema.js.map
