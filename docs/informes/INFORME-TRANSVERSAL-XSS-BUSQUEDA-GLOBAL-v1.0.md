# INFORME — Corrección del XSS almacenado en la búsqueda global

**Versión:** 1.0
**Estado:** **C-7, C-7b, C-8, C-10 y cierre formal cerrados** — todos los hallazgos del frente cerrados
**Fecha:** 2026-08-09
**Modo activo:** EM + Orchestrator
**Autor:** AI-EM-ARCH (consolidación)
**Agente ejecutor:** AI-FE-PLATFORM
**Prueba de concepto (C-7b):** AI-SR-QA
**Cierre formal:** AI-SEC-ENG
**Prompt ejecutado:** [PROMPT-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../prompts/PROMPT-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md)
**Hallazgo:** [SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) — severidad **CRÍTICA**
**Autorización:** CTO, 2026-08-09 — ejecución inmediata, fuera del alcance de [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md)

---

## 1. Entregables

| Artefacto | Ruta | Tipo |
| --- | --- | --- |
| Componente de resaltado sin sink | `apps/web/src/components/search/SearchHighlight.tsx` | Código (nuevo) |
| Render corregido | `apps/web/src/components/search/GlobalSearchResultItem.tsx:83-89` | Código (modificado) |
| Pruebas, 11 casos | `apps/web/src/components/search/GlobalSearchResultItem.spec.tsx` | Prueba (nuevo) |
| Prueba de concepto de la cadena (C-7b) | `apps/web/src/components/search/SearchXssChainPoC.spec.tsx` | Prueba (nuevo) |

---

## 2. La corrección

**Se eliminó el sink; no se escapó.** El prompt lo pedía en ese orden de preferencia y el ejecutor lo cumplió con una razón que conviene registrar: escapar habría dejado vivo un `dangerouslySetInnerHTML` que el siguiente cambio puede volver a romper. Ahora el fragmento del motor de búsqueda **se parsea a nodos de React** —segmentos de texto y coincidencias— y se emite como estructura, nunca como marcado. **La clase de defecto desaparece en lugar de quedar contenida.**

El `className` del chip no cambió ni un carácter y el elemento de marca se emite sin clase, igual que lo producía el marcado anterior. **Cero tokens tocados; render visualmente idéntico**, verificado sobre el DOM en prueba.

### Decisión de reutilización: ni extraer ni duplicar

El prompt pedía decidir entre extraer el helper del portal a un lugar compartido o duplicarlo, justificando la elección. El ejecutor **descartó ambas**, y el argumento es correcto:

El helper del portal (`apps/portal/src/lib/api-client.ts:4032-4062`) es un **productor de string HTML**: devuelve marcado que obliga al consumidor a mantener vivo un `dangerouslySetInnerHTML`. **Extraerlo a `@iwana/ui` habría institucionalizado el sink en el design system** — convertido en compartida justo la fragilidad que C-10 señala. La implementación nueva devuelve nodos, no string: son contratos distintos, no hay lógica equivalente que compartir.

Tampoco hay duplicación real: el portal calcula el resaltado en cliente a partir de valor y consulta; la consola recibe del servidor un fragmento ya delimitado. **Entradas distintas, algoritmos distintos.** Con un único consumidor, el componente vive en el directorio de búsqueda. Si el portal migra a este patrón —la salida natural de C-10—, aparece el segundo consumidor y **ahí** corresponde consultar a AI-DS-OWNER para promoverlo al design system. Queda señalado, no ejecutado.

---

## 3. Evidencia de gates

| Comando | Resultado | `Cached: 0` |
| --- | --- | --- |
| `pnpm turbo run test --filter=@iwana/web --force` | **21 suites · 95 pruebas · todas en verde** *(corrida previa a la PoC)* | ✅ `0 cached, 2 total` |
| `test` + `lint` + `typecheck` en corrida forzada | `8 successful, 8 total` | ✅ `0 cached, 8 total` |
| Lint | 0 errores · 12 avisos, **todos preexistentes** y ninguno en archivos de este cambio | — |

**Verificación independiente de AI-EM-ARCH**, no delegada:

| Verificación | Resultado |
| --- | --- |
| `grep -rn "dangerouslySetInnerHTML" apps/web/src` | **0 coincidencias en toda la aplicación**, no solo en el directorio de búsqueda |
| `git status --porcelain -- apps/api` | **0 archivos** — backend intacto |
| Superficie del cambio | 1 archivo modificado, 2 nuevos, todos en `apps/web/src/components/search/` |
| Suite reejecutada por AI-EM-ARCH | 21 suites · 95 pruebas · `Cached: 0 cached, 2 total` *(pre-PoC)* · **corrida final con PoC: 22 suites · 111 pruebas · `Cached: 0 cached, 2 total`** |

### Control negativo — ejecutado y revertido

Se reintrodujo el sink deliberadamente y **fallaron tres pruebas**, como se esperaba:

- Carga de script → el payload se materializó como elemento del DOM.
- Carga basada en atributo de evento → mismo resultado.
- Guarda de directorio → listó el archivo infractor.

Con el archivo restaurado: **11 de 11 en verde**. La guarda de directorio compone el nombre del sink en tiempo de ejecución para no ser su propia coincidencia — detalle pequeño y correcto. Las aserciones son **estructurales** —ausencia del elemento más texto literal— y no dependen de que el entorno de pruebas ejecute el script, que no sería señal fiable.

---

## 4. Criterios de aceptación

| Id | Criterio | Estado |
| --- | --- | --- |
| CA-XSS-01 | Ningún sink de HTML crudo en el directorio de búsqueda | **Cumplido** — cero en toda la aplicación |
| CA-XSS-02 | Carga de script renderizada como texto literal | **Cumplido** |
| CA-XSS-03 | La prueba falla si se reintroduce el sink | **Cumplido**, con control negativo ejecutado |
| CA-XSS-04 | Resaltado visualmente indistinguible | **Cumplido**, verificado sobre el DOM |
| CA-XSS-05 | `apps/api` sin cambios | **Cumplido**, verificado por AI-EM-ARCH |
| CA-XSS-06 | Evidencia con `Cached: 0` | **Cumplido** |

---

## 5. Deuda y pendientes

| Id | Asunto | Severidad | Estado |
| --- | --- | --- | --- |
| ~~**C-7b**~~ | Prueba de concepto que demuestre la cadena y su cierre | — | **Cerrado el 2026-08-09 por AI-SR-QA** — PoC en `apps/web/src/components/search/SearchXssChainPoC.spec.tsx`, 16 pruebas en verde. Evidencia `Cached: 0 cached, 2 total`. Ver §6 |
| ~~**Cierre formal**~~ | Re-verificación del hallazgo | — | **Cerrado el 2026-08-09 por AI-SEC-ENG** — hallazgo H-01 cerrado formalmente. Ver [SECURITY-REVIEW §6](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) |
| ~~**C-8**~~ | Política de seguridad de contenido en ambas aplicaciones, como segunda capa | Alta | **CERRADO el 2026-08-09 por AI-SEC-ENG.** CSP vía `async headers()` en ambas `next.config.ts`; verificación de infraestructura AI-PLAT-OPS registrada (nginx no pisa ni duplica). Riesgo residual `'unsafe-inline'` aceptado. Ver §5.1 |
| ~~**C-10**~~ | El sink equivalente del portal escapa correctamente, pero la defensa es una función local custodiando HTML crudo | Media | **CERRADO el 2026-08-09 por AI-FE-PLATFORM; re-verificado por AI-SR-QA (P1–P9 del contrato, 9/9) y cerrado formalmente por AI-SEC-ENG.** El sink del portal se eliminó; `SearchHighlight` + `SearchSnippetPill` promovidos a `@iwana/ui` con contrato congelado. Ver §5.1 |
| **Borde cosmético** | Si un tenant escribe la cadena literal de la etiqueta de marca en un campo indexado, el parser la interpreta como delimitador y muestra ese tramo resaltado sin las etiquetas | Baja | **Confirmado en la PoC (C-7b).** Sin consecuencia de seguridad: no hay elementos de carga ni ejecución posible. Ver §6 |

**Nota sobre defensa en profundidad.** Esta corrección cierra **esta** cadena. **No sustituye** a C-8, que contiene las siguientes, ni a [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md), que impide que el token sea legible por script aunque una cadena futura tenga éxito. Son tres capas distintas.

### Cierre de C-8 y C-10 (2026-08-09, AI-FE-PLATFORM)

Prompt ejecutado: [PROMPT-TRANSVERSAL-CSP-Y-RESALTADO-BUSQUEDA-v1.0.md](../prompts/PROMPT-TRANSVERSAL-CSP-Y-RESALTADO-BUSQUEDA-v1.0.md). Contrato congelado: [spec DS `SearchHighlight` v1.0](../specs/2026-08-09-search-highlight-ds-contrato.md).

**C-8 — CSP como segunda capa.** Ambas apps emiten `Content-Security-Policy` vía `async headers()` en su `next.config.ts`, sin nonces, con el baseline que la documentación oficial de Next.js define para apps sin `proxy.ts`:

- `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;`
- El portal añade `https://www.gravatar.com` a `img-src`, consistente con su `images.remotePatterns`.
- **Justificación de `'unsafe-inline'` en `script-src` y `style-src`:** es *requerido* por los scripts de bootstrap inline de Next.js y los estilos inline de React; sin él, las páginas estáticas no hidratan (discusión vercel/next.js#80997). Es el baseline documentado, no un debilitamiento silencioso. El hardening con nonces vía `proxy.ts` + renderizado dinámico queda registrado como mejora futura que ADR-081 (paso 2) habilitará.
- El valor se normaliza (una sola línea) antes de emitirse. La política incluye la contención de exfiltración (`connect-src 'self'`, `object-src 'none'`) y de clickjacking (`frame-ancestors 'none'`, `base-uri 'self'`).
- **nginx no se toca**: AI-PLAT-OPS verifica que no pisa ni duplica la cabecera (Next la emite en sus respuestas HTML y el proxy la pasa al cliente).
- **Estado:** **CERRADO el 2026-08-09 por AI-SEC-ENG** (subsección de cierre formal más abajo). El cierre formal de C-8 no lo firma el productor: lo firmó AI-SEC-ENG tras re-verificación independiente, con la capa de infraestructura verificada por AI-PLAT-OPS.

**C-10 — resaltado del portal sin sink.** `SearchHighlight` se promovió de `apps/web/src/components/search/` a `packages/ui/src/components/SearchHighlight.tsx` (export hermano `SearchSnippetPill`, exports desde `packages/ui/src/index.ts`) siguiendo el contrato congelado v1.0 — **sin cambiar la lógica del parser ni del render**; el `<mark>` adopta el par tonal lima (spec §4.1). El consumidor del portal reemplazó el `span` con `dangerouslySetInnerHTML` por `<SearchSnippetPill snippet={highlight} />`; `highlightMatch`/`escapeHtml`/`compactHighlights` de `api-client.ts` se mantienen como productores de fragmento-dato. Cero `dangerouslySetInnerHTML` en los tres directorios declarados (verificado por `grep` y por la guarda de directorio en pruebas). El archivo local de web se eliminó.

**Resolución de las consultas de DS-OWNER (spec §12).** **C-1:** se adopta el par tonal lima para el `mark` (idéntico al `Badge lime`; cambio visual menor y positivo, alineado con la identidad, AA verificado). **C-2:** se consolida `SearchSnippetPill` en `@iwana/ui` en el mismo acto (mandato anti-duplicación); ambos call sites migran a `<SearchSnippetPill snippet={…} />`. **C-3:** los tests del contrato se mantienen en las apps importando de `@iwana/ui`, con la guarda de directorio extendida a `packages/ui/src/components/`; no se crea infraestructura Jest en `packages/ui` (mejora registrada).

### Cierre formal de C-8 y C-10 (2026-08-09, AI-SEC-ENG)

Re-verificación independiente ejecutada por AI-SEC-ENG con suites forzadas propias. **Veredicto del gate: APROBADO CON RIESGO RESIDUAL.**

- **Evidencia de ejecución propia:** `Cached: 0 cached, 3 total` — web **22 suites / 112 pruebas**; portal **172 suites / 1111 pruebas** (1 skip pre-existente). `grep dangerouslySetInnerHTML` en el workspace → 0; además `innerHTML`, `eval(`, `new Function`, `document.write`, `insertAdjacentHTML` → 0 en `apps/web/src`, `apps/portal/src`, `packages/ui/src`.
- **C-10:** sink eliminado por construcción; control negativo del portal efectivo (payload como texto literal, sonda intacta); contrato DS P1–P9 verificado por AI-SR-QA (9/9); tokens del `mark` exactos de la spec §4.1.
- **C-8:** política verificada con la contención esperada (`object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `connect-src 'self'`, `default-src 'self'`, `upgrade-insecure-requests`). **Riesgo residual aceptado:** el `'unsafe-inline'` de `script-src`/`style-src` **no impide la ejecución de script inline**; es el baseline oficial de Next.js sin `proxy.ts` (bootstrap inline). La contención real: exfiltración externa, clickjacking, plugins y `base-uri`. Hardening con nonces (`proxy.ts` + renderizado dinámico) como mejora futura habilitada por ADR-081, **no como condición de este cierre**.
- **Capa de infraestructura (AI-PLAT-OPS):** nginx no pisa ni duplica la cabecera; `frame-ancestors 'none'` prevalece sobre el `X-Frame-Options SAMEORIGIN` redundante (redundancia benigna).
- **Deudas registradas fuera:** hardening de CSP con nonces (AI-FE-PLATFORM, media, no bloqueante) · CSP del API vía `helmet` no alineada con la de las apps (AI-PLAT-OPS, media, pre-existente) · revisión de CSP cuando exista CDN (AI-PLAT-OPS, baja) · **ADR-081** (sesión cookie `httpOnly`) sigue siendo la capa que impide el robo de token por script aunque una cadena futura tenga éxito.

---

## 6. Prueba de concepto (C-7b) — AI-SR-QA

**Artefacto:** `apps/web/src/components/search/SearchXssChainPoC.spec.tsx` (Jest + Testing Library, co-localizado con la corrección). Se eligió un spec de Jest como PoC porque es reproducible, queda como regresión permanente y reutiliza la infraestructura del paquete; no se introdujo estructura paralela.

**Qué se demostró.**

- **La cadena, simulada.** Se reconstruyó la salida cruda del motor de búsqueda tal como la reenvía `extractHighlights` (`apps/api/src/modules/search/search.service.ts:185-222`): fragmento con la coincidencia envuelta en `<mark>...</mark>` y el resto del campo indexado sin escapar. Sobre ese fragmento se inyectaron payloads representativos: `<script>` en línea, atributo de evento `onerror` en `<img>`, `<iframe>` con URI `javascript:`, `<svg onload>`, etiqueta `<SCRIPT>` en mayúsculas, inyección de atributo sobre el propio delimitador (`<mark onerror=...>`) y una variante codificada en entidades (`&#x3C;script&#x3E;`).
- **El cierre, sobre el render real.** Render de `GlobalSearchResultItem` y de `SearchHighlight` con cada variante: el payload se muestra como **texto literal** (`textContent` contiene el marcado textual), no se materializa ningún elemento de la carga (`script`, `img`, `iframe`, `svg[onload]`), no aparece ningún atributo de evento (`[onerror]`, `[onload]`), la coincidencia legítima sigue resaltada en `<mark>`, y la sonda `window.__xssProbe` queda indefinida. Las aserciones son estructurales (ausencia de elemento + texto literal), no dependen de que el entorno de pruebas ejecute el script.
- **El control negativo.** Dentro del propio archivo, `SinkControlForPoc` reintroduce deliberadamente el sink eliminado (HTML crudo) para demostrar que la batería de aserciones detecta la clase de defecto: con el sink, cada variante **sí** materializa su elemento en el DOM y el marcado deja de ser literal. El nombre del prop se compone en tiempo de ejecución para no convertir el PoC en su propia coincidencia de la guarda de directorio.
- **El borde cosmético declarado (§5).** **Reproducido y confirmado:** si un tenant escribe la cadena literal `<mark>...</mark>` en un campo indexado, el parser la interpreta como delimitador y ese tramo se muestra resaltado sin las etiquetas. **Sin consecuencia de seguridad**: sobre el item completo no se crean elementos de carga ni atributos de evento y la sonda no se modifica. Un delimitador sin cierre (`<mark>` aislado) no matchea y se muestra literal.

**Evidencia con caché rota** (carrera completa de la suite web, corrida forzada):

| Comando | Resultado |
| --- | --- |
| `pnpm turbo run test --filter=@iwana/web --force` | **22 suites · 111 pruebas · todas en verde** (21 suites · 95 pruebas + 16 del PoC) |
| Línea de resumen de Turbo | `Cached: 0 cached, 2 total` |

**Gates complementarios de la corrida:** typecheck y lint de `apps/web` en verde (0 errores; 12 avisos, todos preexistentes y ajenos a este cambio). La guarda de directorio de `GlobalSearchResultItem.spec.tsx` sigue en verde y `grep -rn "dangerouslySetInnerHTML" apps/web/src` mantiene **0 coincidencias**.

**No cierra el hallazgo formalmente.** La re-verificación (cierre formal) es de AI-SEC-ENG.

---

## 7. Campos contables de KPI

| Campo | Valor |
| --- | --- |
| Reescrituras mayores de PRD/HLD | 0 |
| Conflictos entre agentes | 0 |
| Desempates requeridos | 0 |
| Deuda crítica al cierre | **0** — la deuda crítica que originó la fase queda cerrada |
| Deuda alta al cierre | **0** — C-8 y C-10 cerrados |
| Violaciones de boundary detectadas | 0 |
| Ampliaciones de alcance | 0 — el ejecutor respetó los límites y señaló C-10 sin ejecutarlo |

---

## 8. Recomendación de gate

**GO técnico sobre C-7, C-7b, C-8 y C-10, y cierre formal del hallazgo H-01.** El defecto crítico está corregido, verificado de forma independiente, protegido por control negativo y con prueba de concepto de AI-SR-QA que demuestra la cadena, su cierre, el control negativo y el borde cosmético. C-8 y C-10 quedaron cerrados el 2026-08-09 con veredicto de AI-SEC-ENG **APROBADO CON RIESGO RESIDUAL** (riesgo `'unsafe-inline'` aceptado y documentado; hardening con nonces como mejora futura).

**Cierre formal emitido por AI-SEC-ENG el 2026-08-09** ([SECURITY-REVIEW §6](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md)): re-verificación independiente de C-7, validación de la PoC C-7b y cierre de C-8 y C-10. El aprobador de un gate nunca es el productor del artefacto, y esta cadena la cumplió: **productor** AI-FE-PLATFORM, **PoC y control negativo** AI-SR-QA, **capa de infraestructura** AI-PLAT-OPS, **aprobador** AI-SEC-ENG, **consolidación** AI-EM-ARCH.

**Pendientes fuera de este cierre (con dueño, no bloqueantes):** hardening de la CSP con nonces cuando exista `proxy.ts` (AI-FE-PLATFORM, habilitado por ADR-081) · CSP del API vía `helmet` no alineada (AI-PLAT-OPS) · revisión de CSP ante CDN futuro (AI-PLAT-OPS) · **ADR-081** (sesión cookie `httpOnly`), la capa que impide el robo de token por script.
