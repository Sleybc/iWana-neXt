// apps/portal/src/app/dashboard/page.tsx
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@iwana/ui';

/**
 * Dashboard del portal de suscriptores.
 * Sprint 1: datos estáticos. Sprint 2+: conectar con endpoints reales.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div>
          <h1 className="text-xl font-semibold text-[#17163A]">Mi Portal</h1>
          <p className="text-sm text-gray-500">Bienvenido, Juan García</p>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Mi plan activo</p>
                  <p className="mt-1 text-xl font-bold text-[#17163A]">Plan Hogar 100M</p>
                  <p className="text-xs text-gray-500 mt-1">Vence: 31 mar 2026</p>
                </div>
                <Badge variant="success">Activo</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Estado conexión</p>
                  <p className="mt-1 text-xl font-bold text-[#17163A]">En línea</p>
                  <p className="text-xs text-gray-500 mt-1">↓ 98.7 Mbps · ↑ 49.2 Mbps</p>
                </div>
                <div className="w-3 h-3 rounded-full bg-[#22C55E] mt-1" aria-label="Conectado" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Próxima factura</p>
                  <p className="mt-1 text-xl font-bold text-[#17163A]">$89.900</p>
                  <p className="text-xs text-gray-500 mt-1">Vence: 5 abr 2026</p>
                </div>
                <Badge variant="warning">Pendiente</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Ver facturas', href: '/billing' },
                { label: 'Soporte / PQR', href: '/support' },
                { label: 'Cambiar plan', href: '/services' },
                { label: 'Mi perfil', href: '/profile' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-[#17163A] hover:border-[#17163A] hover:bg-[#EEEEFA] transition-all"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
