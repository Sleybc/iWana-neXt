// apps/portal/src/app/settings/page.tsx
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { Settings, Clock, Globe, DollarSign, ShieldCheck } from 'lucide-react';

/**
 * Página de configuración de empresa — placeholder MVP.
 *
 * Sprint 1: muestra la estructura del panel de configuración.
 * Sprint 2+: conectar con GET /tenants/me/settings y formularios editables.
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §4.2
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-col flex-1">
      <PageHeader
        title="Configuración de empresa"
        subtitle="Gestiona la configuración operativa de tu organización"
      />

      <main className="flex-1 p-6 space-y-6">
        {/* Aviso de funcionalidad próxima */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-start gap-3">
            <Settings
              className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Configuración empresarial
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
                La edición de configuración estará disponible en la próxima versión del panel. Por
                ahora puedes visualizar la configuración actual desde el dashboard.
              </p>
            </div>
          </div>
        </div>

        {/* Vista previa de secciones */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="w-4 h-4 text-iwana-secondary-700" aria-hidden="true" />
                Zona horaria y región
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Configuración de timezone, moneda, idioma y país de operación.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Próximamente</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="w-4 h-4 text-iwana-secondary-700" aria-hidden="true" />
                Seguridad y MFA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Políticas de autenticación, MFA obligatorio y control de acceso.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Próximamente</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="w-4 h-4 text-iwana-secondary-700" aria-hidden="true" />
                Facturación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Configuración de moneda, impuestos y módulo de facturación electrónica.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Próximamente</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4 text-iwana-secondary-700" aria-hidden="true" />
                Información legal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Razón social, NIT, dirección y datos de contacto de la empresa.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Próximamente</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
