# PROMPT — Auth · Bloqueo por intentos fallidos

**Versión:** 1.0
**Estado:** G0 aprobado el 2026-11-06. Listo para lanzar
**Fecha:** 2026-11-06
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-06-transacciones-conexiones-y-efectos-spec.md](../specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md), §3 y §9
**Plan:** [2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md](../plans/2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md)

---

## §A1 — `sr-backend`

**Objetivo:** que un intento fallido persista y que el bloqueo de cuenta funcione en `login` y `changePassword`.

**Orden obligatorio:**

1. Escribe CA-1 contra Postgres real, sin simular `runInTenantSchema`. Córrela y guarda el rojo.
2. Haz que la transacción devuelva el resultado del intento y lanza la excepción fuera, después del commit.
3. Haz atómico el incremento en `registerFailedAttempt`, con `UPDATE ... RETURNING`, y decide el bloqueo con el valor devuelto.
4. Emite `LOGIN_FAILED` y `ACCOUNT_LOCKED` después de la transacción.
5. Añade a `login` `@Throttle({ global: { ttl: 60000, limit: 10 } })`, el valor aprobado en el G0. **Corrección 2026-11-06:** este prompt decía `default`, que no tiene efecto porque el limitador se llama `global`.
6. Añade CA-2 a CA-8.

**No hagas:**

- No cambies mensajes, códigos ni tiempos de respuesta entre usuario inexistente y contraseña errónea.
- No pases la auditoría de un intento fallido a `logWithin` dentro de la transacción que falla.
- No toques otros flujos de `auth.service.ts`, `MAX_FAILED_ATTEMPTS` ni `LOCKOUT_DURATION_SECONDS`.
- Ajusta `auth.service.spec.ts` solo donde el cambio lo exija, y justifica cada ajuste.

**Cierre:** `@iwana/api` unitaria e integración completas, sin caché, en un `postgres:18-alpine` propio, con `DB_NAME=test`, conteo real y omisiones declaradas. Lint y `tsc`. Cero PII y nunca `tenant_iwana`.

**Informe:** archivos tocados, salida del rojo de CA-1, tabla de CA-1 a CA-9 con prueba y resultado, y specs existentes modificados con su motivo. En `main`, sin commit. No edites el plan ni registres gates.

## §R1 — Revisiones, solo lectura

- **`sec-eng`:** bloqueo, enumeración de usuarios, conteo en paralelo y límite de `login`.
- **`test-change-reviewer`:** cada spec existente modificado, junto con el cambio que lo motivó.
- **`gate-verifier`:** Gates Before Merge sobre `@iwana/api`, con conteos reales.
