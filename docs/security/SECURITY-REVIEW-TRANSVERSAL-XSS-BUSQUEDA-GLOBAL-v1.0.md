# SECURITY REVIEW — XSS almacenado en la búsqueda global de la consola de plataforma

**Versión:** 1.0
**Estado:** **CERRADO (2026-08-09)** — C-7, C-7b, C-8 y C-10 corregidos y verificados; cierre formal firmado por AI-SEC-ENG
**Severidad:** **CRÍTICA**
**Fecha:** 2026-08-09
**Auditor:** AI-SEC-ENG
**Consolidado por:** AI-EM-ARCH
**Origen:** dictamen de la consulta bloqueante OLA1-b (modelo de sesión) — **hallazgo H-01, independiente de esa decisión**
**Superficie:** `apps/web` — consola de plataforma
**Relacionado:** [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) (frontera de audiencias, Aprobado) · [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (Aprobado) · [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)*

---

## 1. Por qué este documento existe aparte

El hallazgo apareció auditando el modelo de sesión, pero **no depende de esa decisión y no debe esperar a ella**. AI-SEC-ENG lo escaló explícitamente para que no quedara represado dentro del ADR de OLA1-b. Migrar la sesión a cookie **reduce el impacto** de esta cadena, pero **no elimina la ejecución de script** en el origen de la consola de plataforma.

---

## 2. El hallazgo

**Un administrador de tenant puede robar el token de sesión de un usuario de plataforma.**

`apps/web/src/components/search/GlobalSearchResultItem.tsx:81-84` inyecta los fragmentos resaltados de la búsqueda global con `dangerouslySetInnerHTML={{ __html: highlight }}` **sin ningún escapado**:

```tsx
<span
  key={`${item.id}-${highlight}`}
  className="rounded-full bg-gray-100 px-2 py-1 …"
  dangerouslySetInnerHTML={{ __html: highlight }}
/>
```

Los fragmentos llegan crudos desde el motor de búsqueda: `apps/api/src/modules/search/search.service.ts:185-222` los reenvía tal cual. Los campos indexados son **texto libre editable por el tenant** —`name`, `legalName`, `firstName`, `lastName`, `jobTitle`— y la validación del DTO aplica solo `@MaxLength`, sin clase de caracteres (`apps/api/src/modules/users/dto/user.dto.ts:74,98`).

### Cadena de explotación

1. Un `ADMIN` de tenant escribe un payload de script en un campo propio, por ejemplo su `jobTitle`.
2. El campo se indexa en el motor de búsqueda.
3. Un usuario de plataforma busca un término que haga match.
4. El payload **ejecuta en el origen de la consola de plataforma**.
5. Lee `localStorage['iwana.web.access-token']` y lo exfiltra.

### Por qué es crítica y no alta

**Cruza la frontera de audiencias que [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) estableció criptográficamente.** Ese ADR separó las audiencias de plataforma y tenant precisamente para que un actor de tenant no pudiera obtener privilegio de plataforma. Esta cadena lo consigue por otra vía: no falsifica el token, se lo lleva del navegador de quien sí lo tiene.

**Agravante.** El portal **sí escapa** este mismo tipo de contenido —`escapeHtml` + `highlightMatch` en `apps/portal/src/lib/api-client.ts:4032-4062`—. La superficie de **mayor privilegio del sistema es la única desprotegida**.

**Sin segunda capa.** No existe `Content-Security-Policy` en ninguna de las dos aplicaciones de navegador: ni en `nginx/`, ni en los `next.config.ts`. `helmet()` protege solo las respuestas del API, no las páginas servidas por los contenedores `web` y `portal`. Con el token en almacenamiento local, tampoco hay primera capa.

### Estado de verificación

**Verificado por PoC ejecutada (C-7b) y re-verificado de forma independiente por AI-SEC-ENG (2026-08-09).** La PoC (16 pruebas, `Cached: 0 cached, 2 total`) demuestra la cadena simulada, el cierre (texto literal, sin elementos de carga ni atributos de evento, sonda intacta), el control negativo genuino y el borde cosmético declarado. Re-verificación AI-SEC-ENG: `grep -rn "dangerouslySetInnerHTML" apps/web/src` → 0 coincidencias; `apps/api` sin cambios; sin sinks alternativos en el directorio de búsqueda.

---

## 3. Contexto de exposición

El programa **no está en producción** ([ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado), Aprobado) pero **sí procesa PII real** ([ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)*). La exposición actual es acotada, y esa es exactamente la razón para corregirlo ahora: el coste es una función de escapado, y crece con cada módulo que se construya encima.

---

## 4. Corrección requerida

| Id | Acción | Responsable | Bloqueante de |
| --- | --- | --- | --- |
| ~~**C-7**~~ | ~~Escapar o eliminar el `dangerouslySetInnerHTML`~~ · **CORREGIDO el 2026-08-09 por AI-FE-PLATFORM.** Se eligió **eliminar el sink**, no escaparlo: el fragmento se parsea a nodos de React y **el marcado deja de interpretarse como marcado**. Detalle en [INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../informes/INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) | AI-FE-PLATFORM | **Cerrado** |
| ~~**C-7b**~~ | ~~Prueba de concepto que demuestre la cadena y su cierre~~ · **CERRADO el 2026-08-09 por AI-SR-QA, validado por AI-SEC-ENG.** `SearchXssChainPoC.spec.tsx` (16 pruebas, `Cached: 0 cached, 2 total`). Control negativo genuino: `SinkControlForPoc` reintroduce el sink solo en componente de prueba aislado; sin residuo en producción | AI-SR-QA | **Cerrado** |
| ~~**C-8**~~ | ~~`Content-Security-Policy` en ambas aplicaciones Next, vía `async headers()`, como segunda capa~~ · **CERRADO el 2026-08-09 por AI-SEC-ENG.** | **AI-FE-PLATFORM** + **AI-PLAT-OPS** | **Cerrado.** CSP baseline sin nonces vía `async headers()` en ambas `next.config.ts` (portal añade `https://www.gravatar.com` a `img-src`); cabecera presente en el HTML de producción; verificación de infraestructura AI-PLAT-OPS registrada (nginx no pisa ni duplica; `frame-ancestors 'none'` prevalece sobre el `X-Frame-Options SAMEORIGIN` redundante). Alcance de contención: exfiltración (`connect-src 'self'`), plugins (`object-src 'none'`), clickjacking (`frame-ancestors 'none'`), `base-uri 'self'`. **Riesgo residual `'unsafe-inline'` aceptado** (baseline de Next sin `proxy.ts`): **no impide script inline**; hardening con nonces como mejora futura (ADR-081) | **Cerrado** |
| ~~**C-10**~~ | ~~Revisar el sink equivalente del portal~~ · **CERRADO el 2026-08-09 por AI-FE-PLATFORM.** El `span` con `dangerouslySetInnerHTML` de `GlobalSearchResultItem.tsx` se reemplazó por `<SearchSnippetPill snippet={highlight} />`; `SearchHighlight` + `SearchSnippetPill` promovidos a `@iwana/ui` con el contrato congelado ([spec v1.0](../specs/2026-08-09-search-highlight-ds-contrato.md)). `highlightMatch`/`escapeHtml`/`compactHighlights` se mantienen como productores de fragmento-dato. Control negativo del portal en verde; cero sinks en los tres directorios. **Re-verificación AI-SR-QA (P1–P9 del contrato, 9/9 cubiertos) y cierre formal AI-SEC-ENG (2026-08-09).** | AI-FE-PLATFORM | **Cerrado** |

**Nota sobre la defensa en profundidad.** Escapar el sink cierra esta cadena. La CSP contiene las siguientes. Migrar la sesión a cookie `httpOnly` (OLA1-b) impide que el token sea legible por script aunque una cadena futura tenga éxito. **Las tres son capas distintas y ninguna sustituye a las otras.**

---

## 5. Escalación

**[ESCALACION AL CTO] — Prioridad: Crítica.**

**Contexto.** Existe una cadena verificable por la que un administrador de tenant obtiene el token de sesión de un usuario de plataforma, cruzando la frontera de privilegio que ADR-061 protege. No requiere producción para ser explotable: requiere un tenant y un usuario de plataforma que use la búsqueda global.

**Recomendación:** ejecutar **C-7 de inmediato**, fuera del alcance de OLA1-b y sin esperar a la prueba de concepto. Es una corrección de superficie mínima con impacto crítico. C-8 y C-10 se planifican en la misma ventana.

**Decisión requerida antes de:** cualquier uso de la búsqueda global de la consola de plataforma con datos de tenant reales.

---

## 6. Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-08-09 | Apertura. Hallazgo H-01 extraído del dictamen de AI-SEC-ENG sobre OLA1-b y registrado como artefacto propio para evitar que quede represado en un ADR de otro alcance |
| 2026-08-09 | **Cierre formal por AI-SEC-ENG (H-01).** Re-verificación independiente de C-7: `parseSearchHighlight()` emite solo nodos de texto React (sin `dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML`, `document.write`); `GlobalSearchResultItem.tsx` sin sink; `grep -rn "dangerouslySetInnerHTML" apps/web/src` → 0; `apps/api` intacto. PoC C-7b evaluada: cadena, cierre, control negativo genuino y borde cosmético sin consecuencia. C-8 y C-10 permanecen abiertos con dueño, fuera de este cierre |
| 2026-08-09 | **C-10 cerrado y C-8 verificado por AI-FE-PLATFORM** (prompt PROMPT-TRANSVERSAL-CSP-Y-RESALTADO-BUSQUEDA-v1.0). C-10: sink del portal eliminado; `SearchHighlight` + `SearchSnippetPill` en `@iwana/ui` con contrato congelado; control negativo del portal añadido; `grep -rn "dangerouslySetInnerHTML" apps/web/src apps/portal/src packages/ui/src` → 0; `apps/api` intacto. C-8: CSP baseline sin nonces vía `async headers()` en ambas `next.config.ts`, cabecera presente en el HTML de producción. **Pendiente:** re-verificación de AI-PLAT-OPS (nginx) y cierre formal de AI-SEC-ENG (C-8); verificación del control negativo del portal por AI-SR-QA |
| 2026-08-09 | **Cierre formal por AI-SEC-ENG (C-8 y C-10).** Veredicto **APROBADO CON RIESGO RESIDUAL**. Evidencia de ejecución propia: `Cached: 0 cached, 3 total` (web 22 suites/112; portal 172 suites/1111, 1 skip). C-10: cero sinks en los tres directorios (incluye `innerHTML`, `eval(`, `new Function`, `document.write`, `insertAdjacentHTML`), control negativo del portal efectivo, P1–P9 del contrato DS 9/9 cubiertos por AI-SR-QA. C-8: política con `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `connect-src 'self'`, `default-src 'self'`; verificación AI-PLAT-OPS (nginx no pisa ni duplica). **Declaración de alcance de contención:** la CSP no impide script inline (`'unsafe-inline'` documentado, riesgo residual aceptado); contiene exfiltración externa, clickjacking, plugins y base-uri. Hardening con nonces (`proxy.ts` + renderizado dinámico) como mejora futura habilitada por ADR-081. Deuda registrada: CSP del API vía `helmet` no alineada (AI-PLAT-OPS, no bloqueante) |
