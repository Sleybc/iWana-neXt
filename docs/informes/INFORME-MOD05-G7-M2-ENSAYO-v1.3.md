# INFORME — MOD05 + privacidad G7 · ensayo M2d (condición de cierre M2c)

**Versión:** 1.3 · **Fecha:** 2026-10-16 · **Estado:** Ensayo M2d **completo con evidencia viva**; cierra la condición M2d de [PREPARACION v1.0](INFORME-MOD05-PRIVACY-G7-PREPARACION-v1.0.md) §2. No concede G7 ni autoriza ventana
**Responsables:** AI-SR-QA (ejecución) con AI-PLAT-OPS (infraestructura desechable)
**Fuentes:** [Prompt G7](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md) §2 C-M2 · [Runbook por tenant](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md) pasos 2 a 6 · [M2c v1.2](INFORME-MOD05-G7-M2-ENSAYO-v1.2.md) · [B13](../runbooks/RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md)
**Ruta verificada libre:** `docs/informes/INFORME-MOD05-G7-M2-ENSAYO-v1.3.md` no existía antes de redactar. Sin commit.

Skills leídas antes de actuar (como documentación): `iwana-test-evidence`, `verification-before-completion`; de apoyo `postgresql`.

## Alcance ejecutado

Repetición de los pasos 2 a 6 con el tenant sembrado que pedía C-M2, en los dos estados de código del encargo:

- **Partida:** base desechable migrada **solo hasta la 142** con el código de `59e425ee^` (`7d35e604`, worktree temporal desechado tras migrar). Tenant migrado: 24 públicas + 137 tenant, última `ExpandInventoryBaseCostPrecision1420000000000`.
- **Siembra pre-release** (todo sintético, dominios `.invalid`, claves efímeras de sesión nunca escritas en repo ni en este informe): 5 expedientes con PII cifrada MFA; 10 Party (5 con documento en claro + 5 cifradas MFA con IV aleatorio, incluida 1 duplicada lógica del mismo documento: una en claro y una cifrada, indistinguibles para el índice único de la 142); 4 `party_contact` en claro; 4 suscriptores (3 con placeholder: 1 ACTIVE con doble placeholder, 1 con placeholder de correo, 1 con placeholder de teléfono; 1 regular); 4 `consent_records` (3 con suscriptor vinculado, 1 sobre expediente sin suscriptor).
- **Ejecución:** pasos 2 a 6 con el código de `main` (`8a234c38`, artefacto recompilado antes de los CLI): migraciones 143→148, B13 dry-run → resolución → `--apply`, conciliación de la 146, placeholders dry-run/`--apply`, recifrado dry-run/`--apply`/segundo `--apply`/verificación.

## Infraestructura desechable (eliminada al cierre)

| Componente | Nombre / puerto | Estado final |
| --- | --- | --- |
| PostgreSQL 18 | `iwana_it_g7_pg_m2d`, `127.0.0.1:52221` | Contenedor eliminado (con él, la base `iwana_it_g7_m2d_base`) |
| Base + tenant | `iwana_it_g7_m2d_base`, schema `tenant_m2d_ensayo` | Eliminadas con el contenedor |
| Worktree código previo | `C:\appiw-m2d-old` (`7d35e604`) | Registro retirado (`worktree list` solo muestra `C:/appiw`) y directorio borrado |
| Directorio temporal | `TEMP\opencode\m2d-ensayo` (scripts, claves de sesión, SQL) | Borrado |
| Servicios compartidos | `*_dev` (postgres, redis, pgbouncer, minio, nginx, typesense) | Intactos, solo lectura incidental de `docker ps` |

## Evidencia por paso (tiempos y conteos reales, sin PII)

| Paso | Resultado | Tiempo / conteos |
| --- | --- | --- |
| 0 · Partida 142 | Aprobado | Públicas exit 0 (1,0 s, 24 migraciones). Tenant exit 0 (2,7 s; 137 migraciones, última la 142). Siembra exit 0 (0,3 s): 5 expedientes, 5 Party en claro, 5 cifradas, 4 contactos, 4 suscriptores (1 ACTIVE), 4 `consent_records` |
| 2 · Migraciones main | Aprobado | Públicas exit 0 (0,7 s, sin pendientes nuevas). Tenant exit 0 (0,9 s; 137 → 143 migraciones, 143 a 148 aplicadas). La 146 informó en su corrida: `consent_records: origen=4 resueltos=3 no_resueltos=1 filas_destino=3`; habeas/arco «origen no disponible». Verificado: tenant en 148, 3 autorizaciones derivadas, 4 filas fuente conservadas |
| 3 · B13 Party | Aprobado con resolución | Dry-run 1 exit 1 (1,0 s): 10 parties (10 HMAC / 5 cifrados), 4 contactos (4/4), 1 whatsapp (1/1), **1 candidato de fusión CC ×2**, `blockedReason=merge-candidates`. **Resolución:** el duplicado cifrado se marcó `MERGED` hacia el canónico en claro (decisión del dueño del dato, solo en acta restringida temporal). Dry-run 2 exit 0 (0,9 s): candidatos 0, fallos 0, `blockedReason=null`. `--apply` exit 0 (0,9 s, `applied=true`). Verificación B13 §6: `party_document_hmac_missing=0`, `party_contact_value_encrypted_missing=0`, whatsapp sin HMAC `=0`. Segundo `--apply` exit 0 (0,9 s): todas las escrituras en 0 (idempotente) |
| 4 · Conciliación 146 (G7-4) | Aprobado, sin parada | Pre-chequeo solo lectura: `consent_records` existe; `habeas_data_consents`/`arco_requests` no existen («no aplica: la tabla nunca se creó», misma evidencia que M2c). Conciliación: `sin_party=1`, `sin_finalidad=0` (0,2 s). **Decisión operativa:** el residuo `sin_party=1` es el legado sobre expediente sin suscriptor vinculado; la 146 ya lo conservó como fila fuente sin autorización derivada (3 de 4); no se repara por SQL; no bloquea el ensayo (en ventana real lo resuelve el Oficial) |
| 5 · Placeholders | Aprobado + idempotencia | Dry-run exit 0 (0,9 s): 4 vistos, **2 correos + 2 teléfonos placeholder**, **1 ACTIVE sin contacto tras backfill**. `--apply` exit 0 (0,9 s, `applied=true`). Segundo `--apply` exit 0 (0,9 s): placeholders 0/0, ACTIVE sin contacto `=1` (idempotente). Verificación: correos nulos 2, teléfonos nulos 2, ACTIVE sin contacto 1 |
| 6 · Recifrado K2 | Aplicado y verificado en 0 | Dry-run exit 0 (0,9 s): `candidates=45 reencrypted=35 skipped_pii=10 non_ciphertext=0 decrypt_errors=0 blocking=no` (party 10→5, suscriptores 9→9, expedientes 21→21, contactos/whatsapp ya en PII por B13). `--apply` exit 0 (1,1 s): 35 recifradas. Segundo `--apply` exit 0 (1,0 s): `reencrypted=0 skipped_pii=45`. `--verify-pii-only` exit 0 (0,9 s): `mfa_only_remaining=0 pii_previous_remaining=0 non_ciphertext=0 decrypt_errors=0 pending=0 blocking=no` |

## Notas del ensayo (sin ocultar)

1. **`party_contact` con clave MFA es imposible en el estado previo:** a 142 esa tabla solo tiene `value` en claro (`value_encrypted` la crea la 143); por eso B13 lo cifra directamente con la clave PII. La cobertura MFA→PII del recifrado quedó en Party (5 filas), suscriptores (9 celdas) y expedientes (21 celdas): 35 recifradas, 10 ya en PII por B13. Comportamiento esperado, no desviación.
2. **Sin `NODATA-*` en la siembra:** toda Party sembrada era normalizable y cifrable, de modo que el verify de K2 no tuviera restos en claro (la excepción `NODATA` de B13 habría contado como `nonCiphertext` bloqueante en K2). Decisión de diseño del ensayo, declarada.
3. **Claves 100 % sintéticas de sesión** (MFA, PII y hash distintas entre sí, generadas con `randomBytes(32)`), usadas solo vía entorno contra la base desechable; nunca escritas en repo ni en este informe. Las PII sembradas usan dominios `.invalid` y documentos ficticios.
4. **Los segundos `--apply` de B13 y placeholders exceden el runbook** (que solo exige el segundo en K2): se ejecutaron para demostrar la idempotencia que pide C-M2 («el segundo `--apply` de cada CLI da 0»); ambos dieron escrituras en 0 sin efectos.

## Limpieza y restricciones

- Contenedor `iwana_it_g7_pg_m2d` eliminado (bases `iwana_it_g7_*` con él: 0 restos); worktree previo retirado y borrado; temporal del ensayo borrado; puerto 52221 libre; solo `*_dev` en pie.
- Runtime, claves, tokens, ciphertexts, HMAC e IDs de fila nunca escritos en repo ni en este informe (solo conteos agregados y nombres de recursos desechables).
- Sin PII real en fixtures, logs ni informe. Sin commit. `dbiw` y servicios compartidos intactos.

## Cierre

M2d ejecuta los pasos 2–6 sobre datos previos realistas con evidencia viva: B13 con candidato de fusión resuelto y verificación en 0, conciliación G7-4 con `sin_party=1` coherente con la siembra, placeholders con el ACTIVE contado como «sin contacto», y recifrado de 35 filas con segundo `--apply` en 0 y verify en 0 filas solo-MFA. **La condición M2d queda cumplida**; este ensayo no concede ningún gate de release: la decisión CTO/G7 sigue fuera de su alcance.
