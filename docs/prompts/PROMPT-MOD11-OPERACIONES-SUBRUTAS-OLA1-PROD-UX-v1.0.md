# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 1 · AI-PROD-UX

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 1 — congelación de contratos y factibilidad
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `prod-ux` (AI-PROD-UX)
**Cierra:** parte de **G2** (etapa 2 del protocolo: solución UX/UI), junto con el contrato de componente de AI-DS-OWNER

> Orden de despacho. Este encargo (F4) no tiene prompt de fase propio: es una consulta de flujo, no una fase de construcción.

---

## 1. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §2 RACI (fila "UX": eres **R**), §3 etapa 2 y su **definition of ready**, §6.3 marcadores.
3. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §3.4 olas, §4 skills.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO**) — §2 problema, §4.1 a §4.4 rutas, despachador, pestañas y mitigación de fragmentación, §6 criterios de aceptación.

## 2. El problema, en una frase

La OT de ejecución es el activo central del módulo y hoy **no tiene puerta de entrada**: solo se alcanza por deep link desde Programación o Mesa de ayuda. El módulo se separa en sub-rutas (`/tasks`, `/tasks/new`, `/execution-orders`) con pestañas, y la OT gana bandeja propia.

## 3. Encargo: UX spec en `docs/specs/`

Formato de UX spec de tu perfil (estructura de pantalla, user flows, estados, responsive, criterios de accesibilidad). Cubre:

1. **Etiquetas y orden de las pestañas.** La spec propone "Tareas" y "Órdenes de ejecución". Ratifica o corrige: español, sentence case, sin enums crudos.
2. **Veredicto sobre "Crear tarea": CTA del `PageHeader` o tercera pestaña.** El supuesto de spec §4.3 es CTA, con este razonamiento: crear es una acción, no una vista hermana de dos bandejas, y darle el mismo peso invierte la jerarquía de una pantalla cuya tarea dominante es el seguimiento. **Decides tú** — eres el R de UX. Si corriges, justifica.
3. **Continuidad del contexto del despachador.** Es la objeción real contra separar en sub-rutas y se resuelve en la UX, no solo en la arquitectura. Spec §4.4 propone tres mecanismos: marco continuo (`PageHeader` y nav no se desmontan), estado en la URL (volver restaura filtros, página, orden y detalle abierto), y redirección post-alta a `/tasks?taskId=<nuevo>` con el detalle abierto en vez de una alerta de éxito huérfana. Valídalos o propón mejores.
4. **Estados vacíos con acción** de ambas bandejas: sin tareas para el filtro, sin OT para el filtro, sin resultados de búsqueda. Un vacío sin acción es un defecto.
5. **Copy de los filtros nuevos** de la bandeja de tareas —tipo, responsable, ticket; hoy solo hay estado— y de la columna "Vence".
6. **Flujo de llegada por deep link.** Quien entra desde Programación con `?executionOrderId=X` cae en `/execution-orders` con la OT abierta. Define qué ve **al cerrar el drawer**: ¿la bandeja filtrada, vacía, con qué orientación?
7. **Criterios de accesibilidad de flujo.** Tú defines los de flujo; DS-OWNER los de contraste y estados; FE-PLATFORM los implementa; SR-QA verifica (protocolo §2, nota \*\*). Estándar **WCAG 2.2 AA**.

## 4. Skills — leer antes de especificar

**Obligatorias:** `iwana-identity-ui-review` (**modo diseño**), `system-vocabulary-review` (vocabulario visible, labels, tono).
**De apoyo:** `senior-ui-systems-designer`.
**`ui-ux-pro-max` va subordinada** a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y los tokens reales (`AGENTS.md`); **no fundamenta severidad**.
**No uses `brainstorming`:** el alcance está cerrado y aprobado por el CTO; abrir exploración lo reabre.

## 5. Restricciones no negociables

1. **No rediseñes el alcance.** La separación en sub-rutas es decisión del CTO del 2026-09-13. Si crees que la UX exige cambiarla, eso es `[BLOQUEO]` a AI-EM-ARCH, no una alternativa dentro de la spec.
2. **No definas tokens ni APIs de componente** — es de AI-DS-OWNER. Tú defines el qué y el flujo.
3. **No escribas código.**
4. Texto visible en español, sentence case, sin enums crudos ni `UPPER_SNAKE_CASE`.
5. Nada de PII real en ejemplos.
6. Acciones frecuentes visibles: no escondidas tras hover ni en menús colapsados por defecto.

## 6. Stop/go — F4 no cierra si

- Quedó algún enum crudo visible en el copy propuesto.
- El veredicto CTA vs pestaña no se emitió.
- Algún estado vacío quedó sin acción.
- La spec no queda localizable en `docs/specs/`.

## 7. Marcadores (§6.3 — exactos)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-DS-OWNER si necesitas un patrón que el contrato no cubre, o a AI-FE-PLATFORM por costo de implementación de una interacción.

## 8. Reporte final

Skills leídas, ruta de la spec, veredicto sobre CTA vs pestaña con su justificación, y cualquier punto donde discrepes de la spec aprobada. Registrar la discrepancia es correcto; implementarla por tu cuenta no.
