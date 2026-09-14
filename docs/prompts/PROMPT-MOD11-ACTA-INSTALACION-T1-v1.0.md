# PROMPT DE EJECUCIÓN — MOD11 Acta de instalación · Tramo 1

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Bloques:** B1 y B2 (`sr-backend`) · B3 (`sr-qa`) · B4 (`prod-ux`)
**Estado:** **Ejecutable.** G1 cerrado: el CTO aprobó ADR-088 y la spec el 2026-09-14.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec: `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` v1.0 (Aprobado)
- ADR: [ADR-088](../adrs/ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md)
- Plan: `docs/plans/2026-09-14-mod11-acta-instalacion.md` v1.0

---

## 1. Objetivo del tramo

Que «equipos instalados» pase de ser una afirmación a ser una verificación, y que ningún requisito de la plantilla prometa lo que su regla no comprueba.

**Lo que sí entra:** B1 a B4 de §3.
**Lo que no entra:**

- El requisito de **contrato legal firmado**. Pertenece a la culminación, no al cierre de la OT (ADR-088 §D1). Añadirlo produce OT incerrables.
- Cualquier señal de **aprovisionamiento comercial**. El módulo no existe.
- Vía de captura de `MEASUREMENT` o `FIELD`. Deuda declarada, fuera de alcance.
- Re-escribir snapshots de OT ya iniciadas (spec §4.4).

## 2. Contexto que hay que entender antes de tocar nada

El requisito `installation-activity` se satisface con `activities.some(a => a.activityType === 'INSTALLATION')` (`closure-gate-evaluator.service.ts:145-148`): **una nota de bitácora**. Esa es la causa del defecto reportado por el CTO.

Y `evaluateMaterial` (`:165-173`) comprueba `itemId` e `itemCategory`, pero **no `finalDisposition`**: hoy un material devuelto a bodega satisface un requisito de material instalado.

## 3. Bloques

### B1 — Contrato y evaluador (`sr-backend`)

1. Ampliar la variante `MATERIAL` de `ExecutionOrderTemplateRequirement` para que pueda **declarar la disposición final exigida**. Aditivo y opcional: un requisito que no la declare se comporta exactamente como hoy.
2. El contrato `packages/shared/src/contracts/operations/execution-orders.ts` pasa de **v1.1 a v1.2**, con historial en su docstring. Ningún campo existente cambia ni pasa a requerido.
3. `evaluateMaterial` exige `finalDisposition` **solo cuando el requisito la declara**.
4. **Transportar la disposición al contexto del evaluador en los DOS call-sites**: `getCompletion` y `close()`.

**La trampa — léela antes del paso 3.** La consulta de consumos de `getCompletion` proyecta columnas explícitamente. Si añades la condición al predicado **sin** incluir la disposición en la proyección y en el mapeo a `itemUsages`, el campo llegará `undefined`, el predicado será siempre falso y **el requisito quedará permanentemente pendiente**: habrás invertido el defecto en vez de cerrarlo. Es el mismo modo de fallo que ya ocurrió al publicar el estado por requisito. Por eso CA-02 verifica el sentido contrario.

5. El type guard del snapshot y el mapper de plantillas deben aceptar la config nueva sin invalidar el snapshot entero: su `default` es fail-closed y **un kind o config no reconocidos dejan la OT incerrable**.

### B2 — Plantilla v2 y política de migración (`sr-backend`)

6. Migración que publica `INSTALACION_ESTANDAR` **v2** con los requisitos de spec §4.2: equipos instalados (`MATERIAL` con disposición), servicio funcionando en sitio (`EVIDENCE`), evidencia fotográfica, acta de conformidad firmada, y bitácora **no requerida**.
7. Usa el copy entregado por B4. **No inventes etiquetas**: si falta una celda, es `[BLOQUEO]`.
8. **No re-snapshotees OT existentes.** Publicar una versión no toca las órdenes vivas, y eso es deliberado: cambiar el criterio de cierre bajo una orden en curso es peor que la convivencia.
9. Entregar la **política de migración** como documento: qué ocurre con las OT vivas bajo v1, durante cuánto conviven las dos definiciones y si alguna orden se re-crea.
10. La migración debe ser reversible: `down()` ejercitado, sin `throw` incondicional.

### B3 — Regresión (`sr-qa`)

11. Los siete criterios de aceptación de la spec §8, con **ambos sentidos** en CA-01/CA-02.
12. No regresión sobre las suites vigentes de `tasks`, incluido el BOLA, **sin tocar esos tests**.
13. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`.

### B4 — Copy de requisitos (`prod-ux`)

14. Etiqueta y razón de los **cinco** requisitos de spec §4.2, como tabla cerrada.
15. **Regla de copy (ADR-088 §D4):** ninguna etiqueta puede afirmar un resultado que su regla no comprueba. «Actividad de instalación» sobre una regla que solo verifica una nota de bitácora es exactamente el defecto a corregir.
16. La razón de cada requisito pendiente debe decir **qué hacer**, en lenguaje de producto, sin tokens crudos del dominio técnico.

## 4. Restricciones no negociables

- **Boundaries del Modulith intactos.** Sin acceso a tablas de otro módulo ni imports cruzados.
- **Sin ampliar `@Roles` ni `@Permissions`.** T1 no toca la política de acceso.
- **Sin PII real** en migraciones, fixtures ni tests.
- **No se acepta autodeclaración como prueba** (ADR-088 §D5): si una condición no es verificable, se declara pendiente, no se sustituye por un campo que el técnico marca.
- Si el trabajo exige tocar el contrato más allá de la ampliación autorizada, o cambiar `evaluateCompliance`, **detente y emite `[BLOQUEO]`**.

## 5. Entregables

- Contrato v1.2 con la ampliación aditiva y su historial.
- `evaluateMaterial` endurecido y disposición transportada en ambos call-sites.
- Migración de `INSTALACION_ESTANDAR` v2, reversible.
- Documento de política de migración.
- Tabla de copy de los cinco requisitos.
- Suite de regresión en verde con conteo real.
- Informe de fase en `docs/informes/` con deuda por severidad.

## 6. Stop/go

**GO si y solo si:**

- Un requisito con disposición declarada **no** se satisface con un consumo devuelto a bodega (CA-01), y **sí** con uno instalado (CA-02).
- Un requisito `MATERIAL` sin disposición declarada se comporta como hoy (CA-03).
- Progreso y cierre coinciden (CA-04).
- En `OTE-20260828-001` el requisito de equipos instalados aparece **pendiente** (CA-05).
- La bitácora ya no es requerida y su etiqueta no promete verificación (CA-06).
- La política de migración está entregada (CA-07).

**NO-GO si:** el requisito de equipos instalados queda pendiente **también** cuando hay un consumo `INSTALLED_AT_CUSTOMER`. Eso es el defecto invertido, no cerrado.
