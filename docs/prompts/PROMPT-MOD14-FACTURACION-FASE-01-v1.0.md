# PROMPT-MOD14 — Facturación · Fase 01 · Encargos por bloque

**Versión:** 1.0 · **Fecha:** 2026-10-31 · **Emisor:** AI-EM-ARCH
**Estado:** Vigente — habilitado por G0 (2026-10-31)
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md); la estructura por bloques sigue el prompt de MOD13 Fase 01.
**Plan:** [2026-10-31-mod14-facturacion-fase-01-orquestacion.md](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md) (orden, paralelo, gates y matriz de skills)
**Contrato:** [HLD-MOD14-FACTURACION-v1.0](../hlds/HLD-MOD14-FACTURACION-v1.0.md). Se congela en G0. Ningún bloque lo modifica: si algo no cabe, emite `[BLOQUEO] <sección del HLD> — <motivo>` y para.
**Definición:** [PRD-MOD14](../prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md) · [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md)
**Condición de uso:** ningún bloque arranca sin G0 aprobado por el CTO (plan §4).

## Reglas comunes a todos los bloques

1. Lee `AGENTS.md`, el plan, el HLD y tu sección. Lee los `SKILL.md` que el plan §3 te asigna **antes** de escribir código.
2. Se trabaja en `main`. Hay rutas sin commitear ajenas a esta fase: no las toques ni las añadas a tus commits. Haz `git add` solo de tus rutas. **No hagas commit**: el cierre de cada ola lo commitea AI-EM-ARCH.
3. Solo `pnpm`. Tests sin caché de turbo y con conteo real de suites y tests (`iwana-test-evidence`). Un verde sin cifras no cuenta.
4. Multi-tenant: todo en `runInTenantSchema` / `TenantContext`, con `tenant_id` en cada consulta. El contexto del tenant viaja explícito en los payloads de cola.
5. **Ninguna operación de esta fase suspende ni reactiva servicios.** Billing no llama a `SubscriberLifecycleService` ni a `ContractsService` (ADR-103 D9: corte y reconexión automáticos fuera de la fase; D7: D6 de ADR-102 sigue bloqueado).
6. Billing consume otros módulos **solo por puertos** (HLD §5). Prohibido importar entidades o servicios de CRM, Comercial o Tributación desde `modules/billing`.
7. Toda mutación se audita con `AuditService.logWithin` dentro de su transacción, con la lista cerrada de campos y sin PII. Una mutación sin auditoría es defecto P1.
8. Montos en `numeric(14,2)`. Nunca se suman floats de JavaScript: redondeo con `roundHalfUpToCents` o aritmética en centavos enteros (D-BIL-8).
9. Fechas siempre en la zona horaria del tenant (`settings.timezone`), mediante las funciones de `calendar/billing-calendar.ts`. Prohibido `new Date()` para decidir el «hoy» de negocio.
10. Comentarios de negocio en español. Sin `any`. Validación con Zod de `@iwana/shared`.
11. Entrega: archivos con ruta, evidencia con comandos y conteos, y deuda nueva clasificada P0–P3.

---

## Ola 1

### P0 · `prod-ux` — Spec UX

Entrega `docs/specs/2026-10-31-mod14-facturacion-ux.md` con:
- los flujos: configurar la política con vista previa; revisar y emitir borradores; anular; registrar y aplicar un pago con sugerencia FIFO; consultar el estado de cuenta en la ficha; ver el estado de pago en la agenda;
- los estados vacío, cargando, error, bloqueado (`blocking_reason`) y sin permiso;
- el vocabulario del PRD §8, revisado con `system-vocabulary-review`;
- criterios `CA-UX-FAC-nn` medibles.

La combinación «corte en día fijo + cobro al final del periodo» aparece deshabilitada **con explicación visible**. Usa el nombre provisional del documento (D-BIL-2) marcado como pendiente. Si un flujo pide un dato que el HLD no tiene, emite `[BLOQUEO]`.

### S0 · `sec-eng` — Revisión de diseño (solo lectura)

Revisa ADR-103 y el HLD. Entrega `docs/informes/INFORME-MOD14-REVISION-SEGURIDAD-DISENO-v1.0.md` con hallazgos P0–P3. Cubre:
- la matriz de permisos del HLD §7 y la propuesta para D-BIL-11;
- el `buyer_snapshot`: qué PII congela y cómo se protege (ADR-058);
- la Q2 del HLD: anonimización frente a la retención de 10 años (ADR-094);
- la idempotencia del pago y el abuso de la clave;
- la exposición del estado de cuenta a roles de lectura.

### D1 · `data-eng` — Migraciones y entidades

1. Confirma en `packages/database/src/migrations/tenant/runner.ts` que 169 y 170 siguen libres. Si no, toma los siguientes números e infórmalo.
2. Implementa el HLD §3.1 (`169_billing_core`) y las entidades `billing-*.entity.ts`, exportadas desde `packages/database/src/entities/index.ts`.
3. Siembra la fila de `billing_policy` por tenant con los valores de G0.
4. Deja `170_seed_billing_permissions` (HLD §3.2) para el final: necesita la clave de B1a.
5. Escribe `171` (HLD §3.3): D-BIL-7 (b) quedó aprobada en G0.
6. Cada migración tiene una prueba de integración de ida y vuelta contra Postgres real, con el patrón de `168_crm_contract_alias_readable.integration.spec.ts`, y queda registrada en `runner.ts`. La prueba verifica el `CHECK` de la combinación incompatible y los índices únicos.

### B1a · `sr-backend` — Contratos compartidos y calendario

1. Implementa el HLD §4 en `packages/shared/src/contracts/billing/` y `packages/shared/src/calendar/billing-calendar.ts`, sin tocar el comportamiento de `computeCutoffDate`.
2. Escribe pruebas en tabla con **todos** los ejemplos del PRD §6, febrero 28/29, meses de 30/31, diciembre → enero, y los dos modos de corte (CA-FAC-01).
3. Añade `BILLING_POLICY_MANAGE` al enum `AccessPermissionKey` y avisa a D1.
4. Añade `BillingGenerationJobPayload` a `contracts/queue-payloads.ts`.

## Ola 2

### B1b · `sr-backend` — Puerto de CRM, política y permisos

1. Crea `BillingContractReadPort` (HLD §5) en `modules/billing/ports` y su adaptador en `crm/contracts/billing-contract-read.adapter.ts`, dentro de un módulo de lectura pequeño que exporte solo el adaptador.
   - Proyección mínima.
   - El documento del adquirente se descifra solo en `findByContractId`, para el snapshot de emisión.
   - La lista RUT vacía se traduce a `R-99-PN` (ADR-100).
   - Prueba contra Postgres real.
2. Crea `BillingModule` (HLD §2) con la política:
   - `GET/PUT /billing/policy`, sobrescrituras por contrato y `preview`;
   - `expectedUpdatedAt` y 422 `BILLING_POLICY_INCOMPATIBLE` (CA-FAC-02).
3. Activa los permisos en `access-control.constants.ts` (de `RESERVED` a `ASSIGNABLE`) y saca la sección `billing` de `COMING_SOON` en `settings-registry.service.ts`.
4. Documenta la OpenAPI.

## Ola 3

### B2 · `sr-backend` — Generación, documentos, consecutivo y PDF

1. Implementa el HLD §6.1, §6.2 y §6.6 y los endpoints de documentos del §6.5.
   - El job repetible por tenant sigue el patrón de `network-provisioning-reconciler.processor.ts`.
   - Advisory lock por (contrato, periodo).
   - Consecutivo con el patrón de `wfm/services/work-orders.service.ts`.
   - `blocking_reason` cuando falta precio o IVA (CA-FAC-05).
2. Mueve `inventory/services/pdf-branding.ts` a `common/pdf/pdf-branding.ts` y actualiza los imports de inventario, sin cambiar su comportamiento. Las pruebas de PDF de inventario deben seguir en verde.
3. Pruebas contra Postgres real: CA-FAC-03 (doble ejecución en paralelo) y CA-FAC-04 (20 emisiones concurrentes).

### B3 · `sr-backend` — Pagos, aplicaciones, señal y cuenta

1. Implementa el HLD §6.3 y §6.4 y los endpoints de pagos y estado de cuenta.
   - `allocation.ts` es una función pura con pruebas.
   - Idempotencia con `UNIQUE (tenant_id, idempotency_key)` (CA-FAC-06).
   - Señal en `billing_period_signals` y evento solo cuando cambia (CA-FAC-07).
   - Saldo a favor según D-BIL-12 (CA-FAC-08).
2. Implementa `BillingAccountReadPort` y añade `paymentState`, opcional, a la agenda de corte (`getCutoffAgenda` y `CutoffAgendaResponse`), sin romper a sus consumidores (CA-FAC-10).
3. Prueba que ninguna operación cambia el estado de contratos ni de suscriptores (CA-FAC-12).

### F1 · `fe-platform` — Configuración → Facturación

Implementa el formulario de la política según la spec P0:
- vista previa de fechas que viene del servidor; el portal no calcula fechas;
- la combinación incompatible deshabilitada con explicación;
- `expectedUpdatedAt` y manejo del 409;
- `billingApi` en `apps/portal/src/lib/api-client.ts`, con tipos de `@iwana/shared`.

## Ola 4

### F2 · `fe-platform` — Documentos, pagos, ficha y agenda

1. Rutas `/dashboard/billing/documents` y `/dashboard/billing/payments`, con `PagePermissionGate` y el grupo «Facturación» en `Sidebar.tsx`.
2. La pestaña «Facturación» en la ficha del suscriptor, con un cambio mínimo en `SubscriberDetailClient.tsx`. Ese archivo tiene cambios sin commitear de MOD05: no los reescribas.
3. La columna de estado de pago en `CutoffAgendaClient.tsx`.
4. Las mutaciones envían `Idempotency-Key`.

## Validación

- **V1 · `sr-qa`:** E2E del HLD §10 contra la API real (política → generación → emisión → pago → agenda en «pagado») y cobertura de CA-FAC-01 a 15. Escribe pruebas, no código de producto.
- **V2 · `sec-eng`:** permisos, PII del adquirente, idempotencia y logs.
- **V3 · `boundary-reviewer` + `contract-drift-reviewer`:** Billing sin imports de entidades ajenas y ningún llamado al ciclo de vida; `@iwana/shared` igual que la API y el portal.
- **V4 · `ds-owner`:** `audit-ui.mjs` en 0 sobre las pantallas nuevas.
- **V5 · `gate-verifier`:** Gates Before Merge sin caché, con conteo; cobertura ≥80 % en `billing`; `pnpm audit:adr-citations` y `pnpm audit:doc-locations`.
