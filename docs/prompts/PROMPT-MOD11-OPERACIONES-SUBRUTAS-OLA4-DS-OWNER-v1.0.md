# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 4 · AI-DS-OWNER

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 4 — verificación
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `ds-owner` (AI-DS-OWNER)
**Encargo:** **Review de contrato e identidad** (etapa 6 del protocolo)
**Cierra:** parte de **G6** — y **puedes bloquearlo**

> Este encargo **no tiene prompt de fase**: el prompt F5-F6 cubre integración y QA, no el review de contrato. Esta orden es autosuficiente.

---

## 1. Qué es este encargo

Etapa 6 del protocolo: revisas **la implementación contra el contrato de componente que tú congelaste en la ola 1**. El productor del código es AI-FE-PLATFORM, no tú, así que esto no es auto-aprobación: es el gate que el protocolo te asigna.

**Puedes bloquear G6 por violación de contrato o de identidad (Firma iWana)** (protocolo §3, etapa 6).

## 2. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §2 RACI (fila "UI — contrato del design system": eres **R**), §3 etapa 6, §6.3 marcadores.
3. **`docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md`** v1.0 — **tu propio contrato: el patrón de medida**.
4. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md` — **§6 te enruta una consulta asíncrona y §7 una observación tuya**.
5. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-FE-PLATFORM-v1.0.md` — cómo implementó F5 el contrato.
6. Fuentes de identidad, en orden de precedencia: `packages/ui/src/styles/globals.css` (tokens reales — manda sobre *qué existe*), `apps/portal/src/components/shared/portal-ui.tsx` (primitives), `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` (manda sobre *qué construir*).

## 3. Alcance

### 3.1 Review de cumplimiento del contrato

Verifica en el código real (`ExecutionOrdersTable.tsx`, `TasksTable.tsx`, `operations-table-pagination.ts` y sus contenedores):

- **Un solo pie montado** por tabla. La consolidación registró que ambas lo montan en un único ternario sobre `pagination.randomAccess` con tu unión discriminada. Confírmalo tú.
- **El modo se lee de `meta.capabilities.randomAccess`** — nunca decidido en el componente ni por módulo.
- **Encabezados sin `PortalDataTableSortableHead` ni `aria-sort`** mientras `sortableFields` esté vacío. La consolidación dice que solo aparecen en comentarios que documentan su no-adopción: verifícalo.
- **Columna «Vence»** y tratamiento de cifras y fechas con `font-mono` o `tabular-nums`.
- **Estados** que exigiste: hover, focus, active, disabled, loading (skeleton con forma, no spinner), empty con acción, error.
- **Identidad:** lima solo para avance, éxito o acción principal — **nunca en el pager ni en el encabezado de orden**; sin `dark:bg-gray-{700..950}`; sin hex de marca sin tokenizar; sin cards anidadas sin función.

### 3.2 Resuelve lo que la ola 3 te asignó

| # | Asunto | Qué se espera de ti |
| --- | --- | --- |
| **Consulta asíncrona de F5** | F5 declaró que los estados vacíos **E1–E5 los renderiza el contenedor**, no la tabla, invocando como precedente tu propio contrato §6.7 | **Ratifica esa composición o corrígela.** Si la ratificas, decláralo en el contrato para que no vuelva a consultarse |
| **Observación** *(obs.)* | La columna 1 de la tabla de OT consume `order.number`, mientras tu contrato §7.2 nombra `executionOrderNumber`. El anclaje es válido por tu §2 (`ExecutionOrderListItem`) | Ratifica el anclaje, o corrige el contrato. **No lo dejes ambiguo**: es el tipo de divergencia que reaparece en el siguiente módulo que copie el patrón |

## 4. Skills — leer antes de revisar

**Obligatorias:** `iwana-identity-ui-review` (**modo review**, con su formato P0–P3 y sus reglas anti-falsos-positivos), `core-components`, `tailwind-patterns`.
**De apoyo:** `senior-ui-systems-designer`, `wcag-audit-patterns` (contraste y estados del contrato son tu frontera de accesibilidad).
**`ui-ux-pro-max` subordinada**; **no fundamenta severidad**.

## 5. Gate mecánico

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

Corre limpio hoy. Si tu review encuentra algo que el script no detecta, es exactamente el valor que aportas: el script cubre lo grep-able, no jerarquía, densidad ni firma.

## 6. Anti-falsos-positivos — condición de validez de tu informe

1. **Evidencia obligatoria:** cada hallazgo cita `archivo:línea`.
2. **Verifica contra los tokens reales** antes de afirmar que algo falta: recomendar un token inexistente es el falso positivo más dañino.
3. **Una causa raíz, un hallazgo.**
4. **No reportes lo que las primitives ya resuelven.**
5. **Preferencia no es hallazgo.** La severidad se ancla en tu contrato, la spec Firma iWana, un ADR aprobado, los tokens reales o WCAG.

## 7. Superficie

**No escribes código de componentes.** Tu entregable es un informe en `docs/informes/`, y si procede, una versión nueva de tu contrato. Si el contrato cambia, se **versiona** y la versión anterior se marca superada en el mismo acto (§3bis regla 1) — nunca se parchea en silencio.

## 8. Tu autonomía

Sigues teniendo el **carril rápido de UI** (ADR-049, §3bis.3): decides sobre componente, token y estado mientras no toques alcance, contrato de datos, boundary ni tokens de marca. Si tu review concluye que hace falta alterar alguno de esos cuatro, eso sube: `[CONSULTA]` o `[BLOQUEO]` a AI-EM-ARCH.

## 9. Entregable

Informe de review en `docs/informes/` con el formato estándar de `iwana-identity-ui-review` (modo review): resumen ejecutivo, puntaje derivado, hallazgos **P0–P3 con evidencia, impacto, recomendación y esfuerzo**, quick wins, y **veredicto**: Aprobada · Aprobada con cambios (listar bloqueantes) · Requiere rediseño.

Incluye la resolución explícita de la consulta de composición de vacíos y de la observación sobre `order.number`.

## 10. Stop/go — tu review no cierra si

- Algún hallazgo no cita evidencia localizable.
- La consulta de composición de vacíos o la observación de `order.number` quedan sin resolver.
- No emites veredicto.

## 11. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-FE-PLATFORM (fricción de implementación), a AI-PROD-UX (necesidad de experiencia detrás de un patrón), a AI-SR-QA (qué estados y variantes son auditables).

## 12. Reporte final

Declara qué skills leíste, el veredicto, los hallazgos con dueño, la resolución de los dos puntos pendientes, y si tu contrato sube de versión.
