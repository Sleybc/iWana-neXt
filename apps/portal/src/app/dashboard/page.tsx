// apps/portal/src/app/dashboard/page.tsx
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { Wifi, Receipt, Headphones, User, ArrowRight } from 'lucide-react';

/**
 * Dashboard del portal de suscriptores.
 * Sprint 1: datos estáticos. Sprint 2+: conectar con endpoints reales.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1">
      <PageHeader title="Mi Portal" subtitle="Bienvenido, suscriptor iWana" />

      <main className="flex-1 p-6 space-y-6">
        {/* Métricas del servicio del suscriptor */}
        <section aria-label="Estado del servicio">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Card: Plan activo */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Mi plan activo
                    </p>
                    <p className="mt-1 text-xl font-bold text-iwana-primary dark:text-white">
                      Plan Hogar 100M
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Vence: 31 mar 2026
                    </p>
                  </div>
                  <Badge variant="success">Activo</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Card: Estado de conexión */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Estado conexión
                    </p>
                    <p className="mt-1 text-xl font-bold text-iwana-primary dark:text-white">
                      En línea
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      ↓ 98.7 Mbps · ↑ 49.2 Mbps
                    </p>
                  </div>
                  <div
                    className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
                    aria-label="Conectado"
                  >
                    <Wifi
                      className="w-4 h-4 text-green-600 dark:text-green-400"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card: Próxima factura */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Próxima factura
                    </p>
                    <p className="mt-1 text-xl font-bold text-iwana-primary dark:text-white">
                      $89.900
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Vence: 5 abr 2026
                    </p>
                  </div>
                  <Badge variant="warning">Pendiente</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Accesos rápidos */}
        <section aria-label="Accesos rápidos">
          <Card>
            <CardHeader>
              <CardTitle>Accesos rápidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Ver facturas', href: '/billing', icon: Receipt },
                  { label: 'Soporte / PQR', href: '/support', icon: Headphones },
                  { label: 'Cambiar plan', href: '/services', icon: Wifi },
                  { label: 'Mi perfil', href: '/profile', icon: User },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-iwana-primary hover:border-iwana-primary hover:bg-iwana-primary-50 transition-all dark:border-gray-700 dark:text-white dark:hover:border-iwana-primary-300 dark:hover:bg-iwana-primary/10"
                  >
                    <span className="flex items-center gap-2">
                      <item.icon
                        className="w-4 h-4 text-iwana-secondary-700 dark:text-iwana-secondary"
                        aria-hidden="true"
                      />
                      {item.label}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
