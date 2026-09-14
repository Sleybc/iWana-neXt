# ADR-088: El cierre de la OT y la culminación de la instalación son hitos separados

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-09-14
**Aprobado por:** CTO Humano — 2026-09-14
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Aprobación requerida:** CTO (cambio de boundary — perfil §5)
**Módulos:** MOD11 Ejecución Operativa · MOD05 CRM · Provisioning (futuro)
**Relacionado:** [ADR-046](ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md) (Aprobado, boundary de tasks) · [ADR-047](ADR-047-Separacion-Programacion-y-OT-Ejecucion.md) (Aprobado) · [ADR-068](ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado) · [ADR-027](ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md) (Aprobado)
**Spec que lo desarrolla:** `docs/specs/2026-09-14-mod11-acta-instalacion-design.md`

---

## Contexto

El CTO observó el 2026-09-14 que la consola de la OT `OTE-20260828-001` marcaba **«Actividad de instalación → Cumplido»** sobre una instalación que no estaba culminada, y fijó la definición de negocio: *una instalación está culminada cuando se instalan los equipos, se aprovisiona el servicio y se firma el contrato.*

La verificación en código mostró dos problemas de distinta naturaleza.

**El primero es de plantilla, no de motor.** El requisito `installation-activity` de `INSTALACION_ESTANDAR` v1 se llama «Actividad de instalación» y su regla es `activities.some(a => a.activityType === 'INSTALLATION')` (`apps/api/src/modules/tasks/services/closure-gate-evaluator.service.ts:145-148`). Se satisface **registrando una nota de bitácora**: es un acuse de registro con etiqueta de resultado. El evaluador cumple su regla; la plantilla promete lo que la regla no comprueba.

**El segundo es de boundary, y es el que motiva este ADR.** De las tres condiciones del CTO, solo una es representable hoy en el sistema:

| Condición | Estado verificado |
| --- | --- |
| Equipos instalados | `InventoryDisposition.INSTALLED_AT_CUSTOMER` existe y se persiste en `execution_order_item_usages.final_disposition`, pero **el evaluador no lo mira**: `evaluateMaterial` compara solo `itemCategory` (`closure-gate-evaluator.service.ts:165-173`), de modo que un `RETURNED_TO_WAREHOUSE` satisface igual que un equipo instalado |
| Servicio aprovisionado | **El módulo de Provisioning no existe.** Hay un evaluador de pre-requisitos en CRM (`apps/api/src/modules/crm/provisioning-readiness.ts`), un puerto `ProvisioningActivationPort` cuya firma es `Promise<void>` —no consultable— y un adaptador stub vacío (`crm/adapters/stub-provisioning-activation.adapter.ts:6`). El PRD lo declara no construido y lo sitúa en la ola posterior a Billing |
| Contrato firmado | `ContractStatus` no tiene `SIGNED` (`crm/enums/contract-status.enum.ts:1-7`). «Firmado» es la convención `DRAFT → ACTIVE`, y `reactivate()` produce el mismo estado por la misma vía (`crm/contracts/contracts.service.ts:284-341`): `ACTIVE` no prueba que hubo firma. No hay `signedAt`, `signedBy` ni evidencia, y `ExecutionOrder` **no lleva `contractId`** —`ScheduleEvent` y `VisitRequest` sí lo llevan— |

**El riesgo de responder sin decidir el boundary.** Añadir las tres condiciones como requisitos de la plantilla produciría **OT permanentemente incerrables**, exactamente el defecto que ya existe con los requisitos `FIELD` y `MEASUREMENT` —cuyo contexto se alimenta vacío porque no hay vía de captura—.

Y hay un problema más profundo que el de disponibilidad: **exigir el aprovisionamiento como condición de cierre de la OT crea un ciclo de dependencia**. En el flujo operativo de un ISP, el cierre de la OT es lo que habilita la activación comercial y la facturación; si la OT no puede cerrarse hasta que el servicio esté comercialmente activo, ninguno de los dos hitos ocurre nunca.

El CTO resolvió la ambigüedad el mismo día: **la activación técnica en campo y la activación comercial son cosas distintas**, y **el acta de conformidad y el contrato legal son requisitos distintos**.

---

## Decisión

### D1. «OT cerrada» y «instalación culminada» son dos hitos con dueños distintos

| Hito | Dueño | Qué afirma | Se prueba con |
| --- | --- | --- | --- |
| **OT cerrada** | **MOD11** | El técnico terminó su trabajo en campo | Los requisitos de la plantilla de la OT |
| **Instalación culminada** | **El vínculo comercial del suscriptor (MOD05)**, nunca la OT | El servicio está vivo y el vínculo comercial en regla | OT cerrada **más** activación comercial confirmada **más** contrato legal firmado |

**La OT no es dueña del estado «instalación culminada» y no debe exponerlo.** Su ciclo de vida termina antes de que ese estado pueda determinarse. Una OT cerrada es una condición necesaria de la culminación, nunca suficiente.

### D2. El gate de cierre de la OT exige la activación **técnica**, no la comercial

La OT puede y debe exigir que el técnico **deje el servicio funcionando** —lo que él verifica en sitio y puede evidenciar—. No puede exigir la activación comercial ni la facturación, que ocurren después y por otra vía.

Esta es la decisión que rompe el ciclo del §Contexto.

### D3. Dos firmas distintas, con dueños distintos

- **Acta de conformidad de campo** — el cliente firma que recibió el servicio conforme. Es de **MOD11**, ya existe como evidencia `SIGNATURE` con `requirementKey = CUSTOMER_SIGNATURE`, y es requisito del cierre de la OT.
- **Contrato legal del suscriptor** — el documento comercial. Es de **MOD05**, hoy no es verificable, y es requisito de la **culminación**, no del cierre de la OT.

Confundirlas es lo que hacía que «firma del cliente» pareciera cubrir el contrato.

### D4. Un requisito de plantilla solo es legítimo si su regla comprueba lo que su etiqueta promete

Regla de gobierno sobre el catálogo de plantillas, derivada del defecto que originó este ADR:

- Un requisito **`ACTIVITY` no prueba un resultado**: prueba que alguien registró una anotación de ese tipo. No debe etiquetarse como si verificara la ejecución de un trabajo.
- Un requisito cuya condición **no puede satisfacerse con los medios de captura existentes** no se publica como `required`: produce una OT incerrable. Se publica como no requerido, o no se publica.

### D5. Ninguna capacidad ausente se sustituye por una declaración del técnico

Mientras no exista la señal real, **no se acepta una autodeclaración como prueba**. Un campo «servicio aprovisionado: sí» marcado por quien ejecuta no es verificación: es el mismo defecto que este ADR corrige, con otro nombre. La condición se declara pendiente y visible, con su causa.

---

## Consecuencias

**Positivas**

- El cierre de la OT deja de ser un ciclo imposible y pasa a depender solo de lo que el técnico controla y puede evidenciar.
- El checklist deja de afirmar resultados que no comprueba: lo que la pantalla dice pasa a ser verificable.
- La culminación de la instalación queda modelada donde su ciclo de vida sí cabe, y queda disponible cuando existan Provisioning y la firma de contrato, sin rediseñar MOD11.
- Las OT no se vuelven incerrables por requisitos sin vía de captura.

**Negativas y costes**

- Publicar `INSTALACION_ESTANDAR` v2 **no re-snapshotea ninguna OT existente**: el snapshot se congela al crear la orden y publicar una versión nueva no toca las órdenes vivas, ni siquiera las no iniciadas. La v2 aplica solo a OT nuevas, y la coexistencia de dos definiciones exige política explícita de migración.
- El estado «instalación culminada» queda **sin dueño implementado** hasta que exista el módulo de Provisioning. Es una ausencia declarada, no una deuda oculta.
- Endurecer `evaluateMaterial` para exigir `INSTALLED_AT_CUSTOMER` **cambia el resultado del gate** para plantillas que ya usen requisitos `MATERIAL`: es un cambio de comportamiento, no solo de datos, y debe entrar con la versión de plantilla, no por separado.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Las plantillas son por tenant. Publicar la v2 es un acto por tenant, no global; la política de migración debe declararlo. |
| **Seguridad** | Sin ampliación de superficie en el cierre de la OT. El acceso al contrato legal (D3) sí la ampliaría y se decide en su propio tramo, con revisión de AI-SEC-ENG por tratarse de datos del suscriptor. |
| **Escala** | `buildMaterialEvaluationUsages` consulta el catálogo de Inventario **una vez por consumo** y corre en cada lectura del detalle. Una plantilla con requisitos `MATERIAL` multiplica esas consultas por cada `GET` de la OT: debe medirse antes de generalizar la v2. |
| **Regulación** | El acta de conformidad firmada es el soporte de la entrega del servicio. Su custodia ya está cubierta por el flujo de evidencias; este ADR no la modifica. |
| **Boundaries** | **Se aclara uno existente, no se crea otro.** MOD11 sigue siendo owner de `ExecutionOrder`; MOD05 del vínculo comercial. La consulta entre módulos, cuando llegue, será por interfaz tipada — nunca acceso a tablas ajenas. |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Se implementa el endurecimiento de `MATERIAL` sin publicar la plantilla v2, o al revés: el gate cambia de criterio sin que la definición lo acompañe | Ambos entran en el mismo tramo y con la misma versión de plantilla |
| R2 | Las OT vivas quedan con la definición v1 y conviven dos criterios de cierre sin que nadie lo sepa | La política de migración es entregable obligatorio del tramo, no una nota |
| R3 | Se cede a la presión de «marcar» el aprovisionamiento con un campo manual para no dejarlo pendiente | D5 lo prohíbe explícitamente |
| R4 | El requisito de servicio navegando se implementa con `MEASUREMENT`, que no tiene vía de captura, y vuelve a producir OT incerrables | El tramo usa el medio de captura que sí existe; ampliar la captura de mediciones es trabajo aparte y declarado |
| R5 | Se interpreta que este ADR obliga a construir Provisioning ya | Declara el dueño del hito, no su calendario: el módulo sigue en su ola del roadmap |

---

## Alternativas descartadas

**A1 — Exigir las tres condiciones como requisitos de la OT.** Es la lectura literal de la definición del CTO y la razón por la que este ADR existe. Se descarta porque dos de las tres no son representables, y porque el aprovisionamiento como condición de cierre crea el ciclo del §Contexto: produciría OT que nunca cierran.

**A2 — Dejar el requisito `ACTIVITY` y cambiar solo su etiqueta.** Barato y honesto, pero no mejora lo que el gate comprueba: la instalación seguiría dándose por buena con una nota de bitácora. Queda incorporado como parte de D4, no como solución.

**A3 — Que MOD11 posea el estado «instalación culminada» y lo actualice al recibir eventos de otros módulos.** Daría una respuesta única desde la OT, pero obliga a MOD11 a mantener un estado cuyo ciclo de vida excede al suyo y a conocer reglas comerciales ajenas. Contradice el boundary de ADR-046.

**A4 — Bloquear todo hasta que exista Provisioning.** Deja vivo un checklist que afirma cosas falsas durante toda la ola intermedia, que es el defecto reportado.
