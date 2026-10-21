# INFORME — MOD05 · Pestaña Soporte del suscriptor (Fase 07)

**Fecha:** 2026-10-21 · **Versión:** 1.0 · **Estado:** Cierre G7 completado
**Base aprobada:** `90b05217` · **Plan:** [2026-10-20-mod05-pestana-soporte.md](../plans/2026-10-20-mod05-pestana-soporte.md)
**PRD:** [PRD-MOD05-CRM-SUBSCRIBERS-FASE-07-v1.0.md](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-07-v1.0.md) · **Spec UX:** [2026-10-20-mod05-pestana-soporte-ux-spec.md](../specs/2026-10-20-mod05-pestana-soporte-ux-spec.md)

## Dictamen

La implementación satisface los criterios funcionales CA-SO-01 a CA-SO-09 y las revisiones V2, V3 y V4 dieron GO. Las pruebas de integración nuevas ejecutaron contra PostgreSQL real y no se añadieron a `integration-expected-skips.json`. La ejecución local completa de E2E Portal terminó con **307 aprobados, 1 omitido con motivo, 0 fallidos y 0 cuarentenas**. El commit de implementación `dd2ce9194158303738725638399b8b38fca69894` está publicado en `main`; el [CI de `main`](https://github.com/Sleybc/iWana-neXt/actions/runs/39604995487) terminó en verde, incluido el job bloqueante «E2E portal» en 9m33s. También pasó el [E2E Web Admin Smoke](https://github.com/Sleybc/iWana-neXt/actions/runs/39604995503).

## Entregables y trazabilidad

| RF / CA | Resultado y evidencia |
| --- | --- |
| RF-SO-01 a RF-SO-03 · CA-SO-01 | `subscriberId` filtra tickets por solicitante suscriptor, sujeto suscriptor y sujeto contrato. Integración PostgreSQL verifica inclusión de las tres vías y exclusión de otro suscriptor y tenant. |
| RF-SO-04 a RF-SO-06 · CA-SO-02 | WFM filtra visitas y eventos por `subscriber_id` o expediente consultado mediante `CrmSubscriberReadPort`; las originadas en ticket no aparecen. Integración PostgreSQL cubre ambos endpoints. |
| RF-SO-07 · CA-SO-07 | Migración tenant 159 agrega cinco índices reversibles. Las consultas `EXPLAIN (ANALYZE, FORMAT JSON)` comprueban uso de los índices de tickets, visitas y suscriptor en eventos, sin `Seq Scan`; el índice de expediente de eventos ya existía desde MOD09. |
| RF-SO-08 a RF-SO-14 · CA-SO-03, CA-SO-04, CA-SO-06 | La pestaña Soporte compone Tickets y Visitas con permisos independientes; no solicita la sección sin permiso. «Crear ticket» fija el suscriptor. `?tab=soporte`, navegación por teclado, carga/error/vacío y limpieza del foco diferido están cubiertos por tests de componente y E2E. |
| RF-SO-15 · CA-SO-05 | El formulario Assurance busca y selecciona suscriptores para `requesterType = SUBSCRIBER`; el campo ya no acepta referencia libre en ese caso. Otros tipos conservan su flujo. |
| RF-SO-16 · CA-SO-08 | CLI de solo lectura, simulación obligatoria, conteos e ids sin PII. Ejecución en tenant sintético: `simulation=true`, `ticketCount=0`, `ticketIdsCount=0`, salida del proceso `0`. |
| CA-SO-09 | Cuatro suites nuevas de integración —CRM, Assurance, WFM y CLI— ejecutaron **10/10 tests** contra PostgreSQL real. No aparecen como omisiones esperadas. |

### Migración y aislamiento

- `159_subscriber_support_lookup_indexes.integration.spec.ts`: **1 suite, 2 tests**; `up` crea los índices y `down` los elimina sin borrar tablas ni filas.
- La migración 159 se aplicó a **6 tenants ACTIVE** de desarrollo. La comprobación de paridad encontró **154 migraciones idénticas**. No se mutaron tenants inactivos con deriva previa.
- `migration-order.spec.ts`: **1 suite, 6 tests**, verde.
- Assurance y WFM obtienen contratos/expediente solo a través de `CrmSubscriberReadPort`; el CLI valida el tenant y no escribe.

## Verificación local

Comando de repetición sin caché Turbo:

```text
pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --filter=@iwana/db --filter=@iwana/portal --force --concurrency=1
```

Conteos de suites y tests en la ejecución sin caché:

| Paquete | Resultado |
| --- | --- |
| `@iwana/api` | 401 suites aprobadas, 4 omitidas; 5.402 tests aprobados, 15 omitidos (5.417 total). |
| `@iwana/shared` | 22 suites, 207 tests aprobados. |
| `@iwana/db` | 74 suites, 417 tests aprobados. |
| `@iwana/portal` | 318 suites; 3.220 tests aprobados, 1 omitido (3.221 total). |
| CLI dirigido después del ajuste de cierre | `report-ticket-subscriber-links.spec.ts`: 1 suite, 4 tests aprobados; `pnpm --filter @iwana/api build` y ESLint dirigido salieron con código 0. La ejecución real de simulación terminó con código 0. |
| E2E Portal | `pnpm test:e2e:portal`: **307 aprobados, 1 omitido con motivo, 0 fallidos**. Cuarentenas activas: 0. |

El test E2E omitido informa que falta el seed de administrador CRM en ese fixture sintético; no sustituye el rol por `AUDITOR`. No hay filas activas en `e2e/QUARANTINE.md`.

Para mantener el job portal completo compatible con los contratos vigentes, se actualizaron fixtures E2E que aún intentaban activar suscriptores con `PATCH /status`, la expectativa de orden de pestañas del suscriptor y el mock tenant requerido por inventario. Las capturas de E4 ahora se adjuntan al resultado de Playwright y no modifican PNG rastreados.

### Cobertura y gates estáticos

| Paquete | Líneas | Resultado |
| --- | ---: | --- |
| API | 83,37 % | Sobre 80 % en el alcance total medido. `TicketsService` 71,94 % y `ScheduleEventsService` 70,18 % por rutas históricas no cubiertas; los nuevos filtros tienen cobertura unitaria e integrada. |
| Shared | 89,27 % | Sobre 80 %. |
| Portal | 71,86 % | Sobre el ratchet configurado (57 % líneas). |
| DB | 48,00 % | No tiene umbral global; el catálogo histórico de migraciones reduce el agregado. Migración 159 tiene prueba `up/down` real. |

- Lint y typecheck de API, Shared, DB y Portal terminaron con código 0. Avisos de lint preexistentes: API 7, DB 5 y Portal 43; el nuevo cleanup de foco quedó corregido y su spec dirigida pasó **3/3**.
- `node scripts/audit-ui.mjs apps/portal/src/components/crm --json`: P0/P1/P2 = 0; 3 heurísticas P3 preexistentes en componentes de spinner de expediente, no en Soporte.
- `pnpm audit:doc-locations`: 0 bloqueos y 3 avisos previos sobre informes dentro de `.playwright-mcp/`.
- `pnpm audit:adr-citations`: 0 bloqueos; los 144 avisos son heurísticas preexistentes.
- No cambiaron dependencias ni lockfile.

## Revisiones y deuda residual

- **V2 sec-eng: GO.** Sin PII nueva en URL, logs ni respuesta CLI; permisos comprobados por sección y en API. Deja registrado un hallazgo P2 preexistente: la API de creación admite un `requesterRefId` de suscriptor arbitrario dentro del tenant. El buscador del portal limita la selección visual, pero el endpoint no valida pertenencia del id; requiere seguimiento en Assurance.
- **V3 boundary y contract drift: GO.** Sin lectura directa de CRM desde Assurance/WFM; parámetros alineados entre API y portal.
- **V4 ds-owner: GO.** Identidad aprobada; cero P0/P1/P2 en auditoría UI.
- Cobertura total API supera 80 %, aunque dos servicios que contienen rutas históricas siguen debajo de ese porcentaje por archivo (tabla anterior). Las rutas nuevas están cubiertas; conservar esta deuda visible para el siguiente ciclo de cobertura.
- V5 gate-verifier: GO para los gates locales. No sustituye la comprobación del CI de `main`.

## G7

- **Commit de implementación:** `dd2ce9194158303738725638399b8b38fca69894` (`feat(mod05): add subscriber support tab`).
- **Push:** `origin/main` actualizado; `HEAD` y `origin/main` coincidieron al verificar.
- **CI:** [run 39604995487](https://github.com/Sleybc/iWana-neXt/actions/runs/39604995487), conclusión `success`. Pasaron lint, typecheck, build, unitarios y gate de cobertura, migraciones, integraciones PostgreSQL/API, E2E Portal bloqueante, E2E operativo R4.1, integridad ADR y build de imágenes.
- **Smoke adicional:** [run 39604995503](https://github.com/Sleybc/iWana-neXt/actions/runs/39604995503), conclusión `success`.
