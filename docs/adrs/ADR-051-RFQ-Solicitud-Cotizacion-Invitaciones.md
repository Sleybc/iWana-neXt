# ADR-051: RFQ / Solicitud de cotizacion con invitaciones a proveedores (Niveles 1 y 2)

**Version:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO
**Fecha:** 2026-07-11
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM (submodulo Compras)
**PRD relacionado:** docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
**ADR antecedente:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
**ADR relacionado:** docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md
**Plan:** docs/plans/2026-07-11-mod12-compras-rfq-fase-04.md
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD12-COMPRAS-RFQ-FASE-04-v1.0.md

---

## Contexto

El submodulo de Compras de MOD12 cubre hoy: solicitud por lineas (`PurchaseRequest`), registro de cotizaciones sueltas (`SupplierQuote`, por monto total), aprobacion por politica, adjudicacion por linea (`PurchaseRequestLineAward`), orden de compra por proveedor y recepcion contra OC.

Falta el paso que el negocio describe entre la solicitud y la cotizacion: **elegir un listado de proveedores y enviarles la solicitud de cotizacion (RFQ), con seguimiento de quien fue invitado, quien respondio y quien declino**. Hoy `addSupplierQuote` inserta una cotizacion suelta y, como efecto lateral, mueve la solicitud a `PENDING_APPROVAL`; no existe entidad que represente "a quien le pedi cotizacion" ni un artefacto para entregarle al proveedor el listado solicitado.

El negocio pidio dos niveles de ambicion para "invitar N proveedores":

- **Nivel 1 — solo en sistema:** registrar los proveedores invitados y su seguimiento (invitado / respondio / declino). El comprador contacta al proveedor por su medio habitual y registra en el sistema la cotizacion que recibe. Cero envio automatico al exterior.
- **Nivel 2 — PDF descargable:** el sistema genera un PDF de la solicitud de cotizacion (lineas, cantidades, datos del tenant) que el comprador descarga y envia el mismo. Sin envio automatico.

Se excluyen explicitamente de este ADR el **envio automatico de correo** (accion hacia el exterior, requiere infraestructura y confirmacion; futuro) y el **portal de proveedor**.

---

## Decision

Se adopta una capa de **RFQ (Solicitud de cotizacion)** dentro de MOD12, modelada como sub-maquina de estados desacoplada del estado de la `PurchaseRequest`, con invitaciones por proveedor y exportacion PDF.

### Alcance de esta decision

**Nivel 1 (invitacion + seguimiento):**

1. Nueva entidad `PurchaseRfq` que agrupa una ronda de cotizacion originada desde una `PurchaseRequest`.
2. Nueva entidad `PurchaseRfqInvitation` (una por proveedor invitado) con seguimiento de estado.
3. La captura de cotizacion existente (`SupplierQuote`) se puede vincular opcionalmente a una invitacion; al hacerlo, la invitacion pasa a `RESPONDED`.
4. La sub-maquina de RFQ **no agrega estados nuevos a `PurchaseRequestStatus`**: `PENDING_QUOTES` se reinterpreta como "RFQ activa recibiendo cotizaciones". Retrocompatible con datos y con la politica de aprobacion vigente.

**Nivel 2 (PDF):**

5. Generacion server-side de un PDF de la solicitud de cotizacion a partir de la RFQ y sus lineas, descargable por el comprador. Se introduce la dependencia `pdfkit` en `apps/api` (libreria server-side, sin navegador headless).

### Modelo de datos (borrador)

**`purchase_rfqs`** (nueva): `id`, `tenant_id`, `purchase_request_id` (FK), `rfq_number` (`RFQ-NNNNNN`), `status` (enum `purchase_rfq_status`), `currency`, `response_deadline` (nullable), `sent_at` / `closed_at` (nullable), `created_by_user_id` (nullable), `notes` (nullable), timestamps.
Indices: `(tenant_id, purchase_request_id)`, `(tenant_id, status)`. Unico parcial: una sola RFQ activa por solicitud `WHERE status IN ('DRAFT','SENT','RECEIVING')`.

**`purchase_rfq_invitations`** (nueva): `id`, `tenant_id`, `rfq_id` (FK ON DELETE CASCADE), `party_ref_id` (referencia a MOD08 Parties, sin FK cross-module), `status` (enum `purchase_rfq_invitation_status`), `invited_at` / `responded_at` / `declined_at` (nullable), `decline_reason` (nullable), timestamps.
Indices: `(tenant_id, rfq_id)`, `(tenant_id, party_ref_id)`. Unico: `(rfq_id, party_ref_id)` (idempotencia de invitacion).

**`supplier_quotes`** (modificada): agregar `rfq_id` (uuid, nullable, FK) y `rfq_invitation_id` (uuid, nullable, FK). Nullable = las cotizaciones manuales/legado siguen validas sin RFQ. Unico parcial `(rfq_invitation_id) WHERE rfq_invitation_id IS NOT NULL` (una cotizacion por invitacion).

### Enums nuevos (`packages/shared/src/enums/inventory/`)

- `PurchaseRfqStatus { DRAFT, SENT, RECEIVING, CLOSED, CANCELLED }`
- `PurchaseRfqInvitationStatus { INVITED, RESPONDED, DECLINED, EXPIRED, CANCELLED }`

### Maquina de estados RFQ

```text
DRAFT --enviar--> SENT --1a respuesta--> RECEIVING --cerrar--> CLOSED
  |                |                          |
  +------------ CANCELLED <-------------------+
```

- `DRAFT`: RFQ armada, aun sin invitar/enviar. PR permanece en su estado.
- `SENT`: invitaciones emitidas; PR -> `PENDING_QUOTES`; lineas `OPEN` -> `PENDING_QUOTE`.
- `RECEIVING`: al menos una invitacion `RESPONDED`.
- `CLOSED`: cierre de recepcion; invitaciones sin respuesta -> `EXPIRED`; PR -> `PENDING_APPROVAL` (habilita el flujo de aprobacion/adjudicacion existente).
- `CANCELLED`: RFQ anulada (idempotente).

Invitacion: `INVITED --cotiza--> RESPONDED`; `INVITED --declina--> DECLINED`; `--cierre sin respuesta--> EXPIRED`; `--cancelar RFQ--> CANCELLED`.

### Superficie de API (borrador)

Roles ADMIN/NOC/SUPPORT, Zod, multi-tenant, bajo `/purchasing`:

- `POST /requests/:id/rfq` — crear RFQ `DRAFT`.
- `POST /rfqs/:rfqId/invitations` — invitar N proveedores (idempotente).
- `POST /rfqs/:rfqId/send` — `DRAFT -> SENT`, PR -> `PENDING_QUOTES`.
- `POST /rfqs/:rfqId/invitations/:invId/decline` — marcar declino.
- `POST /rfqs/:rfqId/close` — cerrar ronda.
- `GET /rfqs/:rfqId` — detalle + tablero de invitaciones.
- `GET /rfqs/:rfqId/pdf` — **Nivel 2**, PDF descargable.
- `POST /requests/:id/quotes` (existente) — extendido para aceptar `rfqInvitationId` opcional que marca la invitacion `RESPONDED`.

---

## Reglas de boundary

1. RFQ vive dentro de MOD12; no crea bounded context nuevo.
2. Proveedores se referencian por `party_ref_id` (MOD08 Parties); sin FK cross-module ni `partyRefId` visible como texto en UI.
3. No se agregan estados nuevos a `PurchaseRequestStatus`; la sub-maquina RFQ es la unica que introduce estados.
4. La generacion de PDF no envia nada al exterior; solo produce un archivo descargable.
5. El PDF no incluye PII no necesaria ni datos sensibles; se limita a lineas, cantidades, datos del tenant y proveedor.
6. Todas las operaciones CUD pasan por `AuditInterceptor`; sin secretos/PII en logs.
7. El envio automatico por correo y el portal de proveedor quedan fuera; su incorporacion futura exige revision (accion hacia el exterior) y, para portal, ADR propio.

---

## Consecuencias

### Positivas

- Cierra el paso faltante entre solicitud y cotizacion con seguimiento real de proveedores invitados.
- Retrocompatible: cotizaciones manuales sin RFQ siguen funcionando; no rompe el flujo de aprobacion/adjudicacion/OC existente.
- El PDF profesionaliza la solicitud al proveedor sin asumir el riesgo de enviar correo en nombre del tenant.
- Base para incorporar despues cotizacion por linea, comparacion por item y envio automatico, sin re-trabajo estructural.

### Costos y tradeoffs

- Dos tablas nuevas + alter de `supplier_quotes` -> migraciones tenant reversibles.
- Nueva dependencia `pdfkit` en la API (server-side, sin navegador). Requiere plantilla de documento y pruebas de render.
- Complejidad adicional en el workbench de Compras (nueva pestana RFQ y seguimiento).

### Riesgos aceptados

- Multiples RFQ por solicitud: el unico parcial permite reabrir una segunda ronda tras `CLOSED`/`CANCELLED`. Definir si el negocio quiere historial de rondas o una sola queda como decision de producto a confirmar (se asume soporte de reapertura).
- La comparacion sigue siendo por total mientras no exista cotizacion por linea (ADR posterior); la matriz por item **no** entra en este alcance.

---

## Alternativas consideradas

### A1: RFQ como sub-maquina desacoplada + PDF descargable (elegida)

No toca `PurchaseRequestStatus`, reutiliza la captura de cotizacion existente, entrega valor en dos niveles incrementales. Frontera limpia.

### A2: Ampliar `PurchaseRequestStatus` con estados de RFQ

Descartada. Contamina la maquina de estados de la solicitud con el ciclo de cotizacion, rompe retrocompatibilidad de datos y de la politica de aprobacion.

### A3: Envio automatico de correo desde el inicio (saltar Nivel 1/2)

Descartada para este corte. Es accion hacia el exterior (enviar en nombre del tenant), exige dominio de correo verificado, manejo de rebotes y confirmacion; mayor infraestructura y riesgo. Se pospone como fase posterior sobre la base de Nivel 1/2.

---

## Impacto de implementacion

- **Shared:** enums `PurchaseRfqStatus`, `PurchaseRfqInvitationStatus`; barrels de enums.
- **Database:** entidades `PurchaseRfq`, `PurchaseRfqInvitation`; alter de `SupplierQuote`; migraciones tenant reversibles (siguientes numeros libres tras `058` de ADR-050: `059` crea RFQ + invitaciones + enums, `060` vincula `supplier_quotes`). Registrar entidades en `data-source`.
- **API:** `RfqService` + `RfqPdfService` (pdfkit); endpoints en `purchasing.controller.ts`; DTOs Zod; extender captura de cotizacion con `rfqInvitationId`.
- **Portal:** pestana RFQ en el workbench (selector multi-proveedor, tablero de seguimiento con badges icono+texto, boton "Descargar PDF"); cliente API; vocabulario en espanol (`RFQ_INVITATION_STATUS_LABELS`).
- **Dependencias:** agregar `pdfkit` a `apps/api/package.json`.
- **OpenAPI:** nuevos endpoints.
- **Testing:** unit de `RfqService` (crear, invitar idempotente, enviar, responder, declinar, cerrar, expirar), render de PDF, integracion HTTP; cobertura >= 80% core.

### Impacto declarado (perfil AI-EM-ARCH)

- **Multi-tenant:** todo bajo `TenantContext` + `runInTenantSchema`; migraciones por schema. Sin impacto en aislamiento.
- **Seguridad / RBAC:** roles MOD12; auditoria por interceptor; el PDF no expone datos sensibles. Sin nueva superficie de autenticacion.
- **Escala:** volumen bajo (una RFQ + N invitaciones por solicitud); indices por tenant. Sin impacto en la escala objetivo.
- **Regulacion:** sin impacto tributario directo; el PDF es documento operativo, no fiscal. Cualquier valor fiscal futuro **requiere verificacion con fuente oficial**.

---

## Estado de aprobacion

Este ADR fue **Aprobado por el CTO** (2026-07-11). Habilita la ejecucion de la Fase 04 conforme al plan y prompt asociados, incluyendo la creacion de persistencia (dos tablas + alter), endpoints y la introduccion de la dependencia `pdfkit`. Revision reforzada de schema aplicada.

---

## Referencias

- AGENTS.md
- docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md
- docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
- docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md
- docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
- docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
- docs/informes/INFORME-MOD12-INVENTARIO-SCM-DEFINICION-v1.0.md
- apps/api/src/modules/inventory/services/purchasing.service.ts
- apps/api/src/modules/inventory/purchasing.controller.ts
- packages/database/src/entities/supplier-quote.entity.ts
- packages/database/src/entities/purchase-request.entity.ts
