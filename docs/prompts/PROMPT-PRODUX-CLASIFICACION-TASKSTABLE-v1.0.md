# PROMPT — AI-PROD-UX: Clasificacion de TasksTable (feed vs directorio) — E-2 ADR-065

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-24
**Modo activo:** Product Architect (AI-EM-ARCH delega a AI-PROD-UX)
**Generado por:** AI-EM-ARCH
**Ejecutor previsto:** AI-PROD-UX
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (Aprobado CTO 2026-07-24)
**Escalacion origen:** [E-2 Clasificacion de TasksTable](../plans/2026-07-24-escalaciones-abiertas-paginacion.md#e-2--clasificacion-de-taskstable--bloquea-la-ola-5)
**Archivo destino:** docs/prompts/PROMPT-PRODUX-CLASIFICACION-TASKSTABLE-v1.0.md

---

## 1. Objetivo exacto

Clasificar `apps/portal/src/components/operations/TasksTable.tsx` como **feed** (conserva "Cargar mas") o **directorio** (adopta paginacion numerada) segun el caso de uso definido en el PRD del modulo de operaciones, no segun el orden por defecto del codigo.

### Resultado esperado

Una linea de clasificacion documentada: "TasksTable es [feed | directorio]. Fuente: PRD MOD11 §X / caso de uso Y."

### Lo que si entra

- Leer el PRD MOD11 y el HLD MOD11 para extraer el caso de uso primario de la tabla de tareas.
- Leer el `ORDER BY` real en `apps/api/src/modules/tasks/services/tasks.service.ts:212` — hoy es `created_at DESC`.
- Contrastar: ¿el operador usa esta tabla como **bandeja que se vacia** (trabaja las tareas mas recientes, las completa, desaparecen de la vista activa) o como **directorio de ordenes de trabajo** (busca por codigo, estado, responsable; necesita ir a la pagina 7)?
- Emitir clasificacion con el fundamento del PRD.

### Lo que no entra

- Modificar el codigo de TasksTable o del servicio.
- Cambiar el ORDER BY. Si el PRD dice directorio y el codigo ordena por fecha, documentar la discrepancia para que AI-EM-ARCH decida si se corrige el orden o la clasificacion.

---

## 2. Artefactos de entrada obligatorios

- PRD MOD11: [PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md](../prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md) (v1.1, Aprobado 2026-06-24)
- HLD MOD11: [HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md](../hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md) (v1.0, Aprobado 2026-06-24)
- ADR-065 §Decisión 2: regla de clasificacion — si el `ORDER BY` por defecto es cronologico descendente → feed → "Cargar mas"
- Codigo actual: `apps/api/src/modules/tasks/services/tasks.service.ts` (ORDER BY linea ~212) y `apps/portal/src/components/operations/TasksTable.tsx`
- Plan de escalaciones: [2026-07-24-escalaciones-abiertas-paginacion.md](../plans/2026-07-24-escalaciones-abiertas-paginacion.md) (E-2)

---

## 3. Instrucciones para AI-PROD-UX

1. Leer el PRD MOD11 completo, con atencion a la definicion del caso de uso de la tabla de tareas (secciones de personas, casos de uso, criterios de aceptacion).
2. Leer el HLD MOD11, en particular la descripcion del frontend ("dense table as primary view → drawer for detail/timeline/handoff").
3. Verificar el `ORDER BY` real en `tasks.service.ts`.
4. Responder exactamente una de estas tres opciones:
   - **Feed.** El operador consume tareas por orden cronologico, las completa, y la bandeja se vacia. No necesita deep-link a una pagina ni navegacion numerada. Conserva "Cargar mas".
   - **Directorio.** El operador busca tareas por codigo de OT, estado o responsable, y necesita llegar a una pagina arbitraria. Adopta paginacion numerada.
   - **Mixto.** El PRD no es concluyente; la tabla tiene ambos patrones de uso. AI-PROD-UX propone el primario y documenta el secundario como posible vista alternativa futura.
5. Si el PRD dice directorio pero el ORDER BY es `created_at DESC`, documentar que **el defecto es el orden por defecto** (se corrige el ORDER BY, no la clasificacion).

---

## 4. Restricciones no negociables

- La clasificacion se decide contra el PRD, no contra el codigo.
- No se modifica codigo en esta tarea. Es solo lectura y clasificacion.
- Si el PRD guarda silencio, AI-PROD-UX propone razonadamente y AI-EM-ARCH ratifica.

---

## 5. Entregables

- Clasificacion en una linea: "TasksTable es [feed | directorio]. Fuente: PRD MOD11 §X."
- Si aplica, nota de discrepancia PRD vs codigo.
- Recomendacion de orden por defecto si la clasificacion es directorio.

---

## 6. Criterio de stop/go

**Detenerse si:**
- El PRD no contiene suficiente informacion para decidir y el HLD tampoco.

**Escalar a:** AI-EM-ARCH para decision de producto.

---

## 7. Criterio de salida

- Clasificacion documentada con referencia al PRD.
- AI-EM-ARCH ratifica y registra en el informe vivo de escalaciones.

---

## 8. Fecha limite

Antes de la Ola 5 (no bloquea las Olas 1-4). La Ola 5 es la cosecha de superficies ya offset, donde TasksTable migraria si se clasifica como directorio.
