# INFORME — Centro de control «Pulso de plataforma» (`apps/web`, `/dashboard`)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Plan:** [2026-11-21-web-centro-control-pulso-plataforma.md](../plans/2026-11-21-web-centro-control-pulso-plataforma.md) · **Dirección:** [v1.1](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md)

## Fase 1 — Recomposición sin backend

**Estado:** G6 ✅ 2026-11-21 (AI-EM-ARCH) · commit local, sin push.

| Bloque | Agente | Entregable |
| --- | --- | --- |
| 1A | `ds-owner` | Contrato DS v1.3 congelado (§7bis): `PulseStrip`, `AttentionQueue`, `density` compacta. D4 procede |
| 1B | `fe-platform` | Primitives movidas a `@iwana/ui` (portal sin copias), `DashboardClient` recompuesto, `LatestTenantsPanel` |
| 1C | `sr-qa` | E2E de la portada reescrita contra CA-PP-01…08; axe `wcag22aa` |

**Evidencia (conteo real, `--force`, `Cached: 0`):**

| Comando | Resultado |
| --- | --- |
| `@iwana/ui` typecheck lint test | 14 suites · 142 tests |
| `@iwana/web` typecheck lint test | 40 suites · 292 tests |
| `@iwana/portal` typecheck lint test | 457 suites · 5198 tests + 1 omitido |
| `playwright.web.config.ts --workers=1` | 33/35; las 2 rojas son preexistentes (triaje `e2e-triage`) |
| axe `wcag22aa` 375/1280, claro/oscuro | 4/4 |
| E2E inicio del portal (servidor de desarrollo) | 47/47 |
| `audit-ui.mjs` | P0/P1 = 0 |
| Revisión en vivo `localhost:3001/dashboard` 1440×900 | B0, B1, B2 y B4 conforme al prototipo; consola sin errores |

**Decisiones de AI-EM-ARCH:** lima en «Todo al día» permitido por el contrato DS §7bis.3 (CA-PP-07 se lee como «sin lima decorativa»); el punto lima de la actividad era defecto y se corrigió. Los enlaces por estado de la leyenda compacta se conservan. `test-change-reviewer` pidió restaurar 13 coberturas de `DashboardClient.spec.tsx`; restauradas. Sobre las E2E, `test-change-reviewer` no encontró regresión probada.

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| ~~F1-D1~~ | `DashboardMetricStrip` sigue vivo: lo usa `/tenants` | P3 |
| ~~F1-D2~~ | D-5 cerrada 2026-11-22 (`69c8fcd3`): el umbral de 24 px era imposible (24 px de padding + 1 px de borde); mide una columna. `web-tenant-create-happy-path` sigue roja: expectativa obsoleta desde `48e2a7be` (correo del administrador obligatorio, «Emitir credenciales de acceso»). Arreglarla hace que cada corrida cree una empresa real en la base de desarrollo: falta decidir la limpieza (sr-qa) | P2 |
| ~~F1-D3~~ | Sigue sin correr: `playwright.portal.config.ts:59-72` fija el 3002 en `baseURL` y `--port`, con `reuseExistingServer: false`; no admite puerto alterno sin cambiar la configuración | P2 |
| ~~F1-D4~~ | Actividad filtra en cliente (atajo) hasta la Fase 2 | P3 |
| ~~F1-D5~~ | `PulseStrip` sin `aria-busy` por celda | P3 |
| ~~F1-D7~~ | `web-audit-logs-datepicker:198` con `exact` queda más débil; el mock de `/tenants` corta por `limit` sin ordenar (sin prueba de orden de «Últimas empresas») | P3 |
| ~~F1-D6~~ | `'danger'` aún en `dashboard-visuals.tsx` y `DashboardAreaCards.tsx` del portal | P3 |

## Fase 2 — P1 y P3

**Estado:** G6 ✅ 2026-11-21 (AI-EM-ARCH) · commit local, sin push. Encargo: [FASE2](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0.md).

| Bloque | Agente | Entregable |
| --- | --- | --- |
| Contratos | AI-EM-ARCH | `TenantStatusSummary` v1.1, `PlatformUsersSummary` v1.0, `AUDIT_SESSION_ACTIONS` en `packages/shared` |
| §A | `sr-backend` | Serie mensual en `PlatformAuditService.countEntityLifecycleByMonth`, `GET platform-users/summary`, `excludeSessionEvents` |
| §B | `fe-platform` | Tendencia con `Chart` (ADR-112), delta del mes, antigüedad del alta, celda Equipo interno, área Usuarios internos; filtro de sesión en servidor |
| §C | `sr-qa` | Mocks v1.1, CA-PP2-01…06, axe |

**Evidencia (conteo real, `--force`, `Cached: 0`):**

| Comando | Resultado |
| --- | --- |
| `@iwana/shared` test | 59 suites · 811 tests |
| `@iwana/web` typecheck lint test | 40 suites · 299 tests |
| `@iwana/api` typecheck lint test | 626/627 suites · 8374/8375 tests; la roja (`app.config.production-urls.spec.ts`) pasa aislada 29/29: intermitente bajo carga, ajena al cambio |
| Integración `DB_NAME=test` (3 specs) | 3 suites · 11 tests |
| `e2e/playwright.web.config.ts --workers=1` | 41/43; rojas = las 2 preexistentes de F1-D2 |
| axe `wcag22aa` 375/1280, claro/oscuro | 4/4 |
| Revisión en vivo 1440×900 con datos reales | 5 celdas, tendencia 184 altas / 182 bajas, B2 termina a 761 px; sin P2 ni P4 |

**Revisores:** `boundary-reviewer` GO con condición (SQL directo sobre `platform_audit_logs` desde `TenantService`) → corregido moviendo la agregación a `PlatformAuditService`. `contract-drift-reviewer`: sin deriva. `test-change-reviewer`: sin regresiones; hueco del `@Transform` cubierto con `query-platform-audit-logs.dto.spec.ts`. sr-qa halló la tendencia en ceros sin estado vacío (CA-PP2-01) → corregido.

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| ~~F2-D1~~ | `web-chart.tsx` repite `portal-chart.tsx`; subirlo a `@iwana/ui` lo decide ds-owner | P3 |
| ~~F2-D2~~ | Sin serie histórica de activas: la tendencia no tiene la línea de activas ni el selector de periodo del prototipo | P3 |
| ~~F2-D3~~ | Cerrada 2026-11-22 (CTO): fila «N usuarios sin verificación en dos pasos», Atención, enlaza a `/platform-users`; sin usuarios, sin fila (`d75cdf6b`) | — |
| ~~F2-D4~~ | `platform_audit_logs` es append-only: la integración deja filas sintéticas en `test` | P3 |
| ~~F2-D5~~ | `exportCsv` de auditoría no aplica `excludeSessionEvents` | P3 |
| ~~F2-D6~~ | Cerrada 2026-11-22 (`1a2636ef`): otra suite carga `.env.development`, que define `MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS`, prohibida en producción; el helper solo borraba dos claves. Ahora borra toda clave del esquema no declarada | — |
| ~~F2-D7~~ | Mocks E2E repiten literales de sesión en vez de importar `AUDIT_SESSION_ACTIONS` | P3 |

El 2026-11-23 se corrigió el destino de «Ver usuarios», «Equipo interno» y la alerta de verificación en dos pasos. Los tres abren `/platform-users`, que lista las cuentas de `public.platform_users` con el mismo criterio que el resumen P3: cualquier estado y exclusión de cuentas eliminadas. El directorio muestra nombres para identificar cada cuenta, rol, estado, verificación en dos pasos y último acceso para revisar su seguridad. `GET /api/v1/platform-users` exige sesión de plataforma y registra `LIST_ACCESS` con los conteos de la página. El directorio por empresa se sigue abriendo desde `/users`.

«Usuarios internos» en el menú lateral y en las rutas frecuentes del buscador global también abre `/platform-users`. El menú lateral queda marcado como página activa.

El resultado de sección «Usuarios» del buscador global abre `/platform-users` incluso cuando el índice conserva la ruta anterior. Los resultados de personas por empresa mantienen sus enlaces al directorio de su empresa.

Los seis accesos al listado de plataforma usan la misma ruta definida en `@iwana/shared`. El buscador y el directorio por empresa identifican los resultados de personas como «Usuarios de empresa».

El buscador muestra hasta dos fragmentos resaltados distintos por resultado, en su orden original. Así evita claves duplicadas de React cuando la búsqueda devuelve el mismo fragmento más de una vez.

En «Cuentas de plataforma», el administrador puede editar el nombre y los apellidos mediante `PATCH /api/v1/platform-users/:id/name`. La actualización excluye cuentas eliminadas y registra al actor y los campos editados en la misma transacción. El administrador también puede crear cuentas que aparecen de inmediato como pendientes en el listado y se incluyen en el resumen. La persona titular cambia su contraseña temporal y confirma la verificación en dos pasos antes de obtener una sesión completa. [ADR-115 (en revisión)](../adrs/ADR-115-Activacion-de-Cuentas-de-Plataforma.md)

El Panel de activación agrupa el directorio en cuentas pendientes, activas y otras cuentas. La API prioriza las pendientes antes de paginar y entrega el indicador de cambio de contraseña para mostrar qué pasos faltan. Tras crear una cuenta, el panel abre su detalle. En pantallas angostas, seleccionar una cuenta lleva el foco al detalle.

Las cuentas de plataforma que ya están activas pueden configurar la verificación en dos pasos desde «Mi cuenta». La persona titular confirma su contraseña actual y un código de su aplicación autenticadora. Al activarse, el resumen del Centro de control refleja el nuevo estado. [ADR-115 (en revisión)](../adrs/ADR-115-Activacion-de-Cuentas-de-Plataforma.md)

## Fase 3 — P2

**Estado:** G6 ✅ 2026-11-21 (AI-EM-ARCH) · commit local, sin push. Encargo: [FASE3](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3-v1.0.md).

| Bloque | Agente | Entregable |
| --- | --- | --- |
| Contrato | AI-EM-ARCH | `PlatformHealthHistory` v1.0 en `packages/shared` |
| §A | `sr-backend` | Migración `public/034_platform_health_samples`, entidad, muestreador del worker cada 5 min (retención 35 días), `GET /api/v1/platform/health/history` |
| §B | `plat-ops` | `API_INTERNAL_URL` en `docker-compose.prod.yml` y `.env.example`; red `data` compartida worker↔API |
| §C | `fe-platform` | Celda «Disponibilidad, 30 días», tracker de 30 días en Salud, área Colas de trabajo con nombres en español |
| §D | `sr-qa` | Mocks `healthHistory`, CA-PP3-01…03 y 05, axe |

**Evidencia (conteo real):**

| Comando | Resultado |
| --- | --- |
| `@iwana/db` jest `--force` | 83 suites · 458 tests |
| `@iwana/worker` jest `--force` | 29 suites · 315 tests |
| `@iwana/api` jest `--force` | 628/629 suites · 8383/8384 tests; la roja es F2-D6 (`app.config.production-urls.spec.ts`, pasa aislada) |
| `@iwana/web` typecheck lint test | 40 suites · 304 tests |
| Integración `DB_NAME=test` | API 5/5 (401 anónimo y token inválido, 403 token de empresa, día parcial, días sin muestras, tabla vacía) · worker 2/2 (Redis real: cola vacía y antigüedad; retención) |
| `e2e/playwright.web.config.ts --workers=1` | 46/49; rojas: las 2 de F1-D2 y D-4 de `web-empresas-directorio`, intermitente (aislada 2/2) |
| Portada (focal) y axe `wcag22aa` | 28/28 · 4/4 |
| Revisión en vivo 1440×900 con endpoint real | 200 con 30 días; sin muestras aún: «Sin dato disponible» y tracker neutro, nunca verde; B2 termina a 762 px; sin P4 |
| Migración 034 | aplicada en `dbiw` y `test` con `pnpm --filter @iwana/db migration:run` |

**Revisores:** `boundary-reviewer` sin hallazgos (una nota menor); `contract-drift-reviewer` sin deriva (2 menores); `test-change-reviewer` sin regresiones. La señal instantánea de servicio caído queda en «Requiere tu atención».

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| ~~F3-D1~~ | prod-ux 2026-11-22: tracker diario aprobado (100 % / 99 %); para la celda de 30 días propone verde ≥ 99,9 %, que debe coincidir con la disponibilidad prometida: **decide el CTO** ([dirección §8](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md)) | P2 |
| ~~F3-D2~~ | Cerrada 2026-11-22: el worker de `pnpm dev` escribió la muestra de salud al arrancar (`db_ok` y `redis_ok` en verdadero, 19 colas) y la consola la pinta. En local `api_ok` queda nulo porque `.env` no define `API_INTERNAL_URL` (está en `.env.example`): el API no se mide y el tracker marca el día sin dato | — |
| ~~F3-D3~~ | Sonda HTTP del muestreador a `API_INTERNAL_URL`: revisión de `sec-eng` antes de G7 | P2 |
| ~~F3-D4~~ | Tracker local de `apps/web`; candidato a `@iwana/ui` (ds-owner) | P3 |
| ~~F3-D5~~ | `PlatformQueueSnapshot` y `PlatformHealthSampleQueue` sin `satisfies` entre sí; nombres de cola en copy a mano | P3 |
| ~~F3-D6~~ | Sin prueba E2E de 401 (cubierto en integración del API); `formatPercent` trunca en vez de redondear | P3 |
| ~~F3-D7~~ | `docker-compose.e2e.yml` sin API: ese worker no mide `api` | P3 |

## Fase 4 — P4, uso por empresa

**Estado:** G6 ✅ 2026-11-21 (AI-EM-ARCH) · commit local, sin push. [ADR-114](../adrs/ADR-114-Uso-por-Empresa-en-la-Consola-de-Plataforma.md) aprobado por el CTO el 2026-11-21 con D3. Visibilidad (CTO): «System_Admin, y a los roles que se les dé permiso» → constante `PLATFORM_TENANT_USAGE_ROLES` (hoy solo `SYSTEM_ADMIN`; superada por el ajuste por rol de ADR-114 v1.3 §9, F4-D3). Encargo: [FASE4](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4-v1.0.md).

| Bloque | Agente | Entregable |
| --- | --- | --- |
| Contrato | AI-EM-ARCH | `TenantUsage` v1.0 y `PLATFORM_TENANT_USAGE_ROLES` en `packages/shared` |
| §A | `sr-backend` | Migración `public/035_tenant_usage_snapshots` (FK en cascada), definición única de suscriptor listado en `@iwana/db` (CRM la importa), job horario del worker, `GET /api/v1/tenants/usage` auditado |
| §B | `fe-platform` | Área «Uso por empresa» solo para roles autorizados; «Sin dato», desactualizada a 2 h, cupo 0 distinto de sin cupo |
| §C | `sr-qa` | `web-centro-control-uso-empresa.spec.ts`, rol de los mocks alineado al API real, CA-PP3-05 reformulado |
| Verificación | `sec-eng` | Las 7 condiciones del ADR-114 §7 cumplen: GO |

**Evidencia (conteo real, `--force`, `Cached: 0`):**

| Comando | Resultado |
| --- | --- |
| `@iwana/shared` | 59 suites · 811 tests |
| `@iwana/db` | 85 suites · 463 tests |
| `@iwana/worker` | 30 suites · 317 tests |
| `@iwana/api` | 629/630 suites · 8388/8389 tests; la roja es F2-D6 |
| `@iwana/web` (paquete solo) | 40 suites · 308 tests; en la corrida paralela de 5 paquetes CA-PP2-02 superó los 15 s |
| Integración `DB_NAME=test` | API 4/4 (200 con solo campos del contrato, 401, 403 `IWANA_SUPPORT`, 403 empresa) · worker 2/2 (definición de CRM, fallo aislado sin 0, cascada) |
| `e2e/playwright.web.config.ts --workers=1` | 57/59; rojas = las 2 de F1-D2 |
| E2E uso por empresa y axe | 10/10 · 4/4 |
| Revisión en vivo 1440×900 como `SYSTEM_ADMIN` | `tenants/usage` 200; iWana «Sin dato» (aún sin medición); B3 en 3 + 2; B2 termina a 761 px; sin desplazamiento horizontal |
| Migración 035 | aplicada en `dbiw` y `test` |

**Revisores:** `boundary-reviewer` GO; la definición en `@iwana/db` en vez de un puerto de CRM la acepta AI-EM-ARCH (nota en ADR-114 §7). `contract-drift-reviewer` sin deriva; cupo 0 frente a sin cupo → corregido. `test-change-reviewer` sin regresiones.

**Incidencia de entorno:** el API de `pnpm dev` (3000) cayó durante la fase, probablemente al recompilar `@iwana/db`. Con autorización del usuario se arrancó solo el API con `pnpm --filter @iwana/api dev` en una pestaña nueva; web, portal y contenedores no se tocaron.

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| ~~F4-D1~~ | Cerrada 2026-11-22: al activar, la puesta en marcha encola una medición (`ebf968e6`); un fallo al encolar solo se registra | — |
| ~~F4-D2~~ | Cerrada 2026-11-22 (CTO): el conteo excluye anonimizados; ADR-114 v1.2 §8, `sec-eng` GO en las 7 condiciones; la lista de CRM no cambia (`84ffac85`) | — |
| ~~F4-D3~~ | Permisos de plataforma asignables por pantalla: exigen un modelo de permisos de plataforma con ADR propio | P3 |
| ~~F4-D4~~ | prod-ux: 90/95 vale si el cupo bloquea altas; hoy `max_subscribers` no bloquea ninguna alta en CRM (si no bloquea, rojo en 100 %). **Decide el CTO** | P3 |
| ~~F4-D5~~ | Una fila por empresa sin tope; límite o «Ver más» por decidir (prod-ux) | P3 |
| ~~F4-D6~~ | La cascada se probó borrando la empresa directo, no con la función de purga R7 | P3 |
| ~~F4-D7~~ | Cerrada 2026-11-22: el worker midió iWana (1 suscriptor activo, cupo 10 000) y la consola lo muestra en «Uso por empresa» | — |

## Correcciones tras la revisión en vivo (2026-11-22)

**Estado:** G6 local · commit local, sin push. Tres defectos vistos como administrador de plataforma en `localhost:3001/dashboard`.

| # | Defecto | Causa raíz | Arreglo |
| --- | --- | --- | --- |
| C1 | Actividad reciente: cinco filas «registró un cambio en un registro», «ahora» | Cada carga deja una fila `LIST_ACCESS`/`TenantUsage` en `platform_audit_logs` (auditoría de `GET tenants/usage`, ADR-114; 29 en 2 días). El feed solo excluía sesión, y el vocabulario no tenía verbo ni frase para esa acción | Filtro en servidor `excludeAccessEvents` (`LIST_ACCESS`, `RECORD_ACCESS`) en `QueryPlatformAuditLogsDto`; el tablero lo pide. La auditoría se conserva (verificado: siguen creándose filas). Vocabulario: «consultó», «el uso por empresa», «un acceso» |
| C2 | Colas: «Acumulación» con 0 en espera y 14 fallidos; atención «Todo al día» | El área calculaba el aviso por su cuenta (`waiting > 0 \|\| failed > 0` → «Acumulación») y la cola de atención no leía las colas | Regla única `summarizeWorkQueues` (`platform-health.ts`): aviso si hay fallidos o espera; rótulo «Con fallos» si hay fallidos, «Acumulación» si solo espera; en aviso, fila «N trabajos fallidos» / «N trabajos en espera» que enlaza a `#colas-de-trabajo` |
| C3 | Tabla con las 19 colas | Se pintaban todas | Solo colas con novedad, «N colas sin novedad» y «Ver todas»; sin novedad, una línea «Sin novedad en las N colas.» |

Sin cambios en `packages/shared` ni en el ADR-114; sin tokens nuevos (`Badge`, `Button` de `@iwana/ui`).

**Evidencia (conteo real, jest directo sin turbo):**

| Comando | Resultado |
| --- | --- |
| Pruebas nuevas con el código anterior | 6 rojas (C1 API y vocabulario, CA-PP2-04, CA-PP3-03, C2, C3); verdes tras el arreglo |
| `@iwana/web` typecheck · lint · jest | 0 errores · 0 errores (8 avisos previos) · 40 suites, 311 tests |
| `@iwana/api` typecheck · lint · jest | 0 errores · 0 errores (6 avisos previos) · 629/630 suites, 8389/8390 tests; la roja (`tenant.service.spec.ts:1553`, 1 ms entre `generatedAt` y la llamada) pasa aislada 114/114: intermitente, ajena |
| `playwright.web.config.ts --workers=1` | 57/59; las 2 rojas son las preexistentes F1-D2 (`web-empresas-directorio`, `web-tenant-create-happy-path`) |
| Vivo 1440×900, claro y oscuro | Actividad sin lecturas; «Con fallos», 4 colas y «15 colas sin novedad»; atención «14 trabajos fallidos · Colas de trabajo · 4 colas» |

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| ~~C-D1~~ | Cerrada 2026-11-22: la causa era el servicio, no la prueba. `getStatusSummary` sellaba `generatedAt` con un segundo `new Date()` distinto del que usaba para pedir la serie; ahora reutiliza el mismo instante. Prueba nueva con reloj simulado, roja antes del arreglo | — |
| ~~C-D2~~ | Cerrada 2026-11-22: la espera avisa solo si el trabajo más antiguo lleva ≥ 5 min (`QUEUE_BACKLOG_ALERT_SECONDS`); una espera más corta se lista sin aviso. Umbral provisional, a confirmar por prod-ux (C-D4) | — |
| ~~C-D3~~ | Cerrada 2026-11-22: `POST /auth/logout` no llevaba `@SkipAudit()`. El servicio ya audita `LOGOUT` y el interceptor genérico añadía otra fila `CREATE`/`Auth` con el mensaje de respuesta. Las filas viejas siguen en el historial | — |
| ~~C-D4~~ | Cerrada 2026-11-22: prod-ux aprueba ≥ 5 min; cuenta solo `waiting`, no `delayed` | — |
| ~~C-D5~~ | Cerrada con F2-D6 | — |

**Evidencia del cierre de deuda:** las 4 pruebas nuevas (C-D1, C-D3 y dos de C-D2) fallan con el código anterior: C-D1, C-D3 y la de espera reciente de C-D2; la de espera de ≥ 5 min ya pasaba. Las 4 pasan con el arreglo. `@iwana/web`: 40 suites, 313 tests; typecheck y lint sin errores. `@iwana/api`: 8391/8392 tests; la roja es C-D5. Typecheck y lint sin errores. E2E `web-centro-control`: 38/38.

## Cierre de pendientes (2026-11-22)

**Estado:** commits locales, sin push. Commits: `84ffac85` (F4-D2), `d75cdf6b` y `b62e071c` (F2-D3), `6f35ffe7` (umbrales), `ebf968e6` (F4-D1), `1a2636ef` (F2-D6), `69c8fcd3` (F1-D2 D-5).

**Trabajos fallidos en colas (14 en desarrollo):**

| Cola | N | Motivo | Disposición |
| --- | --- | --- | --- |
| Documentos de contrato | 6 | Empresa `2408d3a2…`, purgada. 4 por «Cannot set property name… only a getter», defecto ya corregido en `4e9d1334` (2026-11-11 13:00, con prueba); 1 `42703` y 1 `UnrecoverableError` del mismo día | Retirados con `Queue.remove` |
| Puesta en marcha de empresas | 2 | Empresas `e2e-mod13-f1-*` y `srqa-bf-*`, purgadas | Retirados |
| Revisión de la agenda | 5 | `expired-sweep` del 14 al 24 oct: «Fallaron 1 tenant(s)» y `AggregateError`. El payload no trae empresa | Se dejan: no se puede probar que sean residuo; las corridas de hoy terminan bien |
| Revisión de evidencias | 1 | 14 oct: `relation "execution_order_evidence" does not exist` en algún schema. Sin empresa en el payload | Se deja, mismo motivo |

**Árbol:** los cuatro archivos de `apps/api/src/modules/audit/` tenían el mismo blob que el índice; el índice guardaba el tamaño de una copia CRLF (2040 frente a 1996 bytes) y `update-index --refresh` no lo resolvía. `git add` de esos mismos blobs refrescó la caché; contenido intacto.

**Revisores:** `sec-eng` GO (ADR-114 v1.2, 7 condiciones). `boundary-reviewer` GO en F4-D2 y F4-D1. `prod-ux`: [dirección §8](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md). `e2e-triage`: las 2 rojas de F1-D2 son expectativas obsoletas. `test-change-reviewer`: ajustes OK; señaló que sin el resumen de usuarios la cola decía «Todo al día» → `b62e071c`.

**Evidencia (conteo real, jest directo sin turbo):**

| Comando | Resultado |
| --- | --- |
| `@iwana/db` jest | 85 suites · 463 tests |
| `@iwana/worker` typecheck · lint · jest | 0 errores · 0 errores · 30 suites, 318 tests |
| `@iwana/api` typecheck · lint · jest | 0 errores · 0 errores · 630 suites, 8393 tests (sin rojas) |
| `@iwana/web` typecheck · lint · jest | 0 errores · 0 errores (8 avisos previos) · 40 suites, 315 tests |
| Integración `DB_NAME=test` | muestreador de uso 2/2 (con caso anonimizado, rojo antes); DT-4 de puesta en marcha no corre en local: `.env` sin `DB_BOOTSTRAP_PASSWORD` |
| `playwright.web.config.ts --workers=1` | 58/59; la roja es `web-tenant-create-happy-path` (F1-D2) |

**Decide el CTO:** disponibilidad de 30 días (99,9 % frente a 100 %) y si el cupo bloquea altas (umbral de uso).

Omitido: arreglo de `web-tenant-create-happy-path` y E2E del portal en producción. Sin verificar: suite DT-4 de integración. Riesgo: la medición al activar remide todas las empresas, no solo la nueva.

## Cierre total de deuda (2026-11-22)

**Estado:** commits locales, sin push. Decisiones del CTO del 2026-11-22: disponibilidad 99,9 / 99; el cupo solo avisa; F4-D3 se traslada. Las decisiones de AI-EM-ARCH constan en la [dirección](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md) §8–§8.3 (v1.2) y en el contrato DS v1.4 §7ter.

| Deuda | Disposición |
| --- | --- |
| F1-D1 | ds-owner: `DashboardMetricStrip` ya compone `MetricCard` y es la franja propia de la app; no se borra. Corregido: cifra 0 en tono neutro y `/tenants` con error y reintento en vez de ceros |
| F1-D2 | Expectativa obsoleta por `48e2a7be` (test-change-reviewer): alta real con correo de administrador, slug `srqa-web-alta-*`, limpieza en `beforeAll`/`afterAll` y la contraseña fuera de los artefactos. Verde |
| F1-D3 | `E2E_PORTAL_PORT` (`e2e/portal-origin.ts`), por defecto 3002. Inicio del portal con build de producción en 3012: 47/47 |
| F1-D4 | Ya resuelta: `excludeSessionEvents` y `excludeAccessEvents` en servidor; no queda filtro en cliente |
| F1-D5 | `aria-busy` en la celda `article` que carga; la sección solo cuando carga toda la franja |
| F1-D6 | Portal: `DashboardBarRow` con `Tone` + `FillEmphasis`; `'danger'` pasa a `error`/`strong` |
| F1-D7 | Ausencia sin `exact` en el datepicker; el mock ordena como el API; prueba de orden de «Últimas empresas» |
| F2-D1 | ds-owner: se mantienen `WebChart` y `PortalChart` (la carga diferida de `next` vive en cada app); se corrige el mensaje de ESLint |
| F2-D2 | Contrato `TenantStatusSummary` v1.2 (6/12/24 meses, `activeAtClose`), API con reconstrucción desde auditoría (el worker audita activación y fallo), índice parcial (migración public 036), dos gráficas lado a lado desde `xl` y selector `?periodo=` |
| F2-D4 | Las specs que siembran filas ahora hacen rollback. Las filas que deja el código bajo prueba de la purga y la puesta en marcha son la evidencia que esas pruebas verifican; en CI `test` se crea de cero |
| F2-D5 | `applyFilters` común para el listado, el total y la exportación |
| F2-D7 | Los mocks importan `AUDIT_SESSION_ACTIONS` y `PLATFORM_AUDIT_ACCESS_ACTIONS` (subida a `@iwana/shared`) |
| F3-D1 | Celda de 30 días con el tono por la razón exacta. La cifra redondea sin cruzar una frontera de color; el tracker diario sigue en 100/99 (prod-ux) |
| F3-D3 | sec-eng GO; aplicados L-1 (cancelar el cuerpo), L-2 (credenciales descartadas) e I-2 |
| F3-D4 | ds-owner: queda local hasta el área Red del portal; API `Tracker` reservada en §7ter.4 |
| F3-D5 | `WORKER_QUEUE_NAMES`/`SAMPLED_QUEUE_NAMES` en `@iwana/shared`; `queueNames` con `satisfies Record<…>`; el tablero muestrea también las colas del API |
| F3-D6 | `formatPercent` redondea; E2E de 401 con renovación fallida y aceptada |
| F3-D7 | No aplica: en E2E el API corre en el host y ninguna E2E lee la salud real; el día sale «sin dato», nunca verde. Comentado en el compose |
| F4-D3 | Resuelta 2026-11-23 con «ajuste por rol» (CTO), ADR-114 v1.3 §9; ver «F4-D3 — ajuste por rol» |
| F4-D4 | El cupo no bloquea: ámbar ≥ 90 %, rojo ≥ 100 %; en o sobre el cupo, una fila por empresa en «Requiere tu atención» |
| F4-D5 | Tope de 6 filas por mayor uso, con «Ver todas» en el sitio |
| F4-D6 | Prueba de integración con la purga R7 real: borra las muestras de la empresa purgada y no las de otras |

**Fallidos de octubre (causa raíz):** pruebas de integración corridas contra `dbiw` dejaban empresas `ACTIVE` con schemas incompletos, y el worker de `pnpm dev` las barría. Arreglos:
- una guarda de integración bloquea `INSERT` en `public.tenants` fuera de `test` o `iwana_it_*`;
- los barridos aíslan el fallo por empresa y el motivo dice `tenant=<uuid>`; un schema inválido cuenta como fallo de esa empresa;
- retención por familia de cola (`queue-retention.ts`), con limpieza periódica por antigüedad;
- el aviso solo cuenta `failedRecent` (72 h);
- marcar una empresa para borrado retira sus repetibles por empresa; una empresa suspendida o inactiva no falla.

Retirados de Redis de desarrollo: los 6 de octubre, 200 de repetibles huérfanos, 37 `42P10` de empresas sintéticas que ya no existen y 1 de importación del 16-nov (migración aún no aplicada). Cero fallidos en todas las colas.

**Medición al activar:** el job lleva `tenantId` y mide solo esa empresa.

**DT-4:** el usuario de arranque es el superusuario `iwana` del compose (no existe un rol `iwana_bootstrap`). En local hay que añadir a `.env` `DB_BOOTSTRAP_PASSWORD`, `DB_PURGER_USER=iwana_purger` y `DB_PURGER_PASSWORD`, con el valor de `DB_PASSWORD`. Con eso, 3/3.

**Botón de tema:** no reproducible a 375–1440 px, con menús abiertos ni con los scripts retrasados; no es defecto.

**Rojo del CI de `a74c5689`** (`portal-inventory-scm.spec.ts:3685`): carrera de la prueba con la carga de categorías; ahora espera la categoría. Archivo completo: 42/42.

**Otras decisiones:**
- sec-eng C-2: el payload de puesta en marcha va sin `adminEmail`.
- C-3: limpieza periódica de fallidos.
- C-1 se cerró en otra sesión (`ff8e9110`).
- `admin-bootstrap.spec.ts:416` falló una vez con la suite en curso mientras otros agentes editaban: clase entorno según `e2e-triage`. Se añade `waitForURL` como diagnóstico.

Omitido: E2E web contra un servidor dedicado (hoy usa `next dev` compartido). Sin verificar en este informe: la CI de estos commits. Riesgo: la historia de «Activas al cierre» anterior a hoy sale `null` porque la activación no se auditaba.

**Residuo de empresas de prueba (verificación de la sesión principal):**
- `web-tenant-create-happy-path` creaba una empresa real en `dbiw` por corrida, y R7 no puede purgarla antes de 30 días ni sin constancia del ISP.
- Ahora solo corre con `E2E_ALLOW_REAL_TENANT_CREATE=1`, contra un API con `DB_NAME=test` (`8492417a`).
- En dos corridas seguidas de la suite web, ninguna empresa nueva.
- Las 4 que quedaban (`srqa-web-alta-719ee44d166b`, `srqa-web-alta-fd8ba8fce5be`, `srqa-web-alta-11484ef2c56c` y `srqa-web-alta-043566029740`) se purgaron el 2026-11-22 por excepción autorizada por el usuario. Se usó el superusuario de desarrollo con los mismos pasos de la función R7 (auditoría `TENANT_PURGE_STARTED`/`COMPLETED` con `purgedBy: manual-exception`, `DROP SCHEMA` y borrado de la fila), una transacción por empresa.
- Resultado: `dbiw` queda solo con iWana, sin schemas `tenant_srqa_web_alta_*`; el tablero, con «Requieren atención 0» y «1 en el directorio».
- La celda de disponibilidad en 94,94 % es la medición real de las caídas del API de hoy en desarrollo.

**Título vacío en `/audit-logs`:** con ámbito plataforma la página fijaba una empresa y navegaba a `?tenant=…` por RSC. El `<head>` quedaba unos 90 ms sin `<title>` y axe fallaba de forma intermitente. Ahora no se escribe `?tenant=` en ámbito plataforma y la query se sincroniza con `history.replaceState`. La E2E pasa 100/100 y web jest 351/351. CA-FR-08 se reapunta a `history`, aprobado por test-change-reviewer.

## G6.5 — publicación y CI (2026-11-23)

**Estado:** G6.5 ✅. `origin/main` = `b4a2024a`.

| Push | Commit | CI | Resultado |
| --- | --- | --- | --- |
| 1 | `a74c5689` | 45021428513 | Rojo en el intento 1 (`portal-inventory-scm.spec.ts:3685`, carrera con la carga de categorías; corregida en `871cb00b`); verde en el 2 |
| 2 | `095b5cfc` | 45054684943 | Rojo en tres intentos, cada uno por una prueba distinta: p95 de N1 (348 ms por contención de 4 workers en 2 núcleos), `CreateTaskSchedulingDialog.spec.tsx` (debounce de 300 ms en reloj real) y `tenant-active-at-close.activation` (exigía `DB_NAME=test` en los workers 2 a 4, que usan un clon) |
| 3 | `b4a2024a` | 45188080121 | Verde en el intento 1, incluido el paso nuevo «presupuestos de latencia (en serie)». E2E Web Admin Smoke 45188080316 verde |
| 4 | `52dfd266` | 45206507196 | Verde en el intento 1 (ajuste por rol de «Uso por empresa», F4-D3). E2E Web Admin Smoke 45206507090 verde |
| 5 | `d1acbc85` | 45244735825 | Rojo en el intento 1 por dos vías: el job de citas ADR (estado de ADR-115 (en revisión) fuera del vocabulario canónico; corregido en `c9e850eb`, cuya corrida docs-only 45249106262 es verde) y la integración API (`titular-anonymized-concurrency.postgres.integration.spec.ts`, flake del sondeo de bloqueos; verde en local 10/10). Rojo en el intento 2 por unit del portal (`BillingPolicySettingsClient.spec.tsx`, render asíncrono; verde en local 3/3). El job re-ejecutado quedó verde en el intento 3, con integración, presupuestos de latencia y gate de cobertura incluidos |

Arreglos de las tres intermitentes: `cdc0bc17` y `b4a2024a`. Sin umbrales cambiados ni reintentos. Las dos intermitentes nuevas de la fila 5 (CRM y portal, módulos no tocados por la ola) no recibieron arreglo de código: reproducidas verdes en local el mismo día.

Queda fuera, por decisión del CTO: F4-D3 (permisos de plataforma asignables). Riesgo: la serie «Activas al cierre» no tiene historia anterior al 2026-11-22.

## F4-D3 — ajuste por rol de «Uso por empresa» (2026-11-23)

**Estado:** resuelta, commits locales sin push. Decisión del CTO (2026-11-23): visibilidad configurable por rol; por defecto solo el administrador de plataforma. [ADR-114](../adrs/ADR-114-Uso-por-Empresa-en-la-Consola-de-Plataforma.md) v1.3 §9.

- **Contrato** (`@iwana/shared`): `UpdateTenantUsageVisibilitySchema` (Zod estricto, roles en `TENANT_USAGE_GRANTABLE_ROLES`), `TenantUsageVisibility`, `canRoleViewTenantUsage`. Se retira `PLATFORM_TENANT_USAGE_ROLES`.
- **API:** `GET` y `PUT /api/v1/tenants/usage/visibility`; `GET /tenants/usage` evalúa el ajuste en cada petición. Escritura solo `SYSTEM_ADMIN`, auditada (`TenantUsageVisibility`, valor anterior y nuevo). Migración pública 037 (reversible): columna en `platform_branding_settings`.
- **Consola:** pestaña «Equipo» en Plataforma; el Centro de control monta el área con `canView` del API.

| Evidencia | Resultado |
| --- | --- |
| Integración API `tenant-usage` (`DB_NAME=test`) | 10/10 |
| Jest `apps/api` (suite completa, cambia `@Module`) | 636 suites, 8472 pruebas |
| Jest `packages/shared` · `packages/database` · `apps/web` | 837 · 476 · 358 |
| Typecheck y lint de shared, db, api, web | verdes; lint sin errores |
| E2E `playwright.web.config.ts --workers=1` | 70 pasadas, 1 omitida (alta real, condicionada) |
| En vivo `localhost:3001` (claro y oscuro) | conceder y retirar con confirmación; dos filas de auditoría; ajuste devuelto a vacío |
| `sec-eng` | GO; 7 condiciones de §7 vigentes |
| `boundary-reviewer` · `contract-drift-reviewer` · `test-change-reviewer` | sin bloqueantes |

**Deudas cerradas (2026-11-23, a pedido de la sesión principal):**

- ~~S1: lectura previa, UPSERT y auditoría sin transacción común~~ → `setTenantUsageGrantedRoles` bloquea la fila (`SELECT … FOR UPDATE`), escribe y audita en una transacción con `PlatformAuditService.logWithin` (propaga errores). Integración `platform-access-settings.postgres.integration.spec.ts`: si la auditoría falla, el ajuste no cambia y no queda fila; dos escrituras concurrentes dejan filas que encadenan (2/2, tres corridas).
- ~~Sin spec de la migración 037~~ → `037_tenant_usage_viewer_roles.spec.ts` (3/3).
- ~~`down` de la 037 sin ejecutar~~ → `037_tenant_usage_viewer_roles.integration.spec.ts`: `down` y `up` en una transacción revertida sobre `test` y el CHECK rechaza `SYSTEM_ADMIN` (1/1); sin tocar `dbiw` ni el hook.
- ~~El doble E2E no valida el `PUT`~~ → el mock responde 400 fuera del contrato y la prueba comprueba los cuerpos en orden: conceder `['IWANA_SUPPORT']`, retirar `[]`.
