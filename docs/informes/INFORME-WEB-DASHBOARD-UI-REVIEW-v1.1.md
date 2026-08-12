# INFORME — WEB-DASHBOARD-UI-REVIEW — v1.1 (delta ejecutado)

**Módulo:** Centro de control (`apps/web` `/dashboard`)  
**Fecha:** 2026-07-20  
**Orquestador:** AI-EM-ARCH  
**Estado:** Cerrado — G6 GO con deuda aceptada · **adenda 2026-08-11 v1.1: portada de señal Track D = GO (D-10)** · **G2 navy revertido por el operador (2026-08-11)**  
**Padre:** WEB-UIUX fases 01–05 cerradas; este informe es el **delta residual**.

---

## 1. Resumen ejecutivo

Se ejecutó el protocolo multiagente (PROD-UX + DS-OWNER + FE-PLATFORM + review de calidad) para alinear el Centro de control a Firma iWana y cerrar bloqueantes de tarea del operador SYSTEM_ADMIN.

**Puntaje post-delta (estimado):** ~94/100 (P0: 0; sidebar blanco restaurado — G2 navy **superado**, §10.4).  
**Veredicto:** **Aprobada / cerrada** — deuda operable del Centro de control saldada.

**Modo review:** código + contratos congelados  
**Script:** `audit-ui.mjs` → 0 hallazgos en rutas del delta

---

## 2. Agentes y artefactos

| Rol | Artefacto / acción |
| --- | --- |
| AI-PROD-UX | [`docs/specs/2026-07-20-web-dashboard-centro-control-ux-spec.md`](../specs/2026-07-20-web-dashboard-centro-control-ux-spec.md) |
| AI-DS-OWNER | [`docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md) |
| AI-FE-PLATFORM | Implementación B+C en `apps/web` + exports `@iwana/ui` |
| AI-EM-ARCH | Este informe + [`PROMPT-WEB-DASHBOARD-DELTA-v1.0.md`](../prompts/PROMPT-WEB-DASHBOARD-DELTA-v1.0.md) |
| Review calidad | Aprobado con 3 fixes P1 aplicados (skeletons actividad, cell-link a11y, foco campana) |

---

## 3. Cumplimiento CA

| CA | Estado |
| --- | --- |
| CA-01 Fila → detalle (cell-link; ··· independiente) | Cumplido |
| CA-02 Directorio por estado filtra tabla | Cumplido |
| CA-03 / CA-06 / CA-07 / CA-08 Skeletons / sin ceros falsos | Cumplido |
| CA-05 Atención operativa al frente | Cumplido |
| CA-09 `?q=` ↔ búsqueda tabla | Cumplido |
| CA-04 CTA empty primera vez | Cumplido — `Registrar primera empresa` → `/tenants/new` |

---

## 4. Cumplimiento contrato DS Fase-1

| Ítem | Estado |
| --- | --- |
| Barra lima sidebar (fondo blanco) | Cumplido |
| Norma sombras `shadow-iwana*` | Cumplido |
| Tokens success/warning/error en SystemStatus | Cumplido |
| `interactiveFocusClassName` en `@iwana/ui` | Cumplido |
| `SkeletonBlock` en `@iwana/ui` | Cumplido |
| Vocabulario auditoría en español | Cumplido |
| Bloqueos (sidebar azul, MetricCard, Panel unificado) | Respetados |

---

## 5. Archivos principales tocados

- `packages/ui/src/focus.ts`, `skeleton.tsx`, `index.ts`
- `apps/web/src/components/dashboard/{DashboardClient,TenantsTable,PanelCard,SystemStatusPanel}.tsx` (+ specs)
- `apps/web/src/components/layout/{Sidebar,NotificationBell}.tsx`
- `apps/web/src/lib/platform-ui-copy.ts`
- `apps/portal/src/components/shared/portal-ui.tsx` (re-export / delegación Skeleton)

---

## 6. Verificación

| Check | Resultado |
| --- | --- |
| `audit-ui.mjs` (dashboard + layout + focus/skeleton) | Limpio |
| Typecheck / lint web + ui (FE-PLATFORM) | Verde |
| Jest `src/components/dashboard` | Verde (ajustado post cell-link) |

---

## 7. Deuda — cierre

| Ítem | Resolución |
| --- | --- |
| CA-04 CTA empty | **Cerrado** — botón secundario en empty sin filtros |
| MetricCard huérfano | **Cerrado** — archivo eliminado (sin usos) |
| Tono `info` NotificationBell | **Cerrado** — `bg-iwana-primary` (token DS; no existe escala `info-*`) |
| Asertar Atención operativa | **Cerrado** — `DashboardClient.spec` valida primer indicador |
| Sidebar azul noche unificada | **Superada** — el operador revirtió el navy el 2026-08-11 (§10.4). Rige de nuevo BLOQUEO-3 (sidebar blanco + barra lima). |

---

## 8. Impacto declarado

- **Multi-tenant / seguridad / regulación:** sin cambio de contratos API ni PII nuevo.  
- **Portal:** solo re-exports de primitives compartidos; typecheck portal validado por FE-PLATFORM.

## 9. Verificación cierre deuda (2026-07-20)

- Jest dashboard: 7/7  
- Typecheck `@iwana/web`: OK  
- `audit-ui.mjs` dashboard+layout: limpio  

---

## 10. Adenda — portada de señal (2026-08-11)

**Decisión:** enfoque **A** (confirmado al ejecutar el plan de lluvia de ideas). B y C descartados.

| Artefacto | Ruta |
| --- | --- |
| UX spec v1.0 | [`docs/specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md`](../specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md) |
| Contrato DS v1.0 | [`docs/specs/2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](../specs/2026-08-11-web-centro-control-portada-senal-ds-contrato.md) |
| Spec 2026-07-20 | Parcialmente superada (home sin tabla; CA-02/CA-09 del home) |

**Prompt G4:** [`PROMPT-WEB-CENTRO-CONTROL-PORTADA-SENAL-v1.0.md`](../prompts/PROMPT-WEB-CENTRO-CONTROL-PORTADA-SENAL-v1.0.md) — v1.1 ejecutada (C-8…C-11 / D-6…D-10). C-1…C-7 y D-1…D-5 cerrados el 2026-08-11. Dictamen **GO** en §10.2.

**Alcance autorizado:** quitar `TenantsTable` del home; 4 chips; distribución accionable → `/tenants?status=`; actividad (5) al pie; Monitoreo intacto. Sin endpoints, sin primitive nueva, sin tocar portal.

**Bitácora FE (2026-08-11):** Track C implementó la portada de señal en `apps/web` (chips S, distribución D, actividad al pie, sin `TenantsTable` en el home). Evidencia local FE: Jest dashboard 11/11, typecheck `@iwana/web` OK, `audit-ui.mjs` dashboard sin hallazgos.

### 10.1 Track D — AI-SR-QA (2026-08-11)

**Dictamen:** **GO condicionado** — única condición de gate: CA-PS-09 sin Playwright 375/1280 (autorizado por G4; no es NO-GO).

Sin `[BLOQUEO]`. No hay endpoint nuevo, primitive en `@iwana/ui`, import de portal, `TenantsTable` en el home, ni lima como urgencia.

#### Matriz CA-PS ↔ evidencia

| CA | Criterio (resumen) | Evidencia | Resultado |
| --- | --- | --- | --- |
| **CA-PS-01** | Home sin `TenantsTable` ni «Directorio de empresas» | `DashboardClient.spec.tsx` · `it('CA-PS-01/02/04/05/07/08/09…')` (`queryByText` tabla / directorio). Código: `DashboardClient.tsx` no importa `TenantsTable`. | Cubierto · PASS |
| **CA-PS-02** | Exactamente 4 chips S-1…S-4; sin onboarding ni «Empresas visibles» | Mismo `it`: rótulos Activas / En configuración / Requieren atención / Cambios esta semana; ausencia de «Empresas visibles» y del párrafo de portada anterior. Sin captura visual. | Cubierto en Jest · PASS (captura no ejecutada) |
| **CA-PS-03** | Carga: ningún chip ni tramo D pinta `0` | `it('CA-PS-03: no pinta ceros…')` — `sr-only` de carga, `queryByText('0')` y `queryByText('Activas')` ausentes hasta resolver. | Cubierto · PASS |
| **CA-PS-04** | S-1/S-2 → `/tenants?status=`; S-3 enfoca D; S-4 no es enlace | Mismo `it` mega: `href` ACTIVE/PROVISIONING; `user.click` en botón «Ver el desglose por estado» → `activeElement` = «Empresas por estado» + `tabindex="-1"`; S-4 sin `link`. | Cubierto · PASS |
| **CA-PS-05** | Tramo/chip D > 0 navega a `?status=`; cifra 0 no es control | Mega-`it`: `href` D-1…D-6. `it('CA-PS-05: tramo en cero…')`: D-3/D-4 en 0 no son `link`; D-5/D-6 omitidos. `/tenants` lee `status` en `tenants/page.tsx` (`parseStatusFilter`); **sin smoke Jest** que inyecte la query. | Cubierto en home · PASS. Smoke URL de `/tenants` = preexistente, sin test nuevo |
| **CA-PS-06** | Parque vacío: empty D + CTA `/tenants/new`; sin tabla | `it('CA-PS-06: parque vacío…')` — copy empty, CTA, sin barra (`role=img`), chips 0 no clicables. | Cubierto · PASS |
| **CA-PS-07** | Actividad al pie, ≤ 5, `<time dateTime>`, sin enum/id | Mega-`it`: `platformAuditApi.list({ limit: 5 })`; 5 `listitem` + 5 `time[dateTime]`; ausencia de `UPDATE` y `tenant-\d`; footer «Abrir historial». Región `w-full`. | Cubierto · PASS |
| **CA-PS-08** | Monitoreo: Atención operativa → API → BD → Redis | Mega-`it`: primer indicador `Atención operativa`. `SystemStatusPanel` no se reescribió. Orden API/BD/Redis no se aserta (solo el primero, igual que el delta 2026-07-20). | Cubierto parcial · PASS (sin regresión del primer indicador) |
| **CA-PS-09** | 375: 1 col S→M→D→A. 1280: chips; M\|D; A a 12 col | Mega-`it`: `control-center-split` `xl:grid-cols-12`; M `xl:col-span-7`; D `xl:col-span-5`; A `w-full`. **Sin Playwright ni captura 375/1280.** | Cubierto solo por clases Jest |
| **CA-PS-10** | Fallo parcial: un contrato no tumba la página | `it('CA-PS-10: un contrato caído…')` — directorio 503, Monitoreo + A siguen. `it('CA-PS-10: el fallo de auditoría…')` — solo A se degrada. Fallo aislado de health no tiene `it`. | Cubierto (directorio + auditoría) · PASS |

Fuente de los `it` de portada: `apps/web/src/components/dashboard/DashboardClient.spec.tsx` (6 casos). `TenantsTable.spec.tsx` (5 casos) es regresión del directorio `/tenants`, no de la portada.

#### Comandos y números (re-ejecutados en Track D, 2026-08-11)

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=components/dashboard` | **2 suites · 11/11 PASS** · 5.114 s · exit 0 (`DashboardClient.spec.tsx` + `TenantsTable.spec.tsx`) |
| `pnpm --filter @iwana/web typecheck` | `tsc --noEmit` · **exit 0** |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/web/src/components/dashboard` | **sin hallazgos** · exit 0 · P0/P1 = 0 |
| Playwright de esta pantalla | **Ausente.** No se inventó spec (G4). `e2e/tests/web-auth-dashboard.spec.ts` sigue asertando la tabla del home (UX 2026-07-20 superada). |

#### Condición del GO

1. **CA-PS-09** — layout 375/1280 no está verificado en viewport real. G4: Playwright ausente = GO condicionado, no NO-GO.

#### Adenda v1.1 — evidencia autorizada (ya no «fuera»)

Superada por §10.2. No queda hueco de evidencia de la portada. Sidebar navy = **superado** (§10.4); rige de nuevo el sidebar blanco.

G6.5 / G7 **no** se anticipan.

### 10.2 Track C/D adenda v1.1 — AI-SR-QA (2026-08-11)

**Dictamen:** **GO** — D-6, D-7 y D-8 pasan tras C-11. Axe `wcag2a`+`wcag2aa` en `/dashboard` post-login: `violations = []`. DEF-PS-A11Y-01 **cerrado**. Playwright corrió (no es NO-GO de evidencia).

Sin `[BLOQUEO]`. Sin merge bloqueado por a11y. Sidebar navy = **superado** (§10.4). G6.5 / G7 **no** se anticipan.

#### Matriz CA-PS ↔ evidencia

| CA | Criterio (resumen) | Evidencia | Resultado |
| --- | --- | --- | --- |
| **CA-PS-01** | Home sin `TenantsTable` ni «Directorio de empresas» | Jest `DashboardClient.spec.tsx` · `it('CA-PS-01/02/04/05/07/08/09…')`. E2E D-6: `getByRole('cell')` = 0 y `getByText('Directorio de empresas')` = 0 en `/dashboard`. | Cubierto · PASS |
| **CA-PS-02** | Exactamente 4 chips S-1…S-4; sin onboarding ni «Empresas visibles» | Jest mega-`it` (rótulos + ausencia de «Empresas visibles»). E2E D-6: región «Resumen operativo» con Activas / En configuración / Requieren atención / Cambios esta semana (count = 4). Capturas D-7. | Cubierto · PASS |
| **CA-PS-03** | Carga: ningún chip ni tramo D pinta `0` | Jest `it('CA-PS-03: no pinta ceros…')`. | Cubierto · PASS |
| **CA-PS-04** | S-1/S-2 → `/tenants?status=`; S-3 enfoca D; S-4 no es enlace | Jest mega-`it`: `href` ACTIVE/PROVISIONING; foco en «Empresas por estado»; S-4 sin `link`. | Cubierto · PASS |
| **CA-PS-05** | Tramo/chip D > 0 navega a `?status=`; cifra 0 no es control; `/tenants` lee la URL | Jest mega-`it` + `it('CA-PS-05: tramo en cero…')`. C-10: `tenants/page.spec.tsx` · `status=ACTIVE` → `statusFilter: 'ACTIVE'`; inválido → `TODAS`. | Cubierto · PASS |
| **CA-PS-06** | Parque vacío: empty D + CTA `/tenants/new`; sin tabla | Jest `it('CA-PS-06: parque vacío…')`. | Cubierto · PASS |
| **CA-PS-07** | Actividad al pie, ≤ 5, `<time dateTime>`, sin enum/id | Jest mega-`it`. | Cubierto · PASS |
| **CA-PS-08** | Monitoreo: Atención operativa → API → BD → Redis | Jest mega-`it` (C-8): 4 líneas en ese orden (`Atención operativa` / `API de plataforma` / `Base de datos` / `Redis y colas`). | Cubierto · PASS |
| **CA-PS-09** | 375: 1 col S→M→D→A. 1280: chips en fila; M\|D; A ancho completo | Jest: clases `xl:grid-cols-12` / `xl:col-span-7` / `xl:col-span-5` / `w-full`. E2E D-7: cajas `y`/`x` en 375×812 y 1280×900. Capturas `375.png` / `1280.png`. | Cubierto · PASS |
| **CA-PS-10** | Fallo parcial: un contrato no tumba la página | Jest: directorio 503; C-9 health 503 (chips/D/A permanecen); auditoría degrada solo A. | Cubierto · PASS |

Fuente Jest portada: `DashboardClient.spec.tsx` (7 `it`). Directorio: `TenantsTable.spec.tsx` (5) + `tenants/page.spec.tsx` (3, incl. C-10). E2E: `e2e/tests/web-auth-dashboard.spec.ts` (D-6 + D-8) y `e2e/tests/web-centro-control-portada.spec.ts` (D-7).

#### Comandos y números (re-ejecutados en Track D adenda, 2026-08-11)

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=components/dashboard` | **2 suites · 12/12 PASS** · 5.67 s · exit 0 |
| `pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=app/\(protected\)/tenants/page.spec` | **1 suite · 3/3 PASS** · 2.629 s · exit 0 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium-1208/chrome.exe> pnpm exec playwright test e2e/tests/web-auth-dashboard.spec.ts e2e/tests/web-centro-control-portada.spec.ts --config e2e/playwright.web.config.ts` | **D-10: 4/4 PASS** · 6.2 s · exit 0 (antes D-9: 3 passed / 1 failed) |

Desglose Playwright D-10:

| Spec | Resultado |
| --- | --- |
| D-6 `login -> portada de señal -> buscador en /tenants -> logout` | PASS · 2.7 s |
| D-7 `CA-PS-09: 375 una columna S → Monitoreo → D → A` | PASS · 1.4 s |
| D-7 `CA-PS-09: 1280 chips en fila, M\|D lado a lado, A a ancho completo` | PASS · 1.2 s |
| D-8 `/dashboard post-login sin violaciones wcag2a+wcag2aa` | **PASS** · 1.9 s · `violations = []` |

Capturas (sin PII; mocks `Demo ISP` / `Fibernet Colombia` / `hash:contact-*`):

- `docs/quality/evidence-web-centro-control-portada/375.png`
- `docs/quality/evidence-web-centro-control-portada/1280.png`

Chromium: el sandbox no tenía `chrome-headless-shell` en su cache; se usó el Chromium de `ms-playwright` local vía `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. La suite **sí ejecutó**.

#### Defecto cerrado

[QA-DEFECTO] ID: DEF-PS-A11Y-01 — **CERRADO** (C-11 + D-10, 2026-08-11)  
C-11: tramos de la barra D = `<span>` (sin `Link` dentro de `role="img"`). Leyenda intacta. D-10: Axe `violations = []`.

#### Queda fuera de evidencia

*(vacío — no hay hueco de evidencia de esta fase.)*

#### Deuda declarada (otro gate)

| Ítem | Disposición |
| --- | --- |
| Sidebar azul noche | **Superada** 2026-08-11 — el operador revirtió el navy (§10.4). Código restaurado. BLOQUEO-3 vigente. |

G6.5 / G7 **no** se anticipan.

### 10.3 Track D G2 — sidebar azul noche — AI-SR-QA (2026-08-11)

**Dictamen:** **GO** — CA-AN-01…15 cubiertos en el alcance de este G2. Deuda sidebar **cerrada**.

Sin `[BLOQUEO]`. Sin token nuevo, sin primitive `@iwana/ui`, sin paleta TailAdmin, sin reintroducir fondo blanco del aside, sin lima como fondo.

**CA-AN-12 portal:** `apps/portal/src/app/dashboard/layout.tsx` conserva `lg:rounded-3xl` en `<main>`. FE **no tocó layouts** (contrato §12: «regresión, no cambio»). Web ya sin `lg:rounded-3xl`. **No es NO-GO de este G2.** Se declara **deuda residual de portal** (canvas / CA-SB-02), **no** de sidebar navy.

`audit-ui.mjs` P1 `lime-text-aa` (2+2 `[revisar]`): **falso positivo** confirmado por contrato DS §5 — `text-iwana-secondary` DEFAULT sobre `iwana-primary` = 8,62:1. Deterministas bloqueantes = 0.

G6.5 / G7 **no** se anticipan.

#### Matriz CA-AN ↔ evidencia

| CA | Criterio (resumen) | Evidencia | Resultado |
| --- | --- | --- | --- |
| **CA-AN-01** | Aside `bg-iwana-primary`; grep 0 de `bg-white/95`, `supports-[backdrop-filter]:bg-white/85`, `dark:bg-dark-surface-2` en el aside | Jest web `pinta el aside…` · portal `pinta el aside…`. Grep 0 en ambos `Sidebar.tsx`. | Cubierto · PASS |
| **CA-AN-02** | Activo `relative` + `bg-white/10` + `font-medium` + `text-white`; grep 0 `shadow-*` / `ring-1 ring-inset` / `rounded-2xl` | Jest web/portal `marca el ítem activo…`. | Cubierto · PASS |
| **CA-AN-03** | Barra lima canónica + `aria-hidden` | Jest: `className` exacto `absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary`. | Cubierto · PASS |
| **CA-AN-04** | Icono activo `text-iwana-secondary` DEFAULT; grep 0 `-700` en iconos | Jest web/portal (icono activo). Grep 0 `text-iwana-secondary-700` en ambos aside. | Cubierto · PASS |
| **CA-AN-05** | Inactivo `text-white/70 hover:bg-white/5 hover:text-white`; icono `/50` + `group-hover:text-iwana-secondary` | Jest web/portal `atenúa el ítem inactivo…`. | Cubierto · PASS |
| **CA-AN-06** | `interactiveFocusClassName` + `dark:focus-visible:ring-offset-white` en nav, marca expandida/colapsada y close | Jest web/portal `aplica foco canónico…`. Constante `navyInteractiveFocusClassName` en ambos archivos. | Cubierto · PASS |
| **CA-AN-07** | Nav `rounded-xl` + `min-h-11`; close `h-11 w-11`; marca `min-h-11` | Jest web (activo + close). Jest portal `targets táctiles…` + activo. E2E hitboxes ≥ 44 px. | Cubierto · PASS |
| **CA-AN-08** | Wordmark `text-white`; eyebrow/grupos `text-white/70`; close `/70` hover blanco | Jest wordmark + group label (web colapsado) + close. Portal wordmark tenant + close. | Cubierto · PASS |
| **CA-AN-09** | Web squircle `h-10 w-11 rounded-xl` + `bg-iwana-surface-soft` sin `dark:bg-dark-surface-3` en aside; img `h-7 w-7`; sin ring. Portal `TenantSeal` sin rediseño PNG | Jest web `conserva el squircle…`. `PlatformBrandMark` `onNavy` retira `dark:bg-dark-surface-3`. Portal: sello intacto (fallback lima). | Cubierto · PASS |
| **CA-AN-10** | Dark: aside sigue `bg-iwana-primary` (no `dark-surface-*`) | Grep: aside solo `bg-iwana-primary` + `dark:border-transparent`. Sin `dark:bg-dark-surface-*`. Capturas E2E 375-dark. | Cubierto · PASS |
| **CA-AN-11** | Receta visual idéntica web/portal; grep 0 `Sidebar` nuevo en `packages/ui` | Mismas clases canónicas §4. Glob 0 `packages/ui/**/Sidebar*`. | Cubierto · PASS |
| **CA-AN-12** | Canvas **sin** `lg:rounded-3xl` (regresión CA-SB-02; layouts no tocar) | Web `(protected)/layout.tsx`: `<main>` sin radio. Portal `dashboard/layout.tsx` L161: `lg:rounded-3xl` **preexistente**. Fuera de alcance G2. | Web PASS · portal **deuda residual** (no G2) |
| **CA-AN-13** | Portal disabled: `cursor-not-allowed` + `text-white/40` + `aria-disabled`; no navega | Jest portal `el ítem deshabilitado no navega…` (Reportes = `span`, sin `href`). | Cubierto · PASS |
| **CA-AN-14** | Colapsado: labels/eyebrow/grupos ocultos; activo con barra lima. Mobile ~375: drawer navy + close con foco §6 | Jest web colapsado. Portal: `lg:hidden` en grupos. E2E 375 drawer + close ≥ 44 px + capturas. | Cubierto · PASS |
| **CA-AN-15** | Grep 0 paleta TailAdmin, `z-99999`, expand-on-hover; `bg-iwana-secondary` no es fondo del aside | Grep 0 `#465FFF` / `z-99999` / `Outfit` / expand-on-hover. `bg-iwana-secondary` solo en barra lima. Jest: aside no coincide `bg-iwana-secondary(?:\s|$)`. | Cubierto · PASS |

Fuente Jest: `apps/web/src/components/layout/Sidebar.spec.tsx` (6 `it`) · `apps/portal/src/components/layout/Sidebar.spec.tsx` (16 `it`). E2E: `e2e/tests/web-shell-sidebar-touch-a11y.spec.ts` · `e2e/tests/portal-shell-touch-a11y.spec.ts`.

#### Comandos y números (re-ejecutados en Track D G2, 2026-08-11)

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=layout/Sidebar` | **1 suite · 6/6 PASS** · 4.029 s · exit 0 |
| `pnpm --filter @iwana/portal exec jest --runInBand --testPathPattern=layout/Sidebar` | **1 suite · 16/16 PASS** · 7.506 s · exit 0 |
| `pnpm --filter @iwana/web typecheck` | `tsc --noEmit` · **exit 0** |
| `pnpm --filter @iwana/portal typecheck` | `tsc --noEmit` · **exit 0** |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium-1208/chrome.exe> pnpm exec playwright test e2e/tests/web-shell-sidebar-touch-a11y.spec.ts --config e2e/playwright.web.config.ts` | **1/1 PASS** · 3.8 s · exit 0 |
| `IWANA_PORTAL_E2E_BROWSER=chrome pnpm exec playwright test e2e/tests/portal-shell-touch-a11y.spec.ts --config e2e/playwright.portal.config.ts` | **1/1 PASS** · 3.7 s · exit 0 (1.er intento falló: sandbox sin `chrome-headless-shell`; reintento con Chrome del sistema) |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre ambos `Sidebar.tsx` | P0 = 0 · P1 = 2+2 `[revisar]` lime-text-aa · **falso positivo** DS §5 · exit 0 |

Capturas recapturadas (sin PII; mocks `Demo ISP` / `ISP Prueba` / `hash:contact-*` / `hash-admin-test`):

- `docs/quality/evidence-web-shell-sidebar-touch/` — `375-light-sidebar-open.png`, `375-light-focus-close.png`, `375-dark-sidebar-open.png`, `375-dark-focus-close.png`, `1440-light-shell.png`, `1440-dark-shell.png`, `1440-dark-focus-user-menu.png`
- `docs/quality/evidence-portal-shell-touch/` — `375-light-sidebar-open.png`, `375-light-focus-close.png`, `375-dark-sidebar-open.png`, `1440-light-shell.png`, `1440-dark-focus-user-menu.png`

Inspección visual 1440: aside navy, activo con tinte + barra lima + icono lima, inactivos atenuados, canvas claro. Portal 1440 confirma `lg:rounded-3xl` en el canvas (deuda residual citada arriba).

#### Deuda residual (fuera de G2)

| Ítem | Disposición |
| --- | --- |
| Portal canvas `lg:rounded-3xl` | **Abierta** — `apps/portal/src/app/dashboard/layout.tsx`. No es sidebar navy. No bloquea G2. |

G6.5 / G7 **no** se anticipan.

### 10.4 Reversión — operador 2026-08-11

**Decisión:** el sidebar navy **no se queda**. El operador prefirió el chrome anterior (blanco + barra lima).

| Superficie | Acción |
| --- | --- |
| `apps/web` / `apps/portal` `Sidebar.tsx` | `git restore` al HEAD previo a G2 |
| `PlatformBrandMark.tsx` | `git restore` (sin `onNavy`) |
| `apps/web/.../Sidebar.spec.tsx` | Eliminado (solo existía por G2) |
| `apps/portal/.../Sidebar.spec.tsx` | `git restore` |
| Evidencia shell touch web/portal | `git restore` (capturas navy descartadas) |
| Contrato G2 | Estado **Superado** — no rige |
| Prompt G2 | Estado **Superado** |
| BLOQUEO-3 Fase-1 + carril rápido `bg-white/95` | **Vigentes de nuevo** |

§10.3 queda como bitácora del intento; no es contrato vigente.

**Canvas ovalado (mismo día):** el operador pidió el canto sidebar–dashboard redondeado. `apps/web` `(protected)/layout.tsx` recupera `lg:rounded-3xl`. CA-SB-02 del carril rápido queda **superado**.

### 10.5 Vocabulario humano en `/audit-logs` — 2026-08-11

Misma disciplina que Actividad reciente (`describePlatformActivityLine` + `PLATFORM_UI_COPY.audit`):

| Superficie | Antes | Ahora |
| --- | --- | --- |
| Título / nav / búsqueda | Auditoria | Historial de cambios |
| Filas básicas y resumen | «Se actualizó el usuario email» · badges Creación/MFA | `{quién} {verbo} {qué}` · Alta / verificación en dos pasos |
| Error de carga | registros de auditoría | No pudimos cargar el historial. Reintenta en unos minutos. |

Sin correos, ids ni enums en modo Lectura. Chrome alineado G6 **GO** en [`INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md`](INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md) § Cierre G6.

**Paginación (mismo día):** el listado deja de cargar 50 filas de golpe. Por defecto muestra **10** cambios; el pie permite elegir 10 / 20 / 50 (`size` en URL). Anterior / Siguiente se mantienen (cursor).

**Tabs de ámbito (mismo día):** bajo el título, menú horizontal `Cambios de plataforma` / `Cambios por empresa` (`Tabs` de `@iwana/ui`). Un solo panel visible; `scope=empresa` en URL.

**Empresas por estado (mismo día):** el panel D toma la anatomía de Monitoreo — eyebrow, frase de lectura, chip de total y hint por tesela — sin copiar paleta ni tipografía ajenas.

**Directorio `/tenants` (mismo día):** alineación G4 cerrada en [`INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md`](INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md) § Cierre G6 — dictamen **GO**.
