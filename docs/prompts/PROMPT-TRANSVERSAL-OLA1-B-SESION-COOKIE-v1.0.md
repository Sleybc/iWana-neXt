# PROMPT — OLA1-b: access token a cookie `httpOnly` (paso 1 de la migración en dos pasos)

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH
**Decisión rectora:** [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md) **(Aprobado por el CTO, 2026-08-09)** — sus condiciones **C-1…C-9 quedan congeladas como criterios de aceptación de este encargo** (paso 2 del plan de migración del ADR)
**Destinatarios (tracks):** AI-SR-FULL (backend) · AI-FE-PLATFORM (frontend) · AI-PLAT-OPS (configuración e infraestructura) · AI-SR-QA (E2E)
**Revisor y aprobador de cierre:** AI-SEC-ENG — re-verificación independiente de C-1, C-2 y C-3 (paso 7 del plan del ADR). **El aprobador no es productor de ningún track.**
**Relacionado:** [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) (audiencias JWT, custodiada por C-1) · [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md) (primer ingreso) · [ADR-067](../adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md) (trazabilidad PII) · [SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) (cerrado; esta fase es la tercera capa de defensa) · Deuda a revisar en esta ventana: [INFORME-PROGRAMA §5.3](../informes/INFORME-PROGRAMA-REGULARIZACION-MODULOS-v1.0.md)

---

## 1. Objetivo exacto

**Resultado esperado:** ejecutar el **paso 1** de la migración de ADR-081 en ambas aplicaciones de navegador: el access token pasa a cookie `httpOnly` y **deja de existir en almacenamiento local**; la resolución de tenant se hace desde el token de la cookie; la protección CSRF se vuelve requisito duro; la consola de plataforma gana ciclo de refresco.

**Lo que sí entra (las seis decisiones del ADR):**

1. Cookie `httpOnly` de access token en `apps/web` y `apps/portal`; retiro de todo token de almacenamiento local.
2. Resolución de tenant desde el token de la cookie en `TenantMiddleware` (C-1).
3. Protección CSRF sobre todo método mutante autenticado por cookie (C-2).
4. `platform/login` emite cookie de refresh (C-6).
5. Tokens de alcance limitado (`mfa-setup`, `password-change`) fuera de almacenamiento persistente: **en memoria, nunca en storage** (decisión 6 del ADR).
6. Configuración: variable de API por aplicación (C-4), nombres de cookie por audiencia con prefijo `__Host-` en producción, `Secure` acoplado a producción en el esquema de validación (C-5).
7. Migración E2E a siembra por cookie **antes** de retirar el soporte de almacenamiento local (C-9).

**Lo que no entra:**

- **El paso 2 de la migración** (autenticación en Server Components, precarga por página). Queda habilitado, no obligado. La verificación de la dirección auditada de PII declarada pendiente en ADR-081 se ejecuta sobre la primera página migrada del paso 2, no aquí.
- Cambiar la duración del access token, el mecanismo de revocación o la separación de audiencias: **se conservan intactos** (fuera de alcance del ADR).
- El hardening de la CSP con nonces (`proxy.ts` + renderizado dinámico): es paso 2 de la migración. En esta fase solo se **revisa** (ver §8).
- Cambios de stack, boundaries de módulo o estructura de navegación.

---

## 2. Contratos congelados

| Contrato | Artefacto (ruta y versión) | Qué congela |
| --- | --- | --- |
| **Criterios de aceptación** | [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md) v1.0, Aprobado 2026-08-09 | **C-1…C-9 son los criterios de aceptación de este encargo, sin reinterpretación.** C-1, C-2 y C-3 bloquean merge; C-4, C-5, C-6 y C-9 bloquean el cierre de OLA1-b |
| **Contrato de API tipado** | DTOs de auth en `@iwana/shared` + OpenAPI comprometida | Los consumidores siguen llamando a su API tipada igual que hoy: **el transporte cambia, la superficie de la API no** (decisión 1 del ADR). Ningún endpoint cambia de contrato salvo `platform/login`, que añade emisión de cookie (no cambia su payload) |
| **Frontera de audiencias** | [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) (Aprobado) | Cookies con **nombre distinto por audiencia** (C-5); un token de tenant nunca resuelve contexto de plataforma ni viceversa |

**Re-sync:** cualquier cambio a estos contratos se coordina vía AI-EM-ARCH, se versiona y se notifica. Nunca se parchea en silencio (protocolo §3bis regla 1).

---

## 3. Estado verificado — no re-derivar

Verificado por AI-EM-ARCH sobre el código vigente el 2026-08-09. **Tres hechos difieren de lo que suponía el ADR: se declaran como correcciones y no invalidan ninguna condición.**

**Backend (`apps/api`):**

- Opciones de cookie: `REFRESH_COOKIE_OPTIONS` en `apps/api/src/modules/auth/auth.controller.ts:41-47` — `httpOnly`, `sameSite: 'strict'`, `secure` por `COOKIE_SECURE` (`=== 'true'`), `maxAge` 7 días, **`path: '/api/v1/auth'`** (la cookie de access NO puede conservar este path: debe cubrir toda la ruta del API — decisión 4 del ADR). Nombre: `REFRESH_TOKEN_COOKIE = 'refreshToken'` (línea 35).
- `login()` de tenant emite cookie (línea 96, solo sin MFA pendiente); **`platformLogin()` (líneas 122-141) NO llama a `res.cookie()`** — la consola muere cada 15 minutos sin renovación (motivo de C-6).
- `refresh()` lee y rota la cookie (líneas 159, 170); `logout()` la limpia con `path: '/api/v1/auth'` (línea 195).
- `TenantMiddleware.tryExtractJwtPayload()` (`apps/api/src/modules/tenant/tenant.middleware.ts:95-112`) lee **solo** `req.headers.authorization` (línea 96). **No lee cookies.** Fallback a `X-Tenant-Slug` en `use()` línea 61, con resolución por slug en líneas 86-92.
- **CSRF: no existe nada.** Cero coincidencias de `csrf|xsrf` en `apps/api/src`; ni `csurf` ni `csrf-csrf` en los `package.json`. Única defensa implícita: `sameSite: 'strict'` y que el access viaja por cabecera.

**Frontend:**

- Web: clave `iwana.web.access-token` (`apps/web/src/lib/api-client.ts:22`); `request()` → `authorizeAndFetch()` adjunta Bearer (línea 217) y **ya envía `credentials: 'include'`** (línea 223); refresh ante 401 en líneas 226-236.
- Portal: claves `iwana.portal.access-token` y `iwana.portal.mfa-setup-token` (`apps/portal/src/lib/api-client.ts:162,170`); Bearer en línea 433; `credentials: 'include'` en línea 442; `mfaSetup()`/`mfaVerifySetup()` hacen `fetch` directo con el token limitado (líneas 638-650, 682-695).
- **Corrección 1 al ADR:** el token `password-change` de web **no tiene clave propia** — se persiste en la misma `iwana.web.access-token` (`apps/web/src/lib/api-client.ts:351-352`). C-3 debe contemplarlo: al vaciar esa clave, el token limitado de primer ingreso debe quedar **en memoria** (el portal sí separa su clave; la asimetría desaparece con este paso).
- Ambas apps proxean `/api/v1/:path*` al API vía rewrites — el navegador ya habla con su propio origen (`apps/web/next.config.ts:64-71`, `apps/portal/next.config.ts:66-73`).

**Configuración:**

- **Una sola variable compartida `NEXT_PUBLIC_API_URL`** alimenta ambos bundles (`apps/web/next.config.ts:4`, `apps/portal/next.config.ts:4`). **Corrección 2 al ADR:** `.env.example` **no declara** `NEXT_PUBLIC_API_URL` ni `COOKIE_SECURE` — documentarlas es parte de C-4/C-5.
- Esquema de validación de env: **Joi** (no Zod) en `apps/api/src/app.config.ts:222` (`COOKIE_SECURE: Joi.boolean().default(false)`), registrado en `app.module.ts:127`. Mantener el idiom existente.

**E2E:**

- **Corrección 3 al ADR:** **no existe un helper compartido de siembra** — cada spec del portal define su `seedSession()` local o siembra inline con `page.addInitScript()` + `localStorage.setItem('iwana.portal.access-token', …)` (ejemplos: `e2e/tests/portal-crm-subscribers-pagination.spec.ts:105`, `e2e/tests/portal-assurance.spec.ts:90-93`).
- Conteo confirmado: **21 de 29** specs siembran el access token del portal (todas `portal-*.spec.ts` salvo las de login/branding). **Caso adicional fuera de las 21:** `portal-admin-first-access.spec.ts:219,348` siembra `iwana.portal.mfa-setup-token` — también migra.
- Las specs de web **no siembran token**: hacen login real vía UI (`loginAsPlatformAdmin()`, `e2e/tests/helpers/web-api-mocks.ts:384-392`). Con la cookie emitida por `platform/login` (C-6) siguen funcionando sin cambio de patrón.

---

## 4. Instrucciones por track

Los tracks 1–4 respetan el contrato congelado y corren en paralelo **con una dependencia de secuencia explícita**: el retiro del soporte de almacenamiento local (track 2) es el **punto de no retorno** y solo ocurre con el track 4 en verde (C-9). Track 5 cierra.

### Track 1 — Backend (AI-SR-FULL, con revisión de AI-SEC-ENG)

1. **Cookie de access token** (decisiones 1, 4, 5 del ADR): emitir en login de tenant y en `platform/login` (C-6). Opciones: `httpOnly`, `sameSite: 'strict'`, `secure` acoplado a producción **en el esquema de validación** (C-5: `COOKIE_SECURE` no puede quedar `false` en producción — acoplarlo en `app.config.ts`, no solo en el overlay de Compose), **`path: '/'`** (la cookie de access no hereda el `path` restringido del refresh), nombre **distinto por audiencia** (C-5) con prefijo `__Host-` en producción.
2. **Resolución de tenant desde la cookie** (C-1, bloqueante de merge): `TenantMiddleware.tryExtractJwtPayload()` debe leer el JWT de la cookie de access (además de la cabecera durante la transición) y resolver el tenant **solo desde el payload verificado**. El fallback `X-Tenant-Slug` queda reservado a las rutas públicas que ya lo exigen (`PUBLIC_ROUTES_WITH_TENANT`); **una petición autenticada de tenant nunca resuelve contexto por esa cabecera**. Escribir el **test de arquitectura** que falla si una petición autenticada resuelve por `X-Tenant-Slug`.
3. **CSRF** (C-2, bloqueante de merge): exigir una **cabecera personalizada** (patrón custom-header, p. ej. `X-Requested-With`) en todo método mutante autenticado por cookie — un guard global acotado a rutas cookie-autenticadas, sin estado ni endpoint nuevo; el navegador no adjunta cabeceras personalizadas cross-origin sin preflight, y CORS ya va con credenciales y orígenes explícitos. **Test negativo obligatorio:** petición con cookie válida y sin la cabecera → rechazo (403). Si AI-SR-FULL prefiere double-submit, consultar antes con AI-SEC-ENG — no decidir en silencio.
4. **Clientes:** los `request()` de ambas apps ya envían `credentials: 'include'` — el navegador adjunta la cookie solo (decisión 1: la API tipada no cambia para los 234+27 ficheros consumidores). Sí deben añadir la cabecera CSRF en métodos mutantes.

### Track 2 — Frontend (AI-FE-PLATFORM)

1. Retirar **todo** token de almacenamiento local en ambas apps (C-3, bloqueante de merge): `persistAccessToken`/`getStoredAccessToken` (web), `persistAccessToken`/`readStoredAccessToken` y las de MFA setup (portal) dejan de usar `localStorage`.
2. Tokens de alcance limitado **en memoria** (decisión 6): `mfa-setup` del portal y `password-change` de web (hoy en la clave de sesión, corrección 1) viven en estado del cliente; se pierden al recargar y eso es aceptado por diseño — el flujo de primer ingreso los reemite.
3. **Solo después del track 4 en verde** (C-9): retirar el soporte de lectura del token desde almacenamiento local. Hasta entonces el sistema es reversible (ADR-081, plan).
4. **Test de arquitectura** (C-3): cero coincidencias de acceso a almacenamiento local sobre claves de token en ambas apps, incluidos los alcances limitados. Verificado por test, no por revisión.

### Track 3 — Configuración (AI-PLAT-OPS)

1. **C-4:** separar la variable de URL del API por aplicación (una por app, con su default same-origin) y documentarla en `.env.example` junto a `COOKIE_SECURE` (corrección 2: hoy ausentes).
2. **C-5:** nombres de cookie por audiencia y prefijo `__Host-` en producción; verificar que nginx (`nginx/nginx.prod.conf`) reenvía `Set-Cookie` intacto en ambos vhosts (ya lo hace para el refresh — confirmarlo para la nueva cookie).
3. **Revisión de deuda §5.3 del informe de programa (checklist obligatorio, ver §8):** evaluar la alineación de la CSP del API vía `helmet` con el baseline de las apps y documentar la decisión (alinear en esta fase o diferir con fecha y justificación).

### Track 4 — E2E (AI-SR-QA)

1. **Crear el helper compartido de siembra por cookie** (corrección 3: hoy no existe) usando `context.addCookies()` con las opciones reales de la cookie, y migrar las **21 specs** del portal + `portal-admin-first-access.spec.ts` (token `mfa-setup`).
2. **Orden bloqueante (C-9):** las 22 especificaciones pasan **antes** de que el track 2 retire el soporte antiguo. Evidencia con `Cached: 0` en el informe.
3. **Revisión de deuda §5.3 (checklist obligatorio, ver §8):** junto a AI-FE-PLATFORM, revisar el estado del hardening de CSP con nonces y registrar su destino.

### Track 5 — Re-verificación y cierre (AI-SEC-ENG)

Re-verificación independiente de **C-1, C-2 y C-3** (paso 7 del plan del ADR): ejecutar los tests de arquitectura y el test negativo propios, no fiarse de la evidencia del productor. Emite el cierre formal de OLA1-b en el informe.

---

## 5. Restricciones no negociables

1. **C-1, C-2, C-3 bloquean merge.** Sin test de arquitectura de tenant, sin test negativo CSRF o con una sola clave de token en storage, no hay merge.
2. **El paso 2 de la migración no entra.** Ninguna página migra a autenticación en servidor en esta fase.
3. **La API tipada no cambia** para los consumidores; el transporte es asunto de los clientes centrales de cada app.
4. **No tocar** duración del access token, revocación ni separación de audiencias (ADR-081, fuera de alcance).
5. **No retirar el soporte antiguo antes del track 4 en verde** (C-9). El punto de no retorno es esa retirada.
6. **Cero PII y cero secretos** en logs, tests y docs; los tokens de prueba E2E son sintéticos.
7. **Idiom existente:** validación de env en Joi (no introducir Zod ahí); migraciones a mano si hubiera cambio de schema (no se espera ninguno; si aparece, detenerse y consultar).
8. **Riesgo declarado R3 del ADR:** si queda cualquier token en storage, la superficie no se cerró de verdad — el test de C-3 es la prueba, no una revisión visual.

---

## 6. Entregables

**Técnicos:**

- Backend: cookie de access por audiencia (tenant + plataforma), `platform/login` con refresh (C-6), resolución de tenant desde cookie (C-1 + test de arquitectura), guard CSRF (C-2 + test negativo), `COOKIE_SECURE` acoplado a producción en el esquema (C-5).
- Frontend: clientes API sin storage de tokens, tokens limitados en memoria, cabecera CSRF en mutantes, test de arquitectura C-3. Retiro del soporte antiguo como último commit del track.
- Config: variable de API por app documentada en `.env.example`, nombres de cookie por audiencia, verificación nginx.
- E2E: helper de siembra por cookie + 22 especificaciones migradas y en verde con `Cached: 0`.
- Suites: `pnpm test`, `pnpm lint`, `pnpm typecheck` en verde; E2E portal en verde.

**Documentales:**

- Informe de fase en `docs/informes/` con evidencia de cada C (tests de arquitectura, test negativo, conteos `Cached: 0`), el resultado de las dos revisiones de deuda §5.3, y la declaración del punto de no retorno alcanzado.
- OpenAPI actualizada si la emisión de cookie de `platform/login` se refleja en el contrato.
- Registro en el changelog del informe de programa.

---

## 7. Criterios de aceptación (= C-1…C-9 de ADR-081, congelados)

- **CA-1 (C-1, merge)** — Petición autenticada de tenant resuelve contexto solo desde el token verificado de la cookie; test de arquitectura que falla si resuelve por `X-Tenant-Slug`.
- **CA-2 (C-2, merge)** — Todo método mutante autenticado por cookie exige la protección CSRF; test negativo: cookie válida sin protección → rechazo.
- **CA-3 (C-3, merge)** — Cero coincidencias de almacenamiento local sobre claves de token en ambas apps (incluidos alcances limitados), verificado por test de arquitectura.
- **CA-4 (C-4, cierre)** — Variable de URL del API separada por aplicación; portal y consola llaman same-origin a su API con `SameSite=Strict` sin perder la cookie.
- **CA-5 (C-5, cierre)** — Cookies con nombre distinto por audiencia, prefijo `__Host-` en producción, `path` mínimo que cubra la ruta del API, `Secure` acoplado a producción en el esquema de validación.
- **CA-6 (C-6, cierre)** — `platform/login` emite cookie de refresh; la sesión de `SYSTEM_ADMIN` se renueva.
- **CA-7 (C-9, cierre)** — Helper de siembra migrado a cookies; las 22 especificaciones pasan **antes** de retirar el soporte antiguo, con evidencia `Cached: 0`.
- **CA-8 (checklist §5.3)** — Las dos revisiones de deuda de CSP documentadas en el informe de fase con decisión y fecha.

---

## 8. Checklist de deuda arrastrada a esta ventana (INFORME-PROGRAMA §5.3)

Punto de control trazado el 2026-08-09: al ejecutarse OLA1-b, estas dos deudas se **revisan** aquí. Revisar significa evaluar y documentar decisión con fecha — no necesariamente implementar.

| Deuda | Dueño | Qué se espera en esta fase |
| --- | --- | --- |
| CSP del API vía `helmet` no alineada con el baseline de las apps | AI-PLAT-OPS | Decisión documentada: alinear en esta fase o diferir con justificación y fecha |
| Hardening de CSP con nonces (`proxy.ts` + renderizado dinámico) | AI-FE-PLATFORM | Estado y destino documentados; el **cierre definitivo** es paso 2 de la migración, no esta fase |

---

## 9. Criterio de stop/go

**Detenerse si:**

- Leer la cookie en `TenantMiddleware` revela que el payload no lleva lo necesario para resolver el tenant sin cabecera → **[BLOQUEO]** a AI-EM-ARCH: toca el corazón de la multi-tenancy (R1 del ADR, severidad crítica).
- La protección CSRF exige cambiar el contrato de algún endpoint mutante existente → consultar antes; la superficie de la API no cambia en esta fase.
- Alguna especificación E2E no puede migrar a siembra por cookie sin cambiar lo que prueba → documentar y detener el retiro del soporte antiguo (C-9 manda).
- Aparece un cambio de schema de base de datos → no entra en esta fase; consultar.

**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`. Seguridad o excepción de las condiciones C: escala al CTO vía AI-EM-ARCH.

---

## 10. Criterio de salida

- [ ] CA-1, CA-2, CA-3 en verde (bloqueantes de merge)
- [ ] CA-4, CA-5, CA-6, CA-7 en verde (cierre de OLA1-b)
- [ ] CA-8: revisiones de deuda documentadas
- [ ] Re-verificación independiente de AI-SEC-ENG sobre C-1, C-2, C-3 (track 5) — **el cierre no lo firma el productor**
- [ ] Informe de fase archivado en `docs/informes/` con evidencia
- [ ] Soporte antiguo retirado como último acto, con las 22 especificaciones ya en verde (punto de no retorno declarado)
