# INFORME — MOD12 Compras RFQ PDF por proveedor (fila + ZIP) Fase 15

**Versión:** 1.0
**Estado:** Implementado — pendiente gates G5/G6 y GO CTO
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Ejecutor:** AI-SR-FULL (+ AI-FE-PLATFORM en mismo delivery)
**Spec/plan:** brainstorming aprobado por el usuario (skill `brainstorming`) — decisiones registradas abajo
**Antecede:** [Fase 14 — RFQ PDF personalizado](INFORME-MOD12-COMPRAS-RFQ-PDF-PERSONALIZADO-FASE-14-v1.0.md)

## Contexto / problema

En `/dashboard/inventory?tab=purchasing` → Trabajar solicitud → Cotizar → **Solicitud de cotización (RFQ)**, al invitar proveedores el botón prominente **«Descargar PDF»** generaba el PDF **genérico impersonal** (aparecía «Sin proveedores invitados»). La descarga personalizada existía desde Fase 14 (`renderForInvitation`) pero exigía un ritual poco descubrible: invitar → marcar checkboxes → «Descargar PDF (seleccionados)», que además disparaba N `anchor.click()` seguidos (los navegadores los bloquean).

## Decisiones (brainstorming con el usuario)

1. **Entrega:** botón «Descargar PDF» por fila de proveedor invitado **+** botón «Descargar todos (ZIP)».
2. **Eliminar** por completo el botón/endpoint genérico impersonal.
3. **Bloquear** la descarga hasta que haya al menos un proveedor realmente invitado, con hint.

## Cambios

### Backend (`apps/api`)
- `RfqPdfService`: extraído helper privado `buildInvitationPdf(detail, invitation, itemLabels, contact)` que reúsa la lógica personalizada (`directedToName` + contacto + slug de archivo).
- Nuevo `renderAllInvitationsZip(rfqId)`: carga `itemLabels` y `contact` una vez, genera un PDF por invitación en paralelo y los empaqueta con **`jszip`** (`nodebuffer`); nombra `RFQ-000001-cotizaciones.zip`. Lanza `NotFoundException` en español si la RFQ no tiene invitaciones. Deduplica nombres de entrada colisionantes (`-2`, `-3`…).
- **Eliminados** `render()` y `renderOrThrow()` (solo los usaba el endpoint genérico; sin otros consumidores).
- `purchasing.controller.ts`: **eliminado** `GET /purchasing/rfqs/:rfqId/pdf`; **nuevo** `GET /purchasing/rfqs/:rfqId/invitations/pdf.zip` (`application/zip`, mismos `@Roles` ADMIN/NOC/SUPPORT y patrón de headers). Se conserva `GET .../invitations/:invitationId/pdf`.
- Dependencia nueva: `jszip@^3.10.1` (JS puro, sin binarios nativos) en `apps/api/package.json`.

### Portal (`apps/portal`)
- `api-client`: **eliminado** `downloadRfqPdf`; **nuevo** `downloadRfqInvitationsZip(rfqId)` (patrón blob idéntico, `→ /invitations/pdf.zip`). Se conserva `downloadRfqInvitationPdf`.
- `RfqInvitationsPanel`:
  - Header: un único botón **«Descargar todos (ZIP)»**, deshabilitado si `invitations.length === 0`.
  - Por fila: botón **«Descargar PDF»** (aria-label `Descargar PDF de {proveedor}`) → `downloadRfqInvitationPdf`.
  - **Eliminados** checkboxes, `selectedInvitationIds`, `toggleInvitationSelection`, `handleDownloadSelectedPdfs`, `handleDownloadPdf`.
  - Guard + hint: empty state «Invita al menos un proveedor para generar PDFs personalizados.»

## Deudas de Fase 14 resueltas por esta fase

- **[Constraint] `compress:false` en el PDF genérico** (Hallazgo G6-1 Fase 14): moot — el endpoint/render genérico ya no existe.
- **[a11y] checkbox 16×16px de selección** (Hallazgo G6-2 Fase 14): eliminado; ya no hay checkboxes en las filas.

## Criterios de aceptación

| CA | Estado |
| --- | --- |
| CA-15-01 Botón por fila descarga el PDF personalizado de ese proveedor | Implementado + RTL |
| CA-15-02 «Descargar todos (ZIP)» descarga un ZIP con un PDF por proveedor | Implementado + RTL + unit |
| CA-15-03 ZIP con nombre `{rfqNumber}-cotizaciones.zip` y entradas personalizadas | Implementado + unit |
| CA-15-04 RFQ sin invitaciones → 404 en español + botón deshabilitado + hint | Implementado + unit + RTL |
| CA-15-05 Endpoint genérico eliminado → 404 | Implementado + integration |
| CA-transversal boundaries / sin migración / tenant desde contexto | Cumplido |

## Verificación

| Suite | Resultado |
| --- | --- |
| API `rfq-pdf.service.spec` (incluye ZIP + 404 sin invitaciones) | **5/5 pass** |
| API `rfq.http.integration` (ZIP 200 + genérico 404) | **1/1 pass** |
| API `inventory.controller.http` / `purchasing.http.integration` / `inventory.module` | **pass** |
| Portal `RfqInvitationsPanel.spec` (fila, ZIP, hint, error de fila) | **4/4 pass** |
| Typecheck `@iwana/api` + `@iwana/portal` | **OK** (fuente sin errores) |

## Notas de seguridad (a validar por AI-SEC-ENG)

- `renderAllInvitationsZip` toma `tenantId` de `TenantContext.getOrThrow()` (nunca de input); las invitaciones provienen de `rfqService.getById` (aislado por schema). Sin nuevo vector IDOR respecto a Fase 14. El contacto embebido es el del propio tenant.

## Fuera de alcance

- Envío automático del ZIP por correo, múltiples rondas, comparación por ítem.
- Personalización adicional del contenido del PDF (saludo, instrucciones de respuesta).
