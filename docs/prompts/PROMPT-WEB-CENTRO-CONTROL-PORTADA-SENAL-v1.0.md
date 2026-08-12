# PROMPT-WEB-CENTRO-CONTROL-PORTADA-SENAL-v1.0

## Prompt de ejecución — portada de señal del Centro de control (`apps/web`)

**Versión:** 1.1 (archivo conserva sufijo v1.0; v1.0 = C-1…C-7 / D-1…D-5)  
**Estado:** Ejecutado — adenda v1.1 + C-11/D-10 · GO  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** G4 · protocolo v1.5 §3bis  
**Destinatarios:** AI-FE-PLATFORM (C) · AI-SR-QA (D)  
**Plantilla de formato (en revisión):** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)

> Sin prompt de ejecución no hay implementación. Lo que no está aquí no entra.  
> Contratos UX/DS ya están congelados; PROD-UX y DS-OWNER **no** reabren receta en esta fase.

---

## 1. Contratos congelados

| Contrato | Ruta | Estado |
| --- | --- | --- |
| **UX spec portada** | [`2026-08-11-web-centro-control-portada-senal-ux-spec.md`](../specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md) | v1.0 congelada · **enfoque A** |
| **DS contrato portada** | [`2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](../specs/2026-08-11-web-centro-control-portada-senal-ds-contrato.md) | v1.0 congelado · carril rápido |
| **UX spec 2026-07-20** | [`2026-07-20-web-dashboard-centro-control-ux-spec.md`](../specs/2026-07-20-web-dashboard-centro-control-ux-spec.md) | Parcialmente superada (home) |
| **DS Fase-1** | [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md) | Vigente para sombras/foco/dark/Monitoreo |
| **Informe vivo** | [`INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md`](../informes/INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md) | Actualizar §10 al cerrar |

**API:** sin endpoints nuevos. `tenantApi.list({ limit: 100, offset: 0 })` · `platformAuditApi.list({ limit: 5 })` · `healthApi.get()`.

---

## 2. Objetivo

Convertir `/dashboard` de `apps/web` en portada de señal: qué está bien, qué requiere acción, a dónde ir. El listado vive solo en `/tenants`.

### Entra

| ID | Paso | Cierra |
| --- | --- | --- |
| C-1 | Quitar `TenantsTable` del home | CA-PS-01 |
| C-2 | Franja de 4 chips S-1…S-4 (copy, acentos, destinos UX §4) | CA-PS-02…04 |
| C-3 | Distribución D: barra + leyenda → `/tenants?status=` | CA-PS-05…06 |
| C-4 | Actividad al pie, `limit: 5`, `<time>`, vocabulario | CA-PS-07 |
| C-5 | Subtítulo B0 oficial; Monitoreo intacto (orden CA-05) | CA-PS-08 |
| C-6 | Layout 375 / 1280; degradación parcial | CA-PS-09…10 |
| C-7 | Tests Jest del home reescritos (el mock de `TenantsTable` sobra) | CA-PS-* |
| C-8 | Jest CA-PS-08: orden completo Atención operativa → API → BD → Redis | CA-PS-08 |
| C-9 | Jest CA-PS-10: fallo aislado de `healthApi` no tumba chips/D/A | CA-PS-10 |
| C-10 | Smoke Jest `/tenants?status=` (inyectar `useSearchParams`) | CA-PS-05 |
| D-6 | Reescribir `e2e/tests/web-auth-dashboard.spec.ts` a la portada | CA-PS-01/02 + flujo login |
| D-7 | Playwright CA-PS-09 en viewports 375 y 1280 + capturas | CA-PS-09 |
| D-8 | Axe WCAG 2.1 AA en la portada + captura de chips (CA-PS-02) | CA-PS-02 · a11y |
| D-9 | Re-dictamen GO/NO-GO y vaciar «queda fuera» de evidencia en §10 | Gate |
| C-11 | Barra D sin Links dentro de `role="img"` (DEF-PS-A11Y-01) | D-8 · WCAG 4.1.2 |
| D-10 | Re-ejecutar D-6…D-8 y re-dictaminar | Gate |

### No entra

Portal · endpoints · `@Roles` · migraciones · tokens de marca · primitive `@iwana/ui` · import de `apps/portal` · **implementar** sidebar azul noche (deuda G2: ver §8.3) · G6.5/G7 · suspender/activar en el home · reabrir I-1…I-7 del portal.

---

## 3. Track C — AI-FE-PLATFORM

Skills: `iwana-identity-ui-review` (modo diseño) · `frontend-dev-guidelines` · `test-driven-development` · `system-vocabulary-review`. `ui-ux-pro-max` subordinada a identidad.

Implementa **la UX spec + el contrato DS**, no este resumen. Copy §11 y recetas DS-S / DS-D / DS-A son literales.

**Archivos previstos:**

- `apps/web/src/components/dashboard/DashboardClient.tsx` + `.spec.tsx`
- Componentes locales nuevos *solo si* evitan un `DashboardClient` ilegible (p. ej. `SignalChips.tsx`, `TenantStatusDistribution.tsx`) — sin promover a `@iwana/ui`
- `apps/web/src/lib/platform-ui-copy.ts` si el subtítulo del header sale de ahí
- `PanelCard.tsx` solo si hace falta `<time>` en actividad; no reintroducir filas de estado

**TDD:** reescribe `DashboardClient.spec.tsx` (hoy aserta tabla y «Directorio por estado»). Cubre CA-PS-01…08 y CA-PS-10. CA-PS-09: aserciones de clases de layout (`xl:grid-cols-12`, A a ancho completo); el viewport real lo cierra D-7.

**Comandos:**

```
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=components/dashboard
pnpm --filter @iwana/web typecheck
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/web/src/components/dashboard
```

**Prohibido:** `TenantsTable` en el home · lima en S-3/D-3/D-6 · `inline-flex` en token que anule `hidden` · ceros durante `isLoading` · commitear.

---

## 4. Track D — AI-SR-QA

Arranca cuando C entregue. No implementa features.

| # | Paso |
| --- | --- |
| D-1 | Trazar CA-PS-01…10 ↔ test que pasa |
| D-2 | Jest dashboard en verde; typecheck `@iwana/web` |
| D-3 | `audit-ui.mjs` P0/P1 = 0 en dashboard |
| D-4 | Dictamen GO / GO condicionado / NO-GO |
| D-5 | Actualizar informe vivo §10 (no duplicar informe) |

Playwright ausente **ya no** autoriza GO condicionado: la adenda v1.1 lo cierra en D-7.

---

## 5. Criterios de aceptación

Los **CA-PS-01…10** de la UX spec §9. Copy §11. Checklist DS §7.

---

## 6. Stop / go

**Stop — `[BLOQUEO]` a AI-EM-ARCH:** endpoint nuevo · primitive `@iwana/ui` · import portal · reintroducir tabla en el home · lima como urgencia.

**Go:** CA-PS-01…10 con evidencia **completa** (Jest + E2E 375/1280 + axe + smoke `/tenants?status=`) · informe §10 sin lista «queda fuera» de evidencia · no anticipar G6.5/G7.

---

## 7. Decisiones — no reabrir

| Asunto | Decisión |
| --- | --- |
| Enfoque | **A** — B y C fuera |
| S-3 | Foco a D, no query inventada |
| S-4 | No navegable |
| Directorio canónico | `/tenants` |
| Monitoreo | Sin rediseño |

---

## 8. Adenda v1.1 — evidencia que no queda fuera (2026-08-11)

Autoriza el cierre de los huecos que el Track D v1.0 dejó como «fuera de este track». Contratos UX/DS **siguen congelados**. Sin features nuevas.

### 8.1 Track C — AI-FE-PLATFORM (Jest residual)

Corre en paralelo a D-6…D-8 (archivos distintos). No commitea. No toca E2E.

| ID | Archivo | Qué |
| --- | --- | --- |
| **C-8** | `apps/web/src/components/dashboard/DashboardClient.spec.tsx` | Aserción del orden **completo** de indicadores: Atención operativa → API → BD → Redis (hoy solo el primero). El mock de `SystemStatusPanel` ya pinta `label: detail`. |
| **C-9** | mismo spec | `it` de **health caído**: `healthApi.get` rechaza; chips S, bloque D y actividad A permanecen. Copy de error de Monitoreo = el que ya pinta el cliente (no inventar). |
| **C-10** | `apps/web/src/app/(protected)/tenants/page.spec.tsx` | Smoke: mock de `useSearchParams` con `status=ACTIVE` (y un caso inválido → `TODAS`). Assertar que `TenantsTable` recibe `statusFilter` correcto. No cambiar `page.tsx` salvo bug real de parseo. |

Comandos C:

```
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=components/dashboard
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=app/\\(protected\\)/tenants/page.spec
pnpm --filter @iwana/web typecheck
```

### 8.2 Track D — AI-SR-QA (E2E + a11y + dictamen)

Skills: `e2e-testing-patterns` · `playwright-skill` · `testing-patterns` · `wcag-audit-patterns`. No implementa UI. Selectores por rol/nombre; no clases Tailwind.

| ID | Archivo | Qué |
| --- | --- | --- |
| **D-6** | `e2e/tests/web-auth-dashboard.spec.ts` | El flujo **deja de** asertar `getByRole('cell')` y el placeholder de búsqueda **en `/dashboard`**. Tras login: heading Centro de control, 4 chips (Activas / En configuración / Requieren atención / Cambios esta semana), **sin** «Directorio de empresas». La búsqueda vive en `/tenants`: navegar, llenar el buscador, ver «Fibernet Colombia» y no «Demo ISP». Logout intacto. Reutilizar `setupWebApiMocks` / `submitPlatformLogin`. |
| **D-7** | mismo spec o `e2e/tests/web-centro-control-portada.spec.ts` | Viewports **375×812** y **1280×900**. 375: orden DOM/visual S → M → D → A (una columna). 1280: chips en fila; M y D lado a lado; A a ancho completo. Capturas en `docs/quality/evidence-web-centro-control-portada/` (`375.png`, `1280.png`). Sin PII. |
| **D-8** | mismo flujo autenticado | Conservar/extender **Axe** `wcag2a` + `wcag2aa` en `/dashboard` post-login (ya existe en el spec). Violaciones = `[]`. La captura de D-7 cubre CA-PS-02 visual. |
| **D-9** | `docs/informes/INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md` §10 | Matriz CA-PS actualizada. Números reales de Jest (incl. C-8…C-10) y Playwright. Dictamen: **GO** solo si D-6…D-8 pasan; si Playwright no puede correr en el sandbox, **NO-GO de evidencia** (ya no hay GO condicionado por ausencia). Vaciar la lista «queda fuera» de evidencia. Sidebar: solo la disposición §8.3. |

Comando D:

```
pnpm exec playwright test e2e/tests/web-auth-dashboard.spec.ts --config e2e/playwright.web.config.ts
```

Si D-7 vive en archivo nuevo, incluirlo en el mismo comando o en un segundo `playwright test` del path nuevo.

### 8.3 Disposición — sidebar azul noche (no se implementa)

No es hueco de la portada: es **deuda G2** del informe § (puntaje / bloqueos). Entrada: HLD TailAdmin **Aprobado** + contrato DS. Owner: AI-DS-OWNER + AI-FE-PLATFORM en fase G2. Se retira de «fuera de este track» y queda **declarada** en §10 como deuda abierta de otro gate. No hay tarea C/D de implementación.

### 8.4 Desempate DEF-PS-A11Y-01 — C-11 / D-10 (2026-08-11)

Track D v1.1: **NO-GO**. Axe `nested-interactive` en la barra D (`role="img"` envuelve `<a>` de tramos). Conflicto interno del contrato DS §4: «tramo clicable = Link» + «`role=img` en el contenedor».

**Decisión (AI-EM-ARCH):** la barra es gráfico no interactivo; la leyenda es el único control de navegación. CA-PS-05 se cumple por los chips de leyenda. Contrato DS §4 parcheado (misma fecha). No se reabre el enfoque A ni se inventa `role="group"` en la barra.

| ID | Owner | Qué |
| --- | --- | --- |
| **C-11** | AI-FE-PLATFORM | En `TenantStatusDistribution.tsx`: tramos de la barra = `<span>` (mismo `width` % y `FILL_CLASS`). Quitar `Link` / `interactiveFocusClassName` de dentro del `role="img"`. Leyenda y pie no se tocan. Jest: el `role=img` no contiene `link`. No commitear. |
| **D-10** | AI-SR-QA | Tras C-11: re-correr D-6…D-8. Si Axe = `[]` y D-6/D-7 siguen verdes → **GO**. Actualizar §10.2. |

**Adenda emitida por AI-EM-ARCH el 2026-08-11.**
