/**
 * Límites y patrones canónicos del contrato de perfil de usuario.
 * Fuente única para class-validator (CreateUserDto) y Zod (bulkCreate).
 */
export const USER_FIELD_MAX = {
  email: 255,
  password: 128,
  firstName: 100,
  lastName: 100,
  /** Alineado a columna users.phone varchar(20). */
  phone: 20,
  jobTitle: 150,
  documentNumber: 30,
  avatarUrl: 500,
} as const;

export const USER_PASSWORD_MIN = 10;

/** E.164: '+' + 7–15 dígitos (máx. efectivo 16 chars; columna admite 20). */
export const USER_PHONE_E164_PATTERN = /^\+\d{7,15}$/;
