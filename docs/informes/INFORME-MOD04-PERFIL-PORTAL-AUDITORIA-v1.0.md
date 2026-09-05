# INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0

**Módulo:** MOD04 Usuarios internos — superficie **frontend de perfil propio** (`/dashboard/profile` · `apps/portal/src/components/profile`)
**Fase:** Auditoría de frontend/UX (turno 2 del módulo; el turno 1 backend/datos cerró con GO el 2026-07-23)
**Modo de operación:** AI-EM-ARCH — Architect + Orchestrator
**Fecha:** 2026-09-03
**Autoría:** AI-EM-ARCH (consolidación, arbitraje y verificación de gate) sobre protocolo multiagente
**Protocolo:** [Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md) (v1.5) — etapa 6 (§3, G6) ejecutada como auditoría de solo lectura

---

## 0. Encuadre

Auditoría de solo lectura de la pantalla de perfil propio del **portal del tenant**. No se tocó código.

### El módulo se cerró sobre alcance incompleto

Esto no es un turno pendiente: es una **superficie que ningún turno cubrió** y que quedó dentro de un módulo declarado cerrado.

El HLD §3.3 declara **dos** superficies frontend para MOD04: `components/users/` (gestión de usuarios, `/dashboard/users`) y `components/profile/` (perfil propio, `/dashboard/profile`). La secuencia real fue:

| Turno | Fecha | Alcance real | Veredicto |
| --- | --- | --- | --- |
| Backend / datos / migraciones | 2026-07-23 | `apps/api/src/modules/users` | GO |
| UI/UX | 2026-07-23 | **`components/users/` únicamente** ([informe](INFORME-USUARIOS-UIUX-AUDITORIA-v1.0.md)) | GO |
| Cierre de módulo | 2026-07-23 | commit `6895d9b4` — 26 archivos | **GO de cierre completo** |
| **Perfil propio** | **nunca** | `components/profile/` | **sin auditar** |

**Verificado contra el repo, no contra el relato:** `git show --stat 6895d9b4` no toca **ni un solo archivo** de `apps/portal/src/components/profile/`. El único archivo con "Profile" en su nombre es `components/users/UserProfileFields.tsx`, que pertenece a la otra superficie.

La confusión tiene una causa nombrable, y conviene registrarla porque se repetirá: **"users" y "profile" suenan a lo mismo y no lo son**. Un turno tituló su alcance "frontend/UX del módulo Usuarios" y cubrió la mitad. El informe del turno backend §9 anticipaba *"falta su turno de frontend/UX"*; ese turno ocurrió, se firmó, y la afirmación quedó satisfecha sobre una superficie sí y otra no.

**Consecuencia de gobierno:** el GO de cierre del 2026-07-23 se emitió sobre alcance incompleto. Este informe lo **reabre** — ver §5.

**Aclaración de dominio, porque condiciona el criterio:** `apps/portal` es la **consola del tenant** (`AGENTS.md` → Project Structure, puerto 3002), no un portal de suscriptores finales. El "cliente" de esta pantalla es el **usuario de la empresa cliente**. El suscriptor ISP vive en `crm/subscribers` y no tiene login propio. Toda valoración de PII y de rol se hace bajo esa premisa.

**Despliegue multiagente (6 auditores de solo lectura, alcance disjunto):**

| Agente | Rol RACI | Alcance |
| --- | --- | --- |
| Explorador 1 | Mapa del módulo | Página App Router, grafo de imports, endpoints, estado/validación/errores, tests |
| Explorador 2 | Duplicación | Formularios gemelos, inventario de `@iwana/ui`, avatar, política de contraseñas, utilidades de formato |
| Explorador 3 | Contrato backend | Endpoints `/users/me`, `/login-email`, `/auth/change-password`, DTOs, tipos compartidos, OpenAPI |
| AI-SEC-ENG | Seguridad / PII | STRIDE, tenant isolation, IDOR, Ley 1581, CSRF/cookies, checklist ASVS L2 |
| AI-DS-OWNER | Contrato del design system | Tokens vs valores crudos, primitivas no adoptadas, dark mode, WCAG 2.2 AA, contratos faltantes |
| AI-SR-QA | Verificación | Por qué la suite no vio nada, convención de test del repo, matriz de pruebas, evidencia de gate |

**Verificación de gate (§7.4 anti-alucinación):** AI-EM-ARCH leyó de forma independiente los cuatro componentes completos, `request()` y `userApi` de `api-client.ts`, `tenant-resolution.ts`, `users.controller.ts` (`/me`), `UpdateProfileDto` y `USER_PROFILE_FIELDS`, la rama de cambio de contraseña de `auth.service.ts` en sus dos variantes, `rate-limit-tracker.ts`, `portal-ui.tsx`, el `package.json` del portal y el PRD/HLD de MOD04, y **abrió y comprobó** cada cita de mayor consecuencia antes de firmarla. Todas resistieron apertura. Dos afirmaciones de agentes fueron refutadas y una hipótesis propia fue corregida (§3).

**Estado de la base — declarado, no limpio.** `apps/portal/src/components/profile/PersonalInfoForm.tsx` está **modificado sin commitear**: corrige `updateMe(userId, dto)` → `updateMe(dto)`. Es un parche en vuelo sin informe ni turno, del mismo patrón ya registrado en Inventario. Este informe se emite sobre **HEAD más ese diff declarado** y lo trata como antecedente, no como remediación acreditada. (`api-client.ts` también figura modificado, pero por trabajo de MOD11/MOD12 ajeno a este módulo.)

---

## 1. Veredicto

**Postura general: funcional pero sin red.** La pantalla está bien construida en lo que hereda — react-hook-form + Zod en vez de estado manual, cliente HTTP central sin `fetch()` sueltos, tokens en memoria con un test de arquitectura que lo impone (`c3-no-token-storage.arch.spec.ts`), cookies `httpOnly` + `SameSite=Strict`, CSRF por cabecera personalizada, y un backend cuyo `/users/me` resuelve por `sub` del JWT sin admitir id de cliente. El pipeline de seguridad del servidor es la parte más sólida de la superficie.

**Lo que falla es la unión entre capas y la ausencia total de verificación.** No hay hallazgos críticos y **no se bloquea el merge por seguridad**. Hay **tres hallazgos Altos**: un defecto de tenancy en el cliente que TypeScript no puede ver, una cadena de apropiación de cuenta por cambio de email sin notificación, y un valor por defecto que **rompe el guardado del perfil** para todo usuario sin teléfono registrado.

El hallazgo que explica a los demás es de proceso: **la pantalla tiene cero tests, y el comando de gate que un plan vigente usa para verificarla ejecuta cero tests y sale 0** (`"test": "jest --passWithNoTests"`, `apps/portal/package.json:10`). Es la misma clase de defecto que la nota de caché de Turbo persigue en la cadena de build — una afirmación con forma de evidencia que no la respalda. Por ese hueco pasaron los tres defectos funcionales.

**Decisión del turno:** ver §5.

---

## 2. Hallazgos consolidados

Severidad = criterio EM-ARCH, que puede elevar o rebajar la de los agentes.

| ID | Sev. | Área | Archivo:línea (verificado) | Descripción | Dueño |
| --- | --- | --- | --- | --- | --- |
| **P-01** | **Alto** | Tenancy / funcional | `ProfileClient.tsx:39`; `AuthProvider.tsx:90`; `api-client.ts:5031,418,442`; `tenant-resolution.ts:73-90` | **UUID de usuario enviado como slug de tenant.** `userApi.getMe(user.id)` pasa el id donde la firma espera `tenantSlug` — el propio comentario del api-client dice *"sin param userId"*. Ambos parámetros son `string`, así que el compilador no lo ve. `normalizeTenantSlug` solo hace `trim().toLowerCase()`: el UUID pasa intacto a `X-Tenant-Slug`. Regresión del commit `d5db6239`, que cambió la firma sin actualizar los dos call sites. Impacto acotado en §3.1. | fe-platform |
| **P-02** | **Alto** | Seguridad | `users.service.ts:1094-1169` | **Cambio de email de acceso sin notificación ni re-verificación.** No avisa a la dirección anterior, no re-verifica la nueva y no resetea `emailVerified`. El email de login es el canal de recuperación de contraseña (`auth.service.ts:874-914`), de modo que quien disponga de una sesión viva y la contraseña actual reapunta ese canal **sin señal alguna para el titular**. Si la víctima es el admin principal, `syncCompanyContactEmail: true` — fijado en duro en el cliente (`PersonalInfoForm.tsx:127`) — reescribe además el contacto de la empresa. | sr-backend |
| **P-03** | **Alto** | Funcional | `PersonalInfoForm.tsx:68-69,107,33` vs `user-field-constraints.ts:20` | **El prefijo telefónico por defecto rompe el guardado.** `defaultPhone = profile.phone ?? phonePrefix` siembra el prefijo desnudo `'+57'`, que no cumple `/^\+\d{7,15}$/`. Como `if (values.phone)` lo adjunta siempre, **cualquier usuario sin teléfono guardado que edite solo su nombre recibe 400** y ve *"No fue posible guardar los cambios"*, sin pista. El Zod del cliente valida `max(20)` pero no el formato que el label promete. | fe-platform |
| **P-04** | Medio | Proceso / calidad | `apps/portal/package.json:10`; `docs/plans/2026-05-27-mod00-consolidacion-politica-mfa-en-access.md:198,292` | **Compuerta fantasma.** El script `test` lleva `--passWithNoTests`. El comando de verificación de un plan vigente apunta a `ProfileClient.spec.tsx`, **que no existe**: ejecuta cero tests y sale 0. El plan se dio por verificado con una corrida vacía. Además **16 de 32** specs E2E del portal no afirman ni cabecera ni payload. | sr-qa |
| **P-05** | Medio | Seguridad | `auth.service.ts:1010-1030` vs `:1099-1101` | **El access token sobrevive al cambio de contraseña.** La rama de tenant actualiza el hash, revoca los refresh tokens y audita, pero **no añade el `jti` en curso a la blacklist ni limpia la cookie**; la rama de plataforma sí lo hace. Ventana de 15 min para una cookie robada, justo tras el gesto con el que la víctima cree cerrar el incidente. `ChangePasswordForm` tampoco fuerza logout, a diferencia del cambio obligatorio (`change-password/page.tsx:66`). | sr-backend |
| **P-06** | Medio | Funcional | `PersonalInfoForm.tsx:104-108` vs `users.service.ts:1554-1561` | **Un campo opcional no se puede vaciar.** El cliente usa comprobación de verdad (`if (values.jobTitle)`) en vez de `!== undefined`, así que nunca transporta la intención de borrado. El backend **sí la soporta**: `if (dto.jobTitle !== undefined) user.jobTitle = dto.jobTitle ?? null`. El usuario limpia el cargo, ve *"Perfil actualizado correctamente"* y el valor sigue ahí. Confirmación falsa sobre una capacidad existente. | fe-platform |
| **P-07** | Medio | Cumplimiento | `users.service.ts:1565-1574` | **Auditoría de perfil sin `oldValue`/`newValue`** e igualmente en `fireAndForget`. Queda "quién y cuándo", no "qué cambió" — contrasta con `changeLoginEmail`, que sí registra hashes previo y nuevo. Es el residual que el turno backend dejó abierto por nombre (E-02, *"`updateMe()` sigue fire-and-forget"*). Agrava a P-10: un cambio de cédula queda auditado solo como `UserProfile UPDATE`. | sr-backend |
| **P-08** | Medio | Accesibilidad | `PersonalInfoForm.tsx:192-203,245-256`; `ChangePasswordForm.tsx:110-121` | **Los resultados de guardado no se anuncian (SC 4.1.3).** Los seis banners son `<div>` sin `role`/`aria-live`, pese a que `PortalAlert` (`portal-ui.tsx:1851`) sí es live region y `ProfileClient` la usa a tres archivos de distancia. Matiz de DS-OWNER que cambia la solución: como se montan condicionalmente, **sustituir el `div` por `Alert` no basta** — región y contenido entran al DOM en el mismo tick y el lector se pierde el anuncio. La región debe montarse vacía e intercambiar hijos. | fe-platform |
| **P-09** | Medio | Seguridad | `rate-limit-tracker.ts:30-38`; `app.module.ts:154-163` | **Cuota compartida por tenant y sin lockout por cuenta.** Para sesiones por cookie el bucket es `${tenantId}:tenant` — 100 req/min para toda la empresa; el propio comentario del código lo declara. Además `PATCH /users/:id/login-email` ejecuta `bcrypt.compare` sin throttle propio ni contador de fallos: oráculo de contraseña a unos 100 intentos/min que alimenta P-02. | sr-backend / plat-ops |
| **P-10** | Medio | Cumplimiento / PII | `users.service.ts:1627`; `user.dto.ts:240-242,309-310`; PRD-MOD04 v1.1:80,197,427,438 | **`GET /users/me` devuelve la cédula y la pantalla nunca la renderiza.** El PRD prohíbe esta exposición en **cuatro puntos distintos** ("documentNumber nunca incluido en respuestas API", "excluido de API responses"), citando minimización bajo Ley 1581. La excepción se tomó en un comentario de código. Escalado en §4. | Escalación CTO |
| **P-11** | Bajo | Duplicación / DS | `PersonalInfoForm.tsx:143-156,192-203,206,213-224,245-256,259`; `ChangePasswordForm.tsx:65-80,110-121,124`; `ProfileClient.tsx:95-102` | **El módulo reimplementa lo que el sistema ya le da.** Tres copias del par error/éxito; tres del encabezado de sección (dos completas y una degradada); el eyebrow es copia **carácter a carácter** de `FormSectionTitle` (`FormSection.tsx:17-27`), usado 20 veces en `apps/web` y **0 en portal**; un `<button>` crudo **sin `focus-visible`** en lugar de `Button variant="softDestructive"`; y la prop `loading` de `Button` (spinner + `aria-busy`, `Button.tsx:65,78-105`) ignorada en los tres submits. `settings/CompanyProfileForm.tsx:246-274` resuelve este mismo caso correctamente, en el mismo portal. | fe-platform |
| **P-12** | Bajo | Duplicación | `ProfileHeader.tsx:16,18-19` y 5 sitios más | **Seis implementaciones divergentes de iniciales de avatar** con distinto fallback (`'?'`, `'iW'`, `'U'`, email), y `@iwana/ui` no exporta `Avatar`. El avatar del header del portal ni siquiera muestra iniciales: pinta un icono genérico. El patrón `[firstName, lastName].filter(Boolean).join(' ')` aparece **22 veces**; existe `formatPortalUserTitle` (`api-client.ts:4136`) pero no está exportado. | ds-owner / fe-platform |
| **P-13** | Bajo | Código muerto / superficie | `apps/portal/src/lib/gravatar.ts`; `next.config.ts:46,93`; `ProfileClient.tsx:17` | **143 líneas de MD5 escrito a mano sin un solo importador** (verificado: cero coincidencias de import en todo el repo). Y la funcionalidad inexistente sigue costando superficie: la CSP `img-src` y `images.remotePatterns` conceden `www.gravatar.com`. El comentario *"header Gravatar"* describe un avatar que usa iniciales desde el primer día. | fe-platform |
| **P-14** | Bajo | Consistencia / seguridad | 12 superficies (ver §6 del anexo de duplicación) | **Seis políticas de contraseña divergentes para el mismo endpoint.** `ChangePasswordForm.tsx:13` acepta `currentPassword` de 1 carácter contra un backend que exige 10 (`auth.dto.ts:110-114`), y el `catch` solo mapea 401/403, así que el 400 resultante sale como error genérico. Dos flujos del **mismo portal** contra el **mismo endpoint** aplican reglas distintas: el cambio obligatorio exige complejidad NIST, el voluntario no. Y `changePasswordSchema` de `@iwana/shared` (min 8) es **más débil que el backend** (min 10): `apps/web/src/components/settings/SecuritySettings.tsx:7` lo consume y produce 400s. **Derivado (P-14b):** `ChangePasswordDto.currentPassword` lleva `@MinLength(10)` (`auth.dto.ts:110-114`) — validar longitud sobre la contraseña **actual** es un antipatrón: ese campo solo debe verificarse contra el hash. Hoy no bloquea a nadie mientras no existan contraseñas de menos de 10 caracteres en la base, pero convierte cualquier dato legado o migrado en una **cuenta que no puede cambiar su propia contraseña**, con un 400 que el cliente además colapsa en un mensaje genérico. | fe-platform / sr-backend |
| **P-15** | Bajo | UX / robustez | `PersonalInfoForm.tsx:113,134`; `ChangePasswordForm.tsx:51`; `ProfileClient.tsx:46,53,71-81` | Cuatro bordes: (a) **sin `reset()` tras guardar** — los `defaultValues` quedan obsoletos, `isDirty` sigue en true y el botón habilitado (el formulario de email sí lo hace, el de datos personales no); (b) skeleton con grid y proporciones distintas al layout real, que garantiza salto de layout; (c) tres `setTimeout` sin cleanup en unmount; (d) un `throw` cuyo mensaje descarta su propio `catch` — código inalcanzable de facto. | fe-platform |
| **P-16** | Bajo | Trazabilidad documental | `HLD-MOD04-USUARIOS-INTERNOS-v1.1.md:111,308,323`; PRD-MOD04 v1.1:230 | **El HLD describe un componente eliminado.** §3.3 y §12 listan `MfaRequiredToggle.tsx` y "toggle MFA requerido", retirado por [ADR-045](../adrs/ADR-045-Consolidacion-Politica-MFA-Global-en-Access.md) (Aprobado); un test de regresión vigente afirma **activamente su ausencia** (`portal-users.spec.ts:505`). §13 declara "sin desalineaciones conocidas". Y el PRD lista `mfaRequired` como campo auto-editable en `PATCH /users/me`, algo que el código **correctamente rechaza**: el documento legitima lo que la implementación bien hace al negar. EM-ARCH es Accountable de esta fila (RACI §2). | em-arch |
| **P-17** | Bajo | Seguridad | `tenant.middleware.ts:106-112,233-248` | **Oráculo de enumeración de tenants pre-autenticación.** En rutas públicas: 404 con el slug ecoado si no existe, 403 revelando el estado del ciclo de vida (`SUSPENDED`/`INACTIVE`/`MARKED_FOR_DELETION`), 401 si existe y opera. Un anónimo enumera qué empresas usan la plataforma y su estado comercial. | sr-backend |

### Info / riesgo aceptado (no accionable ahora)

- **Pivote de tenant para tokens de plataforma.** `tenant.middleware.ts:63` condiciona la resolución por JWT a `jwtPayload?.type === 'tenant'`; un token de plataforma cae al camino de cabecera y el tenant **sí** es input del cliente, por diseño de la consola. Contenido sobre esta superficie (`RolesGuard` exige `PlatformRole` + `type:'platform'`; `changeLoginEmail` compara identidades). **No es vulnerabilidad, pero el comentario del middleware está redactado como si la garantía fuera más amplia.** Recomendación: declararlo explícitamente en el HLD.
- **`X-Requested-With` y `/auth/refresh`.** El endpoint es `@Public()`, luego exento del `CsrfGuard`, y descansa solo en `SameSite=Strict`. No explotable hoy desde navegador; reduce el margen si `SameSite` se degradara. Deuda de defensa en profundidad.
- **`mfaRequired` ausente de `USER_PROFILE_FIELDS`** — la implementación es **más estricta que el PRD**, y correctamente: un usuario no debe poder auto-desactivar la exigencia de MFA.

---

## 3. Reclasificaciones del gate (EM-ARCH corrige a los agentes)

### 3.1 P-01 no es Crítico y no envenena la sesión global — reclasificado de Crítico a Alto

El auditor de contrato sostuvo que P-01 activaba `terminalSessionError` y forzaba un **cierre de sesión espurio en toda la aplicación**. **AI-SEC-ENG lo refutó trazando la cadena línea por línea, y acepto la refutación:** ese estado exige un **401** previo (`api-client.ts:380-385`), pero un slug inexistente corta en **404** dentro de `tenant.middleware.ts:108-110`, y el refresh automático de `api-client.ts:442` solo se dispara ante 401. La sesión global no se envenena.

Lo mantengo en **Alto por impacto funcional**, no de seguridad, y con este alcance exacto:

- **Con cookie de access válida** (el caso normal): `tenant.middleware.ts:63-75` resuelve por JWT verificado y **descarta la cabecera**. La pantalla funciona. Por eso nadie lo notó.
- **Al expirar la cookie** (TTL 15 min): la petición sale con el UUID, recibe 404, y el botón "Reintentar carga" vuelve a devolver 404.
- **Y solo para usuarios no-ADMIN.** Un ADMIN dispara además `dashboardApi.getSummary()` (`ProfileClient.tsx:40`), que sí lleva slug correcto, recibe 401 y refresca la cookie de rebote. El no-ADMIN no tiene esa segunda petición: su pantalla queda inservible hasta navegar a otra ruta.

**No hay cross-tenant.** Queda descartado con evidencia, no por ausencia de prueba.

### 3.2 P-10: rechazo la disposición propuesta por SEC-ENG, y también mi propio arbitraje preliminar

SEC-ENG recomendó **retirar `documentNumber` de `UserResponseDto`**. Mi primera lectura fue la contraria — exponerlo en la UI —, apoyándome en que el CTO ya había aceptado el riesgo el 2026-07-23 (E-05) y en que aquí el titular ve su propio dato.

**Ambas posturas son improcedentes como decisión de este perfil.** Al abrir el PRD se comprueba que la prohibición no es un descuido: está escrita **cuatro veces** (líneas 80, 197, 427, 438) y anclada a minimización bajo Ley 1581. Y la aceptación del CTO fue **acotada a `findAll`** — su propio residual pedía *"no propagar la cédula fuera de la superficie ADMIN del tenant"*. Extender esa aceptación a `/users/me` sería precisamente sintetizar una respuesta conveniente entre dos fuentes que no concuerdan.

**Disposición: no decido. Escalo (§4).** Un cambio de campo de perfil no justifica que este perfil se arrogue una excepción de cumplimiento.

### 3.3 Resuelvo el `[BLOQUEO]` de AI-SR-QA sobre la semántica de borrado (P-06)

SR-QA retuvo el caso de prueba PIF-03 antes que codificar una suposición propia como criterio de aceptación. Procede, y se resuelve así:

> **`undefined` significa "no tocar"; `null` significa "borrar"; `''` no es un valor válido y no se envía.**

El backend ya implementa exactamente esta semántica (`users.service.ts:1554-1561`). Falta que el cliente emita `null` al vaciar un campo y que el DTO admita `null` explícitamente en los campos que llevan `@Matches` — con `@IsOptional()` a secas, `phone: null` no atraviesa el validador. Con esto SR-QA puede escribir PIF-03.

### 3.4 Resuelvo el escalamiento E-01 de AI-DS-OWNER sin abrir turno de PROD-UX

El punto verde de "en línea" (`ProfileHeader.tsx:30`) codifica un estado que el modelo de datos no tiene, carece de alternativa textual, contrasta 1,74:1 y **contradice el badge real** cuando el usuario está `SUSPENDED`. La matriz §5 del perfil atribuye a EM-ARCH la aprobación de especificación UX/UI contra el PRD, así que no necesita turno de PROD-UX.

**Disposición: retirar.** Si en el futuro se quiere señal de presencia, exige dato real en el modelo y alternativa textual.

### 3.5 Corrijo una hipótesis propia de la primera pasada

Supuse que `h-4.5` (`PersonalInfoForm.tsx:215`) podía ser una clase inválida. **DS-OWNER lo compiló con el motor instalado (Tailwind 4.2.1) y emite 18px**: la escala dinámica de v4 acepta decimales. La clase es válida; el hallazgo correcto es normalización de escala — es el único `4.5` del repo frente a 101 usos de `3.5` —, no clase muerta. Queda dentro de P-11.

### 3.6 Lo que decidí NO elevar

- **Ausencia de `middleware.ts` en el portal** (gating de rutas 100% cliente): SEC-ENG lo dejó en Bajo y coincido. Los datos llegan por fetch autenticado y el RSC no renderiza PII; el riesgo es un destello del shell, no una fuga.
- **IDOR en `PATCH /users/:id/login-email`:** descartado con evidencia. `users.service.ts:1107-1109` compara identidades **antes** del `bcrypt.compare`, así que un ADMIN recibe 403 igual que cualquiera. No es hallazgo.
- **PII en el audit trail:** la denylist de `audit-sanitize.policy.ts:11-88` es exhaustiva y se aplica en interceptor y servicio. No es hallazgo.

---

## 4. Escalación al CTO

### 4.1 P-10 — RESUELTA (CTO, 2026-09-03)

> **DECISIÓN DEL CTO:** *"La cédula es necesaria verla, se asume que cada usuario lo manejará responsablemente."*

**Opción 2 adoptada — el documento se expone y se hace editable en el perfil propio.** Coincide con la recomendación de este informe. Artefactos emitidos en el mismo acto, para no dejar el corpus contradictorio:

| Artefacto | Estado | Qué fija |
| --- | --- | --- |
| [ADR-086](../adrs/ADR-086-Acceso-Titular-Documento-Perfil-Propio.md) (propuesto) | Propuesto — pendiente de firma del CTO | La distinción que el corpus no tenía escrita: **el titular viendo su propio dato no es proyección a terceros**. ADR-067 gobierna listados y su cláusula 3 lo acota deliberadamente; bajo Ley 1581 art. 8, el acceso y la rectificación por el titular son derechos suyos, no una cesión sujeta a minimización |
| [PRD-MOD04 v1.2](../prds/PRD-MOD04-USUARIOS-INTERNOS-v1.2.md) | Vigente | Marca **superadas** las cuatro afirmaciones que decían "nunca incluido en respuestas API" — falsas desde antes de esta auditoría — y retira `mfaRequired` de RF-USR-10, que el código correctamente rechaza |

**Dos condiciones que la decisión arrastra, y que no son opcionales:**

1. **ADR-086 (propuesto) §4 — la UI debe renderizarlo.** La autorización está atada a la finalidad. Un campo que viaja al cliente y no se muestra vuelve a ser exposición sin propósito y **no queda cubierto**. Si la UI no expone el campo, la proyección se retira con ella.
2. **ADR-086 (propuesto) §5 depende de cerrar P-07.** Hoy `PATCH /users/me` audita sin `oldValue`/`newValue` y en `fireAndForget`: un cambio de documento queda registrado solo como `UserProfile UPDATE`. Sin esa corrección, la rendición de cuentas que sostiene esta autorización no es verificable.

`DT-01` (PII sin cifrado en reposo) sigue abierto y esta decisión no lo relaja.

---

### 4.2 Escalación viva

```text
[ESCALACION AL CTO]
Prioridad: Media (cumplimiento, no seguridad rota) — RESUELTA 2026-09-03, ver §4.1
Contexto: GET /users/me devuelve documentNumber (cédula) al navegador en cada carga de
  /dashboard/profile, y la pantalla nunca lo renderiza — viaja sin finalidad. El PRD-MOD04 v1.1 lo
  prohíbe en cuatro puntos (80, 197, 427, 438) invocando minimización bajo Ley 1581. La decisión de
  aceptación de riesgo del 2026-07-23 (E-05) cubrió findAll para la superficie ADMIN, y su propio
  residual pedía no propagar la cédula fuera de ella. Perfil propio es superficie distinta.
  Agravado por P-07 (el cambio no audita valores) y por DT-01 del PRD (sin cifrado at-rest).
Opciones (máx. 3):
  1. Retirar documentNumber de la proyección de /users/me. Cierra la contradicción con el PRD sin
     tocarlo; obliga a barrer qué otras superficies lo consumen.
  2. Exponerlo en el formulario de perfil. El dato pasa a tener finalidad — el titular ejerce acceso
     y rectificación (Ley 1581 art. 8) — y cierra de paso la asimetría de que el backend acepta 7
     campos editables y la UI muestra 4. Exige ADR con finalidad declarada y bump del PRD.
  3. Aceptar el riesgo también en perfil propio, con bump del PRD que marque las cuatro líneas
     como superadas.
Recomendación: Opción 2. Es la única que convierte una exposición sin propósito en un derecho
  ejercitable, y la que deja el corpus coherente en lugar de acumular una segunda excepción tácita.
  Cualquiera de las tres exige tocar el PRD: hoy hay un artefacto normativo vigente que el código
  contradice cuatro veces sin marcador.
Decisión requerida antes de: emitir la parte de P-10 de PROMPT-MOD04-PERFIL-SEGURIDAD-v1.0.
```

```text
[ESCALACION AL CTO]
Prioridad: Baja (lenguaje visual global)
Contexto: 44 radios arbitrarios en portal+web+ui (26x rounded-[20px], 6x [28px], 6x [18px], 3x
  [24px], y [32px]/[26px]/[14px]) sin token que los cubra — la escala va de --radius-xl (16px) a
  --radius-2xl (24px). Y tres definiciones paralelas del mismo eyebrow: .portal-eyebrow
  (globals.css:241, 10px, 59 archivos), FormSectionTitle (11px, 0.22em, 20 usos) y las copias a
  mano de este módulo. Cambiar tokens de marca no es competencia de este perfil (§5).
Opciones (máx. 3):
  1. Añadir un escalón --radius-* intermedio con justificación y plan de migración.
  2. Migrar los 44 usos a la escala vigente.
  3. Congelar el estado actual y documentar la excepción.
Recomendación: Opción 2 para los radios, y unificar el eyebrow en FormSectionTitle retirando
  .portal-eyebrow. Ambas en turno propio: son unas 80 llamadas y exceden este módulo.
Decisión requerida antes de: la ola 1 de PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0, que es donde se
  crea SectionHeader y se fijan sus radios. Parchear solo profile/ crearía una tercera isla, así que
  ese prompt lo deja explícitamente fuera y usa la escala vigente (rounded-xl). La decisión del CTO
  no bloquea esa ola: la desbloquea para el resto del repo.
```

Ninguna otra escalación: no hay vulnerabilidad crítica ni excepción de seguridad que aprobar.

---

## 5. Decisión de turno (go/no-go)

**Turno de auditoría del perfil propio: CERRADO.** Cumplió su objetivo — mapa completo, hallazgos verificados, cero críticos, dos refutaciones y una autocorrección registradas.

**Cierre del módulo Usuarios: REABIERTO — NO-GO.** No es que el módulo "no cierre todavía": es que **ya se declaró cerrado el 2026-07-23 sin haber auditado esta superficie** (§0). El GO de aquel día conserva su validez sobre lo que sí cubrió — backend y `components/users/` —, y queda **superado como cierre de módulo**. Condiciones para volver a emitirlo:

- **Bloqueantes de cierre:** P-01, P-02, P-03 (los tres Altos).
- **Requisito de merge-gate:** P-04 — el gate 4 del protocolo (cobertura ≥80% en módulos core) **no está cumplido ni es verificable** mientras el script arrastre `--passWithNoTests`. Una cifra de cobertura sin corrida real se reporta como *no verificada*, no como cumplida.
- **Requisito de gate 9 (WCAG 2.2 AA):** P-08.
- **Recomendado antes de cierre:** P-05, P-06, P-07, P-09; y P-10 según la decisión del CTO.
- **Diferible a limpieza:** P-11 a P-17.

**Autoridad de la remediación.** P-01, P-03, P-06, P-08, P-11, P-13 y P-15 **no requieren ADR ni CTO**: corrigen código contra contratos ya vigentes, o adoptan primitivas que el design system ya expone. P-02, P-05, P-09 y P-17 endurecen controles sin cambiar arquitectura — competencia de EM-ARCH con revisión de SEC-ENG. Solo P-10 y los tokens de marca están escalados.

**Nota sobre el diff en vuelo:** el parche no commiteado de `PersonalInfoForm.tsx` corrige la mitad de un defecto hermano de P-01 (`updateMe`), pero **no** P-01 mismo, que vive en `getMe` — verificado sobre el árbol de trabajo actual: las dos llamadas siguen pasando el UUID. Debe entrar al mismo commit que la remediación, con su test, o se pierde la trazabilidad de por qué se tocó.

### 5.1 Corrección de proceso — cómo se perdió una superficie entera

El defecto de gobierno de §0 no fue negligencia de nadie: fue un **alcance declarado por nombre en vez de por ruta**. Un turno titulado "frontend/UX del módulo Usuarios" suena exhaustivo, y cubrió `components/users/` dejando fuera `components/profile/`. El nombre del turno no dejaba ver el hueco, y el informe de cierre no enumeró las superficies contra las que se estaba firmando.

Dos correcciones, ambas baratas y aplicables ya:

1. **Todo turno de auditoría declara su alcance por rutas concretas**, no por nombre de módulo. "Auditar Usuarios" no es un alcance; `apps/api/src/modules/users` + `apps/portal/src/components/users` sí lo es — y hace visible lo que falta.
2. **El informe de cierre de módulo enumera las superficies del HLD y marca cuál turno cubrió cada una.** Una superficie sin turno asociado bloquea el GO. Aplicado a MOD04, esta tabla habría impedido el cierre del 2026-07-23 en el acto.

Esta corrección es del mismo linaje que P-04: en ambos casos existía una forma de evidencia — un GO firmado, un `pnpm test` en verde — que no respaldaba lo que aparentaba respaldar.

---

## 6. Prompts de ejecución (delegación — sin prompt no hay implementación, G4)

Emitidos como artefactos propios en `docs/prompts/`. Los ejecuta el usuario lanzando a los agentes entre turnos; este informe es el handoff.

> **La secuencia, las dependencias entre tracks y los criterios de entrada y salida por ola viven en el [plan de fase](../plans/2026-09-03-mod04-perfil-remediacion.md).** Un prompt dice *qué* hace un agente; el plan dice *cuándo entra, contra qué contrato y qué no debe tocar*. Ningún track arranca sin leer los dos.

| Prompt | Destinatario | Cubre |
| --- | --- | --- |
| [PROMPT-MOD04-PERFIL-P0-v1.0](../prompts/PROMPT-MOD04-PERFIL-P0-v1.0.md) | AI-FE-PLATFORM | P-01 (los dos call sites), P-03, P-06, P-15 |
| [PROMPT-MOD04-PERFIL-SEGURIDAD-v1.0](../prompts/PROMPT-MOD04-PERFIL-SEGURIDAD-v1.0.md) | AI-SR-FULL | P-02, P-05, P-07, P-09, P-17, y P-10 tras decisión del CTO |
| [PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0](../prompts/PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0.md) | AI-FE-PLATFORM | P-08, P-11, P-13, P-14 — contra la spec congelada. Dos olas |
| [PROMPT-MOD04-PERFIL-TESTS-v1.0](../prompts/PROMPT-MOD04-PERFIL-TESTS-v1.0.md) | AI-SR-QA | P-04 y la matriz de pruebas del módulo |
| [PROMPT-TRANSVERSAL-AVATAR-CONTRATO-v1.0](../prompts/PROMPT-TRANSVERSAL-AVATAR-CONTRATO-v1.0.md) | AI-DS-OWNER → AI-FE-PLATFORM | **P-12**, retirado del anterior a turno propio (§6.1) |

**Contrato congelado** para el de consolidación: [2026-09-03-contrato-formstatus-sectionheader.md](../specs/2026-09-03-contrato-formstatus-sectionheader.md) **v1.0**.

### 6.1 P-12 sale a turno propio (decisión del 2026-09-03)

`Avatar` era la ola 3 del prompt de consolidación y se retira de él. Es la única pieza del lote que **no arregla ningún defecto funcional ni de seguridad** y a la vez la que más superficie de regresión toca — seis implementaciones en dos aplicaciones. Mantenerla dentro convertía un prompt acotado al perfil en uno que cruza medio repositorio.

Además exige un acto previo que no puede saltarse: **el contrato de DS-OWNER antes del código**. Crear un componente del design system sin contrato es precisamente lo que produjo las seis divergencias; arreglarlas repitiendo el gesto sería el mismo error con mejor intención. El turno queda ordenado en dos actos —contrato, luego migración— y con una regla de coordinación explícita: no tocar `components/profile/` mientras el turno de perfil siga abierto.

---

## 7. Deuda diferida fuera de turno

Registrada con dueño, **no auditada aquí** (regla de completitud: no se abren módulos fuera de turno):

| Deuda | Alcance | Dueño |
| --- | --- | --- |
| 16 specs E2E del portal ciegos a cabecera y payload | `e2e/tests/portal-*.spec.ts` | sr-qa |
| Migración de banners inline fuera de `profile/` | 21 de error + 10 de éxito en `apps/portal` | fe-platform |
| Gemelo cross-app `apps/web/src/components/profile/ProfileForm.tsx` | 562 líneas con los tres schemas redeclarados | fe-platform |
| 85 `instanceof ApiError` sin `resolveApiErrorMessage` central | `apps/portal` | fe-platform |
| `api-client.ts` monolítico (unas 5.100 líneas, 277 KB) | `apps/portal/src/lib` | fe-platform |
| Etiquetas divergentes del mismo enum entre portal y web (`NOC`, `SUPPORT`, `TECHNICIAN`) | `lib/user-labels.ts` en las dos apps | ds-owner |
| Sin OpenAPI comprometida para `/users/me`, `/login-email`, `/auth/change-password` | `apps/api/openapi/` | sr-backend |

El último merece nota: `apps/api/openapi/` contiene **un solo archivo** (`tasks-execution-orders.v1.json`) y no cubre ninguno de los endpoints de este módulo. El gate 5 ("OpenAPI actualizada") no aplica aquí porque no se añaden endpoints, pero el residual E-03 del turno backend sigue vivo.

---

## 8. Contabilidad de deuda por severidad

| Severidad | Abiertos | IDs |
| --- | --- | --- |
| Crítico | 0 | — |
| Alto | 3 | P-01, P-02, P-03 |
| Medio | 7 | P-04, P-05, P-06, P-07, P-08, P-09, P-10 |
| Bajo | 7 | P-11, P-12, P-13, P-14, P-15, P-16, P-17 |
| Info / aceptado | 3 | pivote de tenant plataforma, `/auth/refresh` fuera de `CsrfGuard`, `mfaRequired` no editable |

**Instrumentación de KPIs.** Latencia de gates y cola de desempates: sin instrumentar en este turno (auditoría, no fase de implementación). Reescrituras de PRD/HLD: **2 previstas** (P-16 y la resultante de la escalación P-10). Desempates emitidos: **0**; refutaciones entre agentes resueltas por consolidación: **2**; autocorrecciones de EM-ARCH: **1**.

---

*Fin del informe (v1.0). Consolidado, arbitrado y verificado por AI-EM-ARCH. Cada finding se comprobó contra el repo antes de firmarlo; ninguna afirmación proviene sin verificar del reporte de un agente, y las dos que no resistieron verificación están registradas como reclasificaciones en §3.*
