# PROMPT — Auth · Límites de peticiones

**Versión:** 1.0
**Estado:** G0 aprobado el 2026-11-06. Listo para lanzar
**Fecha:** 2026-11-06
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-06-limites-de-peticiones-spec.md](../specs/2026-11-06-limites-de-peticiones-spec.md)
**Plan:** [2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md](../plans/2026-11-06-transacciones-conexiones-y-efectos-orquestacion.md)

---

## §L1 — `sr-backend`

**Objetivo:** que cada límite declarado se aplique, con los valores del G0.

**Orden obligatorio:**

1. Escribe CA-1 y CA-5 con `ThrottlerGuard` real, con la configuración de `app.module.ts`. Guarda el rojo.
2. Cambia `default` por `global` en las 11 rutas de §2 y aplica los valores aprobados: `refresh` 60 y `login` 30 por minuto.
3. Añade a `platform/login` un límite de 5 por minuto, con la clave `global`.
4. Añade `RATE_LIMIT_E2E_RELAXED`: multiplica solo los límites de ruta, se define solo en el entorno E2E y rechaza el arranque con `NODE_ENV=production`. Documéntala en el ejemplo de entorno del repositorio.
5. Añade CA-2 a CA-4 y CA-6.
6. Corre CA-7 con el proveedor E2E del repositorio.

**No hagas:** no cambies el límite global, `getGlobalRateLimitTracker`, `trust proxy` ni nginx. No añadas bloqueo por cuenta en plataforma ni migraciones. No uses `@SkipThrottle` para pasar el E2E.

**Cierre:** `@iwana/api` unitaria e integración completas, sin caché, en un `postgres:18-alpine` propio, con `DB_NAME=test`, conteo real y omisiones declaradas. Lint y `tsc`. Cero PII y nunca `tenant_iwana`.

**Informe:** archivos tocados, salida del rojo, tabla de CA-1 a CA-8 y specs existentes modificados con su motivo. En `main`, sin commit. No edites el plan ni registres gates.

## §R1 — Revisiones, solo lectura

- **`sec-eng`:** valores, buckets, variable de E2E y arranque en producción.
- **`test-change-reviewer`:** cada spec existente modificado, junto con el cambio que lo motivó.
