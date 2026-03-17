// apps/portal/src/app/dashboard/page.tsx
import { DashboardClient } from '@/components/dashboard/DashboardClient';

/**
 * Página protegida del dashboard empresarial del tenant autenticado.
 *
 * Esta página reemplaza el antiguo portal de suscriptor.
 * El shell de layout (Sidebar, TopHeader) se aplica en el layout padre.
 * La carga de datos y la composición role-aware quedan en DashboardClient.
 *
 * CA-01: no muestra widgets de suscriptor (plan hogar, velocidad, factura).
 * CA-02: consume datos del tenant autenticado mediante contratos self-service.
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §2.2, §4.1
 */
export default function DashboardPage() {
  return <DashboardClient />;
}
