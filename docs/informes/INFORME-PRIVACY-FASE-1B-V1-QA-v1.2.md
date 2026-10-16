# Informe V1 QA — Privacy Fase 1b · v1.4

**Fecha:** 2026-10-16  
**Estado:** **[BLOQUEO]** — precondición de base ausente; E2E no ejecutado.  
**Plan:** [`2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md`](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md) v1.4.  
**Contrato:** prompts Fase 1b v1.0–v1.4; para la suite y su matriz, ver [V1 QA v1.1](INFORME-PRIVACY-FASE-1B-V1-QA-v1.1.md).  
**Propiedad V1:** Playwright E2E de Fase 1b. No se modificaron pruebas, fixtures, API ni contratos.

## [BLOQUEO] Precondición no satisfecha

Según la consulta de solo lectura ya ejecutada por coordinación contra la configuración de `.env.development`, la conexión apunta a `DB_PORT=5433`, base `dbiw`, y el tenant configurado se resolvió sin exponer su identificador. La consulta informó:

| Migración tenant | Aplicada |
|---|---:|
| 149 | No |
| 150 | No |
| 151 | No |

Resultado reportado: `readyForV1=false`. La ruta requiere `dbiw` respaldada y migrada hasta tenant 151 antes de E2E. No repetí la consulta ni ejecuté backup o migraciones. La evidencia recibida no incluye el texto exacto del comando SQL/de conexión; no lo reconstruyo ni lo presento como una ejecución propia.

Por instrucción de v1.4, **no arranqué la API, no inicié Playwright y no interactué con fixtures**. La base no satisface la precondición del punto de integración.

## Comando y conteo

Comando E2E previsto, pendiente de que se cumpla la precondición:

```powershell
pnpm exec playwright test --config=e2e/playwright.portal.config.ts e2e/tests/portal-privacy-fase-1b-live.spec.ts --retries=0
```

**Conteo real de esta actuación:** no disponible; la suite no se ejecutó. No hay cifra de suites/tests pasados o fallidos que reportar. No se debe interpretar como una corrida de 0/0.

## Matriz R1–R16 y delta v1.4

La matriz vigente test por test, con los límites y referencias complementarias que V1.1 registró sin afirmar una ejecución, está en [INFORME-PRIVACY-FASE-1B-V1-QA-v1.1.md](INFORME-PRIVACY-FASE-1B-V1-QA-v1.1.md). Esta actuación no repite ni convierte esas referencias en resultados de ejecución.

**R10 de v1.4 queda pendiente de V1.** El delta amplía la regla a toda mutación `POST`, `PATCH`, `PUT` o `DELETE` de suscriptores, contratos y expedientes que opere sobre un titular bloqueado: debe responder 409 antes de escribir, sin excepción por `privacy.read` ni `crm.blocked_data.read`. El delta prescribe pruebas HTTP por familias de mutación y verificación de que el repositorio no escribe; esta verificación V1 no pudo acreditarlas por el bloqueo de la base.

## Resultado

G6 sigue abierto. La ruta de este informe estaba libre antes de crear el archivo. No se registraron PII, slug/schema, ciphertext, HMAC, credenciales ni claves. No se realizaron cambios fuera de este informe y no se hizo commit.

