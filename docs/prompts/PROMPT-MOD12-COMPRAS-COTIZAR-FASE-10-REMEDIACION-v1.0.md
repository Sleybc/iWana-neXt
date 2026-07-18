# PROMPT - MOD12 Compras: Remediación auditoría Fase 10 — oferta manual bloqueada sin aviso

**Version:** 1.0
**Estado:** Aprobado e implementado (GO CTO 2026-07-17)
**Fecha:** 2026-07-17
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH (auditoria G6 sobre la entrega de Fase 10)
**Aprobado por:** CTO (confirmado directamente en sesion, 2026-07-17 — ver `docs/informes/INFORME-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md` §Remediacion)
**Ejecutor:** AI-FE-PLATFORM
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-REMEDIACION-v1.0.md`
**Habilitada por:** Auditoria de AI-EM-ARCH sobre `PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md` ya ejecutado

---

## 0. Contexto de la auditoria (leer primero)

AI-SR-FULL/AI-FE-PLATFORM ejecutaron `PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md` y entregaron `INFORME-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md`, declarando dos enmiendas de alcance no solicitadas en el prompt original — **"B"** (KPI "Por cotizar" incluye `DRAFT`) y **"C1"** (bloquear oferta manual si hay RFQ activa; `RfqService.send()` ya no retrocede una solicitud avanzada) — bajo un supuesto "GO CTO" sin registro verificable en la sesion de gobernanza. Notablemente, C1 modifico `RfqService.send()`, que el prompt original decia explicitamente que no se tocaba.

**Resolucion:** el CTO confirmo directamente, en sesion con AI-EM-ARCH, el GO de las enmiendas B y C1 — quedan aceptadas y no se revierten. Se deja como leccion de proceso (no bloqueante): toda enmienda de alcance futura debe consultarse a AI-EM-ARCH *antes* de reclamarse como aprobada (`Protocolo_Colaboracion_Multiagente_v1.md` §6, "la consulta precede al supuesto"), no despues via el informe de cierre.

La auditoria tambien encontro un **bug real, no cubierto por tests**, que este prompt remedia: la guarda C1 del backend no tiene contraparte en el frontend.

## 1. Objetivo exacto

Sincronizar `canAddQuote` en el drawer "Trabajar solicitud" con la guarda C1 del backend (`PurchasingService.addSupplierQuote`, bloqueo de oferta manual si existe una RFQ activa), y mostrar una nota explicativa en vez de dejar el formulario "Nueva oferta" habilitado para luego fallar con un error crudo del backend.

## 2. Problema (evidencia)

- Backend (`apps/api/src/modules/inventory/services/purchasing.service.ts`, bloque `addSupplierQuote`, ya en el árbol de trabajo): si existe una `PurchaseRfq` con `status ∈ {DRAFT, SENT, RECEIVING}` para la solicitud, registrar una oferta manual sin `rfqInvitationId` lanza `BadRequestException('Hay una ronda de cotización activa. Registra la oferta desde una invitación o cierra la ronda primero.')`.
- Frontend (`apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx:265-267`): `canAddQuote` solo evalúa `request.status ∈ {PENDING_QUOTES, DRAFT}` — no consulta `detail?.rfq`. Con la fusión de pestañas de Fase 10 (RFQ y oferta manual ahora conviven en la misma pestaña "Cotizar"), un usuario que crea una RFQ (incluso sin enviarla, en `DRAFT`) sigue viendo el formulario "Nueva oferta" habilitado; al enviarlo, el error llega crudo vía `quoteError`.
- No hay ningún test (`PurchaseRequestWorkbenchDrawer.spec.tsx`) que cubra el caso "DRAFT/PENDING_QUOTES con RFQ activa".

## 3. Artefactos de entrada obligatorios

- `docs/prompts/PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md` (prompt original, contexto de la pestaña "Cotizar")
- `docs/informes/INFORME-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md` (entrega auditada, enmiendas B/C1)
- `apps/api/src/modules/inventory/services/purchasing.service.ts` (guarda C1 en `addSupplierQuote`, ya implementada — referencia de los estados de RFQ que cuentan como "activa": `PurchaseRfqStatus.DRAFT | SENT | RECEIVING`)
- `apps/portal/src/lib/api-client.ts:5952-5997` (`PurchaseRequestDetailRecord.rfq: PurchaseRfqDetailRecord | null`; `PurchaseRfqDetailRecord.rfq: PurchaseRfqRecord` — path correcto es `detail.rfq.rfq.status`, igual al que ya usa `RfqInvitationsPanel.tsx` vía `rfqDetail?.rfq`)
- Skills: `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `testing-patterns`

## 4. Alcance exacto

**Archivo:** `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx`

1. Añadir `PurchaseRfqStatus` al import existente de `@iwana/shared` (línea 19-23, junto a `PurchaseOrderStatus`, `PurchaseRequestLineSourceKind`, `PurchaseRequestStatus`).
2. Extender la definición de `canAddQuote` (línea 265-267) e introducir `hasActiveRfq` y `blockedByActiveRfq`, usando el mismo criterio de estados que la guarda del backend:
   ```ts
   const hasActiveRfq = Boolean(
     detail?.rfq &&
       [PurchaseRfqStatus.DRAFT, PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(
         detail.rfq.rfq.status,
       ),
   );
   const canAddQuote =
     request &&
     [PurchaseRequestStatus.PENDING_QUOTES, PurchaseRequestStatus.DRAFT].includes(request.status) &&
     !hasActiveRfq;
   const blockedByActiveRfq = Boolean(
     request &&
       [PurchaseRequestStatus.PENDING_QUOTES, PurchaseRequestStatus.DRAFT].includes(request.status) &&
       hasActiveRfq,
   );
   ```
3. En la zona "Ofertas registradas" (dentro de `TabsContent value="cotizar"`), donde hoy es `{canAddQuote ? (<section>…formulario "Nueva oferta"…</section>) : null}`, cambiar a:
   ```tsx
   {canAddQuote ? (
     <section>…formulario existente, sin cambios de lógica…</section>
   ) : blockedByActiveRfq ? (
     <PortalAlert
       variant="info"
       title="Oferta manual no disponible"
       description="Hay una ronda de cotización activa. Registra la oferta desde la invitación correspondiente en «Invitar proveedores», o cierra la ronda primero."
     />
   ) : null}
   ```
   `PortalAlert` ya está importado en este archivo; `variant="info"` ya existe en `PortalAlertVariant` (`apps/portal/src/components/shared/portal-ui.tsx:120`).
4. **No tocar** el footer (condición `activeTab === 'cotizar' && canAddQuote`, ~línea 884) — hereda el comportamiento correcto automáticamente porque `canAddQuote` ya excluye el caso bloqueado.
5. **No tocar** el backend — la guarda C1 ya está implementada y testeada; este prompt es puramente de sincronización frontend.

## 5. Tests requeridos

- `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.spec.tsx`: nuevo caso — solicitud en `DRAFT` (o `PENDING_QUOTES`) con `detail.rfq.rfq.status = PurchaseRfqStatus.DRAFT` (o `SENT`/`RECEIVING`) → el formulario "Nueva oferta" (input de monto) no se renderiza, y sí aparece el texto "Oferta manual no disponible". Verificar también el caso ya cubierto (sin RFQ) sigue mostrando el formulario, para confirmar que no hay regresión.

## 6. Fuera de alcance

- No se revierte ni se cuestiona la guarda C1 del backend — el GO ya fue confirmado por el CTO.
- No se rediseña el flujo de "múltiples rondas de RFQ" (Fase 11) ni ningún otro punto del roadmap.

## 7. Criterios de aceptación

- CA-REM-01: con una RFQ en `DRAFT`/`SENT`/`RECEIVING` asociada a la solicitud, el formulario "Nueva oferta" no se muestra; se muestra la alerta informativa en su lugar.
- CA-REM-02: sin RFQ asociada (o RFQ `CLOSED`/`CANCELLED`), el formulario "Nueva oferta" se comporta exactamente igual que antes de este prompt (sin regresión).
- CA-transversal: lint + typecheck + tests verdes; sin cambios de contrato de datos ni de API.

## 8. Stop/Go

**Go:** sin condiciones adicionales — el único bloqueo de gobernanza (GO de B/C1) ya fue resuelto por el CTO en sesión (§0).
**Stop y escalar a AI-EM-ARCH si:** `detail.rfq.rfq.status` no es el path correcto en el tipo actual de `PurchaseRequestDetailRecord`, o si `PortalAlert`/`variant="info"` no está disponible tal como se documenta aquí.
