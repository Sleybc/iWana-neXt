# INFORME-MOD05-DEUDA-FIX-A-v1.0

**Fecha:** 2026-10-17  
**Bloque:** A — correcciones backend de MOD05 Deuda  
**Base:** `main` en `e2348a42`  
**Alcance:** API, contratos compartidos necesarios para NIT-DV y este informe. No se modificó `dbiw` ni se hizo commit.

## Cambios

- `main.ts` y las pruebas HTTP comparten la misma fábrica de pipes globales. Se probaron con la configuración real los DTO de alta/edición y los casos de authorizations, representante legal, `rutResponsibilities`, duplicidad/validez de RUT, `snapshotJson`, `customerAcceptance` y `followUp`. Se añadió una guardia AST para arreglos de objetos con `@Allow()` sin tipo del elemento.
- Se corrigieron los DTO anidados de alta y edición. La ficha 360° reutiliza la proyección de lectura de contratos, que descifra datos, soporta valores heredados y aplica la redacción por bloqueo. El nombre del representante aplica sus propias marcas de privacidad.
- Se corrigieron los puntos CD-01 a CD-08 y B-01: validación fiscal compartida en el boundary, sin regla fiscal duplicada en `create()`, sin `SUBSCRIBER_FISCAL_DATA_REQUIRED`, whitelist fiscal del detalle bloqueado y esquema OpenAPI del resumen de lista.
- `calculateNitVerificationDigit` y `parseExpedienteNit` se trasladaron a `@iwana/shared` con vectores. La API consume la utilidad compartida mediante su adaptador HTTP; se retiró la copia local.

## Evidencia

- **API, suite completa sin caché:** 394 suites pasaron, 4 omitidas; 5307 tests pasaron, 15 omitidos; 0 fallos. Esta corrida precede al ajuste final de documentación OpenAPI; el controller se revalidó después de dicho ajuste por separado.
- **Controller después del ajuste OpenAPI:** 1 suite, 29 tests, 0 fallos. Comando con caché temporal en workspace: `pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest src/modules/crm/subscribers/tests/subscribers.controller.spec.ts --runInBand --no-cache --forceExit --cacheDirectory .cache/jest-tmp`.
- **Pruebas focales A tras formato:** 7 suites, 215 tests, 0 fallos.
- **Revalidación de guardia DTO y pipes HTTP reales:** 2 suites, 11 tests, 0 fallos. Comando: `pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest src/common/dto-allow-array.architecture.spec.ts src/common/pipes/global-validation-pipes.http.spec.ts --runInBand --no-cache --forceExit --cacheDirectory .cache/jest-tmp`. Se ejecutó con permiso de loopback; el intento sin ese permiso había fallado en la apertura de sockets locales (EACCES).
- **Guardia nullable y suite API posterior a su corrección:** el nuevo vector `ElementDto[] | null` falló antes de arreglar el detector y pasó después. La suite guardia pasó 1/2 tests sin fallos; luego la suite API completa volvió a pasar sin caché: 394 suites, 5307 tests pasaron; 4 suites/15 tests omitidos; 0 fallos. Comando: `pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest --runInBand --no-cache --forceExit --cacheDirectory .cache/jest-tmp`.
- **Shared, suite completa sin caché:** 21 suites, 191 tests, 0 fallos.
- **Typecheck y compilación API/shared:** código 0.
- **API integration, ejecutada contra `iwana_it_g7_ci`:** 24 suites pasaron, 3 omitidas; 97 tests pasaron, 15 omitidos; 0 fallos. PostgreSQL y Redis estaban accesibles. Las suites de integración ejecutaron; las omisiones son casos declarados skip. Se seleccionó el tenant activo del entorno de integración sin exponer identificadores en este informe; no se ejecutaron migraciones.
- **Arranque API:** `GET /api/v1/health` respondió `status=ok`, con `db=ok` y `redis=ok` en `127.0.0.1:5433` / `127.0.0.1:6380`.
- **Turbo inicial:** la corrida conjunta del bloque B terminó con 20/30 tareas exitosas y 10 fallidas por errores de entorno (`EPERM`/`EACCES`), resolución de módulos y escritura de Turbopack. El detalle consta en [informe B](INFORME-MOD05-DEUDA-FIX-B-v1.0.md).
- **Re-verificación V4′:** `pnpm --config.use-node-version=24.18.0 exec turbo run build lint test typecheck --force --continue` informó 30/30 tareas exitosas y 0 cacheadas. La cobertura posterior confirmó ≥80% en los servicios API MOD05 medidos; `packages/shared/src/schemas/subscriber.schema.ts` quedó en 75% de statements/lines y está registrado como gate abierto en [informe V4′](INFORME-MOD05-DEUDA-V4-GATES-v1.1.md).

## Resultado

Las correcciones del backend quedaron implementadas y la suite API/shared y las integraciones se ejecutaron con los conteos indicados. La re-verificación amplia de Turbo informó 30/30 tareas exitosas; el gate de cobertura de `subscriber.schema.ts` sigue abierto. No hubo migración de `dbiw`, uso de PII real, claves reales ni commit.

