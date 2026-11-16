import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

/**
 * Página pública para crear (invitación) o restablecer la contraseña desde el enlace del correo.
 * `<Suspense>` es obligatorio: el formulario usa `useSearchParams()` y sin el límite Next.js
 * bloquearía el prerenderizado estático.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
