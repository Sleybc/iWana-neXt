# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 1 · Portal y copy

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agentes destinatarios:** **AI-PROD-UX** (copy de C3) → **AI-FE-PLATFORM** (C3, C4)
**Fases que cubre:** C3, C4
**Estado:** condicionado — C4 no arranca sin C0 y C2 entregadas; C3 puede arrancar desde el inicio

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec que ejecuta: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobado 2026-09-14) — **§2.1 A3, §4.4 y §4.1 son de lectura obligatoria**
- Plan de orquestación: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.1
- Contrato consumido: `packages/shared/src/contracts/operations/execution-orders-completion.ts` v1 (congelado, producido en C0)

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** la consola deja de afirmar cosas falsas sobre su propio estado. La alerta de inicio desaparece de las órdenes ya iniciadas, el copy habla al rol que está mirando, y el checklist dice qué está cumplido y qué falta.

**Lo que sí entra:**

- **C3** — Copy nuevo por rol y por estado (AI-PROD-UX), y corrección de la condición de render de la alerta (AI-FE-PLATFORM).
- **C4** — El checklist consume `completion.requirements[]` y pinta estado y razón por requisito.

**Lo que no entra — y esto es deliberado:**

- **No se reordenan ni se fusionan secciones.** La reestructuración de la consola es la Ola 2 (R0 a R4). Esta fase cambia **contenido**, no estructura. Mezclar ambas cosas en el mismo commit es el riesgo R6 del plan.
- No se toca el uploader ni se añade selector de requisito. Eso es R2.
- No se toca la custodia del ejecutor ni el refetch. Eso es R3 y R4.
- No se toca backend.

## 2. Artefactos de entrada obligatorios

- Spec §2.1 (causa A), §4.1 (requisito como eje), §4.4 (render por rol)
- Código a intervenir: `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx`
- Contrato de C0, citado por ruta y versión antes de consumirlo

## 3. Pasos

### C3 — Copy y condición de la alerta

**Primero AI-PROD-UX, y solo después AI-FE-PLATFORM.**

1. **Diagnóstico que hay que entender antes de escribir copy** (spec §2.1 A3). La alerta de `ExecutionOrderDrawer.tsx:911-924` se renderiza cuando `canStart` es falso, y en `IN_PROGRESS` `canStart` **siempre** es falso porque el backend no ofrece `START` sobre una orden ya iniciada. La pantalla confunde *no puedes iniciar* con *no necesitas iniciar*.
2. El copy actual miente además en dos puntos verificados: invoca la sincronización, que `start()` no valida y que además impide que la alerta se renderice; y habla de permisos de técnico a supervisores, que por diseño **nunca** reciben `START`.
3. **Regla de copy (spec §4.4):** la pantalla enuncia lo que el usuario **sí puede hacer**. Una negación solo aparece cuando hay una acción concreta que el usuario esperaría y no tiene, y entonces nombra quién sí puede ejecutarla.
4. Producir el copy para la matriz completa: rol (técnico asignado, pool sin asignar, supervisor) × estado (pre-inicio, en progreso, bloqueada, terminal). Entregarlo como tabla cerrada, sin ambigüedad.
5. **Implementación:** acotar la condición de la alerta a estados **pre-inicio** (`CREATED`, `ASSIGNED`, `EN_ROUTE`). Derivar la superficie de `allowedActions`, que el backend ya calcula con el `sub` del JWT — **no leas la identidad del usuario en el cliente para decidir permisos**.

### C4 — Checklist con estado real

6. Consumir `completion.requirements[]` del contrato de C0. Cada ítem pinta: etiqueta, estado (cumplido o pendiente) y, cuando está pendiente, su razón.
7. El badge "Requerido" se conserva, pero **deja de ser la única información del ítem**: hoy tres requisitos idénticos con el mismo badge ocupan espacio sin informar (spec §2.1 A4).
8. Si `requirements[]` no viene —plantilla sin snapshot, o backend anterior a C2— degradar al comportamiento actual **de forma visible**, nunca a un bloque vacío silencioso.
9. **Advertencia operativa (riesgo R2 del plan):** al mostrar estado real, los requisitos `FIELD` y `MEASUREMENT` aparecerán como pendientes permanentes, porque hoy no existe vía para cumplirlos (spec §10.1). Es un defecto **preexistente que esta fase hace visible**, no uno que introduce. Verifica el catálogo de plantillas vivas antes de dar por buena la fase y regístralo en el informe.

## 4. Restricciones no negociables

- **Sin tokens de marca nuevos ni componentes nuevos de design system.** Si el checklist necesita un primitive que no existe, es `[CONSULTA]` a AI-DS-OWNER, no una invención local.
- **Sin dependencias nuevas.**
- La identidad y los permisos del actor se derivan de `allowedActions`. El portal **no decide** quién puede iniciar.
- Accesibilidad: el estado de cada requisito debe ser legible por lector de pantalla, no solo por color.
- `audit-ui.mjs` limpio sobre los archivos tocados.
- Si el contrato de C0 no alcanza para lo que la fase necesita, **emite `[BLOQUEO]`**: el contrato está congelado y cambiarlo es re-sync coordinado por AI-EM-ARCH.

## 5. Entregables técnicos

- Condición de la alerta corregida y copy implementado por rol y estado.
- Checklist consumiendo el estado por requisito, con degradación visible.
- Tests de render: OT en `IN_PROGRESS`, OT pre-inicio, actor supervisor, `requirements[]` ausente.

## 6. Entregables documentales

- Informe de fase en `docs/informes/`, con la tabla de copy aprobada por AI-PROD-UX.
- Evidencia en navegador sobre la OT de la auditoría (`OTE-20260828-001`).
- Evidencia de calidad con **conteo real de tests**.
- Registro del hallazgo de plantillas vivas del paso 9.

## 7. Stop/go

**GO si y solo si:**

- Con la OT en `IN_PROGRESS`, la alerta "No puedes iniciar esta orden" **no se renderiza para ningún rol** (CA-03).
- Un supervisor no ve copy dirigido a técnicos; ve sus acciones reales (CA-04).
- El checklist muestra, por requisito, si está cumplido y por qué no lo está (CA-05).
- En `OTE-20260828-001`: "Actividad de instalación" aparece cumplida y los otros dos requisitos pendientes con su razón.
- `audit-ui.mjs` limpio y tests con conteo real.

**NO-GO si:** para cumplir el objetivo hubo que reordenar o fusionar secciones. Eso es Ola 2 y debe devolverse.
