# INFORME-MOD11-BANDEJA-ORDENES-COLAS-v1.0

**Módulo:** MOD11 Ejecución operativa: bandeja de órdenes de ejecución
**Versión:** 1.0
**Estado:** Implementado y verificado. G6 ✅ 2026-11-19 (ver §4). Sin commit ni push.
**Fecha:** 2026-11-19
**Spec:** `docs/specs/2026-11-19-mod11-bandeja-ordenes-colas-ux.md`
**Plan:** `docs/plans/2026-11-19-mod11-bandeja-ordenes-colas.md`
**Prompt de origen:** `docs/prompts/PROMPT-MOD11-BANDEJA-ORDENES-COLAS-LAUNCH-v1.0.md`
**Ruta:** `/dashboard/operations/execution-orders`

---

## 1. Resultado

La bandeja ahora tiene colas de trabajo con conteos: Activas, Por programar, Sin asignar, Hoy, Mías y Todas.

- Entrar sin parámetros abre «Activas».
- La ventana se muestra en forma relativa («Hoy 14:00»).
- La fila entera abre la consola.
- Se puede buscar por número de orden.
- Bajo 768 px la bandeja se lee como tarjetas.

Se cumplen dos reglas de compatibilidad:

- **CA-12:** la API responde igual que antes si no recibe parámetros.
- **CA-10:** los enlaces explícitos, como `?status=COMPLETED`, no se reinterpretan.

La columna Cliente no se tocó y no se añadió búsqueda por cliente, porque F-4 sigue pendiente de G0.

## 2. Medidas en el navegador

Línea base: primera fila en y=748, con 2 filas visibles.

| Medida | Antes | Después |
|---|---|---|
| 1440×900, primera fila (paso 1) | y=748, 2 filas | y=538, 6 filas |
| 1440×900, primera fila (paso 2, con colas) | — | y=545, 6 filas |
| Conteos | — | Activas 42 = total 42; Todas 47 |
| `?status=COMPLETED` | — | abre Todas con 5 órdenes (CA-10) |
| `?number=20261023` | — | 18 coincidencias |
| 375 px | — | sin desplazamiento lateral; primera tarjeta en y=1186 |

## 3. Pruebas (conteos reales, Jest `--no-cache`)

| Corrida | Resultado |
|---|---|
| Línea base W0 (operations) | 52 suites / 861 tests |
| Portal operations + lib tras R1–R3 | 77 suites / 1075 tests, verde |
| Portal completo (QA2) | 445/446 suites; 5010 pasan, 1 omitido, 1 fallo intermitente ajeno (`AssuranceClient.spec.tsx`, MOD10, 21/21 aislado) |
| Shared | 57 suites / 794 tests |
| API tasks unitario | 42 suites / 825 tests |
| Integración de colas (Postgres real) | 14/14 |
| E2E portal (bandeja-ot, origen-ot-e4, pager-a11y con axe) | 27/27 pasan, sin ajustar pruebas |
| audit-ui, typecheck, ESLint | limpios |

La prueba de inventario `ExecutionOrdersInbox.inventory.spec.tsx` (11 tests) mantiene sus expectativas sin cambios.

## 4. Revisiones

- **sec-eng: GO.** SEC-Q1 corregido. SEC-Q2 y SEC-Q3 quedan para G7.
- **boundary-reviewer: GO.**
- **contract-drift-reviewer: GO.** El contrato compartido quedó congelado en v1.1.
- **test-change-reviewer: GO tras corregir R1.**
  - En P1 el veredicto fue un GO condicional.
  - En P2 fue un NO-GO condicional, que se levantó al corregir R1.
  - Los tests retirados cubrían las colas «Mías + estado», reemplazadas según §3 H.

## 5. Decisiones del usuario

- **§3 D:** se mantienen las 8 columnas, en lugar de las 5 propuestas.
- **CA-2:** se aceptan 6 filas visibles en lugar de 7. Lo que limita es que Cliente y «Asignado a» ocupan dos líneas.
- **R1–R3:** se aplicaron las correcciones.
  - R1: abrir una fila conserva la cola.
  - R2: «Limpiar filtros» conserva la cola.
  - R3: vacío propio de cada cola.

## 6. Desviaciones y deudas

1. **Móvil:** la primera tarjeta queda bajo el pliegue (y=1186 a 375 px).
2. **«Hoy» incluye órdenes terminales,** como dice la spec. Excluirlas es un cambio de una línea si se decide.
3. **SEC-Q2:** el `ILIKE` de búsqueda por número no tiene índice. Medir el p95 antes de G7.
4. **R4:** la bandeja responde 503 si no puede resolver la zona horaria del tenant.
5. **Descripción de la orden:** se retiró de la fila (R-1), según §3 A (encabezado) y §3 D.
6. **Prueba entre tenants:** usa el mismo schema.
7. **Colas por estado:** Asignadas, En progreso y Bloqueadas pasan al filtro Estado, a dos clics.
8. **R3 al entrar sin parámetros:** conserva el texto «Todavía no hay órdenes de ejecución» para no alterar el inventario.

## 7. Archivos

- **Portal** (`apps/portal/src/components/operations/`):
  - Cambiados: `ExecutionOrdersClient`, `ExecutionOrdersToolbar`, `ExecutionOrdersTable` (cada uno con su spec), `execution-orders-query` (con su spec) y `execution-order-window-copy.ts`.
  - Nuevos: `execution-order-window-relative.ts` (con su spec) y `ExecutionOrdersInbox.inventory.spec.tsx`.
- **Portal lib:** `apps/portal/src/lib/api-client.ts`, con su spec.
- **API** (`apps/api/src/modules/tasks/`):
  - Nuevo: `services/execution-order-queues.ts`.
  - Cambiados: `services/execution-orders.service.ts`, `dto/execution-orders.dto.ts`, `execution-orders.controller.ts`, `tasks.module.ts` y `tasks.swagger.spec.ts`.
  - Pruebas nuevas: `tests/execution-orders.service-list-queues.spec.ts` y `tests/execution-orders.list-queues.postgres.integration.spec.ts`.
- **Shared:** `packages/shared/src/contracts/operations/execution-orders-list.ts`, con su `.contract.spec.ts`.

## 8. Pendiente

- Fijar línea base de conteos completos: api 618 suites / 8225 tests; portal 446 / 5018; shared 57 / 794.
- El commit, cuando el usuario lo pida. Debe hacerse con índice temporal y excluir `next-env.d.ts`, `.claude/launch.json` y los cambios de otras sesiones.
- G6.5, después del push y con el CI de main en verde.

## 9. Cierre G6

- **docs-governance:** GO. Los menores que contradecían la spec se corrigieron (spec v1.1).
- **gate-verifier:** lint y typecheck limpios. Portal completo 446 suites / 5017 pasan, 1 omitido ajeno. Shared 57 / 794. API tasks 42 / 825. Cobertura ≥ 80 % en las líneas de los archivos tocados.
- **Gates que gate-verifier dejó abiertos, ya cerrados en esta sesión:**
  - test-change-reviewer, boundary-reviewer y contract-drift-reviewer, con los veredictos de §4.
  - La integración de colas contra Postgres real: 14/14.
- **API completa:** 617/618 suites. El rojo está en `app.config.production-urls.spec.ts` y se debe a `MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS` del `.env.development` local. El diff no toca ese archivo y el CI de main está verde en c9c36094 (run 44540744391). Queda como deuda de entorno.
