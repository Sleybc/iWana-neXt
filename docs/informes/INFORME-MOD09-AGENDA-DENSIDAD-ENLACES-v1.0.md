# INFORME — MOD09 Programación · Agenda: densidad y enlaces

**Versión:** 1.0
**Fecha:** 2026-11-19
**Estado:** G6 de los pasos 1 y 2 ✅ en desarrollo · sin commit · G6.5 pendiente (push autorizado y CI de `main` en verde)
**Spec:** [2026-11-19-mod09-agenda-programacion-densidad-y-enlaces-ux](../specs/2026-11-19-mod09-agenda-programacion-densidad-y-enlaces-ux.md) v1.0 · **Plan:** [2026-11-19-mod09-agenda-programacion-densidad-y-enlaces](../plans/2026-11-19-mod09-agenda-programacion-densidad-y-enlaces.md) · **Launcher:** [PROMPT-MOD09-AGENDA-DENSIDAD-ENLACES-LAUNCH-v1.0](../prompts/PROMPT-MOD09-AGENDA-DENSIDAD-ENLACES-LAUNCH-v1.0.md)
**Base:** `main` en `9f9aeca0`

## 1. Resultado

Se cerraron las seis olas. El usuario revisó el paso 1 en el punto de control y autorizó continuar.

| Ola | Bloque | Resultado |
|---|---|---|
| 1 | W0 | Línea base, prueba de inventario (10 tests) y datos sembrados |
| 2 | P1 | Encabezado único, barra en una fila, grilla arriba, Semana/Mes compactos, estado en la URL |
| 3 | QA1 + revisión | CA-1 a CA-8 PASS; la revisión halló el choque del parámetro `type` y se corrigió (filtro → `workType`) |
| 4 | API | Todo el dato ya viajaba; único cambio: 403 → 404 para evento ajeno en `GET /wfm/events/:id` y `PATCH /wfm/events/:id/status` |
| 5 | P2 | `eventId` abre el panel; enlaces desde la orden y el ticket; conteos junto a los accesos |
| 6 | QA2 + revisión | CA-9 a CA-11 PASS; arreglos de revisión: etiqueta neutra del conteo, refresco tras recarga y pruebas por rol |

## 2. Mediciones (1440×900 y 375 px, tenant de pruebas con datos sembrados)

| Medida | Antes (W0) | Después | Criterio |
|---|---|---|---|
| Primera fila de técnico, Día | 779 px | 359–365 px | CA-2 < 400 ✅ |
| Filas de técnico a la vista | 2 | 6 | CA-2 ≥ 6 ✅ |
| Semana sin carga, 1440 | contenido desde 1012 px | 7 días, último termina en 699 px | CA-3 ✅ |
| Semana sin carga, 375 px | 3833 px | 907 px | CA-8 ≤ 1600 ✅ |
| Desplazamiento lateral a 375 px | no | no | CA-8 ✅ |

## 3. Criterios

| CA | Resultado | Evidencia |
|---|---|---|
| CA-1 | PASS | `SchedulingClient.inventory.spec.tsx` 10/10 antes y después, sin tocarla |
| CA-2, CA-3, CA-8 | PASS | §2 |
| CA-4 | PASS | Vista, fecha y filtros en la URL; recargar reproduce |
| CA-5 | PASS | `view=day&fromDate=` y `technicianId` abren lo mismo; la URL no se reescribe al entrar; el enlace de CRM `open=create&type=` conserva `type` |
| CA-6 | PASS | Ninguna expectativa de crear evento, arrastre, borrador o lectura de URL cambió |
| CA-7 | PASS con hallazgos previos | Teclado en barra y grilla; axe: ver §6 |
| CA-9 | PASS | Válido abre su panel en su día; inexistente y ajeno: sin panel, aviso, mismo 404 (ajeno verificado contra la API con token de técnico) |
| CA-10 | PASS | Un clic desde OTE-20261119-012 y desde TK-20261117-007 |
| CA-11 | PASS | Encabezado 3 y 5 = totales de sus bandejas |

## 4. Conteos (jest `--no-cache`)

| Alcance | Base W0 | Final |
|---|---|---|
| `scheduling` | 26 suites / 208 | incluida abajo |
| scheduling + operations + assurance | — | 103 / 1704 |
| Portal completo | 447 / 5037 (W0 excluyó por error rutas con «inventory»; su 351/4162 no es comparable) | 450 / 5062, 1 omitida, 0 fallos |
| API wfm | 19 / 255 | 19 / 256 |
| E2E `portal-wfm-scheduling.spec.ts` (3002) | — | 18/18 tras los últimos arreglos |
| E2E que entran a la agenda + consola de la orden + pestaña Soporte (3002) | — | 5/5 y 17/17 (QA2, antes de los arreglos de revisión de P2) |

`tsc` del portal y de la API sin errores; lint sin errores; `audit-ui.mjs` sin hallazgos.

## 5. Cambios

- **Portal, agenda:** `SchedulingClient.tsx`, `SchedulingToolbar.tsx`, `ScheduleCalendar.tsx`, `scheduling-ui.ts`; nuevos `agenda-event-link.ts` y `scheduling-pending-counts.ts`.
- **Portal, enlaces:** `execution-order-links.ts` (orden), `assurance-ticket-links.ts` y `AssuranceTicketDetail.tsx` (ticket).
- **API:** `schedule-events.service.ts` (404 para evento ajeno en detalle y cambio de estado). Sin cambios de `@Module`, esquema ni `packages/shared`.
- **Pruebas:** specs nuevos `SchedulingClient.inventory.spec.tsx`, `SchedulingClient.pending-counts.spec.tsx`, `scheduling-pending-counts.spec.ts`, `execution-order-links.spec.ts`; casos añadidos en specs existentes.
- **Pruebas con expectativa ajustada:** `ExecutionOrderSummary.console.spec.tsx` (enlace con `eventId`, CA-10); `schedule-events.service.spec.ts` (403 → 404, CA-9); E2E `portal-wfm-scheduling.spec.ts` (descripciones retiradas → títulos con `toBeAttached`, espera explícita de `/wfm/events` en `shiftAgendaToMockEventDay`). Revisadas por `test-change-reviewer`.

## 6. Deudas

| # | Deuda | Dueño sugerido |
|---|---|---|
| D-1 | WFM no tiene alcance por sede en ningún endpoint de eventos ni solicitudes; la spec lo suponía. Hoy: tenant y, para técnico/contratista, eventos propios | Producto + `sec-eng` |
| D-2 (D-A1) | La bandeja de visitas sin realizar trae ≤ 100 por fuente; con más, su total queda por debajo del conteo del encabezado | `fe-platform` |
| D-3 | Los conteos copian los parámetros de las bandejas; consolidar en un helper común | `fe-platform` |
| D-4 | «Pendientes» cuenta todos los estados (carga por defecto de la bandeja); si producto quiere solo programables, cambiar a la vez bandeja y conteo | Producto |
| D-5 | axe: `target-size` en celdas de media hora (`ScheduleCalendar.tsx`) y `color-contrast` en Mes oscuro; previos a este frente | `fe-platform` |
| D-6 | Sin E2E orden/ticket → agenda con `eventId`; CA-10 cubierto por unitarias y navegador | `sr-qa` |
| D-7 | Con 404, el panel se ve un instante cargando antes de cerrarse; al ir de la consola a la agenda queda un diálogo de ancho 0 en el DOM | `fe-platform` |
| D-8 | Los conteos se recargan en cada `loadData` (también al cambiar filtro o día): 4 consultas `limit=1` extra | `fe-platform` |
| D-9 | Nombres de técnico cortados («SeedAge…») y «Sin t…» en Semana a 375 px | `fe-platform` |

## 7. Datos sembrados

En el tenant de pruebas `srqa-mod11-r5-20261006` de la BD dev: 8 técnicos «SeedAgenda Tecnico 01…08» con cargo «[SEED-AGENDA] Técnico de campo» y 16 eventos «[SEED-AGENDA] …» del 2026-11-20, más un solape insertado por SQL (la API rechaza solapes del mismo técnico). Retiro: `seed-agenda.mjs retire` y, para el solape, `seed-agenda-retiro.sql`, guardados en la carpeta de notas de la sesión, fuera del repo. El navegador integrado quedó con sesión de administrador de ese tenant.
