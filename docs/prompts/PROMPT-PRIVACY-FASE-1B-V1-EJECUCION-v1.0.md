# PROMPT — `privacy` Fase 1b · V1 · Ejecución de la suite E2E viva

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Estado:** Reemplazado por [v1.1](PROMPT-PRIVACY-FASE-1B-V1-EJECUCION-v1.1.md) · **Emisor:** AI-EM-ARCH · **Agente:** `sr-qa` · **Base:** `main` en `1214ea02`
**Origen:** [V1 QA v1.3](../informes/INFORME-PRIVACY-FASE-1B-V1-QA-v1.3.md): `[BLOQUEO]`. La API no respondía en `:3000/health` y faltaban `E2E_PRIVACY_ADMIN_EMAIL` y `E2E_PRIVACY_ADMIN_PASSWORD`.

## Diagnóstico de AI-EM-ARCH

- **Las variables:** `e2e/tests/portal-privacy-fase-1b-live.spec.ts:173-174` pide dos variables que **no existen** en ningún archivo de entorno. `e2e/load-env.ts` carga `.env.development.local`, que está fuera de git (`.gitignore:21`) y define `E2E_PLATFORM_*`, `E2E_TENANT_SLUG`, `E2E_AUDITOR_*`, `E2E_PRIVACY_EXPEDIENTE_ID` y `E2E_PRIVACY_PLAN_ID`. La suite de la Fase 1a (`portal-privacy-live.spec.ts`) usa `E2E_AUDITOR_*`.
- **La base:** `dbiw` está respaldada y migrada; los 3 tenants ACTIVE tienen la 149 a la 151.
- **La API:** `apps/api` levanta con `pnpm --filter @iwana/api dev` en `PORT=3000`, y el portal con `pnpm --filter @iwana/portal dev` en el 3002.

## Encargo

1. **Actor administrador de la prueba,** en este orden de preferencia:
   - **(a)** Si el usuario de `E2E_AUDITOR_*` tiene los permisos que la suite necesita (`privacy.read`, `privacy.manage` y los de gestión de CRM que use el escenario), la suite lo usa, y se retiran las variables `E2E_PRIVACY_ADMIN_*`. Verificar los permisos con `GET /access-control/me/effective-permissions` o equivalente, no por rol.
   - **(b)** Si no los tiene: un script propio, `e2e/scripts/seed-privacy-fase-1b-actors.mjs`, idempotente. Con `E2E_PLATFORM_*` crea en el tenant de `E2E_TENANT_SLUG` un usuario de prueba con el perfil «Oficial de protección de datos» más los permisos de CRM que el escenario necesite.
     - La contraseña se **genera aleatoria**.
     - Las dos variables se escriben **solo** en `.env.development.local`.
     - El script nunca imprime la contraseña.
     - Los actores `SALES`, `TECHNICIAN` y `ACCOUNTANT` que la suite ya crea siguen igual.
2. **El tenant:** acreditar con `typeorm_migrations` o `pg_attribute`, **no** con `information_schema`, que el tenant de `E2E_TENANT_SLUG` es ACTIVE y tiene la 149 a la 151. Si no lo es, `[BLOQUEO]` con el nombre del tenant, sin migrarlo.
3. **Los servicios:** arrancar la API y el portal contra `dbiw` y esperar `/api/v1/health` 200. Al terminar, detener los procesos que se arrancaron.
4. **La ejecución:** la suite completa con `--retries=0`, incluido el caso de R10 v1.4 (transición de estado y archivo de contrato sobre un bloqueado → 409).
5. **La evidencia:**
   - el conteo real de Playwright;
   - la matriz R1–R16 ↔ test;
   - la ruta del trace de cada fallo, si los hay.

## Reglas

- Solo `e2e/**` y `.env.development.local`. Nunca código de producto ni contratos.
- Ninguna credencial, PII ni token en el repo, los informes o los logs. Las credenciales solo se nombran por su variable.
- No migrar ni restaurar `dbiw`. No commitear.
- Informe: `docs/informes/INFORME-PRIVACY-FASE-1B-V1-QA-v1.4.md`, con la ruta verificada como libre.
