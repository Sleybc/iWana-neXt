// apps/web/src/app/page.tsx
import { redirect } from 'next/navigation';

/**
 * Ruta raíz — redirige al login.
 * La lógica de auth guard se aplica en middleware.ts.
 */
export default function HomePage() {
  redirect('/auth/login');
}
