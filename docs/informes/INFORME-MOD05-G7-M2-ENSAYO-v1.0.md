# INFORME — MOD05 + privacidad G7 · M2 ensayo del runbook

**Versión:** 1.0 · **Fecha:** 2026-10-15 · **Estado:** NO-GO; ensayo detenido en paso 6 por cuatro tablas ausentes y smoke real bloqueado en login de plataforma
**Responsables:** AI-SR-QA con ejecución aislada de AI-PLAT-OPS
**Fuentes:** [Plan G7, §2](../plans/2026-10-15-mod05-privacy-g7-release.md) · [Runbook por tenant](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md) · [Prompt G7, §2 C-M2](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md)

## Resultado

Se ensayó sobre una base y servicios desechables `iwana_it_g7_*`, con datos y credenciales sintéticos. Se restauró el estado previo a la migración 143, se aplicaron las migraciones del árbol actual y se completaron B13, la conciliación de privacidad y la limpieza de placeholders. El ensayo se detuvo en K2: el esquema restaurado carece de cuatro columnas objetivo. El CLI devolvió error en dry-run y en verify, sin ejecutar `--apply`; se mantuvo `PII_DECRYPT_LEGACY_MFA=true`.

El health del API devolvió HTTP 200. El smoke complementario de Playwright no alcanzó los flujos de negocio: el login de plataforma devolvió HTTP 500, por lo que 1 test falló y 0 pasaron. No se declara aprobado el paso 9. Los pasos 7, 8 y 10 no se ejecutaron. El restore tenant de rollback posterior al paso 3 sí se ensayó en una base nueva; el restore sobre un schema ya existente continúa bloqueado por la guarda del CLI y el runbook.

**Conclusión:** el runbook no está aprobado para release. K2 debe reconciliar el inventario de columnas con el esquema real antes de repetir el ensayo; también deben resolverse los gates operativos abiertos de M1.

## Aislamiento y estado inicial

- Base temporal migrada inicialmente con el código de `59e425ee^` hasta tenant 142.
- Un tenant sintético incluyó expediente, suscriptor, Party, contactos, consentimientos, solicitud ARCO, intento de contacto y verificación de cobertura. No se copiaron datos reales.
- PostgreSQL, Redis y MinIO se enlazaron a loopback. MinIO se verificó privado. API y worker se dirigieron únicamente a esos servicios.
- El código del árbol actual aplicó después las migraciones públicas 026–027 y tenant 143–148.
- Se leyó el bloqueo K2 antes de aplicar el recifrado. No se intentó `--apply` tras detectar destinos ausentes.

## Evidencia por paso

| Paso                                    | Resultado y duración                    | Evidencia agregada                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Preflight                           | No ejecutado                            | Los gates de plataforma/ventana de M1 siguen abiertos; este ensayo no constituye autorización de release.                                                                                                                                                                                                                                                                                                                                                                  |
| 1 · Backup y restore aislados           | Parcial, con restores exitosos          | Backup global 1,07 s; `pg_restore --list` 1,21 s; restore global 3,87 s. Build de `@iwana/db` para destino fresco 3,25 s; baseline público 001–024 1,18 s. Restore tenant previo 5,84 s y restore de rollback en base nueva 5,94 s; ambos restauraron 121 tablas. El intento con `DB_NAME` igual al destino fue rechazado por la guarda (exit 2, 0,64 s), sin modificar el destino.                                                                                        |
| 2 · Migraciones                         | Aprobado en la base desechable          | Público: 24→26 registros de migración, 0,74 s. Tenant: 137→143 registros, 0,90 s; migraciones 143–148 presentes en orden. Se procesó 1 tenant `ACTIVE`.                                                                                                                                                                                                                                                                                                                    |
| 3 · B13 Party                           | Dry-run y apply aprobados               | `partiesSeen=2`, `partiesWouldSetHmac=2`, `partiesWouldEncrypt=1`; `contactsSeen=2`, `contactsWouldSetHmac=2`, `contactsWouldEncrypt=1`; `whatsappSeen=1`, `whatsappWouldSetHmac=1`, `whatsappWouldEncrypt=1`. Sin fallos ni valores personales en salida.                                                                                                                                                                                                                 |
| 4 · Conciliación 146                    | Aprobado                                | `consent_records.sin_party=0`, `consent_records.sin_finalidad=0`, `habeas_data_consents.sin_party=0`, `arco_requests.sin_party=0`, `arco_requests.tipo_no_reconocido=0`.                                                                                                                                                                                                                                                                                                   |
| 5 · Placeholders                        | Dry-run, apply y verificación aprobados | Antes: 1 suscriptor; email placeholder=1, teléfono placeholder=1, HMAC de contacto Party placeholder=1, valores vacíos=0. Después: todos los placeholders=0 y valores vacíos=0. Permaneció 1 suscriptor `ACTIVE` sin contacto, conteo comunicado como condición operativa; no se reconstruyeron datos.                                                                                                                                                                     |
| 6 · Recifrado K2                        | **Bloqueado; no aplicar**               | Dry-run exit 1, `blocking=yes`, 4 objetivos ausentes: `subscriber_contacts.email_encrypted`, `subscriber_contacts.phone_encrypted`, `potential_leads.email_encrypted`, `potential_leads.phone_encrypted`. En objetivos existentes: 8 candidatos, 6 por recifrar y 2 ya PII; verify exit 1 con 6 filas aún descifrables solo por MFA y 4 tablas faltantes. Errores de descifrado=0 y valores no ciphertext=0. No se ejecutó `--apply`; bandera legado conservada en `true`. |
| 7–8 · Arranque de servicios y Media     | No ejecutados como pasos de release     | El bloqueo de paso 6 exige detener la promoción. Redis y MinIO aislados estuvieron saludables (3,24 s y 5,54 s); bucket privado verificado (0,77 s).                                                                                                                                                                                                                                                                                                                       |
| 9 · Health y smoke Portal/API           | **No aprobado**                         | Health API HTTP 200. Playwright ejecutó 1 test: 0 passed, 1 failed, 0 skipped, exit 1. El login de plataforma devolvió HTTP 500 donde se esperaba 200; el test terminó en `beforeAll`, antes de crear tenant y recorrer autorización, conversión, contacto pendiente, privacidad, suplantación o alertas del worker. No se guardaron screenshots, video ni trace.                                                                                                          |
| 10 · Procedimiento manual de privacidad | No ejecutado                            | No se abrió un registro operativo ni se tramitaron casos.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11 · Rollback y cierre                  | Rollback aislado aprobado; cierre NO-GO | El dump tenant pre-paso 3 se restauró a una base nueva (exit 0, 5,94 s, 121 tablas) y se verificaron solo conteos sintéticos. El restore in-place sobre schema existente sigue STOP: la guarda exige destino distinto de `DB_NAME`; no se usó `DROP SCHEMA` ni DDL improvisado.                                                                                                                                                                                            |

El inventario actual del CLI K2 y el esquema restaurado no coinciden. El informe K2 conserva su resultado positivo para su fixture PostgreSQL mínimo independiente; este ensayo M2 evidencia que ese resultado no basta para aprobar K2 sobre el estado tenant heredado del runbook.

## E2E del smoke

Comando ejecutado:

```text
pnpm exec playwright test --config=e2e/playwright.portal.config.ts --project=chromium e2e/tests/portal-crm-contact-pending-live.spec.ts
```

El test usa Portal y API reales, crea un tenant desechable si completa el login de plataforma y configura `trace`, screenshot y video en `off`. El fallo observado fue HTTP 500 en `POST /api/v1/auth/platform/login`; no se atribuye a una regresión del flujo de contacto pendiente porque este no llegó a ejecutarse. Se requiere corregir o explicar el bootstrap/login sintético y repetir el smoke antes de considerar el paso 9.

## Limpieza y restricciones

- AI-PLAT-OPS confirmó eliminación de 7 bases `iwana_it_g7_m2_*` y 3 contenedores; verificó cero bases coincidentes antes de retirar PostgreSQL, cero contenedores y cero listeners en los puertos aislados 52087, 56379, 53931 y 53932.
- Tras detener los procesos de API y worker, también se verificaron libres los puertos locales 3000 y 3002.
- Los servicios y bases compartidos, incluido `dbiw`, no se usaron. No hubo commit.
- Las credenciales desechables expuestas accidentalmente en una salida anterior fueron rotadas y los servicios antiguos retirados; no hubo efecto en la base. No se incluye ninguna clave ni dato personal en este informe.
- **Limpieza local pendiente:** la revisión automática de comandos rechazó `Remove-Item` para el JSON sintético de credenciales y archivos temporales de ejecución, y también para `test-results/.last-run.json`, con el motivo `blocked by policy`. La infraestructura efímera sí está eliminada; esos archivos locales requieren limpieza manual.

## Siguiente acción

1. Reconciliar en K2 el inventario de tablas/columnas contra las migraciones vigentes; no crear tablas manualmente para hacer pasar el ensayo.
2. Repetir dry-run, apply, idempotencia y verify en una base aislada con estado migrado representativo; mantener el fallback MFA hasta verify en cero.
3. Corregir o diagnosticar el HTTP 500 del login de plataforma sintético y repetir el smoke completo del paso 9, incluidos privacidad, suplantación, suspensión y evidencia del job del worker.
4. Cerrar los gates de M1 sobre Compose, rollback de schema existente y alcance de flota antes de proponer G7.
