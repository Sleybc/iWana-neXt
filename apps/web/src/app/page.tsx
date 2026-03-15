// apps/web/src/app/page.tsx
import { redirect } from 'next/navigation';

/**
 * Ruta raíz — redirige al dashboard.
 * La lógica de auth guard se aplica en middleware.ts.
 */
export default function HomePage() {
  redirect('/dashboard');
}
