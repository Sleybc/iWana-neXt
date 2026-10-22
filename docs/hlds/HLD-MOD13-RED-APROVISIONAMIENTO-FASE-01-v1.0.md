# HLD-MOD13 — Red y Aprovisionamiento · Fase 01: IPAM y activación certificada

**Versión:** 1.0
**Estado:** Aprobado — contrato **congelado** desde G0 (CTO, 2026-10-22). Cualquier cambio se hace por re-sync versionado.
**Fecha:** 2026-10-22
**Emisor:** AI-EM-ARCH
**PRD:** [PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md) · **ADR:** [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md)
**Base verificada:** `main` en `01a3e91b`; última migración tenant `159_subscriber_support_lookup_indexes`

---

## 1. Vista general

```mermaid
sequenceDiagram
  participant T as Técnico (portal)
  participant N as NOC (portal)
  participant OT as MOD11 tasks
  participant NET as MOD13 network
  participant W as Worker
  participant CRM as MOD05 crm
  participant INV as MOD12 inventory
  T->>OT: start() → IN_PROGRESS; registra CPE INSTALLED_AT_CUSTOMER
  N->>NET: POST /network/provisioning/reserve
  NET->>OT: ExecutionOrderReadPort.getExecutionSnapshot
  NET-->>N: RESERVED + instrucción MikroTik (adaptador manual)
  N->>NET: POST /network/provisioning/:id/certify (evidenceId)
  T->>OT: close(EXECUTED)
  OT->>NET: ServiceProvisioningReadPort.getForOrder → CERTIFIED (gate)
  OT->>W: outbox ExecutionOrderClosedV1
  W->>NET: cola network-execution-events (HMAC)
  NET->>NET: inbox → ACTIVE; emite network.service-provisioning.activated
  NET->>CRM: listener → expediente CLIENTE_ACTIVO → suscriptor ACTIVE
  NET->>INV: listener → contractRefId del comodato
```

## 2. Estructura de código

```
apps/api/src/modules/network/
  network.module.ts
  controllers/network-catalog.controller.ts        # routers, redes, perfiles por plan, ajustes
  controllers/network-provisioning.controller.ts   # reservar, certificar, liberar, regularizar, bandeja, lecturas
  services/network-catalog.service.ts
  services/ipam.service.ts
  services/service-provisioning.service.ts
  services/network-execution-event.processor.ts    # consumidor BullMQ
  services/network-provisioning-reconciler.service.ts
  ports/router-provisioning.port.ts
  adapters/manual-router-provisioning.adapter.ts
  adapters/service-provisioning-read.adapter.ts    # implementa el puerto de MOD11
  dto/*.dto.ts                                     # class-validator; espejo de los Zod de shared
  events/service-provisioning-activated.event.ts
packages/shared/src/contracts/network/             # enums, Zod, DTO de respuesta, cola firmada
packages/database/src/entities/network-*.entity.ts, ipv4-network.entity.ts, ip-assignment.entity.ts, service-provisioning.entity.ts
packages/database/src/migrations/tenant/160..163_*.ts
```

## 3. Modelo de datos (schema del tenant)

### 3.1 Migración `160_network_catalog`

```sql
CREATE TABLE network_routers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  organization_site_id uuid NULL,            -- ADR-044: referencia opcional, sin FK cruzada
  commercial_node_id uuid NULL,
  management_host varchar(255) NOT NULL,     -- IP o FQDN, sin credenciales
  lan_interface varchar(64) NULL,
  supported_control_methods varchar(40)[] NOT NULL,   -- valores de ControlMethod, al menos 1
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',       -- ACTIVE | INACTIVE
  notes text NULL,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_network_routers_methods CHECK (cardinality(supported_control_methods) >= 1),
  CONSTRAINT ck_network_routers_status CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE UNIQUE INDEX uq_network_routers_tenant_name ON network_routers (tenant_id, lower(name));

CREATE TABLE ipv4_networks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL REFERENCES network_routers(id),
  name varchar(120) NOT NULL,
  cidr cidr NOT NULL,
  gateway inet NOT NULL,
  assignable_from inet NOT NULL,
  assignable_to inet NOT NULL,
  excluded_ips inet[] NOT NULL DEFAULT '{}',
  default_control_method varchar(40) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_ipv4_family CHECK (family(cidr) = 4),
  CONSTRAINT ck_ipv4_prefix CHECK (masklen(cidr) BETWEEN 16 AND 30),
  CONSTRAINT ck_ipv4_gateway_in CHECK (gateway << cidr),
  CONSTRAINT ck_ipv4_range_in CHECK (assignable_from << cidr AND assignable_to << cidr AND assignable_from <= assignable_to),
  CONSTRAINT ck_ipv4_status CHECK (status IN ('ACTIVE','INACTIVE'))
);
-- Dos redes del mismo tenant no se solapan
ALTER TABLE ipv4_networks ADD CONSTRAINT ex_ipv4_networks_overlap
  EXCLUDE USING gist (tenant_id WITH =, cidr inet_ops WITH &&);   -- requiere btree_gist; verificar disponibilidad (§11 Q1)

CREATE TABLE network_plan_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_id uuid NOT NULL,                     -- id del plan de MOD06, sin FK cruzada
  pcq_address_list varchar(64) NOT NULL,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_network_plan_profiles UNIQUE (tenant_id, plan_id)
);

CREATE TABLE network_settings (
  tenant_id uuid PRIMARY KEY,
  enforce_provisioning_on_install_close boolean NOT NULL DEFAULT false,   -- D-NET-3: se enciende en G7, después de F2
  updated_by uuid NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.2 Migración `161_network_provisioning`

```sql
CREATE TABLE service_provisionings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  subscriber_id uuid NOT NULL,
  expediente_id uuid NULL,                   -- copiado del puerto CRM al reservar; lo usa el listener CRM
  contract_id uuid NULL,                     -- ADR-098 D8: opcional
  execution_order_id uuid NOT NULL,
  router_id uuid NOT NULL REFERENCES network_routers(id),
  ipv4_network_id uuid NOT NULL REFERENCES ipv4_networks(id),
  ip_assignment_id uuid NULL,                -- FK añadida tras crear ip_assignments
  control_method varchar(40) NOT NULL,
  control_params jsonb NOT NULL,             -- validado por ControlParamsSchema (§4.2)
  plan_id uuid NULL,
  download_mbps integer NULL, upload_mbps integer NULL,   -- copia del plan para la instrucción
  cpe_serial_number varchar(120) NULL,
  cpe_mac_address varchar(17) NULL,
  status varchar(16) NOT NULL,               -- RESERVED | CERTIFIED | ACTIVE | FAILED | RELEASED
  origin varchar(16) NOT NULL DEFAULT 'NORMAL',   -- NORMAL | REGULARIZED
  reserved_by uuid NULL, reserved_at timestamptz NULL,
  certified_by uuid NULL, certified_at timestamptz NULL, certification_evidence_id uuid NULL,
  activated_at timestamptz NULL,
  released_at timestamptz NULL, release_reason varchar(32) NULL,   -- NOT_EXECUTED|CANCELLED|ANNULLED|REPLACED|MANUAL|RECONCILED
  regularization_reason text NULL,
  failure_reason varchar(64) NULL,           -- CLOSED_WITHOUT_CERTIFICATION
  commercial_activation_status varchar(24) NOT NULL DEFAULT 'NOT_APPLICABLE',
      -- NOT_APPLICABLE | PENDING | DONE | BLOCKED; lo escribe solo el listener CRM vía comando de MOD13 (§6.4)
  commercial_activation_detail varchar(64) NULL,   -- CONTACT_REQUIRED | FISCAL_INCOMPLETE | NO_EXPEDIENTE
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_sp_status CHECK (status IN ('RESERVED','CERTIFIED','ACTIVE','FAILED','RELEASED')),
  CONSTRAINT ck_sp_origin CHECK (origin IN ('NORMAL','REGULARIZED')),
  CONSTRAINT ck_sp_certified CHECK (status NOT IN ('CERTIFIED') OR (certified_by IS NOT NULL AND certified_at IS NOT NULL AND certification_evidence_id IS NOT NULL)),
  CONSTRAINT ck_sp_regularized CHECK (origin <> 'REGULARIZED' OR regularization_reason IS NOT NULL)
);
CREATE UNIQUE INDEX uq_sp_order_live ON service_provisionings (tenant_id, execution_order_id) WHERE status <> 'RELEASED';   -- R4
CREATE INDEX idx_sp_subscriber ON service_provisionings (tenant_id, subscriber_id);
CREATE INDEX idx_sp_status ON service_provisionings (tenant_id, status);

CREATE TABLE ip_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ipv4_network_id uuid NOT NULL REFERENCES ipv4_networks(id),
  ip inet NOT NULL,
  service_provisioning_id uuid NOT NULL REFERENCES service_provisionings(id),
  status varchar(16) NOT NULL,               -- RESERVED | ACTIVE | RELEASED
  released_at timestamptz NULL, release_reason varchar(32) NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ip_status CHECK (status IN ('RESERVED','ACTIVE','RELEASED')),
  CONSTRAINT ck_ip_host CHECK (masklen(ip) = 32)
);
CREATE UNIQUE INDEX uq_ip_assignments_live ON ip_assignments (tenant_id, ip) WHERE status IN ('RESERVED','ACTIVE');   -- R1
CREATE INDEX idx_ip_assignments_network ON ip_assignments (tenant_id, ipv4_network_id, status);
ALTER TABLE service_provisionings ADD CONSTRAINT fk_sp_ip FOREIGN KEY (ip_assignment_id) REFERENCES ip_assignments(id);

CREATE TABLE network_inbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_type varchar(64) NOT NULL,
  execution_order_id uuid NOT NULL,
  processed_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_network_inbox UNIQUE (tenant_id, event_id)
);
```

### 3.3 Migración `162_seed_network_permissions`

Sigue el patrón de `151_seed_blocked_data_permission.ts`:
- siembra los seis permisos del §7;
- crea la plantilla de rol «Acceso estándar Aprovisionamiento» (`baseRoleConstraint: NOC`);
- añade los permisos a «Acceso estándar NOC» y a `ADMIN`;
- inserta la fila de `network_settings` con `false`.

Debe ser reversible.

### 3.4 Migración `163_publish_instalacion_estandar_v3`

Publica `INSTALACION_ESTANDAR` v3, que es la v2 de `131_publish_instalacion_estandar_v2.ts` más este requisito:

```json
{ "key": "service-provisioning", "kind": "PROVISIONING", "label": "Aprovisionamiento certificado", "required": true }
```

No re-congela las OT vivas: ellas quedan cubiertas por la guarda directa del §5.3.

Todas las migraciones se registran en `packages/database/src/migrations/tenant/runner.ts` y llevan su `*.integration.spec.ts` de ida y vuelta.

## 4. Contratos compartidos (`packages/shared/src/contracts/network/`)

### 4.1 Enums

```ts
export const CONTROL_METHODS = ['SIMPLE_QUEUE_STATIC_IP', 'PCQ_ADDRESS_LIST'] as const;   // D2: extensible
export type ControlMethod = (typeof CONTROL_METHODS)[number];
export const SERVICE_PROVISIONING_STATUSES = ['RESERVED','CERTIFIED','ACTIVE','FAILED','RELEASED'] as const;
export const IP_ASSIGNMENT_STATUSES = ['RESERVED','ACTIVE','RELEASED'] as const;
export const PROVISIONING_RELEASE_REASONS = ['NOT_EXECUTED','CANCELLED','ANNULLED','REPLACED','MANUAL','RECONCILED'] as const;
export const COMMERCIAL_ACTIVATION_STATUSES = ['NOT_APPLICABLE','PENDING','DONE','BLOCKED'] as const;
```

### 4.2 `controlParams` como unión discriminada

```ts
export const ControlParamsSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('SIMPLE_QUEUE_STATIC_IP'), queueName: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/) }),
  z.object({ method: z.literal('PCQ_ADDRESS_LIST'), addressList: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/) }),
]);
```

`queueName` lo propone el panel a partir del número de OT; nunca a partir del nombre del suscriptor (R14).

### 4.3 Cola firmada

```ts
export const NETWORK_EXECUTION_EVENTS_QUEUE = 'network-execution-events';            // en constants/queue-names.ts
export const NETWORK_PROVISIONING_RECONCILE_QUEUE = 'network-provisioning-reconcile'; // ídem, §6.7
export const NetworkExecutionEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(['ExecutionOrderClosedV1','ExecutionOrderCancelledV1','ExecutionOrderAnnulledV1']),
  executionOrderId: z.string().uuid(),
  aggregateVersion: z.number().int().positive(),
  result: z.enum(['EXECUTED','EXECUTED_WITH_OBSERVATIONS','NOT_EXECUTED','CANCELLED']).nullable(),   // solo Closed
  occurredAt: z.string().datetime(),
});
export const SignedNetworkExecutionEventSchema = z.object({ tenantId: z.string().uuid(), envelope: NetworkExecutionEventSchema, signature: z.string().regex(/^[0-9a-f]{64}$/) });
export function canonicalizeNetworkExecutionEvent(tenantId: string, e: NetworkExecutionEvent): string;   // JSON con claves ordenadas
```

Se firma con la misma `INTERNAL_QUEUE_SIGNING_KEY` del reenvío a inventario. La verificación se hace con `timingSafeEqual` **antes** de validar el esquema (patrón `inventory-execution-request.processor.ts:402`).

## 5. MOD11: cambios en tasks

### 5.1 `tasks/ports/execution-order-read.port.ts`

Se amplía el puerto existente:

```ts
getExecutionSnapshot(executionOrderId: string): Promise<{
  id: string; executionOrderNumber: string; status: ExecutionOrderStatus; workType: WfmWorkType;
  isAnnulled: boolean; subscriberId: string | null; assignedTechnicianId: string | null;
  closedAt: string | null; result: ExecutionOrderResult | null;
} | null>;
listInstallationOrdersClosedExecutedWithout(provisionedOrderIds: string[], page: PageQuery): Promise<Page<...mismo shape>>;  // bandeja «sin aprovisionar»
```

Se implementa en el adaptador vigente del puerto, sin importar `network`.

### 5.2 `tasks/ports/service-provisioning-read.port.ts` (nuevo)

MOD11 lo define y MOD13 lo implementa.

```ts
export const SERVICE_PROVISIONING_READ_PORT = Symbol('SERVICE_PROVISIONING_READ_PORT');
export interface ServiceProvisioningReadPort {
  getGateStatus(executionOrderId: string): Promise<{ enforced: boolean; status: ServiceProvisioningStatus | null }>;
}
```

`network.module.ts` lo provee con `adapters/service-provisioning-read.adapter.ts`. El registro sigue el patrón `EVIDENCE_ASSET_PORT` ↔ `media.module.ts`, en un módulo estrecho que evita ciclos de Nest (ADR-097).

### 5.3 Gate y guarda en `execution-orders.service.ts` `close()` (~L1922)

1. `TemplateRequirement` gana la rama `kind: 'PROVISIONING'` (`packages/shared/src/contracts/operations/execution-orders.ts:142-173`), sin campos extra.
2. `OrderEvaluationContext` gana `provisioning?: { status: ServiceProvisioningStatus | null }`.
3. `closure-gate-evaluator.service.ts` gana `evaluateProvisioning`: se cumple si `status === 'CERTIFIED'`. Si el contexto no trae `provisioning`, falla cerrado.
4. `close()`, solo cuando `work_type = INSTALLATION` y el resultado es `EXECUTED*`:
   - llama a `getGateStatus` una vez;
   - pasa `provisioning` al evaluador;
   - **guarda directa:** si `enforced && status !== 'CERTIFIED'`, lanza `UnprocessableEntityException({ code: 'CLOSURE_GATE_INCOMPLETE', missingRequirements: ['Aprovisionamiento certificado'] })`. Aplica aunque el snapshot no tenga el requisito.
5. Si el resultado es `NOT_EXECUTED`, no se consulta el puerto (R9).
6. Si el puerto falla, se lanza `CLOSURE_GATE_UNAVAILABLE`, igual que hoy.

### 5.4 Worker: `apps/worker/src/processors/execution-order-events.processor.ts`

En los handlers de `ExecutionOrderClosedV1` (~L441), `CancelledV1` y `AnnulledV1`, después de la proyección vigente:
- lee `work_type` de la OT con el `client` ya abierto;
- si es `INSTALLATION`, ejecuta `enqueueSignedNetworkEvent(tenantId, envelope)`, que copia `enqueueSignedInventoryRequest` (~L497) con `jobId = eventId`, `attempts: 8` y backoff exponencial.

El encolado ocurre en el mismo bloque `try` de la proyección: un error de encolado hace fallar el job, y BullMQ lo reintenta.

## 6. MOD13: servicios y comandos

### 6.1 IPAM (`ipam.service.ts`)

`reserveIp(manager, { networkId, provisioningId, requestedIp? })`, dentro de la transacción del comando:

```sql
SELECT pg_advisory_xact_lock(hashtextextended('ipv4:' || $networkId, 0));
-- automática
SELECT (n.assignable_from + g)::inet AS ip
FROM ipv4_networks n, generate_series(0, (n.assignable_to - n.assignable_from)) g
WHERE n.id = $networkId AND n.status = 'ACTIVE'
  AND (n.assignable_from + g) <> n.gateway
  AND (n.assignable_from + g) <> network(n.cidr) AND (n.assignable_from + g) <> broadcast(n.cidr)
  AND NOT ((n.assignable_from + g) = ANY (n.excluded_ips))
  AND NOT EXISTS (SELECT 1 FROM ip_assignments a WHERE a.tenant_id = n.tenant_id AND a.ip = (n.assignable_from + g) AND a.status IN ('RESERVED','ACTIVE'))
ORDER BY g LIMIT 1;
```

- Sin fila → `409 NETWORK_POOL_EXHAUSTED`.
- IP manual → validar en este orden y devolver el primer código que falle: `IP_OUTSIDE_RANGE`, `IP_IS_GATEWAY`, `IP_EXCLUDED`, `IP_IN_USE`.
- `INSERT` en `ip_assignments`. Ante un `23505` en `uq_ip_assignments_live`, se reintenta una vez; si vuelve a fallar, `409 IP_IN_USE`.

`getOccupancy(networkId) → { total, reserved, active, free }` alimenta la barra de ocupación.

### 6.2 Endpoints (prefijo `/api/v1`; todos con `JwtAuthGuard`, `TenantGuard` y `@Permissions`)

**Catálogo** (`network-catalog.controller.ts`)

| Método y ruta | Permiso | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| `GET /network/routers?status&q&page&pageSize` | `network.catalog.read` | — | `Page<RouterDto>` |
| `POST /network/routers` | `network.catalog.manage` | `{ name, managementHost, lanInterface?, supportedControlMethods: ControlMethod[], organizationSiteId?, commercialNodeId?, notes? }` | `RouterDto` |
| `PATCH /network/routers/:id` | `network.catalog.manage` | Igual, todo opcional, más `version` (409 `VERSION_CONFLICT`) | `RouterDto` |
| `POST /network/routers/:id/deactivate` · `/activate` | `network.catalog.manage` | `{ version }` | `RouterDto` |
| `GET /network/ipv4-networks?routerId&status&page&pageSize` | `network.catalog.read` | — | `Page<Ipv4NetworkDto>` con `occupancy` |
| `POST /network/ipv4-networks` | `network.catalog.manage` | `{ routerId, name, cidr, gateway, assignableFrom, assignableTo, excludedIps?: string[], defaultControlMethod }` | `Ipv4NetworkDto` |
| `PATCH /network/ipv4-networks/:id` | `network.catalog.manage` | `{ name?, assignableFrom?, assignableTo?, excludedIps?, defaultControlMethod?, version }`. `cidr` y `gateway` no se editan; una IP activa no puede quedar fuera del rango ni excluida (409 `IP_IN_USE`) | `Ipv4NetworkDto` |
| `POST /network/ipv4-networks/:id/deactivate` · `/activate` | `network.catalog.manage` | `{ version }` | `Ipv4NetworkDto` |
| `GET /network/plan-profiles` · `PUT /network/plan-profiles/:planId` | `read` · `manage` | `{ pcqAddressList }` | `PlanProfileDto` |
| `GET /network/settings` · `PATCH /network/settings` | `read` · `manage` | `{ enforceProvisioningOnInstallClose: boolean }` | `NetworkSettingsDto`. Se audita el cambio |

Validaciones del catálogo:
- `defaultControlMethod` ∈ `supportedControlMethods` del router (`CONTROL_METHOD_NOT_SUPPORTED`);
- solapamiento de redes → `409 NETWORK_OVERLAP`.

**Aprovisionamiento** (`network-provisioning.controller.ts`)

| Método y ruta | Permiso | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| `GET /network/provisioning/orders/:executionOrderId/context` | `network.provisioning.read`, **o** `operations.execution_orders.read` **siendo** `assignedTechnicianId` de esa OT (si no lo es → 403). La regla vive en el servicio, no en el decorador | — | `ProvisioningOrderContextDto` (§6.5). Para el técnico, se omiten `contracts`, `evidences` y `routerInstruction` |
| `POST /network/provisioning/reserve` | `network.provisioning.execute` | `{ executionOrderId, routerId, ipv4NetworkId, requestedIp?: string, controlParams: ControlParams, contractId?: string }` | `ServiceProvisioningDto` + `routerInstruction` |
| `POST /network/provisioning/:id/certify` | `network.provisioning.certify` | `{ evidenceId: uuid, version }` | `ServiceProvisioningDto` |
| `POST /network/provisioning/:id/release` | `network.provisioning.execute` para `RESERVED`; **`network.provisioning.certify`** para `CERTIFIED` (deshacer una certificación es tan sensible como hacerla, R6 bis) | `{ version, reason (10–500) }`. Solo con la OT abierta; motivo `MANUAL`; auditado con el motivo | `ServiceProvisioningDto` |
| `POST /network/provisioning/regularize` | `network.provisioning.regularize` | `{ executionOrderId, routerId, ipv4NetworkId, requestedIp?, controlParams, contractId?, reason (10–500) }` | `ServiceProvisioningDto` |
| `GET /network/provisioning/inbox?queue=IN_EXECUTION\|FAILED\|CLOSED_UNPROVISIONED&page&pageSize` | `network.provisioning.read` | — | `Page<ProvisioningInboxRowDto>` |
| `GET /network/provisioning/subscribers/:subscriberId` | `network.provisioning.read` o `crm.subscribers.read` (ver §11 Q2) | — | `ServiceProvisioningDto[]` |

Reglas de `reserve` (R3, R4, R5), en una sola transacción:
1. Leer `getExecutionSnapshot`. Si no está `IN_PROGRESS`, no es `INSTALLATION`, está anulada o no tiene suscriptor → `422 PROVISIONING_ORDER_NOT_ELIGIBLE`.
2. Router y red `ACTIVE` y la red pertenece al router (`NETWORK_NOT_IN_ROUTER`). `controlParams.method` ∈ `supportedControlMethods` (`CONTROL_METHOD_NOT_SUPPORTED`).
3. Contexto comercial por `SubscriberServiceContextReadPort`: `expedienteId`, `planId`, velocidades. Si llega `contractId`, debe ser del suscriptor (`CONTRACT_NOT_OF_SUBSCRIBER`).
4. CPE por `InstalledEquipmentReadPort`: primer serial `INSTALLED_AT_CUSTOMER` de la OT. Si no hay, se guarda nulo y la instrucción lo advierte.
5. Si existe un servicio vivo (`RESERVED` o `CERTIFIED`) para la OT: se libera con `REPLACED`, junto con su IP.
6. Insertar el servicio `RESERVED`, llamar a `IpamService.reserveIp` y enlazar `ip_assignment_id`.
7. `routerInstruction = RouterProvisioningPort.apply(...)`. El adaptador manual devuelve `{ mode: 'MANUAL', steps: string[] }`.
8. Auditoría `UPDATE ServiceProvisioning` con `{ action: 'RESERVE', ip, routerId, executionOrderId }`, sin datos del suscriptor.

Idempotencia natural: repetir `reserve` con los mismos `routerId`, `ipv4NetworkId`, `requestedIp` y `controlParams` sobre una reserva viva devuelve la misma, sin liberarla.

Reglas de `certify` (R6, R7, R8):
- Servicio `RESERVED` (`409 PROVISIONING_STATE_INVALID`) y OT `IN_PROGRESS` (`422 PROVISIONING_ORDER_NOT_ELIGIBLE`).
- `actor.sub !== assignedTechnicianId` → si no, `403 PROVISIONING_CERTIFIER_IS_EXECUTOR`.
- `evidenceId` debe existir en `execution_order_evidence` de esa OT con `evidence_type IN ('PHOTO','DOCUMENT')`. La lectura va por `getExecutionSnapshot`, ampliado con `hasEvidence(executionOrderId, evidenceId, types)` en el mismo puerto. Si no → `422 PROVISIONING_EVIDENCE_REQUIRED`.
- Si ya está `CERTIFIED` con la misma evidencia, devuelve el mismo estado.

### 6.3 Consumidor `network-execution-event.processor.ts` (cola `network-execution-events`)

1. Verificar la firma antes de validar (`UnrecoverableError` si no coincide).
2. `TenantContext.run`, igual que `inventory-execution-request.processor.ts:215`.
3. `INSERT ... ON CONFLICT DO NOTHING` en `network_inbox_events`. Si ya tiene `processed_at`, terminar.
4. Según el evento y el servicio vivo de la OT:

| Evento | Servicio vivo | Efecto |
| --- | --- | --- |
| `Closed`, `result ∈ EXECUTED*` | `CERTIFIED` | Servicio e IP pasan a `ACTIVE`, `activated_at = now()`; `commercial_activation_status = PENDING`; se emite `network.service-provisioning.activated` |
| `Closed`, `EXECUTED*` | `RESERVED` | Servicio `FAILED` (`CLOSED_WITHOUT_CERTIFICATION`); la IP sigue `RESERVED` hasta regularizar o liberar |
| `Closed`, `EXECUTED*` | ninguno | Nada; la OT aparece en `CLOSED_UNPROVISIONED` |
| `Closed`, `NOT_EXECUTED` o `CANCELLED` · `CancelledV1` · `AnnulledV1` | `RESERVED` o `CERTIFIED` | Servicio e IP pasan a `RELEASED`, con el motivo correspondiente |
| cualquiera | `ACTIVE` | Nada (idempotencia) |

5. Marcar `processed_at`. Ante un error: `last_error` y relanzar para que BullMQ reintente.

### 6.4 Evento de activación y listeners

```ts
// network/events/service-provisioning-activated.event.ts
export class ServiceProvisioningActivatedEvent {
  constructor(public tenantId: string, public schemaName: string, public serviceProvisioningId: string,
              public subscriberId: string, public expedienteId: string | null, public contractId: string | null,
              public executionOrderId: string, public cpeSerialNumber: string | null) {}
}
// nombre: 'network.service-provisioning.activated'; se emite con emitAsync dentro del job
```

**CRM** (`crm/subscribers/listeners/service-provisioning-activation.listener.ts`, `@OnEvent(..., { suppressErrors: false })`):
- `expedienteId` nulo → `NO_EXPEDIENTE`.
- Si no, `ExpedienteService.transitionStatus(expedienteId, { targetStatus: CLIENTE_ACTIVO }, SYSTEM_ACTOR)`. Eso emite `crm.expediente.activated`, que ya existe.
- Después lee el suscriptor:
  - `ACTIVE` → `DONE`;
  - sin contacto real → `BLOCKED/CONTACT_REQUIRED`;
  - la transición del suscriptor falla por completitud fiscal → `BLOCKED/FISCAL_INCOMPLETE`.
- El resultado se publica con `ServiceProvisioningCommercialStatusPort.record(serviceProvisioningId, status, detail)`, puerto que **define CRM** y que MOD13 implementa. Así CRM no escribe tablas de MOD13.
- `SYSTEM_ACTOR`: usar el actor de sistema que ya acepta `resolveStatusChangeActorId` (cae a `createdBy` del expediente); no inventar un UUID.
- Si el expediente ya está en `CLIENTE_ACTIVO`, no hace nada y solo registra el estado.

**Inventario** (`inventory/listeners/service-provisioning-activation.listener.ts`): si `contractId` y `cpeSerialNumber` no son nulos, `UPDATE` sobre `serialized_assets.contract_ref_id` y sobre `asset_loan_assignments.contract_ref_id`, filtrando por serial, `subscriber_ref_id` y `removed_at IS NULL`. Es idempotente.

**Fallo del listener CRM:** se deja en `PENDING`, se registra `last_error` en el inbox y el job falla para reintentar. Test obligatorio que provoque ese fallo dentro de `@OnEvent` real (memoria de E-3: `suppressErrors`).

### 6.5 `ProvisioningOrderContextDto`

```ts
{
  executionOrder: { id, executionOrderNumber, status, workType, assignedTechnicianId, canCertify: boolean },  // canCertify = permiso && sub ≠ técnico
  subscriber: { id, displayLabel },                 // label de la OT (customer_display_label); sin documento ni teléfono
  plan: { planId, name, downloadMbps, uploadMbps, pcqAddressList: string | null } | null,
  contracts: Array<{ id, alias, status }>,
  cpe: { serialNumber, macAddress, model } | null,
  evidences: Array<{ id, evidenceType, requirementKey, createdAt }>,   // solo PHOTO y DOCUMENT
  provisioning: ServiceProvisioningDto | null,
  suggestedQueueName: string                        // `${executionOrderNumber}`, saneado
}
```

### 6.6 `RouterProvisioningPort`

```ts
export interface RouterProvisioningPort {
  apply(i: { routerId; ip; controlParams; macAddress?; downloadMbps?; uploadMbps? }): Promise<RouterInstruction>;
  remove(i: { routerId; ip; controlParams }): Promise<RouterInstruction>;
  suspend(i: { routerId; ip; controlParams }): Promise<RouterInstruction>;   // no se usa en Fase 01
  sync(routerId: string): Promise<{ supported: false }>;
}
export type RouterInstruction = { mode: 'MANUAL'; steps: string[] } | { mode: 'APPLIED'; reference: string };
```

El adaptador manual genera `steps` en sintaxis RouterOS de referencia:
- `SIMPLE_QUEUE_STATIC_IP`: `/queue simple add name=<queueName> target=<ip>/32 max-limit=<up>M/<down>M`
- `PCQ_ADDRESS_LIST`: `/ip firewall address-list add list=<addressList> address=<ip>`

### 6.7 Reconciliador

Job repetible cada 15 minutos en el API, en la cola `network-provisioning-reconcile` y con el patrón de `apps/api/src/modules/privacy/alerts/privacy-due-alerts.processor.ts`: `repeat`, un job por schema activo y `jobId` determinista. Para cada servicio `RESERVED` o `CERTIFIED` cuya OT, según `getExecutionSnapshot`, ya no está `IN_PROGRESS`, aplica la tabla del §6.3 como si llegara el evento, con `release_reason = 'RECONCILED'` cuando libera.

## 7. Permisos (`AccessPermissionKey`, catálogo `MOD13_NETWORK_V1`)

| Clave | ADMIN (sujeto a D-NET-4 para `certify`) | NOC / «Acceso estándar Aprovisionamiento» | TECHNICIAN |
| --- | --- | --- | --- |
| `network.catalog.read` | ✓ | ✓ | — |
| `network.catalog.manage` | ✓ | ✓ | — |
| `network.provisioning.read` | ✓ | ✓ | — (ve el estado de sus OT por la excepción del endpoint `context`, §6.2; **nunca** la bandeja ni `subscribers/:id`) |
| `network.provisioning.execute` | ✓ | ✓ | — |
| `network.provisioning.certify` | ✓ | ✓ | — |
| `network.provisioning.regularize` | ✓ | — | — |

Se añaden en `access-control.constants.ts`, tanto en `ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2` como en las plantillas.

## 8. Puertos con dueño

| Puerto | Archivo | Define | Implementa | Consume |
| --- | --- | --- | --- | --- |
| `ExecutionOrderReadPort` (+`getExecutionSnapshot`, `hasEvidence`, `listInstallationOrdersClosedExecutedWithout`) | `tasks/ports/execution-order-read.port.ts` | MOD11 | MOD11 | MOD13 |
| `ServiceProvisioningReadPort` | `tasks/ports/service-provisioning-read.port.ts` | MOD11 | MOD13 | MOD11 |
| `SubscriberServiceContextReadPort` | `crm/ports/subscriber-service-context-read.port.ts` | MOD05 | MOD05 (expediente, `interested_plan_id` o plan del contrato, velocidades vía catálogo, contratos) | MOD13 |
| `ServiceProvisioningCommercialStatusPort` | `crm/ports/service-provisioning-commercial-status.port.ts` | MOD05 | MOD13 | MOD05 |
| `InstalledEquipmentReadPort` | `inventory/ports/installed-equipment-read.port.ts` | MOD12 | MOD12 (`serialized_assets` + `asset_loan_assignments` por `execution_order_ref_id`) | MOD13 |
| `RouterProvisioningPort` | `network/ports/router-provisioning.port.ts` | MOD13 | MOD13 (manual) | MOD13 |

## 9. UI del portal (`apps/portal`)

| Ruta o componente | Contenido | Permiso |
| --- | --- | --- |
| `app/dashboard/network/routers/page.tsx` | Tabla con paginación numerada (ADR-065); alta y edición en drawer | `catalog.read` (acciones con `manage`) |
| `app/dashboard/network/ipv4-networks/page.tsx` | Tabla con filtro por router y barra de ocupación; alta y edición en drawer | ídem |
| `app/dashboard/network/provisioning/page.tsx` | Bandeja con tres pestañas: En ejecución · Sin aprovisionar (`FAILED`) · Cerradas sin aprovisionar. Regularizar desde la tercera | `provisioning.read` |
| `components/operations/ExecutionOrderProvisioningPanel.tsx` | En la OT: estado, reservar (router → red → IP automática o manual → método y parámetros → contrato), instrucción copiable, certificar con la evidencia elegida. El técnico solo ve el estado y la IP | `provisioning.read` / `execute` / `certify` |
| `ExecutionOrderRequirementIndex.tsx`, `ExecutionOrderCloseSection.tsx` | Fila del requisito «Aprovisionamiento certificado» y el faltante como acción | — |
| `components/crm/subscribers/SubscriberTechnicalServiceSection.tsx` en `SubscriberDetailClient.tsx` (pestaña «Servicios») | IP, router, red, método, CPE, estado, certificó/cuándo, origen y «Activación comercial pendiente» | `provisioning.read` o el de §11 Q2 |
| Navegación | Grupo «Red» en el menú del portal y en `docs/directorio-modulos.md` | — |

## 10. Trazabilidad regla → campo

| Regla / CA | Campo, endpoint o puerto que la soporta |
| --- | --- |
| R1, CA-NET-02 | `uq_ip_assignments_live` + lock §6.1 |
| R2, CA-NET-01/03 | Consulta §6.1 (`gateway`, `network()`, `broadcast()`, `excluded_ips`), códigos `IP_*` |
| R3, CA-NET-04 | `getExecutionSnapshot` (`status`, `workType`, `isAnnulled`, `subscriberId`) → `PROVISIONING_ORDER_NOT_ELIGIBLE` |
| R4 | `uq_sp_order_live` + liberación `REPLACED` §6.2 paso 5 |
| R5 | `network_routers.supported_control_methods`, `ControlParamsSchema`, `network_plan_profiles.pcq_address_list` |
| R6, CA-NET-05 | `getExecutionSnapshot.assignedTechnicianId` vs `actor.sub` → 403 |
| R6 bis | `release` con `network.provisioning.certify` para `CERTIFIED` + `reason` auditado (§6.2) |
| R7 | `hasEvidence` + `service_provisionings.certification_evidence_id` + `ck_sp_certified` |
| R8 | Estados §6.2 `certify` |
| R9, CA-NET-06 | `ServiceProvisioningReadPort.getGateStatus` + `network_settings.enforce_provisioning_on_install_close` + `kind: 'PROVISIONING'` + guarda §5.3 |
| R10 | Tabla §6.3, fila `RESERVED` → `FAILED`; inbox `CLOSED_UNPROVISIONED` vía `listInstallationOrdersClosedExecutedWithout` |
| R11, CA-NET-10 | Listener CRM §6.4 → `commercial_activation_status` y `commercial_activation_detail` |
| R12, CA-NET-11 | `POST /regularize` + `origin`, `regularization_reason`, `ck_sp_regularized` |
| R13 | `status` de router y red; reserva exige `ACTIVE` |
| R14 | `queueName` desde el número de OT; auditoría sin PII; `subscriber.displayLabel` = label de la OT |
| CA-NET-07 | Evento §6.4 + listener CRM + listener Inventario (`contract_ref_id`) |
| CA-NET-08 | Tabla §6.3, filas de liberación + reconciliador §6.7 |
| CA-NET-09 | `uq_network_inbox` |
| CA-NET-12 | `@Permissions` §6.2 + matriz §7 |
| CA-NET-13 | `GET /network/provisioning/inbox` |
| CA-NET-14 | §9 + gate G5 de identidad (bloque V4) |

**Caminos que crean o mutan `service_provisionings`** (memoria «trazar todos los caminos»):
1. `reserve`
2. `certify`
3. `release`
4. `regularize`
5. el consumidor §6.3
6. el reconciliador §6.7
7. `ServiceProvisioningCommercialStatusPort.record`

No hay seeds ni backfill. Cada camino respeta `ck_sp_certified` y `ck_sp_regularized`.

## 11. Preguntas abiertas que **no** bloquean la Ola 1

| ID | Pregunta | Quién la cierra | Por defecto |
| --- | --- | --- | --- |
| Q1 | ¿Está disponible la extensión `btree_gist` en el Postgres de despliegue? | data-eng en D1 | Si no lo está, el solapamiento se valida en el servicio bajo un lock por tenant y se elimina el `EXCLUDE` |
| Q2 | ¿La sección del suscriptor usa `crm.subscribers.read` o exige `network.provisioning.read`? | sec-eng en S0 | `network.provisioning.read`. Quien no lo tenga no ve la sección |
| Q3 | Plan de un suscriptor sin contrato | Resuelto: `expediente_records.interested_plan_id` vía el puerto CRM | — |
