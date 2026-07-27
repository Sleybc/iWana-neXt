# ADR-064 — Paginación obligatoria en tablas operativas del portal

**Versión:** 1.0  
**Estado:** Aprobado  
**Superado parcialmente por:** [ADR-065](ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (aprobado por el CTO, 2026-07-24) en §§2, 3, 5 y 9 — el resto de este ADR sigue vigente  
**Fecha:** 2026-07-24  
**Modo activo:** Architect + Orchestrator  
**Autor:** AI-EM-ARCH  
**Aprobado por:** CTO (2026-07-24)  
**Skills:** `architecture-decision-records`, `docs-architect`, `iwana-identity-ui-review`  
**Consulta Design Layer:** AI-PROD-UX · AI-DS-OWNER (sesión 2026-07-24) — veredicto **GO-CON-ENMIENDAS** (consolidadas abajo)  
**Relaciona:** [ADR-056](ADR-056-Integridad-Base-Normativa-Diseno.md) (base normativa de diseño), Firma iWana §2.3, receta DataTable en `iwana-identity-ui-review`  
**Vigencia:** norma **efectiva** desde aprobación CTO. Merge gate: tablas operativas nuevas/remediadas sin paginación servidor = rechazo.

### Desempate Design Layer (2026-07-24)

Consulta paralela produjo dos borradores DS-OWNER: uno **action-only** (sin «Fin de resultados») y otro que reintroducía `endLabel` / «Fin de resultados» + «Mostrando…» en el footer. **PROD-UX** (spec CA-PAG) prohíbe el ornamento de fin y prefiere el strip como único conteo visible.

**Decisión EM-ARCH:** prevalece **footer = solo «Cargar más» si `hasMore`**; sin «Fin de resultados»; sin conteo visible en el pie. `variant: pages` queda como excepción PRD (contrato distinto), no como default del primitive. El borrador DS con `endLabel` queda **descartado**.

---

## Aviso de vigencia parcial (2026-07-24)

[ADR-065](ADR-065-Paginacion-Numerada-Tablas-Operativas.md) supersede las cláusulas **§2 (default UX), §3 (ubicación del conteo), §5 (contenido del footer) y §9 (páginas numeradas)** de este documento, por instrucción del CTO de portar el patrón de paginación numerada.

**Lo que sigue vigente y sin cambio:** §1 (paginación servidor obligatoria), §4 (`total` en contrato), §6 (filtros fuera del shell y reset por filtro), §7 (virtualización como complemento), §8 (prohibición de listados unbounded), la tabla de excepciones y el merge gate.

Este ADR **sigue rigiendo íntegramente** los recursos que el contrato declara con `capabilities.randomAccess: false` — feeds cronológicos y colas de alto volumen, que conservan el default de cursor + «Cargar más» y el conteo en `PortalResultsStrip`. No es un documento histórico: es la mitad del contrato.

Ver el registro de posiciones del Design + Engineering Layer y el desempate sobre la ubicación del conteo en ADR-065 §Registro de posiciones.

---

## Contexto

Las tablas operativas del portal divergen en estrategia de carga:

| Superficie | Comportamiento actual |
| --- | --- |
| Usuarios (`/dashboard/users`) | Cursor + `limit` + «Cargar más» |
| Comercial — planes / productos / servicios | Carga el catálogo completo y filtra en cliente |
| Otras tablas (inventory, assurance, CRM, …) | Mixto: algunas sin bound, otras con page/cursor |

Riesgos si 200+ filas se pintan en una sola lista:

1. **Rendimiento y CLS** — layout costoso, scroll largo, memoria del cliente.
2. **Inconsistencia de identidad** — footer «Mostrando X de Y / Fin de resultados» en unas tablas y ausencia total en otras.
3. **Contrato API no uniforme** — listados sin `limit`/`cursor` empujan al FE a descargar el universo.
4. **Firma §2.3** ya anticipa DataTable enterprise (filtros en URL, virtualización ≥~1k); falta la norma de **paginación servidor como piso**, no solo virtualización.

La pregunta de producto («¿todas las tablas deben tener el footer de Usuarios?») se responde junto a esta decisión: el footer no es ornamento; es el control de paginación incremental.

## Opciones

| # | Opción | Resumen |
| --- | --- | --- |
| A | Status quo | Cada módulo decide; Comercial puede listar N ilimitado |
| B | Paginación por páginas numeradas (1…N) en todas las tablas | Familiar; más coste de UX/API y peor para listas ISP densas |
| C | **Cursor + «Cargar más» como default universal**; páginas numeradas solo por PRD explícito | Alinea Usuarios; acota payload; footer solo con acción |

## Decisión (propuesta EM-ARCH → CTO)

**Opción C.**

### Norma

1. Toda **tabla operativa** del portal (listado de dominio con datos remotos bajo `PortalPanel` + `portalDataTableShellClassName`) **debe paginar en servidor** con `limit` + cursor (o equivalente documentado en el contrato OpenAPI del recurso).
2. **[SUPERADA por ADR-065 §Decisión 1-2 — vigente solo si `randomAccess: false`]** **Default UX:** botón «Cargar más» que concatena páginas; tamaño de página por defecto **20** (alineado a `USERS_PAGE_SIZE`), configurable por módulo en el rango 10–50 si el PRD lo justifica. CTA = `Button` secondary sm (no primary de página).
3. **[SUPERADA por ADR-065 §Decisión 4 — en modo paginado el conteo vive en el pie; el principio de un solo conteo por tabla se mantiene]** **Conteo visible:** exclusivo de `PortalResultsStrip` **fuera** del shell (arriba). Gramática del strip: con `hasMore` → `{cargados} de {total} {recurso}`; completo → `{total} {recurso}` (p. ej. `128 usuarios`). Prohibido duplicar ese conteo en el pie.
4. **`total` en contrato:** listados de tablas operativas deben exponer `total` (o meta equivalente) para el strip. Si falta, fallback temporal `{shown} cargados` + deuda API documentada; no inventar pie.
5. **[SUPERADA por ADR-065 §Decisión 5 — vigente solo si `randomAccess: false`; la prohibición de ornamento se mantiene en ambos modos]** **Footer dentro del shell:** solo si `hasMore === true`. Contiene **únicamente** la acción «Cargar más» (`PortalTablePagination` en `portal-ui`, no `@iwana/ui` en Ola 1). Si `hasMore === false` → **omitir el nodo footer completo** (ni caja vacía ni borde solo). Prohibido «Fin de resultados» ornamental.
6. **Filtros** permanecen fuera del shell; al cambiar filtro → reset a primera página (cursor null); no concatenar con página anterior.
7. **Virtualización** (Firma §2.3, ≥~1k filas visibles) es **complemento** futuro, no sustituto de paginación servidor.
8. **API:** los listados que alimentan tablas operativas nuevas o remediadas exponen `limit` + cursor (o page documentada) + `total`. Queda **prohibido** que el FE de una tabla operativa consuma un endpoint sin cota y materialice el universo en memoria como estrategia permanente.
9. **[SUPERADA por ADR-065 §Decisión 1 y 6 — las páginas numeradas pasan de excepción a default; se confirma que son contrato UI distinto: nacen `PortalTablePager` y `PortalPageSizeSelect`, y `PortalTablePagination` no se sobrecarga]** **Paginación numerada (1…N):** contrato UI **distinto** (no sobrecargar `PortalTablePagination`); solo con requisito PRD explícito.

### Excepciones (documentar en el módulo)

| Excepción | Condición |
| --- | --- |
| Preview / resumen embebido | ≤ 10 filas fijas, sin pretensión de directorio completo |
| Matrices / settings estáticos | Cardinalidad fija y pequeña (p. ej. roles del seed, no un CRUD de miles) |
| Tablas de un solo registro / detalle | No aplican |
| Páginas numeradas | Solo con requisito PRD explícito (auditoría, exportabilidad por página, etc.) |

Cualquier excepción permanente se declara en el informe del módulo; no se inventa en código.

### Anatomía canónica (UI)

```text
PageHeader? (ruta + CTAs de página)
└── PortalPanel
      ├── filtros / chips
      ├── PortalResultsStrip          ← conteo
      └── portalDataTableShellClassName
            ├── <table> …
            └── PortalTablePagination  ← solo si hasMore (acción «Cargar más»; sin conteo visible)
```

## Consecuencias

### Positivas

- Una sola regla para QA, DS y FE; cierra la divergencia Users vs Comercial.
- Payload acotado; mejor TTFB percibido en tenants grandes.
- Pie de tabla con significado (acción), no decoración.

### Negativas / deuda

- Comercial y otros catálogos requieren contrato API + FE (ola de adopción).
- Endpoints actuales sin cursor necesitan extensión (SR-FULL) antes o en paralelo al FE.
- Tests y E2E deben cubrir «primera página / cargar más / reset por filtro».

### Fuera de alcance de este ADR

- Implementación inmediata de todos los módulos (va por plan de adopción).
- TanStack Table / densidad / vistas guardadas (siguen en Firma §2.3 como dirección).
- Paginación en `apps/web` plataforma: misma norma **por analogía** cuando la tabla sea operativa; se adopta en la misma ola o en ADR hermano si el CTO lo exige explícito para web.

## Plan de adopción (resumen)

| Ola | Alcance | R | A |
| --- | --- | --- | --- |
| 0 | Este ADR + receta + Firma §2.3 + instrucción portal | EM-ARCH / DS-OWNER | CTO (ADR) |
| 1 | Primitive `PortalTablePagination` (load-more) en `portal-ui` + remediación Users (quitar «Fin de resultados») | FE-PLATFORM | EM-ARCH |
| 2 | Comercial planes/productos/servicios: API cursor + FE | SR-FULL + FE-PLATFORM | EM-ARCH |
| 3 | Inventory, assurance, CRM, access control y resto del inventario | FE + SR-FULL según gap | EM-ARCH |
| 4 | Gate SR-QA: checklist de tablas operativas sin listado unbounded | SR-QA | EM-ARCH |

Detalle: [docs/plans/2026-07-24-portal-table-pagination-universal.md](../plans/2026-07-24-portal-table-pagination-universal.md).

## Criterio de aceptación del ADR

- CTO aprueba o rechaza con enmienda.
- Tras aprobación: estado → **Aprobado**; skill `component-recipes` §2 y Firma §2.3 citan este ADR; `portal.instructions.md` lo referencia.
- Ninguna tabla operativa nueva se mergea sin paginación servidor (gate de review / SR-QA).

## Escalación

ADR final solo lo aprueba el **CTO humano**. EM-ARCH recomienda **C**.
