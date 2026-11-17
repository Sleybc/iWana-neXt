// Página propia del ticket (spec MOD10 2026-11-16 §3 K, CA-11): el mismo contenido que el panel
// de la bandeja. El permiso `assurance.tickets.read` lo aplica `dashboard/assurance/layout.tsx`.
import { AssuranceTicketPageClient } from '@/components/assurance/AssuranceTicketPageClient';

export const metadata = {
  title: 'Detalle del ticket | Mesa de ayuda',
  description: 'Comentarios, historial y acciones de un ticket de la mesa de ayuda.',
};

export default function AssuranceTicketPage() {
  return <AssuranceTicketPageClient />;
}
