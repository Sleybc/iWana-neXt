# INFORME — MOD05 + privacidad G7 · diagnóstico del login de plataforma

**Versión:** 1.0 · **Fecha:** 2026-10-15 · **Estado:** GO; causa P3 reproducida y corregida
**Responsable:** AI-SR-BACKEND
**Fuentes:** [Ensayo M2 v1.0](INFORME-MOD05-G7-M2-ENSAYO-v1.0.md) · [Informe R8](INFORME-PRIVACY-FASE-1A-R8-v1.0.md) · [Prompt G7, §5.1 G7-3 y §5.2 L1](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md)

## Causa raíz

Se reprodujo `POST /api/v1/auth/platform/login` contra el API real en un entorno desechable con PostgreSQL migrado, Redis y una cuenta sintética. Con `PII_HASH_KEY` disponible en `process.env`, el endpoint respondió HTTP 200. En el mismo proceso, después de retirar esa variable mientras la configuración ya estaba cargada en `ConfigService`, respondió HTTP 500. El log de API identificó la excepción `PII_HASH_KEY es requerida` y la traza `resolvePiiHashKey → hashEmail → AuthService.loginPlatform`.

La causa fue la deuda P3: `hashEmail()` resolvía su clave por defecto desde `process.env`. El caso no pasó por el cargador AES de K1; ese bloque conserva el manejo de claves MFA y no causó este fallo. La causa y su ruta de ejecución quedaron reproducidas en aislamiento; no se afirma que se haya usado o modificado una configuración persistente.

## Corrección

- `AuthService`, `PlatformBootstrapService` y `PlatformUsersService` resuelven una vez `PII_HASH_KEY` desde `ConfigService` y pasan la clave explícitamente en todas sus llamadas a `hashEmail`.
- Se añadieron pruebas que operan sin la variable en `process.env` y comprueban que el HMAC conserva su valor cuando ambas fuentes usan la misma clave.
- En el API recompilado, la cuenta sintética respondió HTTP 200 con la variable presente y HTTP 200 después de retirarla del proceso, manteniendo `ConfigService` cargado.

## Verificación

| Comprobación                                                              | Resultado                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| API contra PostgreSQL y Redis efímeros; migraciones públicas              | Arranque correcto; recursos enlazados solo a loopback                                |
| Reproducción previa a la corrección                                       | HTTP 200 con variable; HTTP 500 sin variable; excepción y traza confirman P3         |
| Prueba posterior por API real                                             | HTTP 200 con variable y HTTP 200 sin variable en `process.env`                       |
| Specs de autenticación, bootstrap y plataforma                            | 3 suites, 137 pruebas aprobadas                                                      |
| `pnpm --filter @iwana/api build`                                          | Exit 0                                                                               |
| `pnpm exec turbo run test --filter=@iwana/api --force --output-logs=full` | 382 suites y 5.108 pruebas aprobadas; 4 suites y 15 pruebas omitidas; 0 fallidas     |
| Turbo                                                                     | 4 tareas exitosas; 0 cache hit                                                       |
| Limpieza                                                                  | API detenido; contenedores desechables retirados; puertos 3000, 52110 y 56390 libres |

No se guardaron claves, contraseñas, tokens, cuerpos HTTP ni datos personales en el informe. No se usaron bases compartidas y no se hizo commit.
