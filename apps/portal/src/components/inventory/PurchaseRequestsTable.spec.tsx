import { render, screen } from '@testing-library/react';
import { PurchaseRequestPriority, PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';
import { PurchaseRequestsTable } from './PurchaseRequestsTable';

const baseRequest: PurchaseRequestRecord = {
  id: 'pr-1',
  tenantId: 'tenant-1',
  requestNumber: 'SC-000001',
  title: 'Compra de equipos de red',
  status: PurchaseRequestStatus.PENDING_APPROVAL,
  requestType: PurchaseRequestType.REPLENISHMENT,
  priority: PurchaseRequestPriority.NORMAL,
  requestedByUserId: 'user-1',
  requestingArea: 'Operaciones',
  justification: null,
  operationalRefType: null,
  operationalRefId: null,
  exceptionReason: null,
  approvedByUserId: null,
  neededByDate: '2026-09-09',
  notes: null,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

describe('PurchaseRequestsTable · fecha requerida (regresión bug offset de zona horaria)', () => {
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    // América/Bogotá: UTC-5, sin horario de verano. Reproduce exactamente el bug
    // reportado por el usuario (captura de pantalla): una solicitud con
    // neededByDate = 9 de septiembre se mostraba como 8 de septiembre.
    process.env.TZ = 'America/Bogota';
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('muestra 9 de septiembre, no 8, para neededByDate = 2026-09-09', () => {
    render(<PurchaseRequestsTable requests={[baseRequest]} onSelectRequest={jest.fn()} />);

    expect(screen.getByText('9/09/2026')).toBeInTheDocument();
    expect(screen.queryByText('8/09/2026')).not.toBeInTheDocument();
  });
});
