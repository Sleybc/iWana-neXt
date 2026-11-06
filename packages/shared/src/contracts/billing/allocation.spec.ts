import { suggestFifoAllocations } from './allocation';

describe('suggestFifoAllocations (compartido API + portal)', () => {
  it('aplica primero al documento vencido más antiguo y luego continúa en FIFO', () => {
    const result = suggestFifoAllocations('125.00', [
      {
        documentId: '00000000-0000-4000-8000-000000000002',
        dueDate: '2026-11-30',
        pendingAmount: '80.00',
      },
      {
        documentId: '00000000-0000-4000-8000-000000000001',
        dueDate: '2026-10-30',
        pendingAmount: '100.00',
      },
    ]);

    expect(result).toEqual([
      { documentId: '00000000-0000-4000-8000-000000000001', amount: '100.00' },
      { documentId: '00000000-0000-4000-8000-000000000002', amount: '25.00' },
    ]);
  });

  it('omite documentos sin saldo y deja el excedente como saldo a favor', () => {
    const result = suggestFifoAllocations('30.00', [
      {
        documentId: '00000000-0000-4000-8000-000000000001',
        dueDate: '2026-09-30',
        pendingAmount: '0.00',
      },
      {
        documentId: '00000000-0000-4000-8000-000000000002',
        dueDate: '2026-10-30',
        pendingAmount: '12.50',
      },
    ]);

    expect(result).toEqual([
      { documentId: '00000000-0000-4000-8000-000000000002', amount: '12.50' },
    ]);
  });

  it('ordena fechas iguales por id para producir un resultado determinista', () => {
    const result = suggestFifoAllocations('1.00', [
      {
        documentId: '00000000-0000-4000-8000-000000000002',
        dueDate: '2026-10-30',
        pendingAmount: '1.00',
      },
      {
        documentId: '00000000-0000-4000-8000-000000000001',
        dueDate: '2026-10-30',
        pendingAmount: '1.00',
      },
    ]);

    expect(result).toEqual([
      { documentId: '00000000-0000-4000-8000-000000000001', amount: '1.00' },
    ]);
  });

  it('no propone asignaciones cuando no hay documentos pendientes', () => {
    expect(suggestFifoAllocations('10.00', [])).toEqual([]);
  });
});
