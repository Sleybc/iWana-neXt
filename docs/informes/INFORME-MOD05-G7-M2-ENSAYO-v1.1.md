# INFORME — MOD05 + privacidad G7 · ensayo M2b

**Versión:** 1.1 · **Fecha:** 2026-10-15 · **Estado:** **NO-GO para release**  
**Responsables:** AI-SR-QA con ejecución aislada de AI-PLAT-OPS  
**Fuentes:** [Plan G7](../plans/2026-10-15-mod05-privacy-g7-release.md) · [Runbook por tenant](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md) · [Prompt G7, §2 C-M2](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md) · [K2 v1.1](INFORME-MOD05-G7-K2-v1.1.md) · [M3](INFORME-MOD05-G7-M3-v1.0.md)

## Resultado

El ensayo usó PostgreSQL y Redis desechables, una cuenta de plataforma sintética y tenants creados durante las pruebas. Se restauró el estado previo a la migración 143, se aplicaron las migraciones públicas y tenant hasta incluir la 148, y se ejecutaron B13, el backfill de placeholders y K2. K2 terminó con cero pendientes y cero filas que dependan solo de la clave MFA legado.

El ensayo **no aprueba el runbook de release**. En el paso 4, el archivo de origen `59e425ee^` no contiene `habeas_data_consents` ni `arco_requests`; la migración 146 registra que el origen no está disponible. El paso se detuvo sin inventar tablas ni datos. El rollback M1-G2 por `RENAME` también permanece en **NO-GO** por los conflictos del CLI de restore identificados por la revisión SEC de M3. No se ejecutó `RENAME` ni restore in-place.

El paso 9 dejó evidencia real de Portal/API para login, autorización, conversión, contacto pendiente, solicitud de privacidad y suplantación, además de una integración PostgreSQL del procesador de alertas. Las pruebas iniciales de privacidad revelaron que faltaba un texto legal vigente en el fixture; después de crearlo por la API con datos sintéticos, conversión y suplantación pasaron. Los tres tenants de Playwright quedaron `INACTIVE`, confirmado por la API. El procesador se ejecutó directamente en la integración PostgreSQL; esta evidencia no prueba el transporte de un mensaje por la cola BullMQ.

## Aislamiento y estado inicial

- Base origen de ensayo desechable: `iwana_it_g7_m2b_base_74e1c9d2`. Base restaurada para release: `iwana_it_g7_m2b_release_74e1c9d2`; schema tenant: `tenant_it_g7_m2b_74e1c9d2`. PostgreSQL se enlazó a `127.0.0.1:52117` y Redis aislado a `127.0.0.1:52118`.
- Snapshot previo a migración tenant 143: punto 142 y 137 registros tenant. El fixture contenía un expediente y un suscriptor sintéticos con ciphertext MFA legado creado en memoria.
- Backup global y tenant, sidecar y checksums terminaron con código 0. El restore global a base nueva terminó en **3,64 s**; la instantánea contenía un tenant registrado, un expediente y un suscriptor.
- Las credenciales del runtime se guardaron en un archivo temporal con ACL del usuario actual y no se imprimieron ni se incluyeron en este informe.
- API HTTP 200 en `127.0.0.1:3000`; Portal Playwright en `127.0.0.1:3002`; Redis/PostgreSQL fueron exclusivos del ensayo. No se usaron `dbiw` ni los servicios compartidos.

## Evidencia por paso

| Paso                                    | Resultado                                                      | Evidencia agregada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Preflight                           | **NO-GO de release**                                           | Los gates de M1 siguen abiertos y este ensayo no constituye aprobación de ventana.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1 · Backup y restore aislado            | Aprobado en entorno desechable                                 | Backup global: exit 0, 496.821 bytes. Backup tenant, sidecar y checksums: exit 0; backup tenant en 1,45 s. Restore global nuevo: exit 0, 3,64 s; snapshot con 1 tenant, 1 expediente y 1 suscriptor.                                                                                                                                                                                                                                                                                                                               |
| 2 · Migraciones                         | Aprobado en la base desechable                                 | `migration:run`: exit 0 en 0,79 s, público en 26. `migration:tenant:run`: exit 0 en 0,97 s, tenant en 143; 1 tenant `ACTIVE`. Tras aplicar 148, 16/16 columnas objetivo verificadas.                                                                                                                                                                                                                                                                                                                                               |
| 3 · B13 Party                           | Aprobado                                                       | Dry-run y apply: exit 0; 0 candidatos de Party/contacto/WhatsApp para backfill.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4 · Conciliación 146                    | **STOP**                                                       | `habeas_data_consents` y `arco_requests` no existen en el origen `59e425ee^`; la migración 146 registra origen no disponible. No se fabricaron tablas ni datos y no se ejecutó una conciliación que presuponía esos orígenes.                                                                                                                                                                                                                                                                                                      |
| 5 · Placeholders                        | Aprobado                                                       | Dry-run, apply y verificación: exit 0; 1 suscriptor examinado, 0 placeholders y 0 suscriptores `ACTIVE` sin contacto al ejecutar el backfill.                                                                                                                                                                                                                                                                                                                                                                                      |
| 6 · Recifrado K2                        | Aprobado sobre la base migrada                                 | Dry-run: exit 0 en 0,76 s; 8 candidatos (3 suscriptores y 5 expedientes), 0 errores de descifrado, 0 valores no ciphertext y 0 tablas/columnas ausentes. Apply: exit 0 en 0,72 s; 8 recifrados, 0 pendientes. Segundo apply: exit 0 en 0,68 s; 0 recifrados, 8 ya recifrados. Verify: exit 0 en 0,76 s; 0 MFA-only, 0 PII con clave previa y 0 pendientes. `PII_DECRYPT_LEGACY_MFA=true` se conservó durante la transición.                                                                                                        |
| 7 · API/worker/Redis                    | Parcial, aislado                                               | API health HTTP 200; worker activo; Redis dedicado saludable. Los procesos se dirigieron únicamente a la base y Redis desechables.                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8 · Media                               | No ejecutado como gate de release                              | El ensayo se detuvo por el paso 4; no se declara validado el almacenamiento de evidencia Media.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 9 · Health y smoke Portal/API           | Evidencia funcional; la corrida inicial de privacidad fue roja | Contacto pendiente: 1/1 test passed (57,9 s), CA-E3-01..04 y estado final `INACTIVE` confirmados. Privacidad, primera corrida completa: 1 passed y 2 failed porque faltaba el texto legal vigente requerido por el fixture; tenant `INACTIVE`. Tras crear texto legal sintético por API, conversión/autorización y suplantación/suspensión: 2/2 passed (31,3 s); tenant `INACTIVE`. En conjunto, los tres flujos de privacidad quedaron cubiertos por pruebas que pasaron; se conserva el resultado rojo inicial en estos conteos. |
| 10 · Procedimiento manual de privacidad | No ejecutado                                                   | No se abrió ni tramitó una solicitud manual fuera del smoke automatizado.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 11 · Rollback y cierre                  | **NO-GO para rollback in-place**                               | No se ejecutó `RENAME`. M3 confirmó que `restore-tenant.mjs` rechaza la fila existente de `public.tenants` y volvería a chocar al reinsertarla. No se usó `DROP SCHEMA`, DML manual ni restore sobre el origen.                                                                                                                                                                                                                                                                                                                    |

## Comandos y conteos reales

Las pruebas se ejecutaron sin Turbo cache. Las credenciales se cargaron desde el runtime protegido y no aparecen en los comandos ni en sus salidas guardadas.

```text
pnpm exec playwright test --config=e2e/playwright.portal.config.ts --project=chromium e2e/tests/portal-crm-contact-pending-live.spec.ts
1 test passed (57.9 s)

pnpm exec playwright test --config=e2e/playwright.portal.config.ts --project=chromium e2e/tests/portal-privacy-live.spec.ts
1 test passed, 2 failed (49.3 s); fallos en la precondición de texto legal vigente.

pnpm exec playwright test --config=e2e/playwright.portal.config.ts --project=chromium e2e/tests/portal-privacy-live.spec.ts --grep 'captura la autorización|radica suplantación'
2 tests passed (31.3 s), con texto legal sintético creado por la API.

pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand src/modules/privacy/alerts/privacy-due-alerts.processor.postgres.integration.spec.ts
1 suite passed, 1 test passed (10.824 s).
```

El test PostgreSQL ejecuta `PrivacyDueAlertsProcessor.process()` con `TenantContext` y datos sintéticos sobre la base restaurada y migrada. Verifica la transición automática de la solicitud y el contenido agregado de la alerta sin PII. No encola un job BullMQ en Redis; por ello la entrega/consumo real de cola queda pendiente.

Conteo de ejecuciones Playwright: **4 pasadas y 2 fallidas** en tres comandos. Las dos fallidas pertenecen a la primera corrida completa de privacidad y se debieron a una precondición de fixture ausente. La segunda corrida, con esa precondición preparada, aprobó los dos casos fallidos. No se ocultó ni se reemplazó el resultado inicial.

## Limpieza y restricciones

- Los tenants de contacto pendiente, privacidad inicial y privacidad con fixture legal terminaron `INACTIVE`; las verificaciones se hicieron mediante `GET /tenants/:id` tras `PATCH status=INACTIVE`.
- Los contenedores y bases PostgreSQL/Redis `iwana_it_g7_m2b_*`, el runtime temporal protegido, API y worker del ensayo fueron retirados. Se verificó que no quedaran listeners en `3000`, `3002`, `52117` o `52118`.
- No se ejecutó `RENAME`, no se tocó infraestructura compartida y no se cambiaron datos de producción. No se incluyen claves, contraseñas, tokens, ciphertexts ni valores personales.
- No se creó commit.

## Cierre

**M2b queda NO-GO para release** hasta resolver el origen ausente de la conciliación del paso 4, validar el paso 8 de Media según el runbook y corregir/ensayar el rollback M1-G2 sobre schema existente. La evidencia K2 en estado migrado y el smoke funcional no sustituyen esos gates.

La ruta de este informe estaba libre antes de crearlo.
