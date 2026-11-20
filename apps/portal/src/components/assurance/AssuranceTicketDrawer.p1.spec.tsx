/**
 * Panel del ticket, paso 1 — spec MOD10 2026-11-16 §3 A–H, §4, CA-5 y CA-6.
 * Cubre lo que P1 introduce; el inventario de no regresión vive en
 * `AssuranceTicketDrawer.inventory.spec.tsx`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState, type ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ExecutionOrderStatus,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
} from '@iwana/shared';
import type { AssuranceTicket } from '@/lib/api-client';
import { assuranceApi } from '@/lib/api-client';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';

jest.mock('@/components/shared/use-portal-modal-drawer-broadcast', () => ({
  usePortalModalDrawerBroadcast: () => undefined,
}));

// P2b §3 L: el buscador de la orden exige `operations.execution_orders.read`. Como en el portal
// real (el layout monta `PermissionsProvider`), estas pruebas conceden los permisos de lectura;
// las guardas por permiso se prueban en `AssuranceTicketDetail.p2b.spec.tsx`.
jest.mock('@/components/access-control/permissions-context', () => ({
  // Identidad estable entre renders (guarda jest-context-mocks-stable.structure.spec).
  usePermissions: (() => {
    let stable: { hasPermission: () => boolean } | undefined;
    return () => (stable ??= { hasPermission: () => true });
  })(),
}));

type DrawerProps = ComponentProps<typeof AssuranceTicketDrawer>;
type DrawerComment = DrawerProps['comments'][number];
type DrawerEvent = DrawerProps['timeline'][number];

function ticket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: 'ticket-1',
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2026-0101',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    source: TicketSource.PORTAL,
    subject: 'Sin conexión sintética',
    description: null,
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: 'req-1',
    subjectType: TicketSubjectType.SUBSCRIBER,
    subjectRefId: 'req-1',
    assignedUserId: null,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.OK,
    fieldDecision: TicketFieldDecision.NOT_REQUIRED,
    workOrderId: null,
    createdByUserId: 'user-1',
    createdAt: '2026-06-24T20:13:00.000Z',
    updatedAt: '2026-06-26T09:00:00.000Z',
    ...overrides,
  };
}

function drawerProps(overrides: Partial<DrawerProps> = {}): DrawerProps {
  const noop = jest.fn(async () => undefined);
  return {
    open: true,
    ticket: ticket(),
    comments: [],
    timeline: [],
    assignees: [],
    isLoading: false,
    error: null,
    actionFeedback: null,
    actionError: null,
    isCommentSubmitting: false,
    isTransitionSubmitting: false,
    isAssignmentSubmitting: false,
    isFieldServiceSubmitting: false,
    isLinkingWorkOrder: false,
    canManage: true,
    canOperate: true,
    onClose: jest.fn(),
    onAddComment: noop,
    onTransitionStatus: noop,
    onAssign: noop,
    onRequestFieldService: noop,
    onLinkWorkOrder: noop,
    ...overrides,
  };
}

const COMMENT = {
  id: 'comment-1',
  tenantId: 'tenant-1',
  ticketId: 'ticket-1',
  body: 'Cambio de ONU realizado',
  isInternal: false,
  authorUserId: 'usuario-sin-resolver',
  createdAt: '2026-06-25T10:00:00.000Z',
  attachments: [],
} as unknown as DrawerComment;

const EVENTS = [
  {
    id: 'event-created',
    tenantId: 'tenant-1',
    ticketId: 'ticket-1',
    eventType: TicketTimelineEventType.CREATED,
    actorUserId: null,
    payload: {},
    occurredAt: '2026-06-24T20:13:00.000Z',
  },
  {
    id: 'event-comment',
    tenantId: 'tenant-1',
    ticketId: 'ticket-1',
    eventType: TicketTimelineEventType.COMMENT_ADDED,
    actorUserId: null,
    payload: { isInternal: false },
    occurredAt: '2026-06-25T10:00:00.000Z',
  },
  {
    id: 'event-status',
    tenantId: 'tenant-1',
    ticketId: 'ticket-1',
    eventType: TicketTimelineEventType.STATUS_CHANGED,
    actorUserId: null,
    payload: { from: TicketStatus.OPEN, to: TicketStatus.IN_PROGRESS },
    occurredAt: '2026-06-26T09:00:00.000Z',
  },
] as unknown as DrawerEvent[];

describe('AssuranceTicketDrawer P1 — contenedor (§3 A, CA-5)', () => {
  it('es un diálogo modal con nombre (número), descripción (asunto) y el ancho de hoy', () => {
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    const dialog = screen.getByRole('dialog', { name: 'TK-2026-0101' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Sin conexión sintética');
    expect(dialog.className).toContain('max-w-3xl');
  });

  it('pone el foco dentro del panel y lo devuelve al disparador al cerrar con Escape', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Ver detalle
          </button>
          <AssuranceTicketDrawer {...drawerProps({ open, onClose: () => setOpen(false) })} />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Ver detalle' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'TK-2026-0101' });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('cargando: esqueleto con aria-busy y sin redactor', () => {
    render(<AssuranceTicketDrawer {...drawerProps({ ticket: null, isLoading: true })} />);
    const dialog = screen.getByRole('dialog', { name: 'Detalle del ticket' });
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByLabelText('Nuevo comentario')).not.toBeInTheDocument();
  });
});

describe('AssuranceTicketDrawer P1 — propiedades y vocabulario (§3 C, §4)', () => {
  it('los valores por defecto se muestran atenuados con su propio texto', () => {
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    const dialog = screen.getByRole('dialog');
    for (const text of ['No requiere', 'Sin vincular']) {
      const value = within(dialog).getByText(text, { selector: 'dd span' });
      expect(value.className).toContain('text-gray-500');
    }
    // Área vive solo en la cabecera (añadido aprobado 2026-11-16): su vacío se lee en el control.
    const area = within(dialog).getByRole('combobox', { name: 'Área' });
    expect(area.textContent?.trim()).toBe('Sin área');
    expect(area.className).toContain('text-gray-500');
  });

  // Spec 2026-11-20 §3 A: un panel con Estado y asignación, Visita y orden de trabajo, Datos del
  // caso y Fechas. «Actualizado» se retira (D1: lo cubre el historial); ninguna otra se pierde.
  it('las propiedades siguen el orden de las secciones del riel (2026-11-20 §3 A)', () => {
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    const terms = within(screen.getByRole('dialog'))
      .getAllByRole('term')
      .map((term) => term.textContent);
    expect(terms).toEqual([
      'Visita técnica',
      'Orden de trabajo',
      'Solicitante',
      'Relacionado con',
      'Origen',
      'Abierto',
      'Primera respuesta',
      'Resuelto',
    ]);
  });

  it('responsable sin asignar y autor no resuelto usan sus rótulos de §4', () => {
    render(<AssuranceTicketDrawer {...drawerProps({ comments: [COMMENT] })} />);
    expect(screen.getByRole('combobox', { name: 'Responsable' }).textContent?.trim()).toBe(
      'Sin asignar',
    );
    expect(screen.getByRole('article')).toHaveTextContent('Usuario no disponible');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('No asignado');
  });

  it.each([
    ['con gestión, sin el usuario en la lista', true],
    ['Soporte sin gestión, que no carga la lista', false],
  ])(
    'ticket asignado %s: «Responsable no disponible», nunca «Sin asignar» (§4 nota v1.1)',
    (_name, canManage) => {
      render(
        <AssuranceTicketDrawer
          {...drawerProps({
            canManage,
            assignees: [],
            ticket: ticket({ assignedUserId: 'usuario-fuera-de-la-lista' }),
          })}
        />,
      );
      expect(screen.getByRole('combobox', { name: 'Responsable' }).textContent?.trim()).toBe(
        'Responsable no disponible',
      );
    },
  );
});

describe('AssuranceTicketDrawer P1 — hilo (§3 F, riesgo R6)', () => {
  it('Comentarios es el filtro por defecto; Historial lista todos los hitos', async () => {
    const user = userEvent.setup();
    render(<AssuranceTicketDrawer {...drawerProps({ comments: [COMMENT], timeline: EVENTS })} />);
    expect(screen.getByRole('tab', { name: 'Comentarios' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Cambio de ONU realizado')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Historial' }));
    const history = screen.getByRole('list', { name: 'Historial del caso' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(3);
    expect(within(history).getByText('Comentario agregado')).toBeInTheDocument();
  });

  it('Todo intercala por fecha y omite «Comentario agregado»', async () => {
    const user = userEvent.setup();
    render(<AssuranceTicketDrawer {...drawerProps({ comments: [COMMENT], timeline: EVENTS })} />);
    await user.click(screen.getByRole('tab', { name: 'Todo' }));
    const all = screen.getByRole('list', { name: 'Comentarios e historial del caso' });
    const items = within(all).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Ticket creado');
    expect(items[1]).toHaveTextContent('Cambio de ONU realizado');
    expect(items[2]).toHaveTextContent('Estado actualizado');
    expect(all).not.toHaveTextContent('Comentario agregado');
  });
});

describe('AssuranceTicketDrawer P1 — redactor y mensajes (§3 G, H)', () => {
  it('el redactor vive al pie del panel, fuera del área que se desplaza', () => {
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    expect(screen.getByLabelText('Nuevo comentario').closest('footer')).not.toBeNull();
  });

  it('el mensaje de la acción aparece junto al control que la provocó', async () => {
    const user = userEvent.setup();
    const props = drawerProps();
    const { rerender } = render(<AssuranceTicketDrawer {...props} />);
    await user.click(screen.getByRole('combobox', { name: 'Área' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Área' })).getByRole('option', {
        name: 'Soporte',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar asignación' }));
    // El consumidor recarga el ticket (objeto nuevo, mismo id) y publica el mensaje.
    rerender(
      <AssuranceTicketDrawer
        {...props}
        ticket={ticket()}
        actionFeedback="Asignación actualizada."
      />,
    );
    // 2026-11-20 §3 B: Área se edita en «Estado y asignación»; el aviso queda en esa sección.
    const assignment = screen.getByRole('region', { name: 'Estado y asignación' });
    expect(within(assignment).getByText('Asignación actualizada.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Cambiar estado' })).queryByText(
        'Asignación actualizada.',
      ),
    ).not.toBeInTheDocument();
  });

  it('sin acción propia el mensaje se muestra al inicio del panel', () => {
    render(<AssuranceTicketDrawer {...drawerProps({ actionError: 'Error sintético' })} />);
    expect(screen.getByText('No fue posible aplicar la acción')).toBeInTheDocument();
    expect(screen.getByText('Error sintético')).toBeInTheDocument();
  });

  it('al resolver, la nota indica que es obligatoria', async () => {
    const user = userEvent.setup();
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    expect(screen.queryByText('Para resolver el caso la nota es obligatoria.')).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Nuevo estado' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Nuevo estado' })).getByRole('option', {
        name: 'Resuelto',
      }),
    );
    expect(screen.getByText('Para resolver el caso la nota es obligatoria.')).toBeInTheDocument();
  });
});

describe('AssuranceTicketDrawer P1 — ronda CA-2 (aprobada 2026-11-16)', () => {
  it('redactor contraído en reposo: una línea, sin «Interno» ni adjuntar fuera del tabulador', () => {
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    const box = screen.getByRole('textbox', { name: 'Nuevo comentario' });
    expect(box).toHaveAttribute('rows', '1');
    expect(screen.queryByRole('checkbox', { name: 'Interno' })).toBeNull();
    expect(screen.queryByLabelText('Adjuntar archivos')).toBeNull();
    expect(screen.getByRole('button', { name: 'Agregar comentario' })).toBeDisabled();
  });

  it('al enfocar se expande y el conmutador es alcanzable con el tabulador', async () => {
    const user = userEvent.setup();
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    const box = screen.getByRole('textbox', { name: 'Nuevo comentario' });
    await user.click(box);
    expect(box).toHaveAttribute('rows', '3');
    expect(screen.getByLabelText('Adjuntar archivos')).toBeInTheDocument();
    const internal = screen.getByRole('checkbox', { name: 'Interno' });
    let steps = 0;
    while (document.activeElement !== internal && steps < 6) {
      await user.tab();
      steps += 1;
    }
    expect(internal).toHaveFocus();
  });

  it('no se contrae mientras tenga texto; sí al salir sin contenido', async () => {
    const user = userEvent.setup();
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    const box = screen.getByRole('textbox', { name: 'Nuevo comentario' });
    await user.type(box, 'Borrador');
    await user.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(screen.getByRole('checkbox', { name: 'Interno' })).toBeInTheDocument();
    await user.clear(box);
    await user.click(screen.getByRole('tab', { name: 'Comentarios' }));
    expect(screen.queryByRole('checkbox', { name: 'Interno' })).toBeNull();
  });

  it('si el envío falla, conserva texto y queda expandido', async () => {
    const user = userEvent.setup();
    const onAddComment = jest.fn(async () => false);
    const props = drawerProps({ onAddComment });
    const { rerender } = render(<AssuranceTicketDrawer {...props} />);
    await user.type(screen.getByRole('textbox', { name: 'Nuevo comentario' }), 'Reintento');
    await user.click(screen.getByRole('button', { name: 'Agregar comentario' }));
    rerender(<AssuranceTicketDrawer {...props} actionError="Sin conexión" />);
    await user.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(screen.getByRole('textbox', { name: 'Nuevo comentario' })).toHaveValue('Reintento');
    expect(screen.getByRole('checkbox', { name: 'Interno' })).toBeInTheDocument();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
  });

  it('cabecera en una fila: Nota y «Guardar estado» aparecen solo al elegir destino', async () => {
    const user = userEvent.setup();
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    expect(screen.queryByRole('textbox', { name: 'Nota' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar estado' })).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Nuevo estado' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Nuevo estado' })).getByRole('option', {
        name: 'En progreso',
      }),
    );
    expect(screen.getByRole('textbox', { name: 'Nota' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar estado' })).toBeEnabled();
  });

  it('«Guardar asignación» aparece solo cuando cambia responsable o área', async () => {
    const user = userEvent.setup();
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    expect(screen.queryByRole('button', { name: 'Guardar asignación' })).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Área' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Área' })).getByRole('option', {
        name: 'Facturación',
      }),
    );
    expect(screen.getByRole('button', { name: 'Guardar asignación' })).toBeEnabled();
  });

  it.each([TicketStatus.CLOSED, TicketStatus.CANCELLED])(
    'en estado terminal %s no hay formulario de estado: solo el valor actual',
    (status) => {
      render(<AssuranceTicketDrawer {...drawerProps({ ticket: ticket({ status }) })} />);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).queryByRole('group', { name: 'Cambiar estado' })).toBeNull();
      expect(within(dialog).queryByRole('combobox', { name: 'Nuevo estado' })).toBeNull();
      expect(
        within(dialog).getByText(status === TicketStatus.CLOSED ? 'Cerrado' : 'Cancelado', {
          selector: 'span, div',
        }),
      ).toBeInTheDocument();
    },
  );

  it('Área sale de Propiedades y queda solo en la cabecera', () => {
    render(<AssuranceTicketDrawer {...drawerProps()} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Área', { selector: 'dt' })).toBeNull();
    expect(within(dialog).getByRole('combobox', { name: 'Área' })).toBeInTheDocument();
  });

  it('adjuntos del caso en fila compacta: nombre truncado con el texto completo accesible', () => {
    const longName = 'Adobe Scan 30 jun 2026 (3).pdf';
    render(
      <AssuranceTicketDrawer
        {...drawerProps({
          comments: [
            {
              ...COMMENT,
              attachments: [
                {
                  id: 'att-1',
                  filename: longName,
                  contentType: 'application/pdf',
                  sizeBytes: 2048,
                  status: 'AVAILABLE',
                },
              ],
            } as unknown as DrawerComment,
          ],
        })}
      />,
    );
    const section = screen.getByTestId('ticket-attachments-section');
    expect(within(section).getByRole('heading', { name: 'Adjuntos (1)' })).toBeInTheDocument();
    const name = within(section).getByText(longName);
    expect(name.className).toContain('truncate');
    expect(name).toHaveAttribute('title', longName);
    expect(within(section).getByRole('button', { name: `Abrir PDF: ${longName}` })).toBeEnabled();
    expect(within(section).getByRole('button', { name: `Descargar ${longName}` })).toBeEnabled();
  });
});

describe('AssuranceTicketDrawer P1 — formularios en línea y permisos (§4 nota v1.1)', () => {
  it.each([
    [
      'Solicitar visita',
      { canOperate: true, ticket: ticket({ status: TicketStatus.IN_PROGRESS }) },
      'Confirmar solicitud',
    ],
    // P2b §3 L: el formulario abre con el buscador por número; «Confirmar vínculo» aparece
    // cuando se encuentra una orden libre (p2b.spec).
    ['Vincular orden de trabajo', { canManage: true }, 'Buscar orden'],
  ] as const)('con permiso, «%s» abre su formulario', async (toggleName, perms, confirm) => {
    const user = userEvent.setup();
    render(<AssuranceTicketDrawer {...drawerProps(perms)} />);
    await user.click(screen.getByRole('button', { name: toggleName }));
    expect(screen.getByRole('button', { name: toggleName })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: confirm })).toBeInTheDocument();
  });

  it.each([
    ['Solicitar visita', { canOperate: false, canManage: false }, 'Confirmar solicitud'],
    ['Vincular orden de trabajo', { canManage: false }, 'Confirmar vínculo'],
  ] as const)(
    'sin permiso, «%s» queda deshabilitado y no abre',
    async (toggleName, perms, confirm) => {
      const user = userEvent.setup();
      render(<AssuranceTicketDrawer {...drawerProps(perms)} />);
      const toggle = screen.getByRole('button', { name: toggleName });
      expect(toggle).toBeDisabled();
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: confirm })).toBeNull();
    },
  );

  it.each([
    ['terminal', TicketStatus.CLOSED],
    ['estado no permitido', TicketStatus.OPEN],
  ])(
    'con permiso pero en %s, «Solicitar visita» queda deshabilitado con su ayuda visible',
    async (_name, status) => {
      const user = userEvent.setup();
      render(<AssuranceTicketDrawer {...drawerProps({ ticket: ticket({ status }) })} />);
      const toggle = screen.getByRole('button', { name: 'Solicitar visita' });
      expect(toggle).toBeDisabled();
      await user.click(toggle);
      expect(screen.queryByRole('button', { name: 'Confirmar solicitud' })).toBeNull();
      const hint = screen.getByText(
        'Disponible solo cuando el ticket está en progreso o en espera interna.',
      );
      expect(hint).toBeVisible();
      expect(toggle).toHaveAccessibleDescription(hint.textContent ?? '');
      // «Vincular orden de trabajo» solo depende de canManage: el estado no lo bloquea.
      expect(screen.getByRole('button', { name: 'Vincular orden de trabajo' })).toBeEnabled();
    },
  );

  it('la ayuda de «Crear tarea vinculada» está a la vista y describe la acción', () => {
    render(<AssuranceTicketDrawer {...drawerProps({ onCreateLinkedTask: jest.fn() })} />);
    const hint = screen.getByText('No crea una visita automática.');
    expect(hint.className).not.toContain('sr-only');
    expect(
      screen.getByRole('button', { name: 'Crear tarea vinculada' }),
    ).toHaveAccessibleDescription('No crea una visita automática.');
  });
});

describe('AssuranceTicketDrawer P1 — corrección H-A/H-B (mensajes cuyo control desaparece)', () => {
  async function chooseStatus(user: ReturnType<typeof userEvent.setup>, label: string) {
    await user.click(screen.getByRole('combobox', { name: 'Nuevo estado' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Nuevo estado' })).getByRole('option', {
        name: label,
      }),
    );
  }

  it('H-A: tras confirmar la visita, el ticket pasa a visita solicitada y el aviso sigue a la vista', async () => {
    const user = userEvent.setup();
    const props = drawerProps({ ticket: ticket({ status: TicketStatus.IN_PROGRESS }) });
    const { rerender } = render(<AssuranceTicketDrawer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Solicitar visita' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar solicitud' }));
    rerender(
      <AssuranceTicketDrawer
        {...props}
        ticket={ticket({ status: TicketStatus.FIELD_SERVICE_REQUESTED })}
        actionFeedback="Solicitud de visita técnica registrada."
      />,
    );
    // El formulario se cerró (su acción ya no aplica) y el aviso queda junto a la fila.
    expect(screen.queryByRole('button', { name: 'Confirmar solicitud' })).toBeNull();
    expect(screen.getByText('Solicitud de visita técnica registrada.')).toBeVisible();
    expect(screen.getAllByText('Solicitud de visita técnica registrada.')).toHaveLength(1);
  });

  it('H-A: el error de la visita también queda visible aunque el formulario se cierre', async () => {
    const user = userEvent.setup();
    const props = drawerProps({ ticket: ticket({ status: TicketStatus.IN_PROGRESS }) });
    const { rerender } = render(<AssuranceTicketDrawer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Solicitar visita' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar solicitud' }));
    rerender(
      <AssuranceTicketDrawer
        {...props}
        ticket={ticket({ status: TicketStatus.CLOSED })}
        actionError="Error sintético"
      />,
    );
    expect(screen.getByText('Error sintético')).toBeVisible();
  });

  it('H-B: al pasar de Resuelto a Cerrado el grupo de estado desaparece y el aviso cae arriba', async () => {
    const user = userEvent.setup();
    const props = drawerProps({ ticket: ticket({ status: TicketStatus.RESOLVED }) });
    const { rerender } = render(<AssuranceTicketDrawer {...props} />);
    await chooseStatus(user, 'Cerrado');
    await user.click(screen.getByRole('button', { name: 'Guardar estado' }));
    rerender(
      <AssuranceTicketDrawer
        {...props}
        ticket={ticket({ status: TicketStatus.CLOSED })}
        actionFeedback="Estado actualizado."
      />,
    );
    expect(screen.queryByRole('group', { name: 'Cambiar estado' })).toBeNull();
    expect(screen.getByText('Estado actualizado.')).toBeVisible();
    expect(screen.getAllByText('Estado actualizado.')).toHaveLength(1);
  });

  it('vincular orden: el aviso se ve junto a la fila de acciones', async () => {
    const user = userEvent.setup();
    const props = drawerProps({ ticket: ticket({ status: TicketStatus.IN_PROGRESS }) });
    const { rerender } = render(<AssuranceTicketDrawer {...props} />);
    // P2b §3 L: la orden se busca por número y se confirma la encontrada.
    jest.spyOn(assuranceApi.tickets, 'lookupExecutionOrder').mockResolvedValue({
      id: '8e5d0f6b-4a7c-4b9d-9e2f-3d4e5f607182',
      number: 'OTE-20261116-001',
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      closedAt: null,
      linkedTicket: 'NONE',
    });
    await user.click(screen.getByRole('button', { name: 'Vincular orden de trabajo' }));
    await user.type(screen.getByRole('textbox', { name: 'Orden de trabajo' }), 'OTE-20261116-001');
    await user.click(screen.getByRole('button', { name: 'Buscar orden' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar vínculo' }));
    rerender(
      <AssuranceTicketDrawer
        {...props}
        ticket={ticket({ status: TicketStatus.IN_PROGRESS })}
        actionFeedback="Orden de trabajo vinculada al caso."
      />,
    );
    expect(screen.getByText('Orden de trabajo vinculada al caso.')).toBeVisible();
    expect(screen.getAllByText('Orden de trabajo vinculada al caso.')).toHaveLength(1);
  });

  it('el formulario de visita se cierra al bloquearse y no reaparece solo al volver a permitirse', async () => {
    const user = userEvent.setup();
    const props = drawerProps({ ticket: ticket({ status: TicketStatus.IN_PROGRESS }) });
    const { rerender } = render(<AssuranceTicketDrawer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Solicitar visita' }));
    expect(screen.getByRole('button', { name: 'Confirmar solicitud' })).toBeInTheDocument();
    rerender(
      <AssuranceTicketDrawer
        {...props}
        ticket={ticket({ status: TicketStatus.FIELD_SERVICE_REQUESTED })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Confirmar solicitud' })).toBeNull();
    rerender(
      <AssuranceTicketDrawer
        {...props}
        ticket={ticket({ status: TicketStatus.PENDING_INTERNAL })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Solicitar visita' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'Confirmar solicitud' })).toBeNull();
  });

  it('el formulario de orden se cierra si se pierde el permiso y no reaparece solo', async () => {
    const user = userEvent.setup();
    const props = drawerProps();
    const { rerender } = render(<AssuranceTicketDrawer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Vincular orden de trabajo' }));
    // P2b §3 L: el formulario abre con el buscador por número.
    expect(screen.getByRole('button', { name: 'Buscar orden' })).toBeInTheDocument();
    rerender(<AssuranceTicketDrawer {...props} canManage={false} />);
    rerender(<AssuranceTicketDrawer {...props} canManage />);
    expect(screen.queryByRole('button', { name: 'Buscar orden' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Orden de trabajo' })).toBeNull();
  });
});

describe('AssuranceTicketDrawer P1 — CA-6 sin valores arbitrarios', () => {
  // P2a §3 K: el contenido del panel vive en `AssuranceTicketDetail.tsx` (compartido con la
  // página); se revisan el contenedor, el contenido y la página.
  it.each([
    'AssuranceTicketDrawer.tsx',
    'AssuranceTicketDetail.tsx',
    'AssuranceTicketPageClient.tsx',
  ])('%s no usa hex, text-[11px] ni espaciado de letras arbitrario', (file) => {
    const source = readFileSync(join(__dirname, file), 'utf8');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(source).not.toContain('text-[11px]');
    expect(source).not.toMatch(/tracking-\[/u);
    expect(source).not.toContain('AssuranceKeyValueItem');
  });
});
