# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 1 · Verificación

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-QA**
**Fase que cubre:** C5
**Estado:** arranca con C1, C2, C3 y C4 entregadas

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec que ejecuta: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobado 2026-09-14) — criterios CA-01 a CA-06
- Plan de orquestación: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.1, §8
- ADR de gate: ADR-069 (G6.5 merge readiness)

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** evidencia verificable de que los cuatro defectos de la Ola 1 están cerrados y de que nada de lo que ya funcionaba se rompió.

**Lo que sí entra:** cobertura de regresión de los casos que hoy no existen y que son exactamente los que fallaban.

**Lo que no entra:** reescribir la suite de `tasks`, tocar el test BOLA vigente, ni cubrir funcionalidad de la Ola 2.

## 2. Artefactos de entrada obligatorios

- Spec §2.1 (los cuatro defectos y su evidencia en código) y §8 (criterios de aceptación)
- Informes de fase de C1, C2, C3 y C4

## 3. Casos obligatorios

### Backend

1. **Responsable técnico** — `GET :id` sobre OT con `assignedTechnicianId` devuelve `assignee.displayLabel` (CA-01).
2. **Responsable cuadrilla** — OT con `assignedCrewId` devuelve `assignee` con `type` igual a `CREW`. Es el caso que **hoy no existe** en el detalle (CA-02).
3. **Coherencia entre superficies** — la misma OT en el listado y en el detalle **no discrepa** sobre el responsable. Este es el test que habría capturado el defecto original.
4. **Estado por requisito** — `completion.requirements[]` trae un ítem por requisito con estado real (CA-05).
5. **COMPLIANCE satisfecho** — una OT con aceptación del cliente registrada muestra su requisito `COMPLIANCE` como satisfecho y contando en el avance (CA-06). **Hoy es imposible**: el contexto del evaluador no recibe esa señal.
5-bis. **Aceptación en cuarentena no cuenta** *(añadido el 2026-09-14 tras la auditoría de consolidación — hallazgo P1)*. Una evidencia `SIGNATURE` + `CUSTOMER_SIGNATURE` con `assetStatus` distinto de `AVAILABLE` **no** satisface el requisito `COMPLIANCE`, y con `AVAILABLE` **sí** lo satisface. Es el caso que evita que `getCompletion` prometa una aceptación que el cierre rechaza con 422 `CUSTOMER_ACCEPTANCE_ARTIFACT_NOT_AVAILABLE`. Verifica **ambos sentidos**: el arreglo ingenuo del predicado invierte el defecto en vez de cerrarlo.

6. **Regresión de agregado** — `progress`, `completed` y `total` conservan su semántica para los consumidores vivos.

### Portal

7. **OT en `IN_PROGRESS`** — la alerta "No puedes iniciar esta orden" **no se renderiza**, para técnico y para supervisor (CA-03).
8. **Supervisor** — no ve copy dirigido a técnicos; ve sus acciones reales (CA-04).
9. **Degradación** — sin `requirements[]`, el checklist degrada de forma **visible**, nunca a un bloque vacío.

### No regresión

10. **BOLA del listado** — sigue en verde, **sin tocar el test**. Un `TECHNICIAN` solo ve las OT asignadas a él o a su cuadrilla.
11. **Política de acceso** — ningún endpoint amplió `@Roles` ni `@Permissions` en esta ola. Verificarlo explícitamente.

## 4. Restricciones no negociables

- **Sin PII real** en fixtures ni en evidencia.
- No modificar el test BOLA vigente para acomodar cambios: si falla, es hallazgo, no test a ajustar.
- Los fixtures multi-tenant deben respetar el aislamiento por schema.

## 5. Entregables

- Suite de regresión con los doce casos.
- Evidencia de calidad en `docs/quality/` con **conteo real de tests ejecutados por suite**.
- Evidencia en navegador sobre `OTE-20260828-001`, mostrando el checklist con estado real y sin la alerta falsa.
- Informe de fase con deuda y hallazgos por severidad.

## 6. Stop/go

**GO si y solo si:**

- Los doce casos pasan con **conteo real**. Un verde de caché de turbo, un `--passWithNoTests` o un dev server reusado **no son evidencia** y devuelven la fase.
- No hay hallazgos P1 abiertos.
- La evidencia de navegador muestra la OT de la auditoría con el checklist informativo.

**Escalación obligatoria a AI-EM-ARCH si:** aparece una plantilla productiva con requisitos `FIELD` o `MEASUREMENT` marcados como requeridos. Esas OT **no pueden cerrarse** (spec §10.1) y el hallazgo cambia la prioridad de la deuda, no el alcance de esta fase.
