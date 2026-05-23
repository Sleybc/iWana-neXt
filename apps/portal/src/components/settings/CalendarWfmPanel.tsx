'use client';

import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { WfmOperatingHoursManager } from './WfmOperatingHoursManager';

/**
 * Panel de ventana técnica de despacho WFM para el Calendario operativo.
 * Centraliza los horarios base, overrides por sede y cierres especiales de la
 * agenda técnica, en línea con ADR-042.
 */
export function CalendarWfmPanel() {
  const { user } = useAuth();
  const canEdit = user?.role === UserRole.ADMIN;

  return <WfmOperatingHoursManager canEdit={canEdit} />;
}
