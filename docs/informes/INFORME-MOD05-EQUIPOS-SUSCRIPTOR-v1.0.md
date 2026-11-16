# INFORME — MOD05 · MOD12 · Equipos del suscriptor (fase 1) · v1.0

**Plan:** [2026-11-16-mod05-mod12-equipos-del-suscriptor](../plans/2026-11-16-mod05-mod12-equipos-del-suscriptor.md) · **Spec:** [2026-11-16-mod05-mod12-equipos-del-suscriptor](../specs/2026-11-16-mod05-mod12-equipos-del-suscriptor.md) v1.0 · **Launcher:** [PROMPT-MOD05-EQUIPOS-SUSCRIPTOR-LAUNCH-v1.0](../prompts/PROMPT-MOD05-EQUIPOS-SUSCRIPTOR-LAUNCH-v1.0.md)
**Partida:** `HEAD` 7bed4cb9; CI de `main` `success` (run 43913526018). Todo el trabajo queda **sin commit** en `main`.

## Gates

| Gate | Estado | Fecha | Fuente |
|---|---|---|---|
| G0 | ✅ | 2026-11-16 | Usuario («Apruebo el G0») |
| Fin de ola 1 | ✅ | 2026-11-16 | Contrato A1 v1.0 y `PortalTimeline` v1.1 congelados (§Ola 1) |
| G6 ola 2 | ✅ | 2026-11-16 | CA-4 y CA-5 en verde contra Postgres real; conteos ≥ W0 |
| G6 cierre | ✅ | 2026-11-16 | `gate-verifier` GO; E2E en verde; `audit-ui` sin hallazgos nuevos; `sec-eng` GO (C1 resuelta); `boundary-reviewer` sin hallazgos abiertos |
| G6.5 | Pendiente | — | Requiere push autorizado y CI de `main` en verde |

## Decisiones de ejecución

| # | Decisión | Fuente |
|---|---|---|
| E1 | Paginación por la misma ruta, con `materialsPage/materialsLimit/historyPage/historyLimit/historyAssetId`, como la ficha 360 | A1 |
| E2 | `PortalTimeline` congelado como **v1.1**, con seis añadidos sobre §3: `formatAt`, `headingRef`, error con lista, «Ver más» vía `PortalTablePagination`, pares dark y `aria-current="step"`. Texto en spec §3.1; la cabecera de la spec no cambia | `ds-owner` |
| E3 | Materiales: se excluyen los movimientos reversados y sus reversos | Arquitecto, registrado en spec §2.1 |
| E4 | Índices de la migración tenant 213 justificados por `EXPLAIN` | A2; el de `location_id` lo autorizó el arquitecto |
| E5 | CA-6 frente a R1: opción (a). El drawer de Inventario se abre completo, porque lo protege el mismo permiso; R1 rige para la pestaña | Arquitecto, registrado en spec CA-6 y R1 |
| E6 | `AssetLifecycleEventType.RETURNED` se muestra como «Retorno» (etiqueta compartida) | Arquitecto, spec §2.4 |
| E7 | Comodato cerrado: «Retirado» en gris, sin el estado actual del activo. «Ver OT» exige además `OPERATIONS_EXECUTION_ORDERS_READ`. Materiales con «Cargar más» | F2, aceptadas por el arquitecto (spec §2.2) |
| E8 | Con titular anonimizado no se ofrece «Ver ficha del equipo» (condición C1 de `sec-eng`) | `sec-eng` + spec §2.3 |

## Ola 1

**W0, línea base** (16-nov, `HEAD` 7bed4cb9, jest `--no-cache`):

| Superficie | Suites | Tests | Omitidos |
|---|---|---|---|
| API inventory, unitarias | 81 | 822 | 0 |
| API inventory, integración (`DB_NAME=test`) | 5 (+1 omitida) | 12 | 13 (`ola3d`, por diseño) |
| Portal `crm/subscribers` + `inventory` | 141 | 1299 | 1 (`InventoryClient.spec.tsx:2244`) |

Un rojo por entorno (`EPERM rename` de la caché de jest en `InventoryCatalogDrawer.spec.tsx`), que pasa al repetirlo aislado.

**A1, contrato v1.0 congelado:**
- `packages/shared/src/contracts/inventory/subscriber-equipment.ts`
- `apps/api/src/modules/inventory/dto/subscriber-equipment-response.dto.ts`
- `GetSubscriberEquipmentQuerySchema` en `dto/index.ts`

`UsefulLifeStatus` y `SerializedAssetUsefulLife` pasaron a `@iwana/shared` con la misma forma. Al cierre solo se añadió un comentario: `movementId` no es único por fila. La forma no cambió.

**DS:** `PortalTimeline` v1.1, con la entrada en el changelog DS en `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md:148`.

## Ola 2

**A2, endpoint** `GET /api/v1/inventory/subscribers/:subscriberRefId/equipment`, con `INVENTORY_STOCK_READ` y los mismos roles que `/loans`:
- Implementación en `services/asset-loan.service.ts` y `services/subscriber-equipment.queries.ts`.
- Ningún `@Module` cambió.

**Recorte del historial:** entra el evento que cae en `[installed_at, removed_at]` y el que comparte `stock_movement_id` con el movimiento que abrió el comodato. El INSTALLED se graba con `now()`, antes de `installed_at`.

**`EXPLAIN (ANALYZE)`** con volumen sintético y `ROLLBACK` (40.040 comodatos, 200.200 eventos, 90.000 líneas):

| Consulta | Antes | Después |
|---|---|---|
| Q1 equipment | Seq Scan, 2,49 ms | Index Scan `(tenant_id, subscriber_ref_id)`, 0,41 ms |
| Q2 materials | Seq Scan, 11,0 ms | Index Scan `(tenant_id, location_id)`, 0,79 ms |
| Q3 history | 2,8 ms | 0,60 ms |

**Migración tenant 213** `213_asset_loans_subscriber_index.ts`:
- Crea dos índices, con `CONCURRENTLY`, idempotencia y `down` simétrico.
- Tiene su integration spec y está registrada en `runner.ts:172,423`.
- Aplicada en `dbiw` el 2026-11-16 (ver Pendientes resueltos).

**D:** nota D6 en `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md`.

**F1:** `PortalTimeline` en `apps/portal/src/components/shared/portal-ui.tsx`, con su spec en `portal-timeline.spec.tsx`.

**F2:**
- `SubscriberEquipmentTab.tsx`, `use-subscriber-equipment.ts`, la tarjeta `SubscriberInstalledEquipmentCard` y la integración en `SubscriberDetailClient.tsx` y `SubscriberOverviewTab.tsx`.
- `getSerializedAssetStatusBadgeVariant` en `inventory-labels.ts`.
- Hook extraído `use-serialized-asset-detail.ts`, sin cambio de comportamiento en `InventoryClient`.
- «Ver en kardex» solo aparece si llega `onOpenKardex`.
- Una sola lectura compartida entre la tarjeta y la pestaña.

## Ola 3: QA y evidencia final

**Conteos reales** (`gate-verifier`, jest `--no-cache`, sin turbo):

| Superficie | W0 | Cierre |
|---|---|---|
| API inventory, unitarias | 81 / 822 | **84 / 856** |
| API inventory, integración | 5 / 12 (13 omitidos) | **6 / 21** (13 omitidos) |
| Portal `crm/subscribers` + `inventory` | 141 / 1299 (1 omitido) | **144 / 1353** (1 omitido) |
| Portal `shared` | — | 17 / 184 |
| `@iwana/db` unitarias | — | 81 / 452 |
| Migración 213 (integración) y `migration-order` | — | 2/2 y 6/6 |

- **Typecheck** de shared, db, api y portal: exit 0.
- **ESLint** sobre los 37 archivos del encargo y la E2E: exit 0.
- **Cobertura de los archivos nuevos:** ≥ 87 % de líneas en la API y ≥ 89 % en el portal.

**CA-4 y CA-5** (`subscriber-equipment.postgres.integration.spec.ts`), 4 de 4 en verde:
- CA-4 «A ve solo su periodo, con los bordes installedAt y removedAt y el evento de cierre» y «B no ve eventos del periodo de A ni de bodega».
- CA-5 «el mismo subscriberRefId desde otro tenant devuelve colecciones vacías» y «filtra por tenant_id aunque el schema sea el mismo».

**E2E** `e2e/tests/portal-mod05-equipos-suscriptor-live.spec.ts`: en verde en dos corridas.
- Entorno: API y worker con `node dist/main` (PID 20484 y 27856), detenidos después por PID; portal levantado por el config de Playwright.
- Vecinas: `portal-mod05-ficha-uisp-live` 2 pasan y 1 omitida por su precondición, y `portal-mod05-pestana-soporte` 4/4.
- `portal-mod05-facturacion-ficha-live` 7/8. Su CA-7 (`:1364`) falla por los cambios de billing sin commit de otra sesión, que muestran «Pagada Importada». Es ajeno a este encargo.

**`audit-ui.mjs`:** sin hallazgos en lo nuevo. El único P2 está en `portal-ui.tsx:441` y viene del commit 8340410e, anterior al encargo.

### Trazabilidad CA → prueba

| CA | Prueba |
|---|---|
| CA-1 | `subscriber-ficha-inventario.portal.spec.tsx` «CA-1: la Vista general muestra hasta 3…»; `SubscriberEquipmentTab.spec.tsx` (tarjeta); E2E |
| CA-2 | `subscriber-ficha-inventario.portal.spec.tsx` «CA-2/CA-9: sin INVENTORY_STOCK_READ…»; `subscriber-equipment.permissions.spec.ts` (metadatos y 403 con los guards reales) |
| CA-3 | `SubscriberEquipmentTab.spec.tsx` (una llamada inicial y páginas aparte); `subscriber-ficha-inventario` «CA-3…»; E2E |
| CA-4 | Integración «CA-4 — historial recortado…»; E2E (la recepción previa no aparece en la pestaña) |
| CA-5 | Integración «CA-5 — aislamiento por tenant» |
| CA-6 | `SubscriberEquipmentTab.spec.tsx` «…Ver ficha del equipo abre el drawer»; `SerializedAssetDetailDrawer.spec.tsx`; `use-serialized-asset-detail.spec.tsx`; E2E |
| CA-7 | `SubscriberEquipmentTab.spec.tsx` «estados §2.3» y «estados complementarios»; `portal-timeline.spec.tsx` |
| CA-8 | Encabezados de tabla, menú ⋯ con teclado, objetivos de 44 px (en componente y con `boundingBox` en la E2E); axe con 0 violaciones en componente y en la E2E (pestaña, menú y drawer) |
| CA-9 | `subscriber-ficha-inventario` H1–H5, con 9 pestañas en orden; E2E de las vecinas de la ficha |

## Revisiones

**`sec-eng`: GO con condiciones.** La única condición, C1, está resuelta (E8).

Dictamen de bloqueo (spec §4): **DATOS_BLOQUEADOS no se aplica en la fase 1.** Fundamento:
- El contrato no lleva nombre, dirección, documento ni texto libre.
- CRM y Billing ocultan solo la PII que identifica (ADR-094 D7).
- `/inventory/loans` ya expone los mismos comodatos.
- La spec de bloqueo en proyecciones (2026-11-05) sigue sin G0 y deja `inventory` «por confirmar».

Condiciones del dictamen y evidencia de su cumplimiento:

| # | Condición | Evidencia |
|---|---|---|
| 1 | El contrato no suma nombre, dirección, etiqueta del cliente ni texto libre | `subscriber-equipment.ts`; claves exactas en la integración |
| 2 | El tenant sale solo del contexto | `asset-loan.service.ts:238`; `tenant_id = $1` en las tres consultas; prueba con el mismo schema y otro tenant |
| 3 | UUID validado | `ParseUUIDPipe` y `z.string().uuid()`; pruebas HTTP 400 |
| 4 | «No existe» y «otro tenant» responden igual | Integración (`toEqual`) |
| 5 | `historyAssetId` ajeno devuelve vacío | Integración |
| 6 | Recorte con los bordes probados | Integración CA-4: bordes exactos y ±1 ms |
| 7 | Respuesta campo por campo, sin `notes` | Mapeo explícito; la prueba verifica que no aparecen `notes` ni `PRIVATE_NOTE` |
| 8 | `limit` ≤ 100 | Zod `.max`, que el servicio revalida; prueba HTTP con 101 → 400 |
| 9 | Índice `(tenant_id, subscriber_ref_id)` | Migración 213 y EXPLAIN |
| 10 | Sin serial ni MAC en los logs | Sin logger en la ruta; en el portal, textos de error fijos |

Cuando el CTO dé el G0 de la spec de bloqueo en proyecciones, su fila `inventory` se cierra como «sin PII directa». Si se añade un campo identificador al contrato, el endpoint pasaría a regirse por D-BLQ.

**Hallazgos de `sec-eng` que no condicionan el GO:**
- S-2: prueba de 403. Hecha en `subscriber-equipment.permissions.spec.ts`.
- S-3: recorte con dos relojes, Node y Postgres. Informativo.
- S-4: el `status` actual del activo sale en los comodatos cerrados. Queda para la fase 2.
- S-5: un técnico puede consultar cualquier suscriptor del tenant. Ya está diferido en spec §6.

**`boundary-reviewer`: sin hallazgos de boundary ni de tenancy.**
- Menor 2, el literal `'tasks.execution-order'` repetido: corregido con una fuente única, `EXECUTION_ORDER_ORIGIN_CONTEXT`, que también usa `stock-ledger.service.ts`.
- Menor 1, el estado en los comodatos cerrados: derivado a `sec-eng`, que lo dejó como S-4.

**`contract-drift-reviewer`: sin deriva bloqueante.**
- Corregidos: el ejemplo de unidad `'M'` pasó a `'METER'` y se documentó `movementId`.
- El resto de los menores queda como deuda.

**`test-change-reviewer`:** ningún spec existente se ajustó de forma que oculte una regresión. Sus dos huecos de cobertura (el permiso en el servidor, y el hook y el drawer) los cerró QA.

## Deuda

| Sev. | Deuda | Dueño |
|---|---|---|
| Media | Las cuatro timelines hechas a mano (`SerializedAssetDetailDrawer`, `TaskTimeline`, `ExpedienteTimelinePanel`, `SubscriberActivityCard`) siguen sin migrar a `PortalTimeline`. `ExpedienteTimelinePanel` necesitaría un `marker` opcional (carril rápido) | `fe-platform` |
| Media | `e2e/tests/portal-mod05-facturacion-ficha-live.spec.ts:1364` está desactualizado frente a los cambios de billing sin commit. Ajeno a este encargo | Dueño del trabajo de billing |
| Baja | Cuatro copias de `UsefulLifeStatus`: shared, el DTO de la ficha 360, `api-client.ts` e `inventory-labels.ts` | `fe-platform` / `sr-backend` |
| Baja | Los nulables del DTO están como `@ApiPropertyOptional`, y el contrato los declara presentes con `null`. Es el patrón vigente de la ficha 360 | `sr-backend` |
| Baja | `inventory.swagger.spec.ts` no fija las claves de los DTO de equipo ni de materiales. Lo cubre la integración | `sr-backend` |
| Baja | La pantalla no prueba el aviso «No fue posible abrir el activo» (`InventoryClient.tsx:2326`); el hook sí | `sr-qa` |
| Baja | El drawer de Inventario conserva rótulos contrarios a §2.4: «Ficha 360 del activo», «Ledger» | `fe-platform` |
| Baja | Q2 todavía recorre completa `stock_locations`, 0,55 ms con 10.001 sitios. Vigilar si crece | `sr-backend` |
| Info | S-3, S-4 y S-5 de `sec-eng` | Fase 2 |
| Info | La cobertura total del módulo inventory es 72,0 % de líneas, que ya era así; los archivos del encargo cumplen | — |

## Pendientes resueltos (2026-11-16, a pedido del usuario)

- **Migración 213 en `dbiw`:** aplicada con `pnpm --filter @iwana/db migration:tenant:run`.
  - Resultado: «Paridad de migraciones OK: 8 tenant(s) ACTIVE con 208 migraciones idénticas».
  - Verificación en `pg_index`: los dos índices existen y son válidos en los 8 tenants ACTIVE.
  - Los tenants de prueba que no están ACTIVE no se migran, por diseño del migrador; quedan con su aviso informativo.
- **Aviso de Next.js:** verificado con `pnpm audit --prod`, no con el texto de la compilación. Es GHSA-mfr8-8qww-v76h, moderado, en `>=16.3.0 <=16.4.4`, corregido en `>=16.4.5`.
  - Exposición: nula hoy. Ni el portal ni web usan `'use cache'` ni `unstable_cache`.
  - Corrección: `next` pasa de `^16.4.2` a `^16.4.5` en `apps/portal/package.json` y `apps/web/package.json`, y resuelve a 16.4.6 (publicada el 2026-11-09).
  - `pnpm-lock.yaml`: solo cambian `next` y `@next/*` de 16.4.2 a 16.4.6, más una deduplicación de `caniuse-lite`. Se reformateó con Prettier, como el resto del lockfile.
  - `pnpm install --frozen-lockfile` OK; `pnpm audit --prod` da 0 avisos de `next`; typecheck de portal y web sin errores; `next build` de portal (54 páginas) y de web (15 páginas) con «Next.js 16.4.6», exit 0 y sin el aviso de vulnerabilidad.

## Pendientes

- **G6.5:** commit y push solo a pedido del usuario, y después el CI de `main` en verde.
- **Fase 2** (spec §6): cada punto necesita su G0.
