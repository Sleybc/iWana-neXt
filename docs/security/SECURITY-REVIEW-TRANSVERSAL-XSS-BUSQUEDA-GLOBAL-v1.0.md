# SECURITY REVIEW — XSS almacenado en la búsqueda global de la consola de plataforma

**Versión:** 1.0
**Estado:** **CERRADO (2026-08-09)** — C-7 y C-7b corregidos y verificados; cierre formal firmado por AI-SEC-ENG
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

El programa **no está en producción** ([ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md), Aprobado) pero **sí procesa PII real** ([ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)*). La exposición actual es acotada, y esa es exactamente la razón para corregirlo ahora: el coste es una función de escapado, y crece con cada módulo que se construya encima.

---

## 4. Corrección requerida

| Id | Acción | Responsable | Bloqueante de |
| --- | --- | --- | --- |
| ~~**C-7**~~ | ~~Escapar o eliminar el `dangerouslySetInnerHTML`~~ · **CORREGIDO el 2026-08-09 por AI-FE-PLATFORM.** Se eligió **eliminar el sink**, no escaparlo: el fragmento se parsea a nodos de React y **el marcado deja de interpretarse como marcado**. Detalle en [INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../informes/INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) | AI-FE-PLATFORM | **Cerrado** |
| ~~**C-7b**~~ | ~~Prueba de concepto que demuestre la cadena y su cierre~~ · **CERRADO el 2026-08-09 por AI-SR-QA, validado por AI-SEC-ENG.** `SearchXssChainPoC.spec.tsx` (16 pruebas, `Cached: 0 cached, 2 total`). Control negativo genuino: `SinkControlForPoc` reintroduce el sink solo en componente de prueba aislado; sin residuo en producción | AI-SR-QA | **Cerrado** |
| **C-8** | `Content-Security-Policy` en ambas aplicaciones Next, vía `async headers()` o nginx, como segunda capa | **AI-FE-PLATFORM** + **AI-PLAT-OPS** | Puede cerrarse en OLA1-b o en el frente de hardening, **pero debe quedar con dueño, no diferida sin destino** |
| **C-10** | Revisar el sink equivalente del portal (`api-client.ts:4032-4062`): hoy escapa correctamente, pero la defensa es una función local de seis líneas custodiando un sink de HTML crudo. Frágil por construcción | AI-FE-PLATFORM | No bloqueante |

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
