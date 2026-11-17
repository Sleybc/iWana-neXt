import type { ReactNode } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalPanel } from '@/components/shared/portal-ui';

export const assuranceTextareaClassName =
  'min-h-[120px] w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-colors duration-200 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-iwana-primary dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-400';

interface AssuranceSectionCardProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function AssuranceSectionCard({
  title,
  description,
  eyebrow,
  actions,
  className,
  children,
}: AssuranceSectionCardProps) {
  return (
    <PortalPanel
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={actions}
      className={className}
    >
      {children}
    </PortalPanel>
  );
}

/**
 * Sesión no resuelta o rol sin acceso a la mesa de ayuda. Igual en la bandeja y en la página del
 * ticket (spec MOD10 §3 K: misma carga y permisos).
 */
export function AssuranceAccessState({ reason }: { reason: 'session' | 'role' }) {
  if (reason === 'session') {
    return (
      <div className="space-y-6">
        <PageHeader title="Mesa de ayuda" subtitle="Error al cargar el módulo" />
        <PortalAlert
          variant="error"
          title="Módulo temporalmente no disponible"
          description="No fue posible resolver la sesión del portal para cargar la mesa de ayuda. Inicia sesión nuevamente para recuperar el acceso."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mesa de ayuda" subtitle="Acceso restringido" />
      <PortalAlert
        variant="warning"
        title="Tu rol no tiene acceso a esta vista"
        description="La mesa de ayuda del portal solo está disponible para operación de soporte, NOC y equipos técnicos autorizados."
        icon={ShieldAlert}
      />
    </div>
  );
}
