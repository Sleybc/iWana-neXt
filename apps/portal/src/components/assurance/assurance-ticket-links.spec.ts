/**
 * QA2 · CA-12 — enlaces del detalle del ticket (spec MOD10 2026-11-16 v1.1 §3 L).
 * Una prueba por regla: cada destino exige el permiso de lectura de su módulo y un UUID válido;
 * sin cualquiera de los dos, el helper devuelve `null` y la pantalla muestra texto.
 */
import { AccessPermissionKey } from '@iwana/shared';
import {
  getTicketExecutionOrderHref,
  getTicketPartyProfileHref,
  getTicketVisitHref,
  isUuid,
  TICKET_PARTY_PROFILE_PERMISSION,
} from './assurance-ticket-links';

const SUBSCRIBER_ID = '5b2a7c3e-1d4f-4e6a-8b9c-0a1b2c3d4e5f';
const EXPEDIENTE_ID = '6c3b8d4f-2e5a-4f7b-9c0d-1b2c3d4e5f60';
const VISIT_ID = '7d4c9e5a-3f6b-4a8c-8d1e-2c3d4e5f6071';
const ORDER_ID = '8e5d0f6b-4a7c-4b9d-9e2f-3d4e5f607182';

const INVALID_IDS = [
  '../../settings',
  'UISP-123',
  '',
  `${SUBSCRIBER_ID}/../x`,
  `${SUBSCRIBER_ID}?tab=billing`,
  '5b2a7c3e1d4f4e6a8b9c0a1b2c3d4e5f',
  'javascript:alert(1)',
] as const;

function only(...granted: AccessPermissionKey[]) {
  const set = new Set(granted);
  return (permission: AccessPermissionKey) => set.has(permission);
}

const none = () => false;

describe('QA2 CA-12 · isUuid', () => {
  it('acepta un UUID v4 sin distinguir mayúsculas', () => {
    expect(isUuid(SUBSCRIBER_ID)).toBe(true);
    expect(isUuid(SUBSCRIBER_ID.toUpperCase())).toBe(true);
  });

  it.each([...INVALID_IDS, null, undefined, 42])('rechaza %p', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});

describe('QA2 CA-12 · ficha del solicitante o del relacionado', () => {
  it('cada tipo de ficha exige el permiso de lectura de su módulo', () => {
    expect(TICKET_PARTY_PROFILE_PERMISSION).toEqual({
      SUBSCRIBER: AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      EXPEDIENTE: AccessPermissionKey.CRM_EXPEDIENTES_READ,
    });
  });

  it('suscriptor con crm.subscribers.read: enlaza a su ficha', () => {
    expect(
      getTicketPartyProfileHref(
        { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID },
        only(AccessPermissionKey.CRM_SUBSCRIBERS_READ),
      ),
    ).toBe(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}`);
  });

  it('suscriptor sin crm.subscribers.read: no enlaza aunque tenga el de expedientes', () => {
    expect(
      getTicketPartyProfileHref(
        { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID },
        only(AccessPermissionKey.CRM_EXPEDIENTES_READ),
      ),
    ).toBeNull();
  });

  it('expediente con crm.expedientes.read: enlaza a su ficha', () => {
    expect(
      getTicketPartyProfileHref(
        { kind: 'EXPEDIENTE', id: EXPEDIENTE_ID },
        only(AccessPermissionKey.CRM_EXPEDIENTES_READ),
      ),
    ).toBe(`/dashboard/crm/expedientes/${EXPEDIENTE_ID}`);
  });

  it('expediente sin crm.expedientes.read: no enlaza aunque tenga el de suscriptores', () => {
    expect(
      getTicketPartyProfileHref(
        { kind: 'EXPEDIENTE', id: EXPEDIENTE_ID },
        only(AccessPermissionKey.CRM_SUBSCRIBERS_READ),
      ),
    ).toBeNull();
  });

  it('sin ficha (null o undefined): no enlaza', () => {
    const all = () => true;
    expect(getTicketPartyProfileHref(null, all)).toBeNull();
    expect(getTicketPartyProfileHref(undefined, all)).toBeNull();
  });

  it.each(INVALID_IDS)('identificador no válido %p: no enlaza aunque haya permiso', (id) => {
    expect(getTicketPartyProfileHref({ kind: 'SUBSCRIBER', id }, () => true)).toBeNull();
    expect(getTicketPartyProfileHref({ kind: 'EXPEDIENTE', id }, () => true)).toBeNull();
  });

  it('un tipo de ficha desconocido no enlaza', () => {
    expect(
      getTicketPartyProfileHref({ kind: 'CONTRACT' as never, id: SUBSCRIBER_ID }, () => true),
    ).toBeNull();
  });
});

describe('QA2 CA-12 · visita técnica', () => {
  it('con wfm.schedule.read: enlaza a la bandeja de visitas con la visita seleccionada', () => {
    expect(getTicketVisitHref(VISIT_ID, only(AccessPermissionKey.WFM_SCHEDULE_READ))).toBe(
      `/dashboard/scheduling/pending-visits?selectedVisitRequestId=${VISIT_ID}`,
    );
  });

  it('con evento agendado: abre el evento en la agenda (spec MOD09 agenda §3 G)', () => {
    expect(
      getTicketVisitHref(VISIT_ID, only(AccessPermissionKey.WFM_SCHEDULE_READ), ORDER_ID),
    ).toBe(`/dashboard/scheduling/agenda?eventId=${ORDER_ID}`);
  });

  it('con evento nulo o no válido: conserva el enlace a la bandeja de visitas', () => {
    const allowed = only(AccessPermissionKey.WFM_SCHEDULE_READ);
    const inbox = `/dashboard/scheduling/pending-visits?selectedVisitRequestId=${VISIT_ID}`;
    expect(getTicketVisitHref(VISIT_ID, allowed, null)).toBe(inbox);
    expect(getTicketVisitHref(VISIT_ID, allowed, '../../settings')).toBe(inbox);
  });

  it('con evento pero sin wfm.schedule.read: no enlaza', () => {
    expect(getTicketVisitHref(VISIT_ID, none, ORDER_ID)).toBeNull();
  });

  it('sin wfm.schedule.read: no enlaza aunque tenga los demás permisos', () => {
    expect(
      getTicketVisitHref(
        VISIT_ID,
        only(
          AccessPermissionKey.CRM_SUBSCRIBERS_READ,
          AccessPermissionKey.CRM_EXPEDIENTES_READ,
          AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
        ),
      ),
    ).toBeNull();
    expect(getTicketVisitHref(VISIT_ID, none)).toBeNull();
  });

  it.each([...INVALID_IDS, null, undefined])('identificador no válido %p: no enlaza', (id) => {
    expect(getTicketVisitHref(id, () => true)).toBeNull();
  });
});

describe('QA2 CA-12 · orden de trabajo', () => {
  it('con operations.execution_orders.read: enlaza a su consola', () => {
    expect(
      getTicketExecutionOrderHref(
        ORDER_ID,
        only(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ),
      ),
    ).toBe(`/dashboard/operations/execution-orders?executionOrderId=${ORDER_ID}`);
  });

  it('sin operations.execution_orders.read: no enlaza aunque tenga los demás permisos', () => {
    expect(
      getTicketExecutionOrderHref(
        ORDER_ID,
        only(
          AccessPermissionKey.CRM_SUBSCRIBERS_READ,
          AccessPermissionKey.CRM_EXPEDIENTES_READ,
          AccessPermissionKey.WFM_SCHEDULE_READ,
        ),
      ),
    ).toBeNull();
    expect(getTicketExecutionOrderHref(ORDER_ID, none)).toBeNull();
  });

  it.each([...INVALID_IDS, null, undefined])('identificador no válido %p: no enlaza', (id) => {
    expect(getTicketExecutionOrderHref(id, () => true)).toBeNull();
  });
});
