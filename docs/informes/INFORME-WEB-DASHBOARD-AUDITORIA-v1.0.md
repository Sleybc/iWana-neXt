# INFORME — Auditoría integral de `/dashboard` (apps/web, consola de plataforma)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Estado:** G0-1 a G0-4 ✅ CTO 2026-11-21 (§4)
**Base (ADR-107 D8.1):** investigación pedida expresamente por el CTO el 2026-11-21. Sucede, en lo que toca, al informe vivo [INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md](INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md), que estaba cerrado.
**Emisor:** AI-EM-ARCH (modo combinado Architect + EM) · **Auditores:** fe-platform, sr-backend, sec-eng, sr-qa, ds-owner (solo lectura)
**Spec vigente de la pantalla:** [UX portada de señal](../specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md) v1.0 · [contrato DS](../specs/2026-08-11-web-centro-control-portada-senal-ds-contrato.md)
**Plan de remediación:** [2026-11-21-web-dashboard-auditoria-remediacion.md](../plans/2026-11-21-web-dashboard-auditoria-remediacion.md)

## 1. Resumen

Hay un P0 y siete P1 (E-2, H-1, H-2, L-12, Q-1, U-1 y U-2; detalle en §2). Los cinco de más peso:

- **P0 La portada muestra cifras falsas hoy, no solo «con más de 100 empresas».** La API limita el listado a 100 filas (`tenant.controller.ts:756`), ordenadas de la más nueva a la más antigua, y `unwrapApiResponse` descarta `meta.total` (`api-client.ts:66-70`). Los chips, la distribución y «N empresas registradas» se calculan en el navegador sobre ese recorte. Además, la campana repite la misma consulta en cada pantalla y cada 60 s (`NotificationBell.tsx:85,117`). Ninguna prueba lo cubre.

  **Evidencia en vivo (2026-11-21, base de datos de desarrollo):**

  | Estado | Base de datos | Portada |
  | --- | --- | --- |
  | Activas | 8 | 0 |
  | En configuración | 1 | 0 |
  | Inactivas | 42 | 13 |
  | En eliminación | 182 | 87 |
  | Total | 233 | «100 empresas registradas» |

  El operador ve «0 activas» y «100 requieren atención». Cada carga dispara 4 peticiones `tenants?limit=100`: 2 de la portada y 2 de la campana, por el doble montaje de desarrollo. `/health` tarda entre 457 y 776 ms.
- **P1-2 `/health` siempre responde 200.** Aunque la base de datos o Redis estén caídos (`health.controller.ts:69-75`), el healthcheck de Docker nunca falla.
- **P1-3 `/health` es público y recorre todos los tenants.** Es `@Public()`, nginx lo expone sin `limit_req`, publica la telemetría del relay (outbox y DLQ) y en cada llamada hace unas 3 consultas por cada tenant.
- **P1-4 Accesibilidad sin verificar contra el estándar del repo.** axe se configura con `wcag2a/wcag2aa`, sin `wcag21aa` ni `wcag22aa`, y solo en escritorio claro. Hay además un `<main>` dentro de otro `<main>` y los títulos de panel saltan de `h1` a `h3`.
- **P1-5 Duplicación entre las dos apps.** Las tarjetas de métrica son una copia literal del portal, y `SystemStatusPanel` no tiene estado de error ni vacío.

Alcance cubierto: código de la página, el shell (`Sidebar`, `TopHeader`, `NotificationBell`), los tres endpoints que consume, sus pruebas y la página en vivo con sesión.

Confirmado en el DOM en vivo:
- Hay 2 `<main>`.
- Los títulos de panel son `h3` y no hay ningún `h2`.

No cubierto: no se comparó el tema oscuro contra el claro.

## 2. Hallazgos consolidados

Formato de la columna «Origen»: la letra es la del auditor (F = fe-platform, B = sr-backend, S = sec-eng, Q = sr-qa, D = ds-owner) y, entre paréntesis, el ID que le dio ese auditor. Así se recupera el detalle de cada uno.

| ID | Sev | Cat. | Evidencia (archivo:línea) | Remedio | Ola |
| --- | --- | --- | --- | --- | --- |
| E-1 | P0 | escala | `tenant.controller.ts:756`, `api-client.ts:66`, `DashboardClient.tsx:80,122-143` (F-H1, B-T1/T2, Q1); evidencia en vivo en §1 | `GET /api/v1/tenants/summary` con conteo por estado y `updatedLast7Days`; el tipo va en `@iwana/shared` | 1 |
| E-2 | P1 | escala | `NotificationBell.tsx:85,117` (F-H2) | Que la campana consuma el mismo resumen (`attention`, hasta 5 empresas) y no la lista de 100 | 1 |
| E-3 | P2 | PII | DTO completo (NIT, correos, teléfono) para solo contar (S-2) | Se resuelve con E-1 | 1 |
| E-4 | P2 | índices | `public.tenants` sin índice por `status`; `platform_audit_logs` sin `(created_at,id)` (B-T3, B-A4) | Migración pública | 2 |
| H-1 | P1 | health | `health.controller.ts:69-75` (B-H1) | 503 si `db` o `redis` fallan, con prueba | 2 |
| H-2 | P1 | seguridad | `health.controller.ts:33,63`; `nginx.prod.conf:100,224` (B-H2/H3, S-1) | `/health` público mínimo (`status`, `db`, `redis`, `timestamp`); telemetría del relay a un endpoint con guards de plataforma; `limit_req` en nginx | 2 |
| H-3 | P3 | boundary | `health.module.ts:11` importa todo `TasksModule` (B-H5) | Desaparece con H-2 | 2 |
| C-1 | P2 | contrato | Auditoría responde `{data,nextCursor,total}`, tenants `{data,meta:{total}}`; ninguno sigue `ListMeta` de ADR-065 (B-A1) | Alinear ambos en una versión nueva del contrato | 3 |
| L-1 | P2 | basura | `PanelCard.tsx` (158 líneas) y `layout/Header.tsx` sin consumidores (F-H14/H15, D6, Q15) | Borrar | 1 |
| L-2 | P3 | basura | `layout/ThemeToggle.tsx` solo reexporta `@iwana/ui` (F-H17) | Importar directo y borrar | 1 |
| L-3 | P3 | ubicación | `dashboard/TenantsTable.tsx` (y su spec) solo lo usa `/tenants`; `interface Tenant` duplica `TenantListItem` (F-H16, Q16) | Mover a `components/tenants/` y usar `Pick<TenantListItem>` | 1 |
| L-4 | P3 | muerto | `Array.isArray(auditPayload)` nunca se cumple (F-H25, B-A2) | Leer `.data` directo | 1 |
| L-5 | P3 | limpieza | `.map(i=>({...i}))`, `slice(0,5)`, resets dobles, 3 handlers de reintento en línea, 7 `filter`, `Suspense` sin propósito, `TenantStatusKey` duplicado (F-H6–H10, H12, H22) | Simplificar sin cambiar el comportamiento | 1 |
| L-6 | P2 | a11y | `<main>` anidado (`DashboardClient.tsx:330`); títulos de panel en `h3` sin `h2` (F-H5, H26) | Cambiar a `div` y `h2` | 1 |
| L-7 | P2 | shell | `Sidebar.tsx:25,105` lee una clave de `localStorage` que nadie escribe (F-H3) | Escribirla al alternar, con try/catch | 1 |
| L-8 | P2 | shell | `NotificationBell.tsx:99-108`: un error de carga se cuenta como notificación y su «Reintentar» no hace nada (F-H4) | Estado de error aparte con reintento real | 1 |
| L-9 | P2 | copy | Textos fuera de `PLATFORM_UI_COPY` (`DashboardClient.tsx:267-321`, `SystemStatusPanel.tsx:45-93`) (F-H24) | Moverlos al catálogo | 1 |
| L-10 | P3 | lógica | «Redis y colas» pasa a aviso cuando hay empresas en alta, y «API de plataforma» cuando falla el directorio: mezcla salud con negocio (`DashboardClient.tsx:283-312`) | Cada indicador refleja solo su servicio | 1 |
| L-11 | P2 | regla | «Requieren atención» no significa lo mismo en dos lugares. En el chip son FAILED + SUSPENDED + INACTIVE + MARKED (`DashboardClient.tsx:141`). En la campana, PROVISIONING + SUSPENDED + FAILED + MARKED, sin INACTIVE (`tenant-status-label.ts:43-58`). SUSPENDED es `neutral` en la distribución y `warning` en el badge. | Una sola constante `TENANT_ATTENTION_STATUSES` en `@iwana/shared` (decisión G0-2) | 1 |
| L-12 | P1 | escala | Mismo origen que E-1. Los selectores de empresa de `/users` (`users/page.tsx:45`) y `/audit-logs` (`audit-logs/page.tsx:254`) piden las 100 más recientes y filtran `ACTIVE` en el cliente. Con los datos actuales, ninguna de las 8 activas está entre esas 100, así que los selectores quedan vacíos. Se deduce de la evidencia de §1; no se abrió la pantalla. | Pedir `status: 'ACTIVE'` al servidor (el endpoint ya lo admite) | 1 |
| L-13 | P2 | red | `AuthProvider.tsx:116-157`: el efecto de arranque depende de `pathname`, así que cada navegación repite `auth/me` y `platform-users/me` (verificado en vivo: 2 navegaciones, 2 + 2 peticiones) | Validar la sesión una vez al montar; en las rutas `/auth`, limpiar sin pedir al servidor | 1 |
| Q-1 | P1 | a11y-test | `web-auth-dashboard.spec.ts:99` y 2 specs más (Q2, Q3) | Etiquetas `wcag21aa`/`wcag22aa`; axe a 375 px y en oscuro | 1 |
| Q-2 | P2 | cobertura | Sin spec: `SystemStatusPanel`, salud parcial, reintento real, tramos de `formatRelativeDate` (Q4–Q6, Q13, Q14) | Specs nuevos | 1 |
| Q-3 | P3 | pruebas | Un test valida 9 criterios; aserciones débiles; clases de Tailwind asertadas; fixtures E2E duplicados; ruta inexistente `/dashboard/auditoria` (Q10–Q12, Q17–Q19) | Partir el test y endurecer las aserciones | 1 |
| U-1 | P1 | DS | `SignalChips.tsx:12-43` es una copia literal de `portal-ui.tsx:374-388` (D1) | Primitive de tarjeta de métrica en `@iwana/ui` | 3 |
| U-2 | P1 | DS | `SystemStatusPanel` sin `error`, `onRetry` ni estado vacío (D-E1) | Añadirlos | 3 |
| U-3 | P2 | DS | Superficie de tarjeta escrita a mano 5 veces, distinta de `Card` (D2, F-H20); bloque de error con reintento ×3 (D3, F-H21); mapa de tonos ×2 (D4, F-H19); barra apilada ×2 web/portal (D5) | `Card`, `ErrorState`/`EmptyState` y `StackedBar` en `@iwana/ui` | 3 |
| U-4 | P2 | DS | En oscuro las tarjetas pierden el tono (D-K1); `rose` en vez de `error` (D-C2); `rounded-3xl` y valores arbitrarios (D-C3/C4) | Patrón tonal de `Badge` | 3 |
| U-5 | P2 | token | `amber-*` sin escala `warning` en `globals.css:81` (D-C1) | Escala `warning-50…700`, por escalación al CTO | 3 |
| U-6 | P2 | duplicado | 4 formateadores de tiempo relativo con salidas distintas, web y portal (F-H18, H11) | Una utilidad en `@iwana/shared` con `Intl.RelativeTimeFormat` | 3 |
| V-1 | P3 | red | `auth/me` y `branding/public` se piden dos veces en cada carga (navegador) | Comprobar si es el doble montaje de StrictMode; si persiste en build, deduplicar | 1 |
| V-2 | P3 | contrato | `POST /auth/refresh` sin cookie responde 400, no 401 (navegador) | Responder 401 | 2 |

**Fuera de este alcance (vecinos de `apps/web`):** `lib/form-styles.ts` exporta 4 constantes sin ningún consumidor (`FORM_PANEL_CLASS`, `FORM_PANEL_PREMIUM_CLASS`, `FORM_INPUT_WITH_LEADING_ICON_CLASS`, `FORM_DIVIDER_CLASS`).

**Fuera de este alcance (backlog de seguridad):** S-3 (la auditoría devuelve IP, navegador y valores antes/después que la pantalla no usa) y S-4 (contraseña en memoria si se abandona el MFA; cambiar a `mfaToken`). No bloquean G6.

## 3. Impacto

- **Multi-tenant:** sin fuga entre tenants; el aislamiento lo cumplen los guards del API (S-6).
- **Escala:** E-1 y H-2 no resisten miles de tenants y se corrigen en la Ola 2.
- **Seguridad:** H-2 se cierra antes de G7.
- **Regulación:** E-3 minimiza PII (Ley 1581).

## 4. Decisiones que requieren al CTO

1. **G0-1 Alcance y orden de las olas del plan.** Recomendado: aprobar. La Ola 1 corrige el P0 primero.
2. **G0-2 Qué significa «requiere atención».** Recomendado: PROVISIONING_FAILED, SUSPENDED y MARKED_FOR_DELETION, la misma lista para el chip y la campana.
   - Las empresas en alta ya tienen su propio chip.
   - INACTIVE no es alarma: la propia campana dice que «Activa/inactiva no son avisos».
   - Efecto: el chip deja de contar inactivas y la campana deja de listar las altas en curso.
3. **G0-3 Reducir `/health` público a lo mínimo (Ola 2).** Recomendado: sí. ✅ Aprobado por el CTO el 2026-11-21 («Apruebo G0-3»).
4. **G0-4 Token `warning` (U-5, Ola 3).** Es un token semántico global: lo apruebas tú, con la propuesta de DS-OWNER. ✅ Aprobado por el CTO el 2026-11-21 («Apruebo G0-4») sobre la propuesta de la [spec de consolidación](../specs/2026-11-21-web-portal-dashboard-consolidacion-ds-contrato.md).

**Registro:** el CTO aprobó G0-1 y G0-2 en el chat de la sesión del 2026-11-21 («Apruebo G0-1 y G0-2»), con la recomendación tal como está escrita arriba. G0-2 deja superada la fila S-3 y la §12 de la [spec UX](../specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md), que queda marcada.

## 5. Límites de esta auditoría

- **No se verificó:**
  - el tema oscuro en vivo;
  - el contraste AA de los tonos (lo hará 3A);
  - L-12 abriendo `/users` y `/audit-logs` (se deduce de la evidencia de §1).
- **Riesgo que queda hasta la Ola 1:** el operador ve cifras falsas en la portada.
- **Riesgo que queda hasta la Ola 2:** `/health` sigue siendo público y caro.

## 6. Ola 1 — cierre (2026-11-21)

**G6: GO** de AI-EM-ARCH, sin regresiones atribuibles a la ola. Contrafirmas G4 de sr-backend, fe-platform y sr-qa en sus reportes. Commits locales por bloque, sin push (ADR-107 D2).

- **CA-1 en vivo:** `GROUP BY status` = ACTIVE 8, INACTIVE 42, MARKED_FOR_DELETION 182, PROVISIONING 1 (233). La portada en :3001 muestra Activas 8, En configuración 1, Requieren atención 182 y «233 empresas».
- **CA-2 y CA-3:** solo se pide `/tenants/summary`, nunca `tenants?limit=100`; un `<main>`, títulos de panel en `h2`.
- **CA-5:** `/users` pide `tenants?status=ACTIVE` al servidor.
- **CA-4:** axe con `wcag22aa` a 375 y 1280 px, claro y oscuro: 5/5 en `web-auth-dashboard`. El 20×20 de «Mostrar contraseña» (WCAG 2.5.8) se corrigió en `LoginForm.tsx`.
- **Conteo real (`--force`, `Cached: 0`):** shared 58 suites/800 tests; api 625/8347 (1 rojo, abajo); web 39/247; integración del tenant contra Postgres 4/4 (incluye severidad mixta con prueba de mutación).
- **Revisores:** `boundary-reviewer` GO (2 menores); `test-change-reviewer` GO, con H-1 a H-4 corregidos antes del G6.

**Deuda abierta, previa a la ola (`e2e-triage`: 0 regresiones):**

| ID | Fallo | Causa | Dueño |
| --- | --- | --- | --- |
| D1 | `app.config.production-urls.spec.ts` rojo solo en corrida completa local | `MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS` de `.env.development` se filtra entre suites; el CI no tiene ese archivo | sr-qa |
| D2 | D-5 a 375 px de `web-empresas-directorio` (25 px, tope 24) | `px-6` + borde de `TenantsTable`, anterior al tope del test | sr-qa, con fe-platform |
| D3 | D-4 intermitente (buscador vaciado) | carrera entre el efecto de `searchParams` y `router.replace` en `tenants/page.tsx` | fe-platform |
| D4 | D-6 intermitente (`document-title`) | `<title>` se remonta ~5 ms en `/audit-logs` y `/users`; `useSearchParams` sin `Suspense` (hipótesis) | fe-platform |

La campana ya no avisa de empresas en PROVISIONING (efecto de G0-2). V-1 queda atribuido a StrictMode por lectura de código, sin verificar con `start`.

## 7. Ola 2 — cierre (2026-11-21)

**G6: GO** de AI-EM-ARCH, sin regresiones atribuibles a la ola. Contrafirmas G4 de sr-backend (2A), plat-ops (2B), sr-qa (2C) y fe-platform (2D). Commits locales por bloque, sin push: `5afd2d13` (2C), `dfdb8259` (2A), `58d3a3f4` (2B) y `f0937f32` (2D).

- **2A:** `/health` público devuelve solo `PublicHealth` v1.0 y responde 503 si fallan db o redis. Ya no importa `TasksModule`. La migración pública 033 crea `idx_tenants_status` e `idx_pal_created_id`; con `EXPLAIN` el plan pasa a Index (Only) Scan y desaparece el Sort del cursor de auditoría. V-2 tocó `modules/tenant` con autorización del CTO: `POST /auth/refresh` sin cookie responde 401.
- **2B:** `limit_req` por IP (1 r/s, ráfaga de 5, 429) en `/health` y en `/api/v1/health`. `nginx -t` correcto y 429 comprobado tras 6 peticiones.
- **2C:** `DashboardClient.spec` partido por criterio, con reintento real y tramos de `formatRelativeDate`.
- **2D:** el 503 con cuerpo válido se muestra como degradado. Cualquier otro fallo de `/health` muestra siempre el copy canónico; se retiró `mapOperationalError` (decisión de AI-EM-ARCH).
- **Conteo real (`--force`, `Cached: 0`, `DB_NAME=test`):** api 626 suites/8357 tests; web 39/278; db 82/455; shared 58/800. La 033 está aplicada en `test`.
- **Revisores:** `boundary-reviewer` GO, con H1 (sonda vacía de `app.bootstrap.spec`) corregido. `test-change-reviewer` GO en las dos pasadas.

**Abierto:**

| ID | Tema | Dueño |
| --- | --- | --- |
| D5 | `web-audit-logs-datepicker.spec.ts:87,131,179` en rojo por `getByText` ambiguo; previo, desde 2026-08-11, y no corre en CI (`e2e-triage`) | sr-qa |
| D6 | `curl` en vivo de `/api/v1/health` y `/auth/refresh` sin hacer: la API de dev estaba caída y `dbiw` no tiene la 033 | quien levante `pnpm dev` |
| D7 | `getPlatformRelayTelemetry()` quedó sin llamador; decidir si se expone con guards de plataforma o se borra | AI-EM-ARCH |
| D8 | Distribución en columnas del dashboard (CA-PS-09) sin prueba en CI | sr-qa |
| D9 | Cifras de `limit_req` y `real_ip` detrás de un proxy, por confirmar antes de G7 | plat-ops |

## 8. Ola 3 — cierre (2026-11-21)

**G6: GO** de AI-EM-ARCH, sin regresiones atribuibles a la ola (`e2e-triage`). Contrafirmas G4 de fe-platform en §B y §C. Commits locales, sin push: `22a5a238` (3B), `c7ae859c` (adopción en web y portal) y `c3c194cc` (primitives de `@iwana/ui`). `c7ae859c` consume lo que añade `c3c194cc`, así que solo compila con los dos juntos; el push los lleva en el mismo tren.

- **3A:** contrato DS v1.0 congelado. La v1.1 añade `emphasis` en rellenos y `toneMutedTextVariants`, y resuelve el `[BLOQUEO]` de las barras apiladas del portal. La v1.2 hace que el error de salud sustituya solo a los indicadores de servicio; sale del `[BLOQUEO]` T-2 y respeta L-10. Las dos versiones son aditivas.
- **3B:** `formatRelativeTime` en `@iwana/shared` sustituye a 4 formateadores. La auditoría conserva la fecha corta pasados 30 días (decisión T-1).
- **3C:** `MetricCard`, `StackedBar`, `ErrorState`, `EmptyState`, `Card outline` y la escala `warning` (G0-4). Se borran `SignalChips`, `PortalMetricCard` y `DashboardStackBar`. `aria-pressed` solo se emite con `isActive`.
- **Conteo real (`--force`, `Cached: 0`):** ui 13 suites/121 tests; shared 59/811; web 40/289; portal 457/5199 (1 omitido). E2E del dashboard del portal 47/47, con axe en claro y oscuro.
- **E2E web:** 19/24 con el servidor en caliente. Los 5 rojos son D2, D5 (×3) y `tenant-create` con la API caída.
- **Revisores:** `test-change-reviewer` GO tras T-1 y T-2. ds-owner sin P0 ni P1; P2-1, P2-2, P3-2 y P3-5 corregidos.

**Abierto:** revisión visual en vivo y captura en oscuro (la API de dev estaba caída, D6); `amber-*` en `Alert`, `DropdownMenu`, `PortalAlert` y `DashboardBars`; el delta `danger` de `PortalDashboardMetric`; `text-[11px]` en tres franjas del portal; renombrar `portal-eyebrow-muted` (P3-1); C-1 (`ListMeta`) sin G0.
