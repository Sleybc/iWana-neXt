# MOD05 + `privacy` — K1: separación de clave PII

**Fecha:** 2026-10-15  
**Estado:** GO para el bloque K1 de código. Este informe no marca G7 ni autoriza despliegues.

## Alcance

Se añadió la clave AES-256-GCM independiente para PII según ADR-058 §3. En producción, la configuración rechaza una clave PII ausente o igual a la clave MFA. En entornos no productivos, la ausencia de la clave PII mantiene el fallback a MFA y emite un único aviso sin incluir material de clave. El cargador `loadPiiAesGcmKeyPair(config)` cifra con la clave PII activa y prepara lectura en orden PII activa, PII previa, MFA activa y MFA previa. `PII_DECRYPT_LEGACY_MFA` tiene valor predeterminado `true`; K2 deberá verificar el recifrado de todos los tenants antes de desactivarla.

`.env.example` contiene las tres variables nuevas con valores vacíos o el valor booleano de transición. No se añadieron secretos.

## Inventario de las 12 piezas

| Pieza                                                                 | Clasificación | Resultado K1                                                                        |
| --------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `apps/api/src/modules/crm/subscribers/subscribers.service.ts`         | PII           | Usa el cargador PII                                                                 |
| `apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts` | PII           | Usa el cargador PII                                                                 |
| `apps/api/src/modules/crm/expedientes/expediente.service.ts`          | PII           | Usa el cargador PII                                                                 |
| `apps/api/src/modules/crm/contacts/contacts.service.ts`               | PII           | Usa la clave PII activa                                                             |
| `apps/api/src/modules/crm/potentials/potentials.service.ts`           | PII           | Usa el cargador PII                                                                 |
| `apps/api/src/modules/parties/party-pii.util.ts`                      | PII           | Usa el cargador PII                                                                 |
| `apps/api/src/modules/privacy/requests/requests.service.ts`           | PII           | Usa el cargador PII                                                                 |
| `apps/api/src/cli/anonymize-titular.ts`                               | PII           | Usa el cargador PII                                                                 |
| `apps/api/src/cli/backfill-party-pii.ts`                              | PII           | Se incorporó al cargador PII; era un consumidor adicional que leía MFA directamente |
| `apps/api/src/modules/auth/auth.service.ts`                           | MFA           | Sin cambio; conserva MFA                                                            |
| `apps/api/src/modules/auth/platform-bootstrap.service.ts`             | MFA           | Sin cambio; conserva MFA                                                            |
| `apps/api/src/modules/platform-users/platform-users.service.ts`       | MFA           | Sin cambio; conserva MFA                                                            |

`apps/api/src/cli/reencrypt-aes.ts` permanece fuera del cambio K1 y bajo propiedad de K2, que separará objetivos MFA y PII en el CLI de recifrado.

## Cambios

- `app.config.ts` valida las variables PII y hace fail-closed en producción por ausencia o igualdad con MFA.
- `aes-gcm.util.ts` agrega esquemas Joi, cargador PII y lectura de múltiples claves previas en el orden establecido. `loadAesGcmKeyPair` conserva el contrato MFA.
- Se actualizaron los consumidores PII y sus specs de configuración/crypto. Los consumidores de autenticación MFA quedaron intactos.
- Los casos cubren fail-closed, fallback no productivo y aviso único sin clave, orden de descifrado y rechazo de la lectura MFA legada cuando la bandera está desactivada.

## Verificación

| Comando                                                                      | Resultado observado                                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/api typecheck`                                         | Exit 0                                                                                                      |
| `pnpm --filter @iwana/api lint`                                              | Exit 0; 0 errores y 7 advertencias ya existentes fuera de los cambios K1                                    |
| Jest enfocado en crypto, configuración, Party PII y consumidores modificados | 14 suites y 405 tests aprobados                                                                             |
| `pnpm exec turbo run test --filter=@iwana/api --force`                       | Exit 0; 378 suites aprobadas, 4 omitidas; 5.042 tests aprobados, 15 omitidos; 0 snapshots; 49,373 s de Jest |

La salida final de Turbo reportó `4 successful, 4 total` tareas y `Cached: 0 cached, 4 total`. En los logs de K1 el aviso de fallback identificó solo los nombres de variables, sin valores.

## Límite operativo

El GO cubre K1 y su gate de código. K2 todavía debe ejecutar y verificar el recifrado antes de apagar la lectura legada. El borrador M1 registra que falta cablear las variables PII en Compose de producción, además de otros gates operativos; por tanto este resultado no habilita un release ni cambia el estado de G7.
