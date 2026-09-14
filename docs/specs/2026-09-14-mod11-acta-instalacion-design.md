# Diseño — MOD11: qué exige la OT para cerrarse y qué significa instalación culminada

**Versión:** 1.0
**Estado:** **Aprobado por el CTO (2026-09-14)** — contratos de §7 congelados desde esta aprobación.
**Fecha:** 2026-09-14
**Modo activo:** Mixto (Product Architect + Architect)
**Autor:** AI-EM-ARCH
**Origen:** el CTO observa que el checklist de `OTE-20260828-001` marca «Actividad de instalación → Cumplido» sobre una instalación no culminada.

**ADR que desarrolla:** [ADR-088](../adrs/ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md)
**ADRs relacionados:** ADR-046 (Aprobado), ADR-047 (Aprobado), ADR-066 (Aprobado), ADR-067 (Aprobado), ADR-068 (Aprobado)
**Spec hermana vigente:** `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobada) — **esta spec no la supera**: aquella hizo que el checklist muestre el estado real de cada requisito; esta corrige **qué requisitos** debe haber.
**Plan de orquestación:** `docs/plans/2026-09-14-mod11-acta-instalacion.md`

---

## 1. Objetivo

Que el checklist de la OT deje de dar por cumplida una instalación que no lo está, y que la definición de «instalación culminada» quede modelada donde su ciclo de vida cabe.

## 2. Problema

### 2.1 El checklist no miente: la plantilla promete de más

`INSTALACION_ESTANDAR` v1 (`packages/database/src/migrations/tenant/118_seed_default_execution_order_templates.ts:151-187`) declara tres requisitos:

| key | label | kind | config |
| --- | --- | --- | --- |
| `installation-activity` | Actividad de instalación | `ACTIVITY` | `activityType: INSTALLATION` |
| `work-photo` | Evidencia fotográfica | `EVIDENCE` | `evidenceType: PHOTO` |
| `CUSTOMER_SIGNATURE` | Firma del cliente | `EVIDENCE` | `evidenceType: SIGNATURE` |

La regla de `ACTIVITY` es `activities.some(a => a.activityType === req.activityType)` (`apps/api/src/modules/tasks/services/closure-gate-evaluator.service.ts:145-148`). **Se satisface registrando una nota de bitácora.** En la OT auditada, la actividad registrada fue una descripción de texto libre; el requisito pasó a «Cumplido» sin que nada del trabajo real se verificara.

El evaluador es correcto respecto a su regla. El defecto está en que **la etiqueta promete un resultado que la regla no comprueba** — lo que ADR-088 §D4 convierte en regla de gobierno.

Agravante: `activityType` es **texto libre sin catálogo**. El DTO solo valida longitud (`apps/api/src/modules/tasks/dto/execution-orders.dto.ts:71-76`) y el gate compara por igualdad exacta contra `"INSTALLATION"`. El técnico debe escribir esa cadena exacta, sin ayuda del contrato ni del portal.

### 2.2 De las tres condiciones del CTO, solo una es representable hoy

| Condición | Estado verificado |
| --- | --- |
| **Equipos instalados** | `InventoryDisposition.INSTALLED_AT_CUSTOMER` se persiste en `execution_order_item_usages.final_disposition`, pero `evaluateMaterial` **solo compara `itemCategory`** (`:165-173`): un `RETURNED_TO_WAREHOUSE` satisface igual que un equipo instalado |
| **Servicio aprovisionado** | **No existe el módulo de Provisioning.** Hay un evaluador de pre-requisitos en CRM, un puerto `Promise<void>` no consultable y un adaptador stub vacío (`crm/adapters/stub-provisioning-activation.adapter.ts:6`). El PRD lo declara no construido |
| **Contrato firmado** | `ContractStatus` carece de `SIGNED` (`crm/enums/contract-status.enum.ts:1-7`); «firmado» ≡ `ACTIVE` por convención, y `reactivate()` produce el mismo estado (`crm/contracts/contracts.service.ts:284-341`). Sin `signedAt`, sin evidencia, sin auditoría. `ExecutionOrder` **no lleva `contractId`** — `ScheduleEvent` sí (`packages/database/src/entities/schedule-event.entity.ts:121-123`) |

## 3. Decisión de alcance

Tomada por el CTO el 2026-09-14, en tres respuestas que fijan el modelo:

| # | Decisión | Consecuencia |
| --- | --- | --- |
| **D1** | La activación **técnica en campo** y la **comercial** son distintas | La OT exige la primera. La segunda ocurre después, y exigirla crearía un ciclo: la OT no cerraría nunca |
| **D2** | El acta de conformidad y el contrato legal son **requisitos distintos** | Dos firmas, dos dueños: campo (MOD11, ya existe) y comercial (MOD05, no verificable hoy) |
| **D3** | **Diseñar el modelo completo primero** | Esta spec y el ADR son el entregable. La implementación entra por tramos (§8) |

**Fuera de alcance:** construir el módulo de Provisioning; ampliar la captura de mediciones; la UI de administración de plantillas.

## 4. Diseño

### 4.1 Dos hitos, no uno

Es el eje, y viene de ADR-088 §D1:

| Hito | Dueño | Qué afirma |
| --- | --- | --- |
| **OT cerrada** | MOD11 | El técnico terminó su trabajo en campo |
| **Instalación culminada** | El vínculo comercial del suscriptor (MOD05) | OT cerrada **+** activación comercial **+** contrato legal firmado |

La OT **no expone** el segundo estado. Una OT cerrada es condición necesaria de la culminación, nunca suficiente.

### 4.2 `INSTALACION_ESTANDAR` v2 — lo que la OT debe exigir

| # | Requisito | Kind | Verificable hoy | Nota |
| --- | --- | --- | --- | --- |
| 1 | Equipos instalados en el cliente | `MATERIAL` + disposición | **Tras §4.3** | Sustituye a `ACTIVITY` como prueba de que el trabajo se hizo |
| 2 | Servicio funcionando en sitio | `EVIDENCE` | **Sí** | Evidencia de la prueba de servicio. Es la activación **técnica** de D1 |
| 3 | Evidencia fotográfica | `EVIDENCE PHOTO` | **Sí** | Sin cambios |
| 4 | Acta de conformidad firmada | `EVIDENCE SIGNATURE` | **Sí** en backend | Su captura en portal llega con la Ola 2 de la spec hermana |
| 5 | Registro de la actividad en bitácora | `ACTIVITY` | Sí | **Deja de ser requerido.** Su valor es trazabilidad, no verificación (ADR-088 §D4) |

**El requisito de contrato legal no entra en la plantilla de la OT**: pertenece a la culminación (§4.1), no al cierre. Ponerlo aquí produciría OT incerrables.

**Por qué el requisito 2 usa `EVIDENCE` y no `MEASUREMENT`.** `MEASUREMENT` sería la expresión natural de una prueba de velocidad, pero **no tiene vía de captura**: `RegisterFieldWorkSchema` es estricto y no acepta mediciones, y el contexto del evaluador se alimenta con `measurements: []`. Un requisito `MEASUREMENT` requerido es una OT incerrable. Se usa el medio que existe; ampliar la captura de mediciones queda declarado en §10.

### 4.3 Endurecer `MATERIAL`: la disposición debe contar

Hoy `evaluateMaterial` comprueba `itemId` no vacío e `itemCategory` coincidente. **La disposición final no participa**, así que un material devuelto a bodega satisface un requisito de material instalado.

El requisito `MATERIAL` gana la capacidad de exigir una disposición concreta, de forma **aditiva y opcional**: un requisito que no la declare se comporta como hoy. Cuando la declara, el consumo debe además coincidir en `finalDisposition`.

Con eso, «equipos instalados» pasa de ser una afirmación a ser una verificación — y es lo que sustituye al `ACTIVITY` requerido como prueba del trabajo.

**El contexto del evaluador debe transportar la disposición**, que hoy no llega: la consulta de consumos y el mapeo hacia `itemUsages` deben incluirla en los dos puntos que evalúan —progreso y cierre—, o el predicado quedará siempre falso. Es el mismo modo de fallo que la spec hermana documentó al publicar el estado por requisito.

### 4.4 Política de migración de plantilla

Publicar una versión nueva **no re-snapshotea ninguna OT**: el snapshot se congela al crear la orden (`apps/api/src/modules/tasks/services/execution-orders.service.ts:785-790`) y `publishVersion` no toca `execution_orders`. Ni siquiera las OT no iniciadas adoptan la definición nueva.

Por tanto la v2 aplica **solo a OT creadas después de publicarla**, y durante un tiempo convivirán dos definiciones de cierre. Esa convivencia es aceptable —el snapshot inmutable es una garantía deliberada, no un defecto— pero **debe declararse**: el tramo que publique la v2 entrega la política de migración como artefacto, indicando qué pasa con las OT vivas bajo v1 y si alguna se re-crea.

**Lo que no se hará:** re-escribir snapshots de OT ya iniciadas. Cambiar el criterio de cierre bajo los pies de una orden en curso es peor que la convivencia.

## 5. Lo que esta spec declara pendiente y no resuelve

Honestidad de alcance, para que ningún tramo lo descubra a mitad:

- **El estado «instalación culminada» no se implementa aquí.** Queda modelado y sin dueño implementado hasta que exista Provisioning.
- **El contrato legal no se vuelve verificable aquí.** Requiere trabajo en MOD05 y un vínculo que la OT perdió.
- **La captura de mediciones sigue sin existir**, y con ella los requisitos `MEASUREMENT` y `FIELD` siguen siendo incerrables si se declaran requeridos.

## 6. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Las plantillas son por tenant: publicar la v2 es un acto por tenant, no global. Sin migración de datos transversal. |
| **Seguridad** | **Sin ampliación de superficie.** No se toca RBAC, ABAC ni la política de acceso de la OT. El acceso al contrato legal se decide en su propio tramo, con AI-SEC-ENG. |
| **Escala** | `buildMaterialEvaluationUsages` consulta el catálogo de Inventario **una vez por consumo** (`execution-orders.service.ts:2636-2672`) y corre en **cada lectura del detalle**. Generalizar requisitos `MATERIAL` multiplica esas consultas por cada `GET`: medir antes de publicar la v2 en tenants con volumen. |
| **Regulación** | El acta de conformidad firmada es el soporte de entrega del servicio; su custodia no cambia. |
| **Boundaries** | Ninguno cruzado en el tramo ejecutable. MOD11 sigue siendo owner de `ExecutionOrder`. |

## 7. Contratos congelados por esta spec

**Congelados desde la aprobación del CTO del 2026-09-14.**

| Contrato | Artefacto | Dueño |
| --- | --- | --- |
| **Requisito `MATERIAL` con disposición** | Ampliación aditiva y opcional de la variante `MATERIAL` en `packages/shared/src/contracts/operations/execution-orders.ts` (hoy **v1.1**) | AI-SR-FULL |
| **Definición de `INSTALACION_ESTANDAR` v2** | §4.2 de esta spec, materializada como versión publicada de plantilla | AI-EM-ARCH (definición) · AI-SR-FULL (publicación) |

El contrato de OT ya fue ampliado a v1.1 por la spec hermana. Esta ampliación sube a **v1.2** por el mismo procedimiento: campo opcional, sin romper consumidores, con historial en el docstring y re-sync notificado (protocolo §3bis regla 1).

## 8. Criterios de aceptación

**Tramo 1 — ejecutable al aprobar**

- **CA-01** — Un requisito `MATERIAL` que declare disposición **no** se satisface con un consumo devuelto a bodega.
- **CA-02** — El mismo requisito **sí** se satisface con un consumo `INSTALLED_AT_CUSTOMER`: el endurecimiento no invierte el defecto.
- **CA-03** — Un requisito `MATERIAL` que **no** declare disposición se comporta exactamente como hoy (retrocompatible).
- **CA-04** — La disposición llega al evaluador **en los dos puntos**, progreso y cierre, con el mismo resultado.
- **CA-05** — Sobre una OT **creada bajo la v2**, el requisito de equipos instalados aparece **pendiente** mientras no exista un consumo con la disposición exigida.

  *(Corregido el 2026-09-14 en la consolidación del tramo.* La v1.0 anclaba este criterio a `OTE-20260828-001`, y **era incoherente con §4.4**: esa orden tiene su snapshot congelado en la v1 —verificado en base de datos: `template_version_number = 1`, tres requisitos, el primero `ACTIVITY installation-activity`— y por tanto **nunca tendrá** el requisito de equipos instalados. El criterio era inverificable por diseño sobre esa orden. El defecto era de esta spec, no de la ejecución.)*
- **CA-06** — El requisito de bitácora ya no es requerido y su etiqueta no promete verificación de trabajo.
- **CA-07** — La política de migración de §4.4 está entregada y dice qué ocurre con las OT vivas bajo v1.

**Tramos 2 y 3** — sus criterios se emiten al desbloquearse; no se anticipan aquí.

## 9. Fases

Detalle, dependencias, matriz de dispatch y stop/go en `docs/plans/2026-09-14-mod11-acta-instalacion.md`.

| Tramo | Alcance | Desbloqueado por |
| --- | --- | --- |
| **T1** | §4.2 (sin el requisito 5), §4.3 y §4.4 | Aprobación de ADR-088 y de esta spec |
| **T2** | Contrato legal verificable, vínculo OT↔contrato, `policyKey` respetado | Decisión del CTO sobre el modelo de firma en MOD05 |
| **T3** | El estado «instalación culminada» como agregado fuera de la OT | Módulo de Provisioning |

## 10. Deuda registrada, fuera de alcance

1. **`evaluateCompliance` ignora `policyKey`** (`closure-gate-evaluator.service.ts:175-182`): un solo artefacto satisface **todos** los requisitos `COMPLIANCE` de la plantilla. Bloqueante para el tramo 2.
2. **`ExecutionOrderItemUsage` no tiene `requirement_key`**: no se puede anclar un consumo a un requisito concreto; cualquier consumo de la categoría correcta satisface cualquier requisito `MATERIAL` de esa categoría.
3. **`activityType` es texto libre sin catálogo**, comparado por igualdad exacta por el gate.
4. **`FIELD` y `MEASUREMENT` sin vía de captura** — arrastrada de la spec hermana §10.1.
5. **La migración 118 escribe un snapshot hardcodeado en su backfill** aunque el tenant tuviera otra plantilla activa distinta: las columnas `template_*` apuntarían a una plantilla y el snapshot congelado a otra.
6. **Solo existe plantilla para `INSTALLATION`**: cualquier otro `workType` produce OT incerrables por `CLOSURE_GATE_SNAPSHOT_MISSING`.
7. **No hay UI de administración de plantillas** pese a que el api-client del portal está completo (`apps/portal/src/lib/api-client.ts:7123-7185`): publicar la v2 es hoy un acto solo por API.
8. **`createTemplate` descarta `requirements` y `reasonCatalogs` del body** (`execution-order-templates.service.ts:98-112`), y los POST de plantillas entran sin validación de esquema.

## 11. Artefactos que esta spec NO supera

Ninguno. No contradice la spec hermana del 2026-09-14 —la complementa en el eje de plantilla—, ni la del 2026-09-13, ni los ADR-046/047/066/067/068.
