# Spec — Transversal · Conexiones y efectos dentro de transacciones

**Versión:** 1.0
**Estado:** Aprobada. G0 del CTO el 2026-11-06 sobre los seis puntos de §8, con límite de 10 por minuto por IP en `login`.
**Fecha:** 2026-11-06
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** alta para el defecto de §3, media para el resto. Todo es requisito de G7. No hay producción hasta la beta, así que hoy no hay exposición real.
**Origen:** puntos 3 y 4 del G0 de [la spec de marcas](2026-11-06-crm-marcas-en-transaccion-spec.md).
**Plan:** [2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md](../plans/2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md)
**Evidencia:** [scripts y salidas](../informes/evidence/crm-marcas-en-transaccion-2026-11-06/)

---

## 1. Resultado en una línea

El bloqueo de cuenta por intentos fallidos no funciona: el rollback borra el contador en cada intento. Además, 157 puntos de la API hacen dentro de una transacción algo que debería ir en la misma conexión o después del commit. Y la duda sobre el catálogo se resuelve: `createSnapshot` solo lee, así que puede usar el mismo arreglo que las marcas.

## 2. Método y límites

- `txconn.cjs`: análisis AST de `apps/api/src`. Sigue `this.metodo`, `this.campo.metodo` y puertos abstractos hasta sus implementaciones, cosa que el primer análisis no hacía. Por eso las «30 llamadas» de la spec anterior quedan sustituidas por este inventario.
- **Verifiqué a mano** 12 puntos de la muestra: todos estaban dentro de transacción. El resto no se revisó uno a uno.
- **Límites:** es heurístico, basado en nombres. Un argumento llamado `ctx` o `manager` se da por bueno sin comprobarlo. Los adaptadores `Stub*` no cuentan. No cubre `apps/worker` ni funciones de módulo que reciben un puerto como argumento (`projectContractsForRead`, ya inventariada aparte).
- Las líneas son del árbol sin commitear del 2026-11-06.

## 3. Defecto P1: el bloqueo de cuenta no funciona

**Qué pasa.** `login` escribe el intento fallido dentro de `runInTenantSchema` y luego lanza `UnauthorizedException` en el mismo callback (`auth.service.ts:392-402`). La excepción revierte la transacción y la escritura se pierde. `changePassword` tiene la misma forma (`auth.service.ts:1052-1059`).

**Evidencia.** Ejecuté el `AuthService.login` compilado, con el `runInTenantSchema` real, contra un `postgres:18-alpine` desechable (`loginrollback.cjs`, `loginrollback.out`):

| Paso | `failed_login_attempts` | `locked_until` |
| --- | --- | --- |
| Inicial | 0 | nulo |
| 7 intentos con contraseña incorrecta | 0 | nulo |
| Control: la misma escritura con commit | 1 | nulo |

**Consecuencias:**

- Las 5 fallas y los 15 minutos de bloqueo (`auth.service.ts:58-61`) nunca se activan, y `ACCOUNT_LOCKED` nunca se emite.
- El único freno real es el límite global de 100 peticiones por minuto (`app.module.ts:157-161`); `login` no tiene `@Throttle` propio.
- `LOGIN_FAILED` sí queda en auditoría, solo porque `auditService.log` usa otra conexión. Por eso la auditoría no delataba el problema.

**Por qué no lo vio ninguna prueba.** `auth.service.spec.ts:353` simula `runInTenantSchema` y comprueba que se llamó a `manager.update`, no que el dato persista. No hay prueba de integración del bloqueo.

**Corrección propuesta (D1):**

1. La transacción devuelve el resultado del intento y la excepción se lanza fuera, después del commit.
2. El incremento pasa a ser atómico (`failed_login_attempts = failed_login_attempts + 1 ... RETURNING`). Hoy lee y escribe, y con intentos en paralelo se perderían cuentas.
3. `login` recibe un `@Throttle` propio (D2).

## 4. Catálogo comercial

Revisado `commercial-catalog-read.adapter.ts`: `getPlanById` (`:83`) y `createSnapshot` (`:151`) **solo leen**. La reserva de D4 en la spec de marcas ya no aplica: no hay atomicidad que perder.

**D3:** añadir `ctx?: { manager }` a ambos métodos y a `mediaService.findOne`, que `_hasVerifiedStratumEvidence` llama en la misma ruta (`contracts.service.ts:1983`). Son 8 puntos en CRM, y `_resolveVatSnapshot` también se usa en `:1615`, que el AST no atribuyó.

**Cuidado al implementar:** `changePlan` captura el error `22P02` de `getPlanById` (`:995-1004`). En otra conexión ese error no afecta a la transacción; en la misma, la deja abortada. Hoy se relanza como `PLAN_UNAVAILABLE` y no hay más consultas, así que funciona, pero debe quedar cubierto por una prueba.

## 5. Inventario

157 puntos en 9 módulos. Detalle en `txconn.out`.

| Categoría | Puntos | Módulos | Problema | Sev. |
| --- | --- | --- | --- | --- |
| `auditService.log` | 34 | auth, crm, tenant, users | §6 | P2 |
| Lecturas de otro módulo con conexión propia | 57 | crm, inventory, network, tasks, tenant, users, wfm | Retención y espera del pool | P2 |
| Marcas y autorización | 14 | crm | Ya aprobado, spec de marcas | P2 |
| Catálogo y media | 8 | crm | §4 | P2 |
| Escrituras en Redis | 8 | auth, users | §7 | P2 |
| Colas BullMQ | 6 | assurance, users | §7 | P3 |
| Correo SMTP | 4 | auth, users | §7 | P3 |
| Permisos en Redis | 26 | network, users | Caché de lectura; alarga la transacción si Redis tarda | P3 |

**`routerProvisioningPort.apply` y `remove`:** hoy no hay riesgo. El único adaptador, `ManualRouterProvisioningAdapter`, solo arma texto, sin base ni red. Queda una advertencia: un adaptador real que hable con el router no puede correr dentro de esta transacción.

**Login y bcrypt:** `bcrypt.compare` corre con la conexión tomada (`auth.service.ts:389`). No hay espera circular, pero 10 logins simultáneos ocupan todo el pool durante la comparación.

## 6. Auditoría dentro de transacción

`auditService.log` abre su propia transacción y **nunca lanza** (`audit.service.ts:116-132`). De los 32 puntos directos, 23 usan `await` y 9 usan `void`. Hay dos efectos, además del riesgo de pool:

- **Registro de algo que no pasó:** la auditoría se confirma aunque la transacción externa se revierta después.
- **Pérdida silenciosa:** si el pool está saturado, `log` espera 5 s, falla, solo deja un aviso, y la mutación sigue y se confirma **sin auditoría**.

**D4:** en mutaciones exitosas, usar `logWithin(entry, qr.manager)`, que ya existe, para confirmar datos y auditoría juntos. **Excepción:** la auditoría de un intento fallido debe sobrevivir al fallo, así que va después de la transacción. Pasar `login` a `logWithin` sin más borraría `LOGIN_FAILED`.

## 7. Efectos antes del commit

| Efecto | Dónde | Riesgo |
| --- | --- | --- |
| Registro de idempotencia en Redis | `users.service.ts:708, 1114, 1399, 1603` | **El más serio.** Si falla el commit, un reintento encuentra la clave y da por creado algo que se revirtió |
| Encolado de trabajo de campo | `tickets.service.ts:708`, con `await` | Un rollback deja un trabajo sin ticket confirmado, o el trabajador lo toma antes del commit. Si Redis tarda, retiene la transacción |
| Encolado de búsqueda | `users.service.ts:716, 1118, 1285, 1403, 1461` | Sin espera. El índice puede leer un dato aún no confirmado |
| Correo | `auth.service.ts:949, 1265`; `users.service.ts:1262, 1274` | Sin espera. Si hay rollback, se avisó de un cambio que no ocurrió |
| Lista negra de `jti` | `auth.service.ts:1087` | Falla hacia el lado seguro; basta con moverla |

**D5:** todos pasan a después del commit. El patrón es devolver los datos desde la transacción y ejecutar el efecto fuera. Una bandeja de salida transaccional sería más robusta, pero no hace falta para estos casos.

## 8. Puntos del G0 del CTO (aprobados el 2026-11-06)

1. Corregir el bloqueo de cuenta ya (D1), sin esperar a MOD14: `apps/api/src/modules/auth` no tiene cambios sin commitear. **Recomendado.**
2. Límite propio en `login` (D2): 10 por minuto por IP.
3. Catálogo y media con `ctx` (D3), junto con la ola de marcas. **Recomendado.**
4. Auditoría con `logWithin` y efectos después del commit (D4 y D5), por módulo, antes de G7. **Recomendado.**
5. Las 57 lecturas: corregir por módulo con `ctx`, empezando por network, antes de G7. **Recomendado.**
6. Añadir una regla de arquitectura que falle si una transacción llama a `auditService.log`, `mailerService.sendMail` o `queue.add`. **Recomendado, al terminar la limpieza.**

## 9. Criterios de aceptación de la Ola A

| # | Criterio | Prueba |
| --- | --- | --- |
| CA-1 | 5 fallos persisten el contador y `locked_until`. **Debe verse rojo antes del cambio** | Integración contra Postgres real |
| CA-2 | Con la cuenta bloqueada, la contraseña correcta recibe 401 hasta que venza | Integración |
| CA-3 | Un login correcto reinicia el contador | Integración |
| CA-4 | 10 fallos en paralelo dejan la cuenta bloqueada y el contador en 5 o más | Integración |
| CA-5 | `changePassword` persiste el intento fallido | Integración |
| CA-6 | `LOGIN_FAILED` y `ACCOUNT_LOCKED` quedan en auditoría | Integración |
| CA-7 | Respuesta y mensaje idénticos para usuario inexistente y contraseña errónea | Unitaria existente, sin cambio de expectativa |
| CA-8 | `login` responde 429 al superar el límite aprobado | HTTP |
| CA-9 | Suite completa de `@iwana/api` sin caché, unitaria e integración | `DB_NAME=test`, conteo real |
