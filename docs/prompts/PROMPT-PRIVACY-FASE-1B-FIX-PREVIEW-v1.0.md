# PROMPT — `privacy` Fase 1b · Vista previa de la supresión responde 500

**Versión:** 1.0 · **Fecha:** 2026-10-17 · **Estado:** Vigente · **Emisor:** AI-EM-ARCH · **Agente:** `sr-backend` (dueño de B1 y B2) · **Base:** `main` en `1214ea02` más el árbol de V1 sin commitear
**Origen:** [V1 QA v1.7](../informes/INFORME-PRIVACY-FASE-1B-V1-QA-v1.7.md): NO-GO, 3/4. `GET /privacy/requests/:id/erasure-preview` responde **HTTP 500** genérico, sin código, para un prospecto con expediente, consentimiento, solicitud verificada y fixture WFM. No se pudo validar la anonimización ni la marca «Anonimizado».

## Lo que AI-EM-ARCH ya descartó o encontró

- **Descartado:** `withPrivacyTenant` usa `runInTenantSchema`, que abre una transacción (`packages/database/src/data-source.ts:207-214`). La guarda `requireTransaction` del adaptador no es la causa probable.
- **Hueco de evidencia (causa de que no se detectara):**
  - `requests.service.postgres.integration.spec.ts` prueba `resolve` con un adaptador **falso**;
  - `anonymize-titular.postgres.integration.spec.ts` prueba el adaptador **real**, pero por el camino del CLI (`resolveCliScope`);
  - **ningún test ejercita `erasurePreview` ni `resolve` por la API con el `CrmPersonalDataErasureAdapter` real contra Postgres.**
- **Superficie sospechosa:**
  - `CrmPersonalDataErasureAdapter.resolve` (`crm-personal-data-erasure.adapter.ts:183-229`);
  - el `plan()` de cada participante;
  - la proyección de `counts` a `erasurePreviewSchema`.

## Encargo

1. **Reproducir con el stack.**
   - Arrancar la API contra `dbiw`, con su salida a un archivo temporal fuera del repo.
   - Usar la solicitud SUPRIMIR del tenant `e2e-privacy-1b-a114bf06` que dejó la corrida de V1 (ubicarla con SQL de solo lectura) y las credenciales de `.env.development.local`, sin imprimirlas.
   - Llamar a la vista previa y capturar el stack.
   - En el informe va el **tipo de error, el archivo:línea y la consulta o el paso** que falla, sanitizados: sin PII, HMAC, UUID ni tokens.
2. **Causa raíz y corrección**, en el módulo dueño del paso que falla. Si la corrección toca un contrato, `[BLOQUEO]` antes de cambiarlo.
3. **Cerrar el hueco con un test de integración nuevo** (`privacy-erasure-api.postgres.integration.spec.ts`).
   - Compila con Nest `PrivacyRequestsService` y el `CrmPersonalDataErasureAdapter` **real**, con sus participantes reales.
   - Siembra la misma forma que el fixture de V1: prospecto sin Party, expediente con HMAC del documento, consentimiento, solicitud verificada y visita, evento y orden de WFM.
   - Prueba la vista previa (200 y conteos por categoría) y `resolve` (anonimización, `erased_at`, la marca en el expediente y las tablas de WFM y `tasks`).
   - Debe fallar con el código de hoy.
4. **Errores:**
   - Los errores esperables de un participante (tabla o columna ausente, alcance vacío) no deben producir 500: o se manejan, o llevan un `code` de dominio.
   - Un 500 inesperado se registra en el log con su stack, sin PII.

## Evidencia obligatoria

- La suite unitaria completa de `@iwana/api` sin caché, con 0 fallos.
- `test:integration` contra una base **desechable** (`iwana_it_g7_ci`, nunca `dbiw`), con el test nuevo en `PASS`.
- La API arrancada contra `dbiw` y la vista previa de la solicitud de V1 en **200**.

## Reglas

- Solo el código del módulo dueño del fallo y sus tests; no modificar contratos.
- Ninguna PII, credencial, HMAC ni token en el repo, los informes o los logs. No commitear.
- Detener la API al terminar.
- Informe: `docs/informes/INFORME-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0.md`, con la ruta verificada como libre.
