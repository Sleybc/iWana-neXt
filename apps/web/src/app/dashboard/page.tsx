// apps/web/src/app/dashboard/page.tsx
import type { Metadata } from 'next';
import { Building2, Users, BriefcaseBusiness, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { TenantsTable } from '@/components/dashboard/TenantsTable';
import { PanelCard } from '@/components/dashboard/PanelCard';
import { SystemStatusPanel } from '@/components/dashboard/SystemStatusPanel';

export const metadata: Metadata = {
  title: 'Dashboard — iWana neXt Admin',
};

/**
 * Dashboard principal del portal administrativo.
 * Sprint 1: datos estáticos. Sprint 2+: conectar con endpoints reales.
 * Layout: 12-col grid — col-span-8 contenido principal + col-span-4 paneles.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1">
      <PageHeader title="Dashboard" subtitle="Resumen de la plataforma iWana neXt" />

      <main className="flex-1 p-6">
        {/* Grid principal 12 columnas */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* ── COLUMNA IZQUIERDA (8/12 en xl) ── */}
          <div className="xl:col-span-8 flex flex-col gap-6">
            {/* Sección de métricas */}
            <section aria-label="Métricas de plataforma">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                <MetricCard
                  title="Tenants activos"
                  value="4 / 5"
                  change="1 nuevo esta semana"
                  icon={<Building2 className="w-5 h-5" />}
                  iconBg="#EAF5CC"
                  iconColor="#6A7A1C"
                />
                <MetricCard
                  title="Usuarios registrados"
                  value="12"
                  change="Admin de plataforma"
                  icon={<Users className="w-5 h-5" />}
                  iconBg="#EEEEFA"
                  iconColor="#17163A"
                />
                <MetricCard
                  title="Jobs en cola"
                  value="0"
                  change="Sistema saludable"
                  icon={<BriefcaseBusiness className="w-5 h-5" />}
                  iconBg="#DCFCE7"
                  iconColor="#22C55E"
                />
                <MetricCard
                  title="Alertas"
                  value="1"
                  change="1 tenant en error"
                  icon={<AlertTriangle className="w-5 h-5" />}
                  iconBg="#FEF2F2"
                  iconColor="#EF4444"
                />
              </div>
            </section>

            {/* Tabla de tenants */}
            <section aria-label="Tenants de la plataforma">
              <TenantsTable />
            </section>
          </div>

          {/* ── COLUMNA DERECHA (4/12 en xl) ── */}
          <div className="xl:col-span-4 flex flex-col gap-6">
            {/* Panel estado del sistema */}
            <SystemStatusPanel
              indicators={[
                { label: 'API Gateway', status: 'ok', detail: 'Latencia: 12ms' },
                { label: 'Base de datos', status: 'ok', detail: 'Conexiones: 4/20' },
                { label: 'BullMQ / Redis', status: 'ok', detail: '0 jobs bloqueados' },
                { label: 'Provisioning', status: 'warning', detail: '1 tenant en error' },
              ]}
            />

            {/* Panel actividad reciente */}
            <PanelCard
              title="Actividad reciente"
              columnHeaders={{ label: 'Evento', value: 'Hace' }}
              rows={[
                {
                  label: 'Tenant "Demo ISP" — error de provisión',
                  value: '2h',
                  valueClassName: 'text-red-600 dark:text-red-400',
                },
                { label: 'Nuevo usuario admin creado', value: '5h' },
                {
                  label: 'Tenant "Fibernet" — activado',
                  value: '8h',
                  valueClassName: 'text-green-600 dark:text-green-400',
                },
                { label: 'Backup automático completado', value: '1d' },
              ]}
              footerLabel="Ver historial completo"
              footerHref="/audit"
            />

            {/* Panel distribución de estados */}
            <PanelCard
              title="Distribución de tenants"
              columnHeaders={{ label: 'Estado', value: 'Cantidad' }}
              rows={[
                {
                  label: 'Activos',
                  value: 4,
                  valueClassName: 'text-green-600 dark:text-green-400',
                },
                {
                  label: 'Provisionando',
                  value: 1,
                  valueClassName: 'text-amber-600 dark:text-amber-400',
                },
                { label: 'Error', value: 1, valueClassName: 'text-red-600 dark:text-red-400' },
                { label: 'Suspendidos', value: 0 },
              ]}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
