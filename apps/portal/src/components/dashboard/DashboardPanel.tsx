import type { ReactNode } from 'react';
import { PortalPanel } from '@/components/shared/portal-ui';

interface DashboardPanelProps {
  title: string;
  eyebrow?: string;
  description?: string;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Wrapper visual común para los paneles secundarios del dashboard empresarial.
 * Mantiene una gramática consistente sin mover todavía estos bloques a packages/ui.
 */
export function DashboardPanel({
  title,
  eyebrow,
  description,
  className,
  contentClassName,
  children,
}: DashboardPanelProps) {
  return (
    <PortalPanel
      as="section"
      eyebrow={eyebrow}
      title={title}
      description={description}
      className={className}
      contentClassName={contentClassName}
    >
      {children}
    </PortalPanel>
  );
}
