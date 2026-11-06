# Spec — Transversal · Límites de peticiones inactivos

**Versión:** 1.0
**Estado:** Aprobada. G0 del CTO el 2026-11-06 sobre los cinco puntos de §6: `refresh` 60, `login` 30 y `platform/login` 5 por minuto por IP.
**Fecha:** 2026-11-06
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** alta, requisito de G7. Sin exposición real: no hay producción hasta la beta.
**Origen:** hallazgo de `sec-eng` en la Ola A, confirmado por AI-EM-ARCH en el código.
**Plan:** [2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md](../plans/2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md), Ola A2

---

## 1. Resultado en una línea

11 rutas declaran un límite que no se aplica, porque usan el nombre `default` y el limitador se llama `global` (`app.module.ts:157-166`). Activarlos es un cambio de una palabra por ruta, pero el límite de `login` ya aprobado puede romper el E2E de CI y frenar a oficinas con una sola IP. Hay que ajustar eso antes de publicar la Ola A.

## 2. Inventario

Sin el nombre correcto, todas caen a 100 por minuto.

| Ruta | Declarado | Bucket | Propuesta |
| --- | --- | --- | --- |
| `POST /auth/refresh` | 30 | IP | **60**: ver §3 |
| `POST /auth/change-password` | 10 | Usuario | Activar |
| `PATCH /users/:id/login-email` | 10 | Usuario | Activar |
| `POST /media/upload` | 20 | Usuario | Activar |
| `POST /privacy/evidence` | 20 | Usuario | Activar |
| `GET /tenants/public-branding` | 60 | IP sin sesión, usuario con sesión | Activar |
| `POST /tenants/me/branding/assets` | 10 | Usuario | Activar |
| `POST /tenants` | 10 | Plataforma | Activar |
| `POST /tenants/:id/branding/assets` | 10 | Plataforma | Activar |
| `GET /platform/branding/public` | 60 | IP | Activar |
| `POST /platform/branding/assets` | 10 | Plataforma | Activar |

El bucket lo define `getGlobalRateLimitTracker` (`common/rate-limit-tracker.ts`). Sin JWT verificado de tenant es la IP, así que las rutas de plataforma pueden caer en ese caso: la prueba debe confirmarlo.

En producción, nginx pasa la IP real (`nginx.prod.conf:116`) y el portal llama al API desde el navegador. No encontré llamadas desde el servidor de Next que hagan compartir una IP a todos los usuarios.

## 3. IP compartida

Una oficina suele salir a internet con una sola IP. Las rutas públicas comparten ahí un mismo bucket.

- **`login`, 10 por minuto, ya aprobado y activo en la Ola A.** Fui yo quien lo propuso, y hoy lo recomendaría más alto: 15 personas que entran a las 8:00 desde la oficina de un ISP recibirían 429. Ahora que el bloqueo por cuenta funciona, el límite por IP no es el único freno. Propongo **30**.
- **`refresh`:** usa un token de alta entropía, así que el riesgo de fuerza bruta es bajo y un 429 cierra sesiones legítimas. Propongo **60**.

## 4. `platform/login`

No tiene límite propio ni bloqueo por cuenta, y la entidad `PlatformUser` no tiene columnas para ello. La cuenta de plataforma es la de mayor privilegio, pero tiene MFA obligatorio (`platform-user.entity.ts:69`).

**Propuesta:** límite de **5 por minuto por IP**, sin bloqueo por cuenta. Con solo conocer un correo, un atacante podría dejar sin consola a los pocos administradores, justo durante un incidente, y el segundo factor ya cubre la contraseña filtrada. Evita además una migración pública. Si prefieres bloqueo por cuenta, es trabajo aparte.

## 5. E2E y CI

**Riesgo para G6.5 de la Ola A, no medido.** Playwright corre desde una IP. `execution-orders-operational.spec.ts` hace varios logins seguidos en su preparación, y hay 26 archivos que inician sesión. El límite de `login` ya activo puede devolver 429 y dejar rojo `execution-orders-e2e`. Ninguna corrida de la Ola A incluyó E2E, tampoco la mía.

**Propuesta:** una variable `RATE_LIMIT_E2E_RELAXED=true` que solo el entorno E2E define, y que multiplica los límites de ruta. La API debe negarse a arrancar si está definida con `NODE_ENV=production`. El límite global no cambia.

## 6. Puntos del G0 del CTO (aprobados el 2026-11-06)

1. Activar las 11 rutas con el valor declarado, salvo `refresh` en 60. **Recomendado.**
2. Subir `login` de 10 a 30 por minuto por IP. **Recomendado:** cambia una decisión tuya de hoy.
3. `platform/login` con 5 por minuto por IP y sin bloqueo por cuenta. **Recomendado.**
4. Variable para E2E, con arranque rechazado en producción. **Recomendado.**
5. Publicar la Ola A y esta ola juntas, para no dejar CI rojo. **Recomendado.**

## 7. Criterios de aceptación

| # | Criterio | Prueba |
| --- | --- | --- |
| CA-1 | Cada ruta de §2 responde 429 al superar su límite, con `ThrottlerGuard` real. **Debe verse rojo antes del cambio** | HTTP, parametrizada |
| CA-2 | `login` y `platform/login` responden 429 en el valor aprobado | HTTP |
| CA-3 | Una segunda IP no comparte bucket en rutas públicas | HTTP |
| CA-4 | Dos usuarios no comparten bucket en rutas autenticadas | HTTP |
| CA-5 | Una regla de arquitectura falla si `@Throttle` o `@SkipThrottle` usan un nombre distinto de los definidos en `ThrottlerModule` | Arquitectura |
| CA-6 | La API no arranca con `RATE_LIMIT_E2E_RELAXED` en producción | Unitaria |
| CA-7 | `execution-orders-e2e` y las suites E2E de API y portal pasan con conteo real | E2E |
| CA-8 | Suite completa de `@iwana/api` sin caché | `DB_NAME=test`, conteo real |
