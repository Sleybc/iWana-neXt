# INFORME - Auditoria y remediacion del datagrid del portal

- **Tipo:** INFORME
- **Version:** v1.0
- **Fecha:** 2026-08-17
- **Modulo:** MOD00 y superficies operativas de `apps/portal`
- **Modo:** codigo + auditoria mecanica + protocolo multiagente

## Resumen ejecutivo

Se audito el datagrid operativo del portal con `iwana-identity-ui-review`,
`senior-ui-systems-designer` y `ui-ux-pro-max`, aplicando el protocolo multiagente con
AI-FE-PLATFORM, AI-PROD-UX, AI-DS-OWNER y AI-SR-QA.

La primitive existente era valida; el riesgo estaba en la adopcion desigual: tablas con clases
locales, headers no canonicos, divisores duplicados y consumidores que no persistian el estado en
URL. Se consolidaron tokens, se corrigio la seleccion de modo por `randomAccess`, se migro el
estado relevante de usuarios y consumidores con filtros a URL y se amplio la cobertura.

## Hallazgos iniciales

- **P0:** 0.
- **P1:** 1 causa raiz: estado de filtros/paginacion fuera de URL en superficies operativas.
- **P2:** 6 causas raiz: divisores `divide-gray-200`, headers `bg-gray-50`, tablas fuera del patron,
  tracking arbitrario en badges, superficies no homogeneas y falta de patron en `apps/web`.
- **P3:** 3 causas de pulido: densidad duplicada, gramaticas locales y coverage responsive parcial.
- **Puntaje orientativo:** 73/100 antes de la remediacion.

Los heuristics restantes del script no son defectos bloqueantes del datagrid: `bg-iwana-secondary-50`
en Access Control y spinners puntuales para acciones o refrescos.

## Protocolo ejecutado

### Wave 1 - Clasificacion y contrato

- Se inventariaron tablas operativas, previews, pickers, matrices, calendarios y tablas anidadas.
- AI-DS-OWNER confirmo que no hace falta una primitive nueva.
- El contrato se registro en `docs/specs/2026-08-17-mod00-datagrid-portal-ds-contrato.md`.

### Wave 2 - Consistencia visual

AI-FE-PLATFORM alineo las tablas operativas con `portalDataTable*`, `PortalDataTableHead` y
`portalTableRowHoverClassName`. Se limpiaron clases locales en Assurance, Comercial, CRM,
Inventario, Operaciones, Scheduling y Settings. Se incluyeron `AccessControlSettingsClient` y
`OrganizationSettingsClient`, como fue aprobado, limitando esos cambios a la superficie visual.

Se preservaron como excepciones los previews, editores de lineas, pickers, importaciones, matrices,
calendarios y tablas anidadas.

### Wave 3 - Estado en URL

- `UsersClient` usa `useTableQueryState` para `search`, `status`, `role`, pagina y tamaño.
- La seleccion de `PortalTablePager` vs `PortalTablePagination` usa exclusivamente
  `meta.capabilities.randomAccess`.
- El pager de usuarios incorpora `PortalPageSizeSelect` y elimina el conteo duplicado del strip
  en modo numerado.
- Assurance reutiliza `PortalSearchField`, conserva sus filtros remotos en URL y no fabrica cursores.
- Comercial conserva sus helpers de URL existentes y reinicia el buffer/cursor al cambiar filtros.
- Los componentes cursor no se convirtieron artificialmente a offset sin soporte backend.

### Wave 4 - Calidad

- Se ampliaron tests del primitive: sorter mobile, `aria-sort`, pager, focus restoration, page size,
  resultados y axe.
- Se ampliaron tests de hook URL: page, page size, filtros, sort y preservacion de parametros.
- Se agregaron specs para `TaxApplicationRulesManager` y `CompatibilityRulesManager`.
- Se corrigio un bug real: `UnrealizedVisitsView` ahora propaga `isLoading` a `PortalTablePagination`.
- Se corrigio un bug real: `PortalDataTableSortableHead` conserva `aria-sort="none"` en mobile.
- El E2E de suscriptores verifica pagina, tamaño, URL y navegacion atras.

## Verificacion ejecutada

| Gate | Resultado |
| --- | --- |
| `pnpm.cmd --filter @iwana/portal test` | 187 suites, 1422 passed, 1 skipped preexistente, 0 failed |
| `pnpm.cmd --filter @iwana/portal typecheck` | Limpio |
| `pnpm.cmd --filter @iwana/portal lint` | 0 errores; 51 warnings existentes |
| `git diff --check` | Limpio |
| `audit-ui.mjs` sobre archivos productivos del datagrid | P0: 0, P1: 0; heuristics no bloqueantes |
| Playwright `--list` | 8 pruebas E2E detectadas en 2 archivos |

La ejecucion E2E queda pendiente porque requiere el stack de API/web/portal levantado. No se
declara como pasada.

## Archivos principales

- Primitive: `apps/portal/src/components/shared/portal-ui.tsx` y su spec.
- Usuarios: `UsersClient.tsx`, `UsersTable.tsx` y specs.
- Assurance: `AssuranceClient.tsx`, `AssuranceTicketsTable.tsx` y specs.
- Comercial: combos, promociones, catalogo tributario, reglas tributarias, compatibilidad,
  productos, servicios y planes.
- Inventario: activos, comodatos, solicitudes, salidas, vida util y tablas relacionadas.
- Scheduling y operaciones: `PendingVisitRequestInbox`, `UnrealizedVisitsView`, `TasksTable`.
- URL: `apps/portal/src/lib/use-table-query-state.spec.ts`.
- E2E: `e2e/tests/portal-crm-subscribers-pagination.spec.ts`.

## Pendientes no bloqueantes

1. Ejecutar los 8 E2E contra el stack levantado.
2. Extender el mismo contrato a `apps/web`, que no tiene una primitive equivalente detectada en
   esta auditoria.
3. Completar coverage responsive y axe por dominio, especialmente scheduling e inventario.
4. Medir y publicar `sortableFields` solo despues de contar con indices y p95 conforme ADR-065.
