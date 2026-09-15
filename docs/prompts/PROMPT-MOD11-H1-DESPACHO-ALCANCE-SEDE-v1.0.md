# PROMPT DE EJECUCIÓN — MOD11 · H1: el despacho no valida el alcance sobre la sede

**Versión:** 1.0
**Fecha:** 2026-09-15
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`) · **C:** `sec-eng` (condición de cierre)
**Estado:** **Ejecutable y bloqueante.** E3 no arranca hasta que esto cierre.

## Vínculos de trazabilidad

- Origen del hallazgo: auditoría de AI-EM-ARCH del 2026-09-15 sobre el cierre de E2
- Spec: `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0 §3.6.1
- ADR marco: [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) §D6 c.3 · [ADR-076](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md) (Aprobado) §D1
- Informe de E2: `docs/informes/INFORME-MOD11-ORIGEN-OT-E2-v1.0.md` — **§5 y su P3 son el punto de partida, y su severidad está mal calibrada (ver §2)**

---

## 1. El defecto

`dispatchFromCoordination` valida el origen y su referencia, pero **nunca comprueba que el actor tenga alcance de supervisión sobre `organizationSiteId`**. No llama a `assertSupervisionScope` ni al puerto de acceso organizacional.

Y la ruta no lo compensa: `POST /tasks/execution-orders/dispatch` lleva `@ExecutionOrderTenantScoped()` —correcto, porque no hay `:id`—, lo que hace que el guard **retorne antes de comprobar nada**.

Los otros cuatro comandos de coordinación —`assign`, `follow-ups`, `reconciliation` y la lectura con `SUPERVISE`— sí pasan por `assertSupervisionScope`. **El despacho es el único que escribe sin comprobarlo.**

**Lo más grave es lo que dice el comentario que E2 dejó sobre la ruta:**

> «el scoping vive en `TenantContext` + `@Roles` + **validación del servicio**»

Esa validación del servicio **no existe**. El código afirma un control que no está — la misma familia de defecto que T0 vino a corregir en `assign()`.

## 2. Por qué no es «una OT muerta»: quema el origen

El informe de E2 lo clasifica como **P3**, razonando que una sede inválida «equivale operativamente a una OT muerta, nunca a fuga». **Esa calibración es incorrecta, y el motivo es el índice de E1.**

La unicidad activa es `(tenant_id, origin_context, origin_ref, work_type)` — **sin sede**. Por tanto un despacho hacia una sede ajena **bloquea el despacho legítimo** de ese mismo origen con `DUPLICATE_ACTIVE_WORK`.

Y no hay salida: la OT queda en `CREATED`, invisible para el campo por el dictamen de `sec-eng`, inasignable por quien la creó —fail-closed sobre la sede que no supervisa— y sin vía de cancelación mientras ADR-090 §D3 no esté implementado.

**Resultado: cualquier rol de supervisión puede bloquear indefinidamente el trabajo de campo de cualquier sede del tenant.** Eso es denegación, no una fila huérfana.

## 3. Pasos

1. **El despacho valida el alcance del actor sobre la sede declarada**, con el mismo mecanismo y el mismo carácter fail-closed que ya usan los otros comandos de coordinación. **Reutiliza lo que existe**: `assertSupervisionScope` y `OrganizationOperationalAccessPort` están ahí y son el precedente. No inventes un segundo camino de autorización.

2. **Decide y justifica la forma del rechazo.** Los comandos sobre `:id` responden 404 para no filtrar existencia. Aquí no hay recurso previo que ocultar: la sede la aporta el cliente. Elige entre 403 y 404 y **razónalo en el informe** — es decisión de diseño, no detalle.

3. **Revisa si hay otra ruta sin `:id` en el mismo estado.** `@ExecutionOrderTenantScoped()` desactiva la comprobación ABAC del guard por diseño; cualquier ruta que lo lleve y **escriba** necesita su propia validación en el servicio. Inventaría las que existan; corrige solo las que sean el mismo defecto.

4. **Corrige el comentario de la ruta.** Hoy documenta un control inexistente. Un comentario que miente es peor que ninguno: la próxima auditoría lo dará por cierto.

## 4. Tests

5. **Por negación, que es el único criterio que vale.** Un actor con rol de supervisión **sin** alcance sobre la sede **no puede despachar** hacia ella. Comprobar solo que el que sí tiene alcance lo consigue deja el hallazgo abierto.
6. **El caso que hace daño:** un despacho rechazado **no deja rastro que bloquee el origen**. Tras el rechazo, el despacho legítimo de ese mismo origen **debe funcionar**. Si el rechazo ocurre después de insertar, el origen queda quemado igual y no habremos arreglado nada.
7. **Sin regresión de alcance:** quien sí supervisa la sede sigue despachando exactamente igual que antes.
8. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`. La suite de `tasks` **no baja de 676**.
9. La suite completa de la API **sigue terminando sola**: `pnpm --filter @iwana/api test:exit-guard`.

## 5. Restricciones no negociables

- **Alcance mínimo.** Esto corrige una validación ausente. **No toques** el esquema, la guarda de unicidad de E1, el pool reclamable ni el contrato de `@iwana/shared`.
- **No inventes un segundo mecanismo de autorización.** Si el puerto existente no alcanza, **detente y emite `[BLOQUEO]`**: sería frontera y es dictamen de AI-EM-ARCH.
- **No amplíes ni reduzcas quién puede despachar.** El rol sigue siendo coordinación; lo que se añade es el alcance sobre la sede.
- **No abras la vía de cancelación aquí.** Es T2 de `docs/plans/2026-09-14-mod11-correccion-ot.md`, ahora desbloqueado por ADR-090 (Aprobado).
- Sin PII real en fixtures ni tests.

## 6. Entregables

- Validación de alcance en el despacho, fail-closed y reutilizando el puerto existente.
- Tests de los puntos 5 a 7, con el de origen no quemado (punto 6) como el central.
- Comentario de la ruta corregido.
- Informe en `docs/informes/` con la decisión del paso 2, el inventario del paso 3 y deuda por severidad.

## 7. Stop/go

**GO si y solo si:**

- Un supervisor **sin** alcance sobre la sede **no puede despachar** hacia ella (punto 5).
- Tras un rechazo, el origen **sigue libre** para el despacho legítimo (punto 6).
- Quien sí supervisa la sede despacha igual que antes (punto 7).
- `tasks` ≥ 676 con conteo real, y la suite completa termina sola.
- **Dictamen de `sec-eng`** confirmando que no queda ruta de escritura sin alcance.

**NO-GO si:** la validación ocurre después de insertar la fila. Rechazar tarde deja el origen bloqueado igual, y el defecto seguiría vivo con apariencia de cerrado.
