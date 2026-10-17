# PROMPT — `privacy` Fase 1b · V1 · Ejecución de la suite E2E viva · v1.2

**Versión:** 1.2 (reemplaza a [v1.1](PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.1.md)) · **Fecha:** 2026-10-16 · **Estado:** Reemplazado por [v1.3](PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.3.md) · **Emisor:** AI-EM-ARCH · **Agente:** `sr-qa` · **Base:** `main` en `1214ea02`
**Origen:** [V1 QA v1.5](../informes/INFORME-PRIVACY-FASE-1B-V1-QA-v1.5.md): `[BLOQUEO]`. El tenant `e2e-privacy-1b-…` quedó en `PROVISIONING` porque el worker, que procesa la cola `tenant-provisioning`, no estaba arrancado.

**Inspección de colas (AI-EM-ARCH, solo lectura, 2026-10-16):**
- `tenant-provisioning`: 1 trabajo, el de este tenant. `search-index`: 2 trabajos inocuos. Nada activo ni priorizado.
- En las otras 9 colas solo hay tareas programadas (`repeat:`).
- `tenant-schema-purge` solo purga tenants `MARKED_FOR_DELETION` con la retención vencida, y hoy hay 0.
- **Arrancar el worker es seguro.**

## Diagnóstico de AI-EM-ARCH

- **Tenant configurado:** `E2E_TENANT_SLUG` apunta a `e2e-privacy-mv8kvz61-61187e`, creado el 2026-10-14 para la Fase 1a. Hoy está `INACTIVE`, y `db:migrate:all` solo migra tenants `ACTIVE`.
- **Tenants ACTIVE:** `iwana`, `test-s2-live` y `srqa-mod11-r5-20261006`. Ninguno es desechable para esta suite.
- **Patrón vigente:** `e2e/scripts/seed-mod11-r5-fixtures.mjs:60-116` inicia sesión con `E2E_PLATFORM_*`, crea su tenant con `POST /tenants`, espera `ACTIVE` y falla si queda `PROVISIONING_FAILED`. El aprovisionamiento corre todas las migraciones, así que un tenant nuevo nace con la 151.
- **No se reactiva ni se migra a mano el tenant viejo.**
- **No se cambia `E2E_TENANT_SLUG`:** la suite de la Fase 1a lo usa.

## Encargo (en este orden; el orden de v1.0 queda reemplazado)

1. **Servicios:** arrancar la API (`pnpm --filter @iwana/api dev`, `:3000`), **el worker** (`pnpm --filter @iwana/worker dev`) y el portal (`:3002`) contra `dbiw`, y esperar `/api/v1/health` 200. Si al arrancar el worker aparece en sus logs una purga de schema, detenerlo y emitir `[BLOQUEO]`.
2. **Tenant propio de la fase:** reejecutar `e2e/scripts/seed-privacy-fase-1b-fixtures.mjs`, que es idempotente: reutiliza el tenant ya creado y espera `ACTIVE`.
   - Crea o reutiliza el tenant `e2e-privacy-1b-<sufijo>`.
   - Espera `ACTIVE`.
   - Acredita con `typeorm_migrations` del schema nuevo que tiene la 149 a la 151.
   - Crea los actores con contraseñas **aleatorias**: el administrador con el perfil «Oficial de protección de datos» y los permisos de CRM del escenario, y los actores `SALES`, `TECHNICIAN`, `ACCOUNTANT` **con** el perfil «Facturación y cobro» y `ACCOUNTANT` **sin** él (R16).
   - Escribe **solo** en `.env.development.local` las variables nuevas `E2E_PRIVACY_1B_TENANT_SLUG`, `E2E_PRIVACY_ADMIN_EMAIL` y `E2E_PRIVACY_ADMIN_PASSWORD`, sin imprimir nunca una contraseña.
   - La suite pasa a leer `E2E_PRIVACY_1B_TENANT_SLUG` en vez de `E2E_TENANT_SLUG`.
3. **Casos de R10 v1.4:** agregarlos al spec (transición de estado del suscriptor y archivo del contrato sobre un bloqueado → 409, también con `crm.blocked_data.read`).
4. **Ejecución:** la suite completa con `--retries=0`.
5. **Cierre:** detener la API, el worker y el portal. El tenant se conserva para repetir la corrida y se informa su slug.

## Evidencia

- El conteo real de Playwright, por test.
- La matriz R1–R16 ↔ test.
- La ruta del trace de cada fallo.
- La salida del script de siembra, sin secretos.

## Reglas

- Solo `e2e/**` y `.env.development.local`. Nunca código de producto, contratos ni otros tenants.
- No reactivar, migrar ni restaurar tenants existentes, ni `dbiw`.
- Ninguna credencial, PII ni token en el repo, los informes o los logs: solo los nombres de las variables. No commitear.
- Informe: `docs/informes/INFORME-PRIVACY-FASE-1B-V1-QA-v1.6.md`, con la ruta verificada como libre.
