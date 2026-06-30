import { z } from 'zod';
/**
 * Schemas Zod para formularios de autenticación.
 * Usados con react-hook-form + @hookform/resolvers/zod.
 * Mensajes de error en español colombiano.
 */
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type LoginFormValues = z.infer<typeof loginSchema>;
export declare const mfaVerifySchema: z.ZodObject<{
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
export type MfaVerifyFormValues = z.infer<typeof mfaVerifySchema>;
export declare const changePasswordSchema: z.ZodEffects<z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
    confirmPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}>, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
export declare const createBootstrapPasswordSchema: z.ZodEffects<z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    confirmPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    confirmPassword: string;
}, {
    email: string;
    password: string;
    confirmPassword: string;
}>, {
    email: string;
    password: string;
    confirmPassword: string;
}, {
    email: string;
    password: string;
    confirmPassword: string;
}>;
export type CreateBootstrapPasswordFormValues = z.infer<typeof createBootstrapPasswordSchema>;
//# sourceMappingURL=auth.schema.d.ts.map