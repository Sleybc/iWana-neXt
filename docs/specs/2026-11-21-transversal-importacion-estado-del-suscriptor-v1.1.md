# Spec — Lista de suscriptores · Clientes con servicio activado

**Versión:** 1.1
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-21: «G0 aprobado», con D1–D3 tal como se proponen
**Fecha:** 2026-11-21
**Sustituye a:** [v1.0](2026-11-21-transversal-importacion-estado-del-suscriptor.md). Su G0 quedó sin efecto por el bloqueo H6; el usuario eligió la opción 1 el mismo día: «Opción 1, reescribe la spec»
**Relacionado:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) · [rediseño UX suscriptores](2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) · [complementar titular](2026-11-15-transversal-importacion-uisp-complementar-titular.md)

## 1. Hechos

| # | Hecho | Fuente |
|---|---|---|
| H1 | La importación crea todo suscriptor en `PROSPECT` con `activated_at` nulo, tenga o no servicio | `crm-migration-import.adapter.ts:195` (`createSubscriber`) |
| H2 | Los contratos importados conservan su estado real (`ACTIVE`, `SUSPENDED`, `TERMINATED`) | `crm-migration-import.adapter.ts` (`createContract`) |
| H3 | Desde `7bebb5eb`, la lista, la búsqueda, la búsqueda exacta y los conteos de colas solo incluyen a quien tiene `activated_at` y estado `ACTIVE`, `SUSPENDED` o `CANCELLED` | `subscribers.service.ts` (`ACTIVATED_SUBSCRIBER_SCOPE_SQL`, 3 usos) |
| H4 | Por H1 y H3, una cartera importada no aparece en la lista. Las E2E `portal-importacion-uisp-live:385` y `portal-importacion-uisp-usuarios-live:541` fallan en el CI de `main` (run 44908811979) | CI |
| H5 | Activar un contrato por `/crm/contracts/:id/activate` no cambia el estado del suscriptor: un `LEAD` con contrato activo tampoco aparece | `contracts.service.ts`; corregido solo para el buscador de facturación en `b84a0112` (parámetro `billable`) |
| H6 | Un importado no puede pasar a `ACTIVE` ni a `SUSPENDED`: `ck_subscribers_fiscal_complete_when_active` exige `vat_responsibility` (y representante legal si es jurídica), y UISP no los trae. El estrato da el tratamiento de IVA del servicio (`vat_treatment`), no la responsabilidad del RUT | `157_subscriber_fiscal_completeness.ts`; `legacyVatTreatment` |
| H7 | La regla de `7bebb5eb` busca ocultar a los prospectos **sin servicio** («un prospecto queda fuera de la búsqueda») | `portal-crm-suscriptores-ux-qw-live.spec.ts` (V1) |

## 2. Regla

La lista, la búsqueda, la búsqueda exacta y los conteos de colas de suscriptores incluyen a quien cumple **una** de estas condiciones:

1. Tiene `activated_at` y estado `ACTIVE`, `SUSPENDED` o `CANCELLED` (la regla actual).
2. Tiene al menos un contrato no borrado en `ACTIVE`, `SUSPENDED` o `TERMINATED` (servicio que llegó a activarse), sea cual sea su estado.

- Es el alcance que hoy usa solo el buscador de facturación (`BILLABLE_SUBSCRIBER_SCOPE_SQL`), que pasa a ser el único. El parámetro `billable` de `b84a0112` se retira de la API y del api-client.
- El suscriptor conserva su estado. Un importado sin datos fiscales aparece como «Prospecto» con servicio activo hasta completar esos datos por la vía normal. La importación no cambia.
- El prospecto sin ningún contrato activado sigue fuera (H7).

**Fuera de alcance:**

- Cambiar el estado o `activated_at` de los importados (bloqueado por H6).
- Rellenar `vat_responsibility` con un valor por defecto: es un dato fiscal y requeriría dictamen del contador.
- El dashboard: sus altas se cuentan por `activated_at` y ya excluyen `import_batch_id`.

## 3. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Las tres consultas de H3 usan el alcance de §2; una prueba unitaria por consulta |
| CA-2 | Un `PROSPECT` sin contratos, o solo con contratos `DRAFT` o `ARCHIVED`, no aparece en lista, búsqueda ni conteos |
| CA-3 | Un `PROSPECT` o `LEAD` con un contrato `ACTIVE`, `SUSPENDED` o `TERMINATED` sí aparece |
| CA-4 | `billable` ya no existe en el controlador, el servicio ni el api-client; el buscador de facturación sigue encontrando al titular de `portal-billing-flow` |
| CA-5 | Pasan sin cambiar sus aserciones: `portal-importacion-uisp-live`, `portal-importacion-uisp-usuarios-live`, `portal-billing-flow` y `portal-crm-suscriptores-ux-qw-live` (V1). **Excepción aprobada por el usuario el 2026-11-21 («Sí, ajústalas»):** el caso del complemento de `portal-importacion-uisp-live` esperaba ver en la lista a un titular sin servicio antes de promover y después de revertir. Ahora espera la lista vacía y que su ficha responda 200; la comprobación de que no hay duplicado tras promover no cambia |

## 4. Decisiones para el G0

| # | Decisión | Propuesta |
|---|---|---|
| D1 | ¿Un único alcance o dos? | Uno. Retirar `billable` evita que la lista y facturación vuelvan a divergir |
| D2 | Filtro «Estado» de la lista (solo Activo, Suspendido y Cancelado) | Sin cambios. Los prospectos con servicio aparecen sin filtro de estado, pero no se pueden filtrar como «Prospecto». Si se necesita, va en un cambio aparte |
| D3 | ¿Enmienda de ADR-110? | No: la importación no cambia. Se registra en el informe de cierre |
