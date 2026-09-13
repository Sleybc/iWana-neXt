# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 4 · AI-PROD-UX

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 4 — verificación
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `prod-ux` (AI-PROD-UX)
**Encargo:** **Review de experiencia** (etapa 6 del protocolo)
**Cierra:** parte de **G6** — y **puedes bloquearlo**

> Este encargo **no tiene prompt de fase**: el prompt F5-F6 cubre integración y QA, no el review de experiencia. Esta orden es autosuficiente.

---

## 1. Qué es este encargo

Etapa 6 del protocolo: revisas **la implementación contra la UX spec que tú escribiste en la ola 1**. No eres el productor del código — lo es AI-FE-PLATFORM —, así que esto no es auto-aprobación: es el gate que el protocolo te asigna.

**Puedes bloquear G6 por ruptura crítica de flujo o de accesibilidad** (protocolo §3, etapa 6). Úsalo si procede; un review que nunca bloquea no es un gate.

## 2. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §2 RACI (fila "UX": eres **R**; accesibilidad: **R** de los criterios de flujo), §3 etapa 6, §6.3 marcadores.
3. **`docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md`** v1.0 — **tu propia spec: el patrón de medida**.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 §6 — los once criterios de aceptación.
5. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md` — **§6 te enruta dos consultas asíncronas y §7 tres deudas tuyas**.
6. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-FE-PLATFORM-v1.0.md` — qué implementó F5 y cómo.

## 3. Alcance

### 3.1 Review de experiencia de lo implementado

Recorre las tres sub-rutas (`/tasks`, `/tasks/new`, `/execution-orders`) y el flujo de llegada por deep link, contra tu UX spec:

- **Continuidad del contexto del despachador** — los tres mecanismos que validaste (marco continuo, estado en URL, redirect post-alta). ¿Se sostienen en la implementación real?
- **Los siete estados vacíos y de error con acción** que especificaste. ¿Están todos, y con su acción?
- **Copy de filtros y de la columna «Vence»** — español, sentence case, sin enums crudos.
- **Flujo de llegada por deep link:** qué ve el usuario al cerrar el drawer de OT.
- **Accesibilidad de flujo**, WCAG 2.2 AA: tu frontera son los criterios de flujo (DS-OWNER cubre contraste y estados; FE-PLATFORM implementa; SR-QA verifica).

### 3.2 Resuelve las tres deudas que la ola 3 te asignó

| # | Asunto | Qué se espera de ti |
| --- | --- | --- |
| **D-1** *(media)* | «Asignado a» en la bandeja de OT **solo busca técnicos**; tu UX spec §7.2 declara «técnicos y cuadrillas» | Ratifica o corrige. Si ratificas que deben estar las cuadrillas, la factibilidad pasa a AI-SR-FULL — no la asumas resuelta |
| **D-4** *(baja)* | `dueAt` nulo se pinta **«—»** (contrato de componente H4 §7.1) y tu spec §7.3 decía **«Sin fecha»** | Mandó el contrato congelado. Ratifica esa resolución o pide el cambio por la vía del contrato, no por implementación |
| **D-5** *(baja)* | Botón «Actualizar» en la toolbar de OT **no figura** en tu anatomía UX §4.5 | ¿Entra a la anatomía, o sobra? |

## 4. Skills — leer antes de revisar

**Obligatorias:** `iwana-identity-ui-review` (**modo review**, con su formato de informe P0–P3 y sus reglas anti-falsos-positivos), `system-vocabulary-review`.
**De apoyo:** `senior-ui-systems-designer`, `wcag-audit-patterns`.
**`ui-ux-pro-max` subordinada** a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y los tokens reales; **no fundamenta severidad**.
**No uses `brainstorming`:** el alcance está cerrado.

## 5. Anti-falsos-positivos — condición de validez de tu informe

Un informe con cinco hallazgos verificados vale más que uno con veinte especulativos:

1. **Evidencia obligatoria:** cada hallazgo cita `archivo:línea` o zona concreta. Sin evidencia localizable no es hallazgo.
2. **Verifica contra las fuentes** antes de afirmar que falta un token o una utility: confirma que existe en `globals.css` o `portal-ui.tsx`.
3. **Una causa raíz, un hallazgo.**
4. **No reportes lo que las primitives ya resuelven.**
5. **Preferencia no es hallazgo.** La severidad se ancla solo en tu UX spec, la spec Firma iWana, un ADR aprobado, el manual de identidad, los tokens reales o un criterio WCAG.

## 6. Superficie

**No escribes código.** Tu entregable es un informe de hallazgos en `docs/informes/`. Si detectas un defecto, tiene dueño: FE-PLATFORM (implementación), DS-OWNER (contrato) o SR-FULL (datos). Repórtalo con dueño propuesto.

## 7. Restricciones no negociables

1. **No rediseñes el alcance.** La separación en sub-rutas es decisión del CTO. Si crees que la UX exige cambiarlo, es `[BLOQUEO]` a AI-EM-ARCH.
2. **No definas tokens ni APIs de componente** — es de AI-DS-OWNER.
3. **No modifiques tu UX spec para que encaje con lo implementado.** Si la implementación se desvió, el hallazgo es la desviación.
4. Sin PII real en ejemplos.

## 8. Entregable

Informe de review en `docs/informes/`, con el formato estándar de `iwana-identity-ui-review` (modo review): resumen ejecutivo, hallazgos por severidad **P0–P3 con evidencia, impacto, recomendación y esfuerzo**, quick wins, y **veredicto**: Aprobada · Aprobada con cambios (listar bloqueantes) · Requiere rediseño.

Incluye la resolución explícita de D-1, D-4 y D-5.

## 9. Stop/go — tu review no cierra si

- Algún hallazgo no cita evidencia localizable.
- D-1, D-4 o D-5 quedan sin resolución.
- No emites veredicto.

## 10. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-DS-OWNER (patrón o token que el contrato no cubre), a AI-FE-PLATFORM (costo de implementación de un cambio de interacción), a AI-SR-FULL (factibilidad de datos — relevante para D-1).

## 11. Reporte final

Declara qué skills leíste, el veredicto, los hallazgos con dueño asignado, y la resolución de las tres deudas.
