# PROMPT — MOD04 Perfil: endurecimiento de credenciales y auditoria

**Agente destinatario:** AI-SR-FULL (con revision de AI-SEC-ENG antes de cerrar)
**Modulo:** MOD04 Usuarios internos — superficie backend de perfil propio y credenciales
**Emitido por:** AI-EM-ARCH · 2026-09-03 · gate G4
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) — hallazgos P-02, P-05, P-07, P-09, P-17, P-10

---

## 1. Objetivo exacto de la fase

Cerrar la cadena de apropiacion de cuenta por cambio de email, alinear la invalidacion de sesion del tenant con la de plataforma, y pagar el residual de auditoria que el turno backend anterior dejo abierto por nombre.

**Ninguno de estos cambios altera arquitectura, boundaries ni multi-tenancy.** Son controles que endurecen politica ya aprobada. **P-10 y la Ola 2 fueron decididos por el CTO el 2026-09-03** y estan incorporados como Pasos 6 y 7: ya no hay nada retenido en esta fase.

## 2. Artefactos de entrada obligatorios

1. `AGENTS.md`; `docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.2.md`; `docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.2.md` — **usa las v1.2**, que recogen las decisiones del CTO del 2026-09-03; las v1.1 estan superadas.
2. El informe de origen — §2 y §4 (escalaciones).
3. [INFORME-USUARIOS-AUDITORIA-BACKEND-v1.0](../informes/INFORME-USUARIOS-AUDITORIA-BACKEND-v1.0.md) §9: los residuales que quedaron abiertos. P-07 es literalmente uno de ellos.
4. Skills: `nestjs-expert`, `auth-implementation-patterns`, `backend-security-coder`, `security-auditor`.

## 3. Instrucciones

### Paso 1 — P-02 (Alto): el cambio de email de acceso no avisa a nadie

`apps/api/src/modules/users/users.service.ts:1094-1169` cambia el email de login sin notificar a la direccion anterior, sin re-verificar la nueva y sin resetear `emailVerified`. Como el email de login **es** el canal de recuperacion de contrasena (`auth.service.ts:874-914`), quien tenga una sesion viva y la contrasena actual reapunta ese canal en silencio.

Implementa los tres controles:

1. **Aviso a la direccion anterior**, no bloqueante para la operacion. Contiene que el email de acceso cambio, cuando, y a quien contactar. **Nunca** incluye el email nuevo completo ni PII adicional.
2. **`emailVerified = false`** y disparo de la re-verificacion del nuevo email, reutilizando el flujo existente (`resendVerification`). Decide y **documenta** si el acceso queda condicionado a verificar: mi recomendacion es que **no** lo quede — degradaria el login por un cambio legitimo —, pero que la UI muestre el estado no verificado.
3. `syncCompanyContactEmail` deja de fijarse en duro en el cliente (`PersonalInfoForm.tsx:127`). El servidor decide si procede segun si el actor es el admin principal; el cliente no impone un efecto colateral sobre `public.tenants`. Coordina con AI-FE-PLATFORM el retiro del booleano.

### Paso 2 — P-05 (Medio): el access token sobrevive al cambio de contrasena

Compara `auth.service.ts:1010-1030` (rama tenant) con `:1099-1101` (rama plataforma). La segunda hace `redis.set('jti:blacklist:'+actor.jti, …, 'EX', remainingTtl)`; la primera no.

Replica esa invalidacion en la rama de tenant y **limpia la cookie de access** en la respuesta. La asimetria no tiene justificacion documentada: el comentario que la razona pertenece al token de alcance limitado, no a este flujo. Si al abrirlo concluyes que la asimetria **si** era deliberada, no la cambies: emite `[CONSULTA]` a AI-SEC-ENG con la cita.

Coordina con FE-PLATFORM: tras el cambio voluntario, `ChangePasswordForm` debe cerrar sesion, como ya hace el cambio obligatorio (`apps/portal/src/app/auth/change-password/page.tsx:66`).

### Paso 3 — P-07 (Medio): auditoria del perfil sin valores y en fire-and-forget

`users.service.ts:1565-1574` registra `UPDATE / UserProfile` sin `oldValue` ni `newValue`, y en `fireAndForget`. Incumple CA-08 del PRD, y es el residual E-02 que el turno anterior dejo nombrado.

- Pasa a `await` **dentro** de `runInTenantSchema`, igualando a `create/update/remove/resetPassword`, que ya se corrigieron en el turno anterior.
- Registra que cambio. La denylist de `audit-sanitize.policy.ts:11-88` ya redacta la PII, asi que puedes pasar los valores; si prefieres no persistir ni el hash, usa el patron `{campo: 'changed'}`. **Decide y justifica**: lo que no es aceptable es seguir sin saber que se toco.

### Paso 4 — P-09 (Medio): cuota por tenant y ausencia de lockout

`apps/api/src/common/rate-limit-tracker.ts:30-38` usa `${tenantId}:tenant` para sesiones por cookie — 100 req/min para toda la empresa; el propio comentario lo declara como limitacion. Cambialo a bucket por **`sub` del token verificado**, que en ese punto ya esta disponible por el orden del pipeline (verificalo antes de asumirlo).

Anade ademas `@Throttle` estricto y contador de fallos por cuenta en **todo endpoint que valide `currentPassword`**: `PATCH /users/:id/login-email` y `POST /auth/change-password`. Sin esto, P-02 tiene un oraculo de contrasena a unos 100 intentos/min.

### Paso 5 — P-17 (Bajo): oraculo de enumeracion de tenants

`tenant.middleware.ts:106-112,233-248` distingue en rutas publicas 404 (con el slug ecoado), 403 (revelando `SUSPENDED`/`INACTIVE`/`MARKED_FOR_DELETION`) y 401. Un anonimo enumera empresas y su estado comercial.

Unifica la respuesta en rutas publicas y mueve el detalle al log del servidor. **Cuida el efecto colateral**: hoy el portal distingue esos codigos para mostrar mensajes utiles en login; coordina con FE-PLATFORM antes de uniformar, o degradaras la experiencia de un tenant legitimo mal escrito.

### Paso 6 — P-10: RESUELTO por el CTO (2026-09-03) — **no retires el campo**

**Decision:** el documento **se conserva** en la proyeccion y pasa a ser visible y editable por su titular. Formalizada en [ADR-086](../adrs/ADR-086-Acceso-Titular-Documento-Perfil-Propio.md) (propuesto) y [PRD-MOD04 v1.2](../prds/PRD-MOD04-USUARIOS-INTERNOS-v1.2.md), que marca superadas las cuatro lineas que lo prohibian.

**Tu trabajo aqui es ninguno sobre el DTO** — no toques `toDto` ni `UserResponseDto`. Lo que si te corresponde es la condicion que la decision arrastra:

> **ADR-086 (propuesto) §5 depende de que cierres P-07** (Paso 3). Sin `oldValue`/`newValue` en la auditoria del perfil, un cambio de documento de identidad queda registrado solo como `UserProfile UPDATE`, y la rendicion de cuentas que sostiene esta autorizacion no existe. **Con la decision del CTO, el Paso 3 deja de ser "recomendado" y pasa a ser condicion de cumplimiento.**

La exposicion en la UI la implementa AI-FE-PLATFORM (Paso 5 de su prompt). No dupliques ese trabajo.

### Paso 7 — Ola 2 aprobada: endurecer la politica de contrasenas en el servidor

**Aprobado por el CTO el 2026-09-03.** AI-FE-PLATFORM sube la fuente unica a `@iwana/shared` (min 10 + complejidad NIST) en su prompt de consolidacion. **Sin respaldo del servidor esa politica es cosmetica**: hoy `ChangePasswordDto.newPassword` solo valida longitud, asi que cualquiera con `curl` la salta.

1. Alinea `ChangePasswordDto.newPassword` con el schema compartido: min 10, max 128 **y complejidad**. No rompe a nadie — la validacion aplica al **fijar** una contrasena, no al verificarla en login, asi que las credenciales existentes siguen funcionando.
2. **Retira `@MinLength(10)` de `currentPassword`** (`auth.dto.ts:110-114`). Validar la longitud de la contrasena **actual** no aporta seguridad — el servidor la compara contra un hash — y convierte cualquier credencial legada corta en una **cuenta que no puede cambiar su propia contrasena**, con un 400 que el cliente ademas colapsa en un mensaje generico. Dejala en `@IsString()` + `@IsNotEmpty()`.
3. Revisa que ninguna otra ruta de creacion de credencial quede por debajo de la politica (bootstrap, reset, password temporal generada).

## 4. Restricciones no negociables

1. **Tenant desde JWT, nunca desde input.** Ningun cambio de este prompt debe ampliar el camino de resolucion por cabecera.
2. Sin PII real ni credenciales en logs, tests, fixtures ni correos de aviso.
3. Migraciones, si las hubiera, reversibles y con `down()` ejercitado. Este prompt no deberia necesitar ninguna: si crees que si, `[CONSULTA]` antes de escribirla.
4. No cambies contratos de respuesta salvo los codigos nuevos que introduzcas, y declaralos.
5. Comunicacion inter-modulo por interfaces tipadas o eventos BullMQ. El correo de aviso del Paso 1 sale por el canal existente, no por una integracion nueva.

## 5. Entregables

- Codigo de los pasos 1 a 5.
- Tests que fijen cada invariante: que el cambio de email dispara el aviso y resetea `emailVerified`; que tras cambiar la contrasena el `jti` anterior queda en blacklist; que la auditoria del perfil persiste dentro de la transaccion y falla la operacion si no puede escribirse; que el bucket de rate limit discrimina por sujeto.
- Reporte de fase con las decisiones justificadas (verificacion obligatoria o no; valores vs `changed` en auditoria) y `[CONSULTA]` emitidas.
- **Revision de AI-SEC-ENG** sobre el diff antes de cerrar: la fase toca superficie de autenticacion, y el protocolo exige revision reforzada.

## 6. Evidencia de gate exigida

```bash
pnpm --filter @iwana/api test
pnpm lint && pnpm typecheck
```

Si corres por Turbo, adjunta la linea `Cached: 0` (o usa `--force`): una suite restaurada de cache reporta exito sin ejecutar nada, y entonces la cifra de cobertura se reporta como **no verificada**.

## 7. Criterio de stop/go

**STOP y emite `[BLOQUEO]` a AI-EM-ARCH si:**

- Concluyes que la asimetria de invalidacion de token (P-05) era deliberada y esta documentada.
- El bucket por `sub` no es alcanzable en ese punto del pipeline sin reordenar guards.
- Uniformar las respuestas de P-17 degrada mensajes de login que el portal necesita, y FE-PLATFORM no acepta el cambio.

**GO si:** pasos 1 a 5 cerrados con tests, dictamen de SEC-ENG sin bloqueantes, gates en verde, y P-10 intacto a la espera del CTO.

## 8. Fuera de alcance

Frontend (salvo la coordinacion declarada), P-10 sin decision, y los residuales del turno backend anterior que siguen abiertos (E-07 bulk sin limite 128, E-09 `DROP INDEX`, H-04 unicidad case-sensitive): tienen dueno y turno propios.
