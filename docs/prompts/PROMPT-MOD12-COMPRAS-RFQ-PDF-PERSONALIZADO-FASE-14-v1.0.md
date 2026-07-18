# PROMPT - MOD12 Compras: PDF de RFQ personalizado por proveedor (Fase 14)

**Version:** 1.0
**Estado:** Aprobado e implementado (GO CTO 2026-07-17)
**Fecha:** 2026-07-17
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH (sesion de brainstorming, skill `brainstorming`)
**Aprobado por:** CTO (2026-07-17)
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL) + Frontend Platform (AI-FE-PLATFORM)
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-RFQ-PDF-PERSONALIZADO-FASE-14-v1.0.md`
**Habilitada por:** Diseño aprobado por el usuario en sesion de brainstorming — ver `docs/specs/2026-07-17-mod12-compras-rfq-pdf-personalizado-fase14-design.md`
**Secuencia:** Independiente de `PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-REMEDIACION-v1.0.md` (puede ejecutarse en paralelo o despues; no hay dependencia tecnica entre ambos)

---

## 1. Objetivo exacto

Permitir generar y descargar un PDF de RFQ **personalizado** (dirigido a un solo proveedor) por cada invitacion seleccionada en `RfqInvitationsPanel`, sin modificar el PDF genérico existente (todos los invitados juntos), que se mantiene intacto para uso de archivo interno. Sin automatizar el envio (sigue siendo descarga + envio manual, ADR-051 Nivel 2).

## 2. Artefactos de entrada obligatorios

- `docs/specs/2026-07-17-mod12-compras-rfq-pdf-personalizado-fase14-design.md` (spec de diseno — fuente primaria de alcance)
- `docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md` (alcance RFQ vigente Nivel 2, no se modifica)
- `.github/instructions/api.instructions.md`, `frontend.instructions.md`, `portal.instructions.md`, `testing.instructions.md`
- **Skills a leer y aplicar** (`.agents/skills/`): `nestjs-expert`, `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `testing-patterns`, `backend-security-coder`.
- **Referencia de reuso — backend:** `apps/api/src/modules/inventory/services/rfq-pdf.service.ts` (`render()` linea 17-99, `renderOrThrow()` linea 101-116 — extender, no duplicar la construccion del documento), `apps/api/src/modules/inventory/services/rfq.service.ts` (patron de validacion de invitacion perteneciente a la RFQ, ver `applyQuoteToInvitation`), `apps/api/src/modules/inventory/ports/supplier-party.port.ts` (patron exacto a replicar para el nuevo `TenantContactPort`: abstract class + adapter), `apps/api/src/modules/inventory/purchasing.controller.ts` (linea 424, patron del endpoint PDF existente y de `POST rfqs/:rfqId/invitations/:invId/decline` para el anidamiento de ruta).
- **Referencia de reuso — datos:** `packages/database/src/entities/tenant.entity.ts` (`contactEmail` linea 60-61, `phone` linea 112; entidad de schema publico) — confirmar en `apps/api/src/modules/tenant/tenant.service.ts` el metodo existente de lectura por id a reutilizar en el adapter en vez de consultar la entidad a mano.
- **Referencia de reuso — portal:** `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx` (`handleDownloadPdf` linea 168-188, lista de invitaciones linea ~266+), `apps/portal/src/lib/api-client.ts` (`downloadRfqPdf`, patron a replicar).

## 3. Alcance exacto

### 3.1 Backend — nuevo port de contacto de tenant

- Crear `TenantContactPort` (abstract class, patron identico a `SupplierPartyPort`) en `apps/api/src/modules/inventory/ports/`, con un unico metodo `getContactInfo(tenantId: string): Promise<{ contactEmail: string; phone: string | null; legalName: string | null }>`.
- Adapter en `tenant` module (o en `inventory` envolviendo `TenantService` si ya expone un metodo de lectura por id) que implementa el port. Registrar el provider en `inventory.module.ts` siguiendo el patron ya usado para `SupplierPartyPort`.
- **No exponer** el port como import directo de la entidad `Tenant` desde `inventory` — debe pasar por el adapter, igual que `parties` se accede via `SupplierPartyPort`/`IPartyReadPort`.

### 3.2 Backend — endpoint y servicio PDF personalizado

- `RfqPdfService`: refactorizar `render()` para extraer la construccion del documento (cabecera, lineas, `PDFDocument`) a una funcion interna parametrizable por lista de proveedores a mostrar + datos de contacto opcionales, y anadir un nuevo metodo publico `renderForInvitation(rfqId: string, invitationId: string): Promise<{ buffer: Buffer; filename: string }>` que:
  - Carga el detalle de la RFQ (`rfqService.getById`) y valida que `invitationId` pertenezca a `detail.invitations`; si no, `NotFoundException`.
  - Resuelve el nombre del proveedor de esa invitacion via `supplierPartyPort.getSupplierSummary`.
  - Resuelve el contacto del tenant via `TenantContactPort.getContactInfo(tenantId)`.
  - Genera el documento con: cabecera igual al PDF generico, seccion de destinatario con **solo** ese proveedor + linea "Cotización dirigida a: {nombre}", lineas solicitadas igual que hoy, y una seccion final "Contacto" con `contactEmail`/`phone` del tenant.
  - `filename`: `${rfq.rfqNumber}-${slug(nombreProveedor)}.pdf` (slug: minusculas, sin acentos, espacios por guiones).
- `render()`/`renderOrThrow()` existentes **no cambian de firma ni de comportamiento observable** — siguen produciendo el PDF con todos los invitados.
- `purchasing.controller.ts`: nuevo endpoint `GET rfqs/:rfqId/invitations/:invitationId/pdf`, mismo `@Roles(ADMIN, NOC, SUPPORT)` y patron `StreamableFile` que el endpoint existente (linea 424-436), `@ApiOperation({ summary: 'Descargar PDF de RFQ personalizado para un proveedor' })`.

### 3.3 Frontend

- `api-client.ts`: nueva funcion `downloadRfqInvitationPdf(rfqId: string, invitationId: string)`, mismo patron que `downloadRfqPdf` (fetch con headers de tenant/auth, retorna `{ blob, filename }`).
- `RfqInvitationsPanel.tsx`:
  - Estado nuevo `selectedInvitationIds: Set<string>` (o array).
  - Checkbox por fila de invitacion (junto al badge de estado existente) que anade/quita el id del set. No restringir por estado de invitacion (se puede seleccionar cualquiera, incluida `DECLINED`/`EXPIRED` — el comprador decide).
  - Boton "Descargar PDF (seleccionados)" junto al boton "Descargar PDF" existente; deshabilitado si `selectedInvitationIds.size === 0` o mientras `isBusy`.
  - Handler `handleDownloadSelectedPdfs()`: itera `selectedInvitationIds` con un `for...of` (no `Promise.all`, para no disparar descargas simultaneas que el navegador puede bloquear) llamando `purchasingApi.downloadRfqInvitationPdf(rfq.id, invitationId)` y el mismo patron blob→anchor→click→revoke que `handleDownloadPdf`; capturar error por invitacion sin abortar el resto (acumular y mostrar un resumen si alguna fallo).

### 3.4 Tests

- Unit `rfq-pdf.service.spec.ts`: caso `renderForInvitation` — PDF generado solo lista al proveedor de la invitacion dada; `NotFoundException` si la invitacion no pertenece a la RFQ; incluye contacto del tenant.
- Unit del nuevo `TenantContactPort`/adapter (si aplica segun donde quede implementado).
- Component `RfqInvitationsPanel.spec.tsx` (si existe, o crear): seleccionar invitaciones habilita el boton; click dispara una descarga por invitacion seleccionada.
- Cobertura ≥80% en los archivos nuevos/tocados.

## 4. Fuera de alcance (explicito)

- Seleccion de proveedores no invitados a la RFQ.
- Empaquetado `.zip` de PDFs.
- Envio automatico (email/WhatsApp) — Fase 12.
- Cualquier cambio a `render()`/`renderOrThrow()` genericos mas alla de la extraccion interna necesaria para reuso (sin cambio de firma publica ni de comportamiento).
- Multiples rondas de RFQ (Fase 11) y comparacion por item (Fase 13).

## 5. Criterios de aceptacion

- CA-14-01: `GET /purchasing/rfqs/:rfqId/invitations/:invitationId/pdf` devuelve un PDF que lista **solo** al proveedor de esa invitacion.
- CA-14-02: el PDF personalizado incluye el encabezado "Cotización dirigida a: {nombre}" y una seccion de contacto con el email/telefono del tenant.
- CA-14-03: solicitar el PDF con un `invitationId` que no pertenece a la RFQ devuelve 404 en espanol.
- CA-14-04: el endpoint y comportamiento del PDF generico (`GET /rfqs/:rfqId/pdf`) no cambian — mismo contenido que antes de esta fase.
- CA-14-05: en el portal, seleccionar 2+ invitaciones y hacer clic en "Descargar PDF (seleccionados)" dispara una descarga de archivo por cada una, con nombre de archivo distinto por proveedor.
- CA-14-06: si una descarga individual falla (ej. proveedor sin nombre resuelto), las demas seleccionadas se descargan igual; se muestra un aviso de cuales fallaron.
- CA-transversal: lint + typecheck + tests verdes; cobertura core ≥80%; sin migracion de schema; boundaries Modulith respetados (acceso a `Tenant` solo via `TenantContactPort`); sin PII nueva en logs.

## 6. Stop/Go

**Go solo si**, ademas de los criterios tecnicos habituales:

1. AI-SR-FULL confirma que existe (o puede reutilizarse) un metodo de lectura de tenant por id en `TenantService` para implementar el adapter del nuevo port sin duplicar logica.

**Stop y escalar a AI-EM-ARCH si:** el adapter de `TenantContactPort` requeriria exponer mas datos del tenant de los estrictamente necesarios (`contactEmail`, `phone`, `legalName`), o si `RfqPdfService.render()` no puede refactorizarse sin romper su firma publica actual (en cuyo caso se evalua una alternativa antes de duplicar codigo).
