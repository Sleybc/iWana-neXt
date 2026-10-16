# INFORME — MOD05 + privacidad G7 · M1 Runbook por tenant

**Versión:** 1.0 · **Fecha:** 2026-10-15 · **Estado:** BORRADOR; revisión documental SEC sin hallazgos bloqueantes; tres gates operativos abiertos
**Responsable:** AI-PLAT-OPS
**Fuente:** [Plan MOD05 + privacy camino a G7, §2](../plans/2026-10-15-mod05-privacy-g7-release.md) · [Prompt G7, §2 C-M1](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md).

## Resultado

Se preparó [RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md) con los pasos 0–11. Cada paso identifica comandos o la acción operativa exacta, evidencia agregada sin PII, condición de parada y rollback. Integra por enlace B13, el runbook manual de privacidad, release/rollback, Media/MinIO y rotación de claves.

Se actualizó §6ter en [RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md) con el CLI publicado por K2 para MFA→PII, su secuencia dry-run/apply/idempotencia/verify, el orden de despliegue, la bandera `PII_DECRYPT_LEGACY_MFA` y la limitación explícita de que K2 no ofrece PII→PII para una rotación posterior.

**M1 continúa abierto.** Este material no autoriza un release. La revisión documental SEC no reportó hallazgos bloqueantes, incluido el procedimiento común de generación segura de claves. Esto no declara G-SEC ni autoriza la ventana; el cierre de M1 sigue condicionado a resolver los tres gates operativos siguientes.

En la revisión SEC se detectó que varias instrucciones de generación enviaban claves a stdout. Se consolidó §1 como procedimiento común para `MFA_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY` y `PII_HASH_KEY`; §2, §6bis y §6ter remiten a ese procedimiento. Usa temporal restringido, valida solo el conteo de bytes, importa por mecanismo aprobado sin mostrar el valor y borra el archivo con limpieza automática al salir. La re-revisión documental no reportó hallazgos bloqueantes en este procedimiento; no se declara G-SEC ni cierre M1.

## Gates operativos abiertos

1. **Compose no cablea la nueva configuración.** En el estado revisado, API y migrator solo declaran MFA y HMAC; faltan `PII_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY_PREVIOUS` y `PII_DECRYPT_LEGACY_MFA` en ambos servicios ([API en docker-compose.prod.yml](../../docker-compose.prod.yml#L144), [migrator](../../docker-compose.prod.yml#L413)). Este encargo es documental y no modifica Compose; el cableado debe resolverse por el bloque de infraestructura autorizado antes de la ventana.
2. **Rollback tenant sobre schema existente sin mecanismo aprobado.** El restaurador versionado aborta si el schema ya existe y no debe sustituirse con `DROP SCHEMA ... CASCADE`; §6.3 remite a un procedimiento de ventana, pero no incluye el mecanismo concreto de reemplazo ([RUNBOOK-RELEASE-ROLLBACK-v1.0.md](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md#L449)). §11 mantiene STOP y escala sin improvisar DDL.
3. **La migración tenant tiene alcance de flota.** El runner procesa todos los tenants `ACTIVE` y no acepta un schema en el comando ([RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md](../runbooks/RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md#L13)). AI-EM-ARCH debe confirmar que la ventana conjunta satisface el alcance por tenant.

## Contrato y evidencia K2 incorporados

El comando por tenant es `pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --schema=<tenant> [--apply]`; la verificación es `pnpm --filter @iwana/api encryption:reencrypt -- --verify-pii-only --schema=<tenant>`. Ambos modos exigen `--schema` explícito y rechazan `public` antes de abrir la conexión. K2 resuelve el schema mediante consulta parametrizada a `public.tenants`, valida que el namespace físico exista y no filtra por estado: cubre cualquier status con tenant registrado, incluidos `ACTIVE`, `INACTIVE`, `SUSPENDED` y `MARKED_FOR_DELETION`. Schema ausente/no registrado falla antes de consultar tablas tenant; tablas/objetivos faltantes impiden completar verify. MFA general sigue limitado a `ACTIVE`. No hay modo de flota, por lo que se compila `@iwana/api` y se ejecuta cada schema explícitamente.

El informe fuente [INFORME-MOD05-G7-K2-v1.0.md](INFORME-MOD05-G7-K2-v1.0.md) registra: 2 suites y 51 tests CLI aprobados; typecheck exit 0; 1 suite y 1 test de integración PostgreSQL aprobados. La integración resolvió schemas retenidos en `ACTIVE`, `INACTIVE`, `SUSPENDED` y `MARKED_FOR_DELETION`, y rechazó un schema no registrado. En el fixture sintético hubo 21 candidatos en dry-run sin escritura, 21 recifrados iniciales y 0 en la segunda aplicación; `NULL` se conservó y verify dio 0 filas que solo abrieran con MFA. Usó el contenedor Postgres efímero `iwana_it_g7_k2_f1020b6e6b` en loopback, eliminado al terminar (`EPHEMERAL_CONTAINER_REMOVED=True`). La corrida Turbo API `--force` final tras el hardening MFA reportó 380 suites aprobadas y 4 omitidas; 5.097 tests aprobados y 15 omitidos (5.112 total); `Cached: 0 cached, 4 total`. Esta evidencia corresponde al trabajo K2; M1 no repitió tests ni ejecutó el CLI contra tenants existentes.

**Gate de cierre de fallback MFA:** mantener `PII_DECRYPT_LEGACY_MFA=true` hasta que cada schema de tenant registrado, cualquiera que sea su status, tenga recifrado e idempotencia documentados y `--verify-pii-only` en cero. K2 requiere una invocación por schema; si el tenant no se puede resolver, falta el namespace/tablas/objetivos o no se verifica en cero, conservar el fallback y escalar. No cambiar el estado del tenant para procesarlo. Este control criptográfico no cierra ni reemplaza los tres gates operativos de release que permanecen abiertos arriba.

## Alcance y verificación

- Leídos `AGENTS.md`, plan §2, prompt §2 C-M1, los cinco runbooks fuente y las skills `docs-architect`, `docker-expert` y `postgresql`; comprobadas nuevamente sus rutas.
- Trabajo limitado a documentación M1. No se tocó código, migraciones, Compose, otras configuraciones ni datos.
- No se ejecutaron comandos contra `dbiw`, PostgreSQL, MinIO ni ningún entorno. No se generó ni incluyó ninguna clave real. No se ejecutaron pruebas.
- Las rutas del runbook nuevo y de este informe se comprobaron libres antes de escribir.
- Se incorporó el contrato CLI y solo la evidencia publicada por K2; no se copiaron valores sintéticos, ciphertext ni datos personales.
- `pnpm exec prettier --check` pasó en los tres documentos; `git diff --check` del archivo trackeado y la variante `--no-index --check` para los dos archivos nuevos no reportaron errores de whitespace.

## Siguiente estado

M1 no se declara cerrado hasta resolver los tres gates operativos de este informe. La revisión documental SEC reportó ausencia de hallazgos bloqueantes; esto no equivale a G-SEC ni a aprobación del release. K2 ya publicó su CLI y evidencia; el Turbo API `--force` tras el hardening MFA pasó con `Cached: 0 cached, 4 total` según la corrida coordinada por el padre. M1 no repitió esa prueba.
