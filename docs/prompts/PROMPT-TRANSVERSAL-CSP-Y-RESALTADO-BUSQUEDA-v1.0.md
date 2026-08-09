# PROMPT — Cierre de C-8 (CSP) y C-10 (resaltado de búsqueda del portal)

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-FE-PLATFORM
**Revisores obligatorios:** AI-PLAT-OPS (capa de infraestructura de la CSP) · AI-SR-QA (control negativo del portal y pruebas del contrato) · AI-SEC-ENG (cierre formal de C-8 y C-10)
**Hallazgo:** [SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) — C-8 y C-10, abiertos con dueño
**Relacionado:** [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md) (capa complementaria de defensa en profundidad) · [INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../informes/INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md)

---

## 1. Objetivo exacto

**Resultado esperado:** eliminar los dos pendientes de seguridad de la búsqueda global que quedaron con dueño al cerrar H-01:

1. **C-8** — Política de seguridad de contenido (**CSP**) como segunda capa en **ambas** aplicaciones Next (`apps/web` y `apps/portal`).
2. **C-10** — Eliminar el sink de HTML crudo equivalente del **portal** (`apps/portal/src/components/search/GlobalSearchResultItem.tsx:90`) promoviendo `SearchHighlight` a `@iwana/ui` con contrato congelado.

**Lo que no entra:**

- La migración del modelo de sesión (ADR-081), ni la resolución de tenant, ni la protección CSRF. Son otra fase.
- Cambiar el servicio de búsqueda del API (`apps/api`), el esquema de indexación o los DTO. **`apps/api` no se toca.**
- El hardening de la CSP con nonces vía `proxy.ts` + renderizado dinámico. Se registra como mejora futura (ADR-081 paso 2 lo habilitará); este prompt la implementa **sin nonces** con la política baseline que la documentación oficial de Next.js define para apps sin nonces (`async headers()` en `next.config.ts`).
- Cambiar tokens de marca, stack o estructura de navegación.

---

## 2. Contratos congelados

| Contrato | Artefacto (ruta y versión) | Qué congela |
| --- | --- | --- |
| **Contrato de componente** | [`docs/specs/2026-08-09-search-highlight-ds-contrato.md`](../specs/2026-08-09-search-highlight-ds-contrato.md) **v1.0**, aprobado por AI-DS-OWNER el 2026-08-09 | API `SearchHighlight({ snippet })` + `parseSearchHighlight` + `SearchHighlightSegment` · tokens del `<mark>` (par tonal lima, §4.1) · estados sin variantes (§5) · límite del componente (el chip es receta canónica + `SearchSnippetPill`, §6) · a11y (§7) · pruebas auditables P1–P9 (§8) |

**Decisiones de AI-EM-ARCH sobre las `[CONSULTA]` de la spec §12 (todas resueltas el 2026-08-09):**

- **C-1 — marca visual del `mark`:** se **adopta el par tonal lima** (§4.1). El amarillo UA no es parte de la identidad y varía por navegador; el componente del design system usa tokens reales con contraste AA verificado. Cambio visual menor y positivo en ambas apps.
- **C-2 — alcance del pill:** se **consolida `SearchSnippetPill`** en `@iwana/ui` en el mismo acto (export hermano de `SearchHighlight`). La cadena del chip es byte-idéntica en ambas apps; la duplicación visual entre módulos contradice el mandato anti-duplicación. Ambos call sites migran a `<SearchSnippetPill snippet={…} />`.
- **C-3 — hogar de los tests:** los tests del contrato (P1–P9) se **mantienen en los apps** importando de `@iwana/ui`, con la guarda de directorio extendida a `packages/ui/src/components/` y a los directorios de búsqueda de ambas apps. **No** se crea infraestructura Jest en `packages/ui` en este acto (scope mayor, se registra como mejora).

---

## 3. Estado verificado — no re-derivar

- `apps/web/src/components/search/SearchHighlight.tsx` (hoy local): `parseSearchHighlight()` usa `matchAll` sobre `/<mark>([\s\S]*?)<\/mark>/gi`; emite nodos de texto React + `<mark>`. Sin `dangerouslySetInnerHTML`. Probado: `apps/web/src/components/search/GlobalSearchResultItem.spec.tsx` (11 casos) y `SearchXssChainPoC.spec.tsx` (16 casos, PoC C-7b).
- `apps/portal/src/components/search/GlobalSearchResultItem.tsx:87-91` conserva `dangerouslySetInnerHTML={{ __html: highlight }}`.
- Productor del portal: `apps/portal/src/lib/api-client.ts:4032-4066` — `escapeHtml` + `highlightMatch` + `compactHighlights`. **Se mantienen locales** (productores de fragmento-dato, ya escapan). No se tocan en este acto.
- Ambas apps: Next.js **16.2.11**, React 19.2, sin `middleware.ts` ni `proxy.ts`. nginx (`nginx/nginx.prod.conf`) ya emite `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`; **no emite CSP**.
- `packages/ui/src/components/` es la carpeta de componentes del design system; `packages/ui/src/index.ts` es el barril de exports.

---

## 4. Instrucciones

### C-8 — CSP como segunda capa

1. Añadir `async headers()` en **ambos** `next.config.ts` (`apps/web` y `apps/portal`) con la política baseline de CSP que la documentación oficial de Next.js define para apps **sin nonces**. Base común:
   `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;`
   - `'unsafe-inline'` en `script-src` y `style-src` es **requerido** por los scripts de bootstrap inline de Next.js y los estilos inline de React; sin ello las páginas estáticas no hidratan (discusión vercel/next.js#80997). Es el baseline documentado, no un debilitamiento silencioso: **documentarlo en el informe**.
   - **Portal** (diferenciación por superficie): añadir `https://www.gravatar.com` a `img-src`, consistente con `images.remotePatterns` ya presente.
   - Normalizar el valor (quitar saltos de línea) antes de fijarlo.
2. **No** duplicar la CSP en `nginx/nginx.prod.conf`: Next emite la cabecera en sus respuestas HTML y el proxy la pasa al cliente. AI-PLAT-OPS verifica que nginx no pisa ni duplica la cabecera.
3. Verificación de build: `pnpm --filter @iwana/web build` y `pnpm --filter @iwana/portal build` en verde; confirmar en el HTML de producción que la cabecera CSP está presente.

### C-10 — Promoción de `SearchHighlight` + `SearchSnippetPill` y migración del portal

Siguiendo la spec **v1.0** (handoff §10) y las decisiones de AI-EM-ARCH:

1. **Mover** `apps/web/src/components/search/SearchHighlight.tsx` → `packages/ui/src/components/SearchHighlight.tsx`. Exportar `SearchHighlight`, `SearchHighlightProps`, `parseSearchHighlight`, `SearchHighlightSegment` desde `packages/ui/src/index.ts`. **Sin cambiar la lógica del parser ni del render.**
2. **`SearchSnippetPill`** (decisión C-2): mismo archivo o colindante, export hermano. API `{ snippet: string }` → `<span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300"><SearchHighlight snippet={snippet} /></span>`. La cadena es exactamente la receta canónica de la spec §6, sin variaciones.
3. **Web:** `apps/web/src/components/search/GlobalSearchResultItem.tsx` importa `SearchSnippetPill` (o `SearchHighlight`) desde `@iwana/ui`; eliminar el archivo local de `SearchHighlight.tsx` de web. Los tests de web que importan `./SearchHighlight` pasan a importar de `@iwana/ui`.
4. **Portal (cierre de C-10):** en `apps/portal/src/components/search/GlobalSearchResultItem.tsx:87-91`, reemplazar el `span` con `dangerouslySetInnerHTML` por `<SearchSnippetPill snippet={highlight} />`. `highlightMatch`/`escapeHtml`/`compactHighlights` de `api-client.ts` **se mantienen** como productores de fragmento-dato.
5. **Directiva de cliente:** el componente no usa hooks ni eventos; puede renderizarse desde Server Components y client components sin `'use client'`. Decisión de implementación documentada (§2 de la spec), sin cambio de comportamiento.
6. **Visual:** el `mark` pasa del amarillo UA al par lima en ambas apps (decisión C-1). **Cero tokens tocados**; los chips y el layout no cambian.

---

## 5. Restricciones no negociables

1. **Cero `dangerouslySetInnerHTML`** en `apps/web/src/components/search/`, `apps/portal/src/components/search/` y `packages/ui/src/components/` al terminar.
2. **No tocar `apps/api`.** La corrección es de frontend y design system.
3. **No tocar el modelo de sesión** (ADR-081 es otra fase).
4. **No cambiar tokens de marca ni lenguaje visual más allá del `mark` lima de la spec.**
5. **No crear infraestructura Jest en `packages/ui`** (decisión C-3).
6. **No tocar** `highlightMatch`/`escapeHtml`/`compactHighlights` del portal.
7. **No duplicar la CSP en nginx.**

---

## 6. Entregables

**Técnicos:**

- `apps/web/next.config.ts` y `apps/portal/next.config.ts` con `async headers()` + CSP.
- `packages/ui/src/components/SearchHighlight.tsx` (+ `SearchSnippetPill`) exportados desde `packages/ui/src/index.ts`.
- `apps/web/src/components/search/GlobalSearchResultItem.tsx` importando de `@iwana/ui`; `SearchHighlight.tsx` local eliminado de web.
- `apps/portal/src/components/search/GlobalSearchResultItem.tsx` sin sink, importando de `@iwana/ui`.
- Tests actualizados: los specs de web (`GlobalSearchResultItem.spec.tsx`, `SearchXssChainPoC.spec.tsx`) importan de `@iwana/ui`; nuevo spec del portal con control negativo (o extensión al spec existente); guarda de directorio extendida a `packages/ui/src/components/`.
- `pnpm --filter @iwana/web test`, `pnpm --filter @iwana/portal test`, `lint` y `typecheck` en verde (para el paquete y las apps afectadas), con evidencia `Cached: 0`.

**Documentales:**

- Informe breve en `docs/informes/`, declarando: la decisión de CSP sin nonces (y por qué no con nonces en este acto), la promoción del componente con el contrato citado, y la resolución de las consultas de DS-OWNER.
- Actualizar el hallazgo (`docs/security/SECURITY-REVIEW-...md`): C-8 y C-10 a cerrado (C-10) y verificado (C-8) con evidencia.
- Actualizar el informe transversal (`docs/informes/INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md`).

---

## 7. Criterios de aceptación

- **CA-C8-01** — Ambas apps responden con `Content-Security-Policy` en el HTML de producción.
- **CA-C8-02** — La política contiene `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `connect-src 'self'` (contención de exfiltración y clickjacking).
- **CA-C8-03** — Las apps no rompen: build en verde, hidratación verificada (no basta build; revisar que la página renderiza).
- **CA-C10-01** — Cero `dangerouslySetInnerHTML` en los tres directorios declarados, verificado por `grep` y por la guarda de directorio en pruebas.
- **CA-C10-02** — `apps/api` sin cambios.
- **CA-C10-03** — El resaltado del portal muestra el payload como texto literal (control negativo en verde).
- **CA-C10-04** — Web y portal usan el componente de `@iwana/ui`; el archivo local de web se eliminó.
- **CA-C10-05** — El `mark` usa el par lima de la spec (sin hex, sin tokens paralelos).
- **CA-C10-06** — Suite web y portal en verde con evidencia `Cached: 0`.

---

## 8. Criterio de stop/go

**Detenerse si:**

- La CSP rompe la hidratación o el render de alguna página en build de producción → verificar antes de continuar; si `'unsafe-inline'` no basta, revisar la necesidad de nonces con AI-EM-ARCH antes de proceder (es una ampliación de alcance, no un parche).
- Mover `SearchHighlight` exige cambiar la lógica del parser o el render → detenerse y consultar (el contrato lo congela).
- Aparece una dependencia de build entre `@iwana/ui` y las apps que rompe `transpilePackages` → documentar y consultar.

**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`.

---

## 9. Criterio de salida

- [ ] CSP en ambas apps (CA-C8-01..03)
- [ ] `SearchHighlight` + `SearchSnippetPill` en `@iwana/ui` (CA-C10-01..06)
- [ ] Portal sin sink
- [ ] Tests en verde con `Cached: 0`
- [ ] Hallazgo actualizado con C-8 y C-10 cerrados
- [ ] Re-verificación de AI-PLAT-OPS (nginx) y AI-SEC-ENG (cierre)
- [ ] Control negativo del portal verificado por AI-SR-QA
