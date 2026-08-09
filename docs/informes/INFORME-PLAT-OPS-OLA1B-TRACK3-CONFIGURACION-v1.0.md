# INFORME — PLAT-OPS · OLA1-b · Track 3 — Configuración

**Versión:** 1.0
**Fecha:** 2026-08-09
**Autor:** AI-PLAT-OPS (Platform / DevOps Engineer)
**Encargo:** [PROMPT-TRANSVERSAL-OLA1-B-SESION-COOKIE-v1.0.md](../prompts/PROMPT-TRANSVERSAL-OLA1-B-SESION-COOKIE-v1.0.md) — Track 3
**Decisión rectora:** [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md) — C-4 y C-5 (condiciones de cierre de OLA1-b)
**Destinatario del reporte:** AI-EM-ARCH (orquestador)
**Estado del track:** DONE_WITH_CONCERNS

---

## 1. Objetivo del track

Ejecutar la parte de configuración e infraestructura del paso 1 de la migración de ADR-081:

- **C-4:** separar la variable de URL del API por aplicación (hoy una sola `NEXT_PUBLIC_API_URL` se bakeaba en ambos bundles).
- **C-5 (infraestructura):** verificar que nginx reenvía `Set-Cookie` intacto en ambos vhosts para la nueva cookie de access.
- **Corrección 2 al ADR:** documentar en `.env.example` las variables ausentes (`NEXT_PUBLIC_*_API_URL` y `COOKIE_SECURE`).
- **Checklist §5.3:** documentar la decisión de la deuda CSP del API vía `helmet`.

---

## 2. Resumen por archivo

| Archivo | Qué cambió |
| --- | --- |
| `apps/web/next.config.ts` | `resolveWebApiProxyBase()` lee `NEXT_PUBLIC_WEB_API_URL` en lugar de la variable compartida. Default same-origin (`/api/v1` en el bundle) y rewrite conservado. CSP baseline intacta. |
| `apps/portal/next.config.ts` | `resolvePortalApiProxyBase()` lee `NEXT_PUBLIC_PORTAL_API_URL`. Default y rewrite conservados. CSP baseline intacta. |
| `.env.example` | Nueva sección "Sesión por cookie httpOnly (ADR-081, C-4/C-5)": declara `COOKIE_SECURE=false` con semántica, y `NEXT_PUBLIC_WEB_API_URL` / `NEXT_PUBLIC_PORTAL_API_URL` (vacías = same-origin). Placeholders sin secretos. |
| `.env.production.example` | Sustituye la única `NEXT_PUBLIC_API_URL` por `NEXT_PUBLIC_WEB_API_URL` (dominio raíz) y `NEXT_PUBLIC_PORTAL_API_URL` (`portal.`). Actualiza comentario C-4 (mismo vhost por app) y acople de `COOKIE_SECURE=true` al esquema (C-5). |
| `apps/web/Dockerfile` | `ARG`/`ENV` renombrados a `NEXT_PUBLIC_WEB_API_URL`. |
| `apps/portal/Dockerfile` | `ARG`/`ENV` renombrados a `NEXT_PUBLIC_PORTAL_API_URL`. |
| `docker-compose.prod.yml` | Build args de `web-prod` → `${NEXT_PUBLIC_WEB_API_URL:?...}` y de `portal-prod` → `${NEXT_PUBLIC_PORTAL_API_URL:?...}`. Comentario de cabecera actualizado. |
| `.github/workflows/ci.yml` | Build args sintéticos de CI → `NEXT_PUBLIC_WEB_API_URL=https://ci.invalid/api/v1` y `NEXT_PUBLIC_PORTAL_API_URL=https://ci.invalid/api/v1`. |
| `turbo.json` | Clave de caché del task `build`: `NEXT_PUBLIC_API_URL` → `NEXT_PUBLIC_WEB_API_URL` + `NEXT_PUBLIC_PORTAL_API_URL` (invalidación correcta por variable). |
| `nginx/nginx.prod.conf` | Sin cambios funcionales (ver §4). Solo comentarios documentales: `proxy_pass_header Set-Cookie` en ambos vhosts ahora documenta que cubre refresh + access por audiencia (ADR-081 C-5). |
| `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` | Sección §5.2 de interacción con rollback por digest actualizada a las dos variables por aplicación. |
| `docs/prompts/PROMPT-PLAT-OPS-RESTAURACION-PERFIL-DEV-v1.0.md` | Lista R1 de variables `${VAR:?}` que bloquean la interpolación global: `NEXT_PUBLIC_API_URL` → las dos por aplicación. |
| `.agents/skills/turborepo-caching/SKILL.md` | Ejemplo de `env` del task build actualizado a las dos variables por aplicación. |

**No tocados (superficie de otros tracks):** `apps/api/*` (Track 1), `apps/web/src/lib/api-client.ts` y `apps/portal/src/lib/api-client.ts` (FE-PLATFORM — ver §5), `e2e/*` (Track 4).

---

## 3. C-4 — Variable de URL del API por aplicación

### Esquema adoptado

| Aplicación | Variable | Default sin definir |
| --- | --- | --- |
| Consola de plataforma (`apps/web`) | `NEXT_PUBLIC_WEB_API_URL` | Bundle: `/api/v1` (same-origin) · rewrite: `http://localhost:3000/api/v1` |
| Portal de suscriptores (`apps/portal`) | `NEXT_PUBLIC_PORTAL_API_URL` | Bundle: `/api/v1` (same-origin) · rewrite: `http://127.0.0.1:3000/api/v1` |

El nombre es consistente con el contrato de cookies del ADR-081 (C-5): `webAccessToken`/`portalAccessToken` usan el mismo prefijo de audiencia (`web` = consola, `portal` = portal).

### Por qué

Con dos vhosts distintos (`REPLACE_ME_PRODUCTION_DOMAIN` y `portal.REPLACE_ME_PRODUCTION_DOMAIN`), una sola variable compartida hace que el portal bakee la URL de la consola y llame **cross-site** a su propio API: con `SameSite=Strict` el navegador no enviaría la cookie. Cada app tiene ahora SU variable, con default same-origin, y el rewrite de Next.js (dev) o nginx (prod) enrutan en el mismo origen.

### Cadena de build coherente

La variable se bakea en tiempo de build, así que el rename toca toda la cadena: Dockerfiles (ARG→ENV), build args de Compose, build args de CI y la clave de caché de Turborepo. Todos actualizados. Sin estos, el pipeline de CI quedaría roto (los build args apuntarían a una variable que ya no lee ningún bundle).

### Estado de `api-client.ts` (coordinación con FE-PLATFORM)

`apps/web/src/lib/api-client.ts:10` y `apps/portal/src/lib/api-client.ts:152` siguen leyendo `process.env.NEXT_PUBLIC_API_URL`. Ese archivo es superficie de AI-FE-PLATFORM (prohibido para PLAT-OPS). Mientras no se renombre, el comportamiento **es correcto para C-4**: sin `NEXT_PUBLIC_API_URL` definida (ya no se declara en ningún `.env*`), el cliente resuelve same-origin `/api/v1`, que es exactamente lo que exige C-4. **Recomendación al orquestador:** que FE-PLATFORM renombre esas dos lecturas a la variable de su aplicación en el Track 2, para eliminar la referencia muerta y cerrar C-4 de forma completa y verificable.

---

## 4. C-5 — Verificación nginx (infraestructura)

**Método:** inspección estática de `nginx/nginx.prod.conf` + confirmación de ausencia de transformaciones de cabeceras.

### Hallazgos

| Aspecto | Vhost principal (consola) | Vhost portal |
| --- | --- | --- |
| `location /api/` → `proxy_pass_header Set-Cookie;` | ✅ (línea ~114) | ✅ (línea ~177) |
| `proxy_hide_header Set-Cookie` | Ausente | Ausente |
| Módulo `headers-more` (`more_set_headers`/`more_clear_headers`) | No presente en el conf; imagen `nginx:1.31.2-alpine` sin módulo extra | Igual |
| `proxy_cookie_path` (reescritura de path de cookie) | Ausente | Ausente |
| `add_header` de seguridad (X-Frame-Options, etc.) | `add_header` NO elimina `Set-Cookie` (no es transformación de la respuesta del upstream) | Igual |

**Conclusión:** `Set-Cookie` llega al navegador **intacto** en ambos vhosts para cualquier cookie emitida por el API, incluida la nueva cookie de access (`webAccessToken` / `portalAccessToken`, `path: /`, `httpOnly`, `Secure` en producción). No hay ninguna transformación que pueda romper el encabezado. No se requieren cambios de configuración en nginx.

**Nota de prefijo `__Host-`:** el prefijo lo emite el backend (Track 1) en el nombre de la cookie; nginx no lo toca. La condición infra de que el `Set-Cookie` fluya intacto queda verificada.

**Evidencia adicional en el propio conf:** el comentario del vhost principal ya registraba "Verificado por AI-PLAT-OPS 2026-08-09" para la no-duplicación de CSP; se amplió para documentar el alcance de `Set-Cookie` sobre las cookies de access.

---

## 5. Checklist §5.3 — Decisiones documentadas de deuda CSP

### 5.1 Deuda: CSP del API vía `helmet` no alineada con el baseline de las apps

- **Ubicación:** `apps/api/src/main.ts:57-63` — `helmet()` con solo `crossOriginResourcePolicy` configurado; el resto usa los defaults de helmet (CSP por defecto, `frame-ancestors 'self'`, sin `connect-src` explícito, `script-src 'self'` sin `unsafe-inline`).
- **Brecha respecto al baseline de las apps:** las apps emiten `frame-ancestors 'none'`, `connect-src 'self'` y `unsafe-inline` en script/style (requerido por el bootstrap de Next). El API sirve **JSON** y no comparte esas directivas; su única respuesta HTML es Swagger UI, que **solo se habilita fuera de producción** (`NODE_ENV !== 'production'`, `main.ts:108`).
- **Decisión (2026-08-09): DIFERIR**, con justificación:
  1. El API responde JSON; la CSP de helmet en respuestas JSON no protege contenido que el navegador renderice como documento (excepto Swagger en no-prod).
  2. Alinear la CSP del API implicaría tocar `apps/api/src/main.ts`, superficie de backend **fuera del alcance del Track 3** (y del congelamiento del contrato).
  3. Riesgo bajo y pre-existente; no bloquea C-1…C-9.
  - **Re-evaluación programada:** con la habilitación del dominio productivo (ADR-070/078) o en la siguiente ventana que toque `main.ts`. Registrada como deuda con dueño AI-PLAT-OPS y revisión en la misma fecha.
- **Nota:** la instrucción del encargo exige "NO implementes el cambio de CSP sin emitir la decisión documentada". Esta decisión queda emitida aquí con fecha; no se implementa en esta fase porque tocaría backend.

### 5.2 Deuda: hardening de CSP con nonces (`proxy.ts` + renderizado dinámico)

- **Dueño:** AI-FE-PLATFORM (revisada junto a AI-SR-QA en el Track 4).
- **Estado registrado por PLAT-OPS:** fuera del alcance de este track; el cierre definitivo es el paso 2 de la migración de ADR-081. Esta fase solo la revisa; no se implementa.

---

## 6. Verificación

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/web typecheck` | ✅ en verde |
| `pnpm --filter @iwana/portal typecheck` | ✅ en verde |
| `pnpm --filter @iwana/web lint` | ✅ 0 errores (12 warnings pre-existentes) |
| `pnpm --filter @iwana/portal lint` | ✅ 0 errores (54 warnings pre-existentes) |
| `pnpm typecheck` (monorepo) | ⚠️ **Falla en `apps/api/src/modules/auth/auth.controller.ts:223`** — error **ajeno a este track**: el archivo está siendo modificado por el Track 1 (AI-SR-FULL) en paralelo (verificado con `git status`: `M apps/api/src/modules/auth/auth.controller.ts`). PLAT-OPS no toca `apps/api`. |

Ningún archivo del Track 3 introduce errores de lint o typecheck.

---

## 7. Desviaciones del contrato

- **Ninguna desviación.** El esquema de variables (`NEXT_PUBLIC_WEB_API_URL` / `NEXT_PUBLIC_PORTAL_API_URL`) respeta el contrato congelado C-4 y la convención de nombres de cookies por audiencia.
- `api-client.ts` queda con una lectura de la variable antigua (ver §3): no es una desviación del contrato, sino una **coordinación pendiente** con FE-PLATFORM cuyo comportamiento resultante ya es el exigido por C-4.
- No se crean endpoints, no se cambia la API tipada, no se toca backend, clientes de API ni e2e.

---

## 8. Riesgos / notas operativas

- **Rollback por digest (ADR-070, riesgo 3):** el runbook §5.2 quedó actualizado a las dos variables por aplicación. Cada digest de `web-prod`/`portal-prod` lleva grabada su propia variable de API.
- **Acoplamiento de interpolación de Compose (R1):** las dos variables nuevas son requisito global `${VAR:?}` igual que la antigua; el prompt operativo de restauración del perfil dev fue actualizado para que la lista siga siendo operativa.
- **CSP en nginx:** no se duplica (orden C-8); la emiten las apps. La nota de no-duplicación queda intacta y verificada.

---

## 9. Estado

**DONE_WITH_CONCERNS**

- DONE: C-4 (variables por app + documentación + cadena de build), C-5 infra (verificación nginx), corrección 2 (.env.example), checklist §5.3 documentado, lint/typecheck de los paquetes del track en verde.
- CONCERNS: (a) typecheck monorepo global falla por el Track 1 en paralelo (ajeno); (b) `api-client.ts` debe renombrar la lectura de la variable por FE-PLATFORM para cerrar C-4 con cero referencias muertas (recomendación, no bloqueante).
