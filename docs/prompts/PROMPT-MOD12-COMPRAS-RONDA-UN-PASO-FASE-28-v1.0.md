# PROMPT DE EJECUCIÓN — MOD12 Compras, Fase 28

## Ronda de cotización en un paso: alcanzabilidad del selector de proveedores

**Versión:** 1.0
**Estado:** Aprobado para ejecución
**Fecha:** 2026-09-09
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 **(en revisión)**
**Plan de orquestación:** [`docs/plans/2026-09-09-mod12-compras-ronda-un-paso-fase-28.md`](../plans/2026-09-09-mod12-compras-ronda-un-paso-fase-28.md)

## Módulo

- Nombre: Inventario / SCM — Compras
- Código: MOD12
- Fase: 28
- Destinatarios: **AI-PROD-UX** (T1), **AI-DS-OWNER** (T2), **AI-FE-PLATFORM** (T3), **AI-SR-QA** (T4)

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que el operador vea y use el selector de proveedores en su **primer contacto** con la ronda de cotización, sin pasos intermedios no señalizados, tanto en `DRAFT` como en `PENDING_QUOTES`.

### Defecto de origen

Superficie: portal tenant → `/dashboard/inventory?tab=purchasing` → Trabajar solicitud → Decidir → Cotizar → Ronda de cotización.

El acordeón promete «Invita proveedores y registra respuestas de la ronda» y al expandirlo **no hay ningún proveedor a la vista**. Nada fue borrado: `SupplierMultiPicker` existe, está cableado y el backend está completo desde la Fase 04. El defecto es de **alcanzabilidad**, en dos modos:

1. **`DRAFT` sin ronda (reportado).** El picker vive dentro del bloque `{rfq ? …}` de `RfqInvitationsPanel.tsx:509`: aparece **solo después** de crear la ronda. Antes, el formulario ofrece únicamente moneda, fecha límite y notas. Agrava la ceguera que `getCotizarPrimarySection` (`purchase-workbench.ts:126-135`) devuelva el bloque manual como primario en `DRAFT`, con lo que la ronda nace **colapsada** y «Nueva cotización» expandida.
2. **`PENDING_QUOTES` sin ronda (latente, peor).** `PurchaseRequestWorkbenchDrawer.tsx:606` (`showRondaSection`) **oculta la sección entera**: no queda ninguna ruta para invitar proveedores. El backend sí lo acepta — `RfqService.createFromRequest` (`rfq.service.ts:68`) no mira `request.status`, y `send` (`:238`) contempla `PENDING_QUOTES` explícitamente. **El gate de frontend es más estricto que el dominio.** Introducido en `1e0e1368` para evitar un acordeón vacío; hoy congelado por `PurchaseRequestWorkbenchDrawer.spec.tsx:305`.

### Lo que sí entra

- Fusionar creación de ronda e invitación en un solo acto de UI («Crear e invitar»).
- Alinear el gate de frontend con el dominio para admitir la **primera** ronda en `PENDING_QUOTES`.
- Volver la ronda el bloque primario de Cotizar cuando no hay ronda ni cotizaciones.
- Tests que cierren la brecha de cobertura detectada y reescritura del test que congela el comportamiento contrario.

### Lo que no entra

- **Multi-ronda / reapertura tras `CLOSED` o `CANCELLED`** — riesgo abierto de ADR-051 §L126, remitido a Fase 11. Requiere decisión de producto propia.
- **Envío automático al proveedor** (correo/WhatsApp) — excluido explícitamente por ADR-051 §L30; revertirlo exige ADR nuevo.
- Comparación de ofertas por ítem (Fase 13).
- Filtro de proveedores por rubro en `SupplierMultiPicker` (sin fase asignada).
- **Cualquier cambio en `apps/api`, `packages/database` o `packages/shared`.**

---

## 2. Artefactos de entrada obligatorios

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| ADR canónico de la ronda | `docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md` | **Aprobado** (CTO, 2026-07-11) |
| ADR de proveedores invitables | `docs/adrs/ADR-052-*` §L27 | Aprobado |
| PRD rector del flujo | `docs/prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` | Vigente |
| Spec del shell de 3 fases | `docs/specs/2026-07-17-mod12-compras-journey-shell-cotizar-fase24-design.md` | Aprobado e implementado |
| Spec origen de la pestaña Cotizar | `docs/specs/2026-07-17-mod12-compras-cotizar-fase10-design.md` | Aprobado |
| Defecto previo de la misma superficie | `docs/informes/INFORME-MOD12-COMPRAS-RFQ-ENVIO-BLOQUEO-v1.0.md` | 2026-09-03 |
| Vocabulario congelado | `docs/informes/INFORME-MOD12-COMPRAS-UX-UI-VOCABULARIO-AUDITORIA-v1.0.md:90` | Vigente |

### Artefactos faltantes detectados (declarados, no bloqueantes)

- **Ningún PRD ni HLD de MOD12 contiene un RF de «invitar proveedores».** La capacidad nació directamente de ADR-051. El PRD que manda sobre esta superficie es `PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` (RF-06-05/07/08/09). Queda registrado como hueco normativo en el informe de fase; **no se subsana aquí**.
- Los tipos de transporte de la ronda (`PurchaseRfqRecord`, `PurchaseRfqInvitationRecord`, `InviteSuppliersDto`) están **duplicados a mano** en `apps/portal/src/lib/api-client.ts:7778-8672` en vez de vivir en `@iwana/shared`. Deuda preexistente; **no se toca aquí** (implicaría cambio de contrato).

---

## 3. Contratos congelados (perfil AI-EM-ARCH §3.5)

Los tracks corren contra estos contratos. **Ninguno cambia en esta fase**; si alguno necesitara cambiar, es evento de re-sync y se escala al orquestador antes de tocarlo.

- **Contrato de API — congelado.** `POST /purchasing/requests/:id/rfq`, `POST /purchasing/rfqs/:rfqId/invitations`, `POST /purchasing/rfqs/:rfqId/send`, tal como los expone `apps/portal/src/lib/api-client.ts:9555-9576`. DTOs `CreateRfqDto` e `InviteSuppliersDto` con `partyRefIds: string[]` (`api-client.ts:8662-8672`). Origen normativo: ADR-051 §L86-93.
- **Contrato de componente DS — congelado.** `SearchableMultiPicker` según `docs/specs/2026-07-25-searchable-picker-ds-contrato.md` v1.0. Se reutiliza `SupplierMultiPicker` (`apps/portal/src/components/inventory/SupplierMultiPicker.tsx:29`) **tal cual**: no se crea ningún componente nuevo ni variante nueva.

---

## 4. Instrucciones por track

### T1 — AI-PROD-UX · delta de spec

Producir `docs/specs/2026-09-09-mod12-compras-ronda-un-paso-design.md` con:

1. Flujo de un solo paso: el proveedor es el objeto de la tarea y va **primero** en el formulario, por encima de moneda, fecha límite y notas.
2. Criterios de aceptación CA-28-01..08 (base en §7).
3. **Desviación declarada** frente a la matriz dominante D3 de la spec de Fase 24 §L79-84: se inserta un escalón entre `hasActiveRfq` y el caso de cotizaciones existentes.
4. **Nota de continuidad, no de ruptura:** la spec de Fase 24 §L75 ya preveía, para el caso «Empty histórico `PENDING_QUOTES` sin ronda», un *«Bloque "Abrir ronda" colapsado (opcional)»* que la implementación omitió. Esta fase **cierra lo que esa spec previó**, no lo contradice. La spec de Fase 10 §L70, en cambio, sí remitía el caso a Fase 11: consignar la desviación consciente y su razón (el backend nunca impuso la restricción).
5. Copy definitivo del formulario, del botón y del estado de error de fallo parcial. Vocabulario congelado: **«ronda de cotización»**; prohibidos «RFQ», «OC», «oferta», «landed» y `partyRefId` en texto visible.

### T2 — AI-DS-OWNER · veredicto de carril rápido

1. Emitir veredicto sobre alojar `SupplierMultiPicker` dentro del formulario de creación **sin variantes nuevas ni tokens nuevos**. Se espera GO de carril rápido: no hay impacto en alcance, contrato de datos, boundary ni tokens de marca.
2. **Cerrar la tensión abierta** en `INFORME-MOD12-COMPRAS-RFQ-ENVIO-BLOQUEO-v1.0.md:37`: contrato DS v1.0 §3 («la lista permanece abierta tras añadir») frente a la spec UX v1.0 §5.2. Si DS-OWNER mantiene «siempre abierto», **versionar el contrato a v1.1** en el mismo acto; si cede, marcar §3 como superado. No dejar las dos versiones vigentes.

### T3 — AI-FE-PLATFORM · implementación

Ámbito exclusivo: `apps/portal/src/components/inventory/`. **No tocar `apps/api`, `packages/database` ni `packages/shared`.**

**3.1 — `RfqInvitationsPanel.tsx`, fusionar creación e invitación**

- Mover `<SupplierMultiPicker>` **dentro** del bloque `canStartRfq` (`:442-482`), como **primer campo**. La misma instancia sigue sirviendo al bloque de ronda existente (`:509`) para invitar proveedores adicionales: **reutilizar el estado `selectedSuppliers` existente, no duplicarlo**.
- Sustituir «Crear solicitud de cotización» por **«Crear e invitar»**, deshabilitado mientras no haya proveedores seleccionados, con hint «Selecciona al menos un proveedor para abrir la ronda».
- `handleCreateRfq` encadena `createRfq` → `inviteSuppliers` con los `partyRefIds` seleccionados, dentro de un solo `runAction`, reutilizando el helper de `:225`.
- **Fallo parcial — tratamiento obligatorio.** `createRfq` **no es idempotente**: `RfqService.createFromRequest` rechaza una segunda ronda activa (`rfq.service.ts:80-89`). Si `createRfq` tiene éxito e `inviteSuppliers` falla: **no** limpiar `selectedSuppliers`, **sí** ejecutar `onRefresh()` para caer al modo «ronda existente» con el picker poblado y «Invitar seleccionados» disponible, y emitir un error que diga que la ronda quedó creada y solo falta invitar. Un reintento ciego de «Crear e invitar» produciría un 400 confuso.
- `canStartRfq` (`:168`) pasa a exigir que no exista ronda y que el estado sea `DRAFT` **o** `PENDING_QUOTES`.
- **No tocar** la máquina `canInvite` / `canSend` / `canClose` (`:74`) ni `sendBlockedReason` (`:175-184`), que resolvió el defecto del 2026-09-03.

**3.2 — `PurchaseRequestWorkbenchDrawer.tsx:606`, abrir el gate**

`showRondaSection` admite además `PurchaseRequestStatus.PENDING_QUOTES`. Actualizar el comentario de `:605`: la condición ya no es «existe o DRAFT» sino «existe o se puede crear». El acordeón no queda vacío, porque en ambos estados `canStartRfq` rinde el formulario.

**3.3 — `purchase-workbench.ts:121-136`, la ronda como camino primario**

`getCotizarPrimarySection` recibe un campo nuevo `canStartRfq: boolean`, evaluado **inmediatamente después** de `hasActiveRfq` y **antes** del caso de cotizaciones existentes. Con cotizaciones ya registradas se conserva la comparación como primario, para no romper CA-24-06. El drawer pasa el valor derivado del estado de la solicitud.

**3.4 — Copy**

Ajustar `PortalSectionHeader` (`RfqInvitationsPanel.tsx:436`) al flujo de un solo paso, según el copy que fije T1.

### T4 — AI-SR-QA · verificación

- **Reescribir** `PurchaseRequestWorkbenchDrawer.spec.tsx:305`: hoy afirma lo contrario de lo buscado («oculta el bloque Ronda … `PENDING_QUOTES`»). Pasa a verificar que en `PENDING_QUOTES` sin ronda la sección **sí** se renderiza y ofrece «Crear e invitar».
- **Cerrar la brecha de cobertura:** hoy **no existe ningún test** que verifique que `SupplierMultiPicker` se renderiza ni que «Invitar seleccionados» dispara la invitación. Añadir en `RfqInvitationsPanel.spec.tsx`: (a) `DRAFT` sin ronda → el picker está presente; (b) seleccionar proveedor y pulsar «Crear e invitar» → se llaman `createRfq` **e** `inviteSuppliers`; (c) fallo de `inviteSuppliers` tras `createRfq` exitoso → la selección se conserva y aparece «Invitar seleccionados»; (d) `PENDING_QUOTES` sin ronda → el formulario está disponible.
- `purchase-workbench.spec.ts`: caso nuevo de `getCotizarPrimarySection` con `canStartRfq`.
- **Test de límite:** confirmar que la reapertura **no** queda habilitada. Tras cerrar una ronda la solicitud pasa a `PENDING_APPROVAL`, no a `PENDING_QUOTES`, y `getRequestDetail` deja de adjuntar rondas no activas: verificar que en `PENDING_APPROVAL` no aparece el formulario.
- Regresión sobre los casos vivos: `RfqInvitationsPanel.spec.tsx:307, :473, :488, :512` y CA-24-05/07 en `PurchaseRequestWorkbenchDrawer.spec.tsx:320`.
- Smoke E2E del flujo crear-e-invitar → enviar.

---

## 5. Restricciones no negociables

1. Sin cambios de backend, OpenAPI, entidades ni migraciones. Los contratos de §3 están congelados.
2. No romper boundaries del modulith; los proveedores se referencian por `partyRefId` (MOD08 Parties), nunca visible como texto en UI (ADR-051 §L100).
3. Sin credenciales ni PII real en código, tests o fixtures.
4. Vocabulario en español, sentence case, sin enums crudos en vistas finales (`AGENTS.md` → UI).
5. No crear componentes nuevos: `SupplierMultiPicker` se reutiliza tal cual.
6. **Higiene de scope.** El working copy arrastra ~31 archivos de la Fase 26 (tributos de compra de mostrador) sin commitear. El hallazgo I-2 de `INFORME-MOD12-COMPRAS-CIERRE-FASE-06-AUDITORIA-ARCH-v1.0.md:56` ya sancionó exactamente este patrón: **el commit de Fase 28 se acota a sus propios archivos**.

---

## 6. Entregables

**Técnicos:** cambios 3.1–3.4 en `apps/portal`; tests de T4. Sin migraciones y sin OpenAPI — N/A en esta fase.

**Documentales:** delta de spec de T1; veredicto DS (y versionado del contrato si aplica) de T2; informe de fase `docs/informes/INFORME-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md`.

---

## 7. Criterios de aceptación

| ID | Criterio |
| --- | --- |
| **CA-28-01** | Solicitud en `DRAFT` sin ronda: al abrir Cotizar, «Ronda de cotización» nace **expandida** y el selector de proveedores es visible **sin ningún clic previo**. |
| **CA-28-02** | Seleccionar N proveedores y pulsar «Crear e invitar» crea la ronda e inscribe las N invitaciones en estado *Invitado* en un solo acto; «Enviar solicitud» queda habilitado. |
| **CA-28-03** | «Crear e invitar» está deshabilitado sin proveedores seleccionados, con hint visible. |
| **CA-28-04** | Fallo parcial (`createRfq` correcto, `inviteSuppliers` falla): la selección se conserva, el panel muestra la ronda creada con «Invitar seleccionados» disponible, y el mensaje explica que solo falta invitar. Ningún reintento produce un 400 opaco. |
| **CA-28-05** | Solicitud en `PENDING_QUOTES` sin ronda: la sección existe y permite crear la ronda e invitar. |
| **CA-28-06** | Con cotizaciones ya registradas y sin ronda, el bloque primario sigue siendo «Comparación» (CA-24-06 intacto). |
| **CA-28-07** | Con ronda activa, el panel conserva invitar / enviar / cerrar / descargar ZIP y sigue bloqueando la cotización manual (C1, CA-24-05). |
| **CA-28-08** | En `PENDING_APPROVAL` no aparece el formulario de crear ronda: la reapertura sigue fuera de alcance. |

---

## 8. Criterio de stop/go

**Detenerse y escalar a AI-EM-ARCH si aparece necesidad de:**

- Cambiar cualquiera de los contratos congelados de §3 — en particular, si la fusión pareciera exigir un endpoint atómico de crear-con-invitaciones. **La respuesta anticipada es no**: el fallo parcial se resuelve en UI según 3.1.
- Habilitar reapertura de ronda tras `CLOSED` o `CANCELLED` — es multi-ronda (Fase 11), exige ADR y decisión de producto del CTO.
- Tocar `PurchaseRequestStatus` o la máquina de estados de la ronda.
- Un veredicto de T2 que obligue a variante nueva de componente o token nuevo.

**Documentar causa en:** el informe de fase. **Recomendación esperada:** acotar a UI y diferir lo demás con su propio artefacto.

---

## 9. Criterio de salida de la fase

- Frontend validado: CA-28-01..08 verificados **en navegador** sobre `/dashboard/inventory?tab=purchasing`, no solo en RTL.
- Backend y base de datos: **N/A declarado** — la fase no los toca.
- Tests en verde **con conteo real de tests ejecutados**. La caché de turbo y `--passWithNoTests` han falseado evidencia verde en este repositorio: si el conteo no aparece, repetir forzando la corrida.
- `pnpm typecheck` y `pnpm lint` en verde (Gates Before Merge de `AGENTS.md`).
- Cobertura ≥80% en core; sin violaciones de boundary; sin PII en logs.
- Documentación archivada: delta de spec, veredicto DS e informe de fase.

### Nota operativa para la verificación

Si el picker aparece **vacío al escribir**, la causa no es esta fase: `GET /purchasing/providers` filtra por rol `SUPPLIER` activo en `party_roles` (`apps/api/src/modules/parties/adapters/party-read.adapter.ts:70-75`). Un tercero sin ese rol activo nunca aparece, aunque tenga perfil en `supplier_profiles`. Verificar el dato del tenant antes de reportarlo como defecto de UI.
