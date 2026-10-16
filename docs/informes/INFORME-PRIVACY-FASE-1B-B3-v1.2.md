# Informe PRIVACY Fase 1B · B3 · v1.2

**Estado:** completado. Se verificó que esta ruta no existía antes de crear el informe.

## Bloque F · subrecursos de expedientes bloqueados

Las seis lecturas — timeline, soportes documentales, archivo de soporte, intentos de contacto, consentimientos y verificaciones de cobertura — verifican acceso al expediente y su marca de privacidad. Sin permiso para leer datos bloqueados responden `403 PRIVACY_DATA_BLOCKED`; `CRM_BLOCKED_DATA_READ` y `PRIVACY_READ` permiten servir los datos bloqueados. Las listas registran `LIST_ACCESS` y `blockedServed`; el archivo registra `RECORD_ACCESS` e incluye `grantedBy`. Se bloquearon con `409` las mutaciones de esos subrecursos.

La prueba HTTP cubre SALES, TECHNICIAN y ACCOUNTANT sin permiso especial (403), con `CRM_BLOCKED_DATA_READ` y con `PRIVACY_READ` (200 y auditoría), además de las rutas de mutación.

## Bloque G · cobertura de `crm/subscribers`

Corrida comparable, sin caché, con cobertura de todos los tests del módulo:

| Métrica    |          Línea base |               Final | Resultado                |
| ---------- | ------------------: | ------------------: | ------------------------ |
| Statements | 94,05 % (1202/1278) | 94,13 % (1203/1278) | +0,08 pp                 |
| Branches   |   83,42 % (629/754) |   83,42 % (629/754) | sin caída                |
| Functions  |   90,97 % (131/144) |   91,66 % (132/144) | +0,69 pp; supera 91,47 % |
| Lines      | 94,53 % (1125/1190) | 94,62 % (1126/1190) | +0,09 pp                 |

La prueba añadida ejercita la importación heredada cuando el canal de consentimiento no es reconocido y comprueba su clasificación como `LEGACY_IMPORT`.

## Verificación

- Prueba HTTP F: Jest `--no-cache --runInBand` — **1 suite, 68 tests aprobados**.
- Corrida focalizada de expedientes, subscribers y participante Media, Jest `--no-cache --runInBand` — **4 suites, 167 tests aprobados**.
- Cobertura completa de `crm/subscribers` — **14 suites, 299 tests aprobados**; cifras arriba. Comando ejecutado sin caché:

  ```text
  pnpm --filter @iwana/api exec jest --no-cache --runInBand --coverage --coverageDirectory="../../coverage/privacy-v1.2-g-final" --coverageReporters=text-summary --coverageReporters=json-summary --collectCoverageFrom="modules/crm/subscribers/**/*.ts" --coveragePathIgnorePatterns='\.spec\.ts$' --coverageThreshold="{}" --testPathPattern="modules/crm/subscribers"
  ```

- `pnpm --filter @iwana/api typecheck` — aprobado.
- `git diff --check` — sin errores.

No se modificaron contratos compartidos, no se registraron PII, ciphertext, HMAC o claves reales y no se hizo commit.

## Deuda nueva por severidad

| Severidad | Deuda nueva |
| --------- | ----------: |
| Crítica   |           0 |
| Alta      |           0 |
| Media     |           0 |
| Baja      |           0 |
