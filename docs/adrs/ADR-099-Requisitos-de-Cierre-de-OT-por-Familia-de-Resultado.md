# ADR-099: Los requisitos de la plantilla de cierre se evalúan según la familia del resultado de la OT

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-10-23
**Aprobado por:** CTO Humano — 2026-10-23, con E1 = (a) y E2 = sí
**Autor:** AI-EM-ARCH
**Modo activo:** Architect + EM
**Aprobación requerida:** CTO — cambia el criterio del gate de cierre para todas las plantillas y extiende la lista de resultados de ADR-098 D5 (E1)
**Módulos:** MOD11 Ejecución Operativa · MOD13 Red y Aprovisionamiento (consumidor del cierre) · MOD09 Programación (dueño de la causa de no realización)
**Relacionado:** [ADR-068](ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado, gate determinista) · [ADR-077](ADR-077-Ciclo-Vida-Visita-No-Realizada.md) (Aprobado, causa obligatoria) · [ADR-088](ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md) (Aprobado, D4 y D5) · [ADR-090](ADR-090-Correccion-de-OT-Dueno-del-Dato-y-Anulacion-por-Error.md) (Aprobado, anulación) · [ADR-098](ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) (Aprobado, D3 y D5)
**Plan:** [2026-10-23-mod11-gate-cierre-por-resultado](../plans/2026-10-23-mod11-gate-cierre-por-resultado.md)

---

## Contexto

Durante la Fase 01 de MOD13, el bloque V1-ci de `sr-qa` quiso probar que cerrar una OT de instalación como `NOT_EXECUTED` libera la IP reservada (ADR-098 D3). No pudo hacerlo, porque MOD11 no permite ese cierre sin haber registrado un CPE instalado.

### Verificación en código (2026-10-23, árbol de `main` en `42d4b7b5`)

`ExecutionOrdersService.close()` (`apps/api/src/modules/tasks/services/execution-orders.service.ts`, bloque «Closure gate evaluation») pasa al evaluador **el snapshot completo** de la plantilla, sea cual sea el resultado. Solo filtra el requisito `PROVISIONING`, y solo cuando el resultado es `NOT_EXECUTED` o el ajuste de MOD13 está apagado. `ClosureGateEvaluatorService.evaluate()` no recibe el resultado: aplica a todos los requisitos `required` la misma regla, que es la del trabajo ejecutado.

| Resultado | Qué evalúa hoy el gate | Origen |
| --- | --- | --- |
| `EXECUTED`, `EXECUTED_WITH_OBSERVATIONS` | Todo el snapshot, con `PROVISIONING` consultando el puerto de MOD13 | `5de2f5eb` (2026-07-27) + MOD13 Ola 6 |
| `NOT_EXECUTED` | Todo el snapshot salvo `PROVISIONING` | `5de2f5eb` + MOD13 |
| `REQUIRES_FOLLOW_UP` | Todo el snapshot. `PROVISIONING` **siempre falla**: el puerto de MOD13 solo se consulta para los dos resultados ejecutados, así que el contexto llega sin `provisioning` | MOD13 Ola 6 |
| `CANCELLED` | No llega al gate: `close()` lo rechaza antes con `CLOSE_RESULT_CANCELLED_REMOVED` (MOD11 T2, CA-11). Las vías son la anulación (ADR-090) y la cancelación desde la agenda | MOD11 T2 |

**Prueba.** Se ejecutó una sonda temporal sobre `close()`, con el evaluador real y el snapshot de `INSTALACION_ESTANDAR` v3 (migraciones 131 y 163). Tenía `reasonCode: 'CUSTOMER_ABSENT'`, ningún consumo y ninguna evidencia, y se borró después de correr:

```text
NOT_EXECUTED        → 422 CLOSURE_GATE_INCOMPLETE
  ["Equipos instalados en el sitio del cliente", "Prueba de servicio en el sitio",
   "Fotos del trabajo realizado", "Acta de conformidad firmada por el cliente"]
REQUIRES_FOLLOW_UP  → 422 CLOSURE_GATE_INCOMPLETE
  [los cuatro anteriores + "Aprovisionamiento certificado"]
```

Una visita en la que el cliente no estaba solo se puede cerrar «no ejecutada» si el técnico registra un CPE instalado en el cliente, fotos del trabajo y un acta firmada que no existen. En la práctica, el sistema obliga a fabricar una instalación falsa. Eso contradice dos decisiones aprobadas:

- **ADR-088 D4**: un requisito que no puede satisfacerse con los medios existentes no se publica como requerido. Una visita no realizada no puede satisfacer «equipos instalados» de forma legítima.
- **ADR-088 D5**: ninguna capacidad ausente se sustituye por una declaración. Aquí ocurre lo contrario: el gate exige declarar algo falso para avanzar.

Además rompe el contrato de ADR-098 D3 («la IP se libera si la OT termina `NOT_EXECUTED`»), porque ese estado no es alcanzable de forma honesta.

**Hallazgo adicional.** ADR-077, regla 1, dice que la causa es obligatoria para cerrar como no ejecutada. `CloseExecutionOrderSchema` declara `reasonCode` opcional, y `close()` no lo exige para ningún resultado. El portal sí la pide (`use-execution-order-close-form.ts`), pero el API acepta el cierre sin ella.

---

## Decisión

### D1. Los requisitos de la plantilla describen el trabajo ejecutado

El snapshot de la plantilla enumera lo que debe quedar hecho y evidenciado cuando el técnico **ejecutó** el trabajo. El gate lo evalúa completo solo para la **familia ejecutada**: `EXECUTED` y `EXECUTED_WITH_OBSERVATIONS`, y `REQUIRES_FOLLOW_UP` según E1. Para estos resultados no cambia nada.

### D2. `NOT_EXECUTED` no evalúa la plantilla: su gate es la causa

Con `NOT_EXECUTED` no se evalúa **ningún** requisito del snapshot, de ningún `kind`. Lo que el cierre exige en su lugar:

1. **`reasonCode` obligatorio y no vacío.** Es ADR-077 regla 1, que el API todavía no aplica. Sin él, el cierre se rechaza con `422` y código `CLOSE_NOT_EXECUTED_REASON_REQUIRED`.
2. **Coherencia con el inventario (E2, aprobado).** Si quedan consumos vigentes (no revertidos) con `finalDisposition = INSTALLED_AT_CUSTOMER`, el cierre se rechaza con `422` y `CLOSE_NOT_EXECUTED_HAS_INSTALLED_EQUIPMENT`. El técnico tiene que revertir el consumo por la vía que ya existe (contrato v1.7). Así se evita lo contrario del defecto: una visita «no realizada» que deja equipos instalados en el cliente.

El catálogo de causas es de MOD09 (`non-realization-causes.service.ts`). Este ADR **no** introduce la validación cruzada del código contra ese catálogo ni exige la evidencia del intento que algunas causas piden (`requiresEvidence`). Las dos cosas quedan pendientes y declaradas (§Consecuencias). MOD11 no lee tablas de MOD09.

### D3. La regla es fija en el evaluador, no un campo de la plantilla

Se descarta, por ahora, añadir `appliesTo: ExecutionOrderResult[]` a `ExecutionOrderTemplateRequirement` (alternativa A1). La regla vive en una función pura del evaluador, `selectRequirementsForResult(snapshot, result, { provisioningEnforced })`. Esa función absorbe también el filtro de `PROVISIONING` que hoy está en línea en `close()`. `close()` la usa y conserva sus guardas previas, y `getCompletion()` no cambia: el checklist sigue mostrando el camino ejecutado.

La razón determinante es que **el snapshot es inmutable** (ADR-088, Consecuencias). Un campo nuevo solo protegería a las OT creadas con una versión de plantilla posterior. Las OT vivas, con snapshot v1, v2 o v3, seguirían bloqueadas. La regla fija las corrige a todas sin re-snapshotear.

### D4. `CANCELLED` no cambia

`close()` ya lo rechaza antes del gate. La anulación (ADR-090) y la cancelación desde la agenda no pasan por el gate de plantilla y siguen así.

---

## Escalaciones al CTO (resueltas el 2026-10-23)

**Resolución:** el CTO aprobó las dos recomendaciones. E1 = (a): `REQUIRES_FOLLOW_UP` pertenece a la familia ejecutada y consulta MOD13, lo que extiende ADR-098 D5. E2 = sí: D2.2 entra en el encargo.

**E1 — `REQUIRES_FOLLOW_UP` en instalaciones.** Hoy es incerrable con la plantilla v3, porque el requisito `PROVISIONING` nunca consulta MOD13. Es un defecto de MOD13 Ola 6, no de `5de2f5eb`. El resultado se proyecta como `COMPLETED_WITH_OBSERVATIONS` y la tarea queda `RESOLVED`, es decir, que se trata como trabajo hecho.

- **(a) Recomendada.** Es de la familia ejecutada: se evalúa todo el snapshot, y `REQUIRES_FOLLOW_UP` se añade a los resultados que consultan el puerto de MOD13. Esto **extiende ADR-098 D5**, que hoy nombra solo `EXECUTED` y `EXECUTED_WITH_OBSERVATIONS`. Si la instalación quedó a medias, la vía honesta es `NOT_EXECUTED` con la causa `PARTIAL_EXECUTION` de ADR-077.
- **(b)** Se trata como `NOT_EXECUTED` (D2). Deja cerrar «con seguimiento» una instalación sin equipo ni servicio, y la tarea quedaría `RESOLVED`. No se recomienda.
- **(c)** Se mantiene la conducta actual. Deja el resultado inalcanzable en instalaciones.

**E2 — Rechazar `NOT_EXECUTED` con equipos instalados vigentes (D2.2).** Se recomienda **sí**. Si el CTO lo descarta, D2.2 sale del encargo y el riesgo R2 queda aceptado.

---

## Consecuencias

**Positivas**

- La visita no realizada vuelve a ser un cierre honesto, y la liberación de IP de ADR-098 D3 se puede probar por su vía natural.
- Se aplica ADR-077 regla 1 en el servidor, no solo en el portal.
- Corrige también las OT vivas, sin migración de datos ni versión nueva de plantilla.

**Negativas y costes**

- Hay clientes del API que cierran `NOT_EXECUTED` sin `reasonCode`: pruebas de MOD13 (`execution-orders.provisioning-gate.spec.ts`), fixtures y E2E. Dejan de pasar y deben actualizarse. Es un cambio de comportamiento del contrato de cierre, y la descripción del DTO en OpenAPI debe declararlo.
- Un tenant no puede exigir, mediante la plantilla, un requisito propio para las visitas no realizadas (por ejemplo, la foto de la fachada). Esa evidencia ya la gobierna el catálogo de causas de MOD09 (`requiresEvidence`). Llevarla al servidor queda pendiente: se hará por un puerto MOD09 → MOD11, no con `appliesTo`.
- El código de causa no se valida contra el catálogo de MOD09. Además, el portal envía hoy el **id** de la causa en `reasonCode` y su **código** en `followUp.reasonCode`. Unificarlo queda fuera de este ADR, como deuda declarada.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| Multi-tenant | Ninguno. Regla de código, igual para todos los tenants. Sin migración |
| Seguridad | No amplía la superficie. Endurece una validación (`reasonCode`) |
| Escala | Menos consultas en `NOT_EXECUTED`: no hace falta resolver categorías de inventario para MATERIAL. D2.2 sí lee los consumos de la OT, igual que hoy |
| Regulación | Ninguna |
| Boundaries | Sin cambios. MOD11 sigue siendo dueño del gate. MOD13 se consulta por el puerto existente. MOD09 no se lee |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | La regla se implementa en `close()` y no en una función pura, y vuelve a divergir entre los dos call-sites | D3 fija `selectRequirementsForResult` con pruebas unitarias propias |
| R2 | Sin D2.2, una OT `NOT_EXECUTED` deja un CPE `INSTALLED_AT_CUSTOMER` vigente y el inventario contradice el cierre | D2.2 aprobado (E2). Prueba contra Postgres real |
| R3 | Exigir `reasonCode` rompe clientes que nadie revisó | El encargo obliga a buscar todos los `NOT_EXECUTED` en `apps/`, `e2e/` y `packages/` y a actualizarlos en la misma ola |
| R4 | Se lee como permiso para cerrar `NOT_EXECUTED` sin evidencia del intento cuando la causa la exige | Queda declarado como pendiente con dueño (MOD09). El portal ya la exige en la UI |

---

## Alternativas descartadas

**A1 — `appliesTo: ExecutionOrderResult[]` en `TemplateRequirement`.** Es más expresiva y permitiría requisitos propios de la no realización. Se descarta por tres motivos: no corrige las OT vivas (snapshot inmutable), exige contrato v1.8, re-publicación de plantillas y UI de edición, y duplica lo que ya gobierna el catálogo de causas de MOD09. Puede reconsiderarse si aparece un requisito de no realización que no sea una evidencia de causa.

**A2 — Filtrar solo `MATERIAL` en `NOT_EXECUTED`.** Es el parche mínimo, pero deja bloqueado el cierre por las dos fotos y el acta, que tampoco existen en una visita no realizada. No corrige el defecto.

**A3 — Que MOD13 rodee el defecto probando solo la cancelación y la anulación.** Es lo que hizo V1-ci como medida temporal. No corrige MOD11 y deja `NOT_EXECUTED` sin probar.
