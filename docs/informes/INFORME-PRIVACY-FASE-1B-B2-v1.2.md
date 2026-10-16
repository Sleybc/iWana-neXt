# Informe PRIVACY Fase 1B · B2 · v1.2

**Estado:** completado. **Decisión previa:** D-1B-7 = A, aprobada en el plan v1.2.

## Alcance y resultado

Se verificó que esta ruta no existía antes de crear el informe. En el CLI se retiró la selección y actualización de `data_authorizations.evidence_media_id`; `privacyMediaAssets` permanece en el JSON con valor `0` y la etiqueta `conservada (prueba de autorización)`. El participante de Media conserva la fila de resultado para compatibilidad, pero no selecciona ni actualiza la evidencia de autorización.

La prueba PostgreSQL del CLI confirma que el asset sigue activo y que la fila de `data_authorizations` permanece idéntica. La prueba PostgreSQL del participante de la ruta API confirma la misma conservación al ejecutar el adaptador real. En la integración del CLI se cambió únicamente la aserción de evidencia indicada por v1.2: de borrada a conservada y activa.

No se modificaron contratos compartidos ni se registraron PII, ciphertext, HMAC o claves reales. No se hizo commit.

## Verificación

- `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --no-cache --runInBand --runTestsByPath src/cli/anonymize-titular.postgres.integration.spec.ts src/modules/media/privacy/media-titular-erasure.api.postgres.integration.spec.ts` — **2 suites, 10 tests aprobados**; PostgreSQL disponible. La suite CLI aporta 9 tests y la prueba API 1.
- `pnpm --filter @iwana/api exec jest --no-cache --runInBand --runTestsByPath src/modules/crm/expedientes/expedientes.controller.fase2.http.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/subscribers/tests/subscribers.service.spec.ts src/modules/media/privacy/media-titular-erasure.participant.spec.ts` — **4 suites, 167 tests aprobados**, incluida la prueba unitaria del participante de Media.
- `pnpm --filter @iwana/api typecheck` — aprobado.
- `git diff --check` — sin errores.

## Deuda nueva por severidad

| Severidad | Deuda nueva |
| --------- | ----------: |
| Crítica   |           0 |
| Alta      |           0 |
| Media     |           0 |
| Baja      |           0 |
