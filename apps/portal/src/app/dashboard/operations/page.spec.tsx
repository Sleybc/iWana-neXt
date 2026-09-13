// apps/portal/src/app/dashboard/operations/page.spec.tsx
// Acreditación del despachador de deep links de la raíz (H3, F2): cada forma
// vigente de deep link redirige en servidor preservando la query completa, y
// la raíz sin llaves reconocidas cae en la rama landing (D-A7). El caso
// `?executionOrderId=` es el deep link LEGADO que viaja en notificaciones ya
// enviadas; su comportamiento vivo con stack completo lo ejercita el e2e en
// e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts:876 y :975 (líneas
// intocadas por F2).
import { render, screen } from '@testing-library/react';
import OperationsPage from './page';

jest.mock('next/navigation', () => ({
  // El `redirect()` real interrumpe el render con NEXT_REDIRECT; el doble
  // replica esa semántica para que el branch cortado sea observable.
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

jest.mock('@/components/operations/OperationsLandingRedirect', () => ({
  OperationsLandingRedirect: () => <div data-testid="operations-landing" />,
}));

describe('operations/page — despachador de deep links', () => {
  function searchParamsOf(params: Record<string, string>): Promise<Record<string, string>> {
    return Promise.resolve(params);
  }

  it('deep link legado ?executionOrderId= redirige a la bandeja de OT preservando la query', async () => {
    await expect(
      OperationsPage({
        searchParams: searchParamsOf({
          executionOrderId: 'eo-9',
          from: 'notification',
        }),
      }),
    ).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard/operations/execution-orders?executionOrderId=eo-9&from=notification',
    );
  });

  it('?ticketId=&fromAssurance=1 redirige al alta de tarea preservando la query', async () => {
    await expect(
      OperationsPage({
        searchParams: searchParamsOf({ ticketId: 't-21', fromAssurance: '1' }),
      }),
    ).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard/operations/tasks/new?ticketId=t-21&fromAssurance=1',
    );
  });

  it('?taskId= redirige a la bandeja de tareas preservando la query', async () => {
    await expect(
      OperationsPage({ searchParams: searchParamsOf({ taskId: 'task-7' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard/operations/tasks?taskId=task-7');
  });

  it('sin llaves reconocidas cae en la rama landing (sin redirect)', async () => {
    const landing = await OperationsPage({ searchParams: searchParamsOf({}) });
    render(<>{landing}</>);
    expect(screen.getByTestId('operations-landing')).toBeInTheDocument();
  });

  it('parámetros no reconocidos también caen en la rama landing (D-A7)', async () => {
    const landing = await OperationsPage({
      searchParams: searchParamsOf({ filtroDesconocido: 'x' }),
    });
    render(<>{landing}</>);
    expect(screen.getByTestId('operations-landing')).toBeInTheDocument();
  });
});
