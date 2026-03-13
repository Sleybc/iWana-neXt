// apps/web/src/app/dashboard/page.tsx
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { TenantsTable } from '@/components/dashboard/TenantsTable';

export const metadata: Metadata = {
  title: 'Dashboard — iWana neXt Admin',
};

/**
 * Dashboard principal del portal administrativo.
 * Sprint 1: datos estáticos. Sprint 2+: conectar con endpoints reales.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1">
      <Header title="Dashboard" subtitle="Resumen de la plataforma iWana neXt" />

      <main className="flex-1 p-6 space-y-6">
        <section aria-label="Métricas de plataforma">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Tenants activos"
              value="1 / 2"
              change="1 nuevo esta semana"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              }
            />
            <MetricCard
              title="Usuarios registrados"
              value="1"
              change="Admin de plataforma"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              }
              iconBg="#EAF5CC"
              iconColor="#6A7A1C"
            />
            <MetricCard
              title="Jobs en cola"
              value="0"
              change="Sistema saludable"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              }
              iconBg="#DCFCE7"
              iconColor="#22C55E"
            />
            <MetricCard
              title="Alertas"
              value="1"
              change="1 tenant en error"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              }
              iconBg="#FEF2F2"
              iconColor="#EF4444"
            />
          </div>
        </section>

        <section aria-label="Tenants de la plataforma">
          <TenantsTable />
        </section>
      </main>
    </div>
  );
}
