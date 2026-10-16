# INFORME — MOD05 + privacidad G7 · ensayo M2c

**Versión:** 1.2 · **Fecha:** 2026-10-16 · **Estado:** Ensayo M2c **completo con evidencia viva**; no concede G7 ni autoriza ventana
**Responsables:** AI-SR-QA (ejecución) con AI-PLAT-OPS (infraestructura desechable)
**Fuentes:** [Prompt G7](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md) §6 · [Runbook por tenant](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md) · [M2b v1.1](INFORME-MOD05-G7-M2-ENSAYO-v1.1.md) · [M4 v1.0](INFORME-MOD05-G7-M4-v1.0.md) (GO formal sec-eng 2026-10-16)
**Ruta verificada libre:** `docs/informes/INFORME-MOD05-G7-M2-ENSAYO-v1.2.md` no existía antes de redactar. Sin commit.

Skills leídas antes de actuar (como documentación): `iwana-test-evidence`, `verification-before-completion`; de apoyo `playwright-skill`, `bullmq-specialist`.

## Alcance ejecutado

Repetición de los pasos 1 a 11 desde el estado `59e425ee^`, con las condiciones del encargo:

- Paso 4 según G7-4 (solo `consent_records`; `habeas_data_consents`/`arco_requests` como «no aplica: la tabla nunca se creó»).
- Paso 6 aplicado y verificado en 0.
- Paso 7 (texto legal publicado) antes del smoke.
- Paso 8: bucket privado sin política pública, URL firmada de 300 s para `stratum_evidence` y `privacy_evidence`, endpoints genéricos bloqueados.
- Paso 9: job `privacy-due-alerts` encolado en Redis desechable y consumido por el procesador de la API.
- Paso 11: rollback en sitio con `--rollback-in-place` sobre el schema existente, y su reversión.

Solo bases desechables `iwana_it_g7_m2c_*`, credenciales sintéticas generadas para el ensayo (nunca escritas en repo ni en este informe). Infraestructura eliminada y confirmada (ver § Limpieza).

## Infraestructura desechable (eliminada al cierre)

| Componente | Nombre / puerto | Estado final |
| --- | --- | --- |
| PostgreSQL 18 | `iwana_it_g7_pg_m2c`, `127.0.0.1:52217` | Contenedor eliminado |
| Redis 7 | `iwana_it_g7_redis_m2c`, `127.0.0.1:52218` | Contenedor eliminado |
| MinIO | `iwana_it_g7_minio_m2c`, `127.0.0.1:52200/:52201`, bucket `iwana-media-m2c2` | Contenedor eliminado |
| Bases | `iwana_it_g7_m2c_base`, `iwana_it_g7_m2c_release` | Eliminadas (`0` restos `iwana_it_g7*`) |
| API development | `:3100` luego `:3000` (same-origin para el smoke) | Procesos detenidos, puertos libres |
| API staging | `:3001` (sin `envFile`, para 8c) | Proceso detenido, puerto libre |
| Worker | contra Redis/PG desechables | Detenido |
| Portal dev | `:3002` (Playwright / manual breve) | Puerto libre |

## Evidencia por paso (tiempos y conteos reales)

| Paso | Resultado | Tiempo / conteos |
| --- | --- | --- |
| 1 · Backup y restore aislado | Aprobado | Backup tenant: exit 0, 466.896 bytes, `sha256 c845b3…` (0,4 s). Backup global: exit 0, 500.518 bytes. Restore global a base nueva: exit 0 (1 tenant, 143 migraciones tenant). Checksums correlacionados |
| 2 · Migraciones | Aprobado | `migration:run` público: exit 0 en 1,47 s (público en 027). `migration:tenant:run`: exit 0 en 2,79 s (143 migraciones, tenant en 148; la 146 informa «origen no disponible» para habeas/arco) |
| 3 · B13 Party | Aprobado | Dry-run exit 0 en 3,90 s (0 candidatos); apply exit 0 en 0,64 s (`applied: true`, 0 fallos) |
| 4 · Conciliación 146 (G7-4) | Aprobado, sin parada | Pre-chequeo: `consent_records` existe; `habeas_data_consents`/`arco_requests` no existen. Conciliación solo lectura: `sin_party 0`, `sin_finalidad 0`. Evidencia: ningún `CREATE TABLE` de habeas/arco fuera de `146_privacy_module.integration.spec.ts` (solo fixtures); ambas se registran como «no aplica: la tabla nunca se creó» |
| 5 · Placeholders | Aprobado | Dry-run 0,62 s y apply 0,63 s, exit 0; 0 placeholders, 0 `ACTIVE` sin contacto |
| 6 · Recifrado K2 | Aplicado y verificado en 0 | Dry-run/apply/apply/verify exit 0 (~0,65–0,69 s c/u): `candidates=0 reencrypted=0 decrypt_errors=0 pending=0`, `blocking=no`. Tenant sintético vacío; los conteos de producción se toman del dry-run por tenant y K2Δ cubre el fixture no vacío |
| 7 · Texto legal y Oficial | Aprobado (parcial menor, ver límites) | API health 200. `POST /privacy/legal-texts` 201 (`AUTORIZACION m2c-qa-v1`, vigente) + `GET current` vigente. `privacy.manage=true` en el Oficial sintético. Asignación de perfil por gestión aprobada (vía API en el ensayo) |
| 8 · Media | **Validado vivo** | 8a bucket `private` (`mc anonymous get`). 8b `proof` de `privacy_evidence` con `ttlSeconds=300` (0,08 s; URL descartada). 8c `stratum-evidence/signed-url` con `ttlSeconds=300` (0,08 s; URL descartada). 8d `POST /media/upload` con `stratum_evidence` → **400** (0,04 s); `GET /media/:id/signed-url` de evidencia → **404** (0,03 s) |
| 9 · Smoke + BullMQ | Aprobado | Contacto pendiente: **1 passed (35,3 s)**, tenant final `INACTIVE`. Privacidad: **3 passed (31,4 s)** (consulta completa, autorización+conversión, suplantación con suspensión). Job `privacy-due-alerts-tenant` en Redis desechable: `active → completed` en **2,2 s** por el procesador de la API. Integración del procesador contra PG desechable: **1 suite, 1 test passed (3,5 s)**. Repeatable `07:00 America/Bogota` registrado en el Redis desechable |
| 10 · Procedimiento manual | Registrado | Registro restringido temporal fuera del repo (vigencia 2026-10-16, responsables por rol, canal de escalamiento, reporte mensual pendiente); eliminado en la limpieza |
| 11 · Rollback y reversión | **Completo** | Backup dbg: exit 0, 498.125 bytes, `sha256 5f99…` (0,5 s). Suspend 0,02 s. Pre: 128 tablas (contratos 2, suscriptores 2, autorizaciones 4, textos 1, solicitudes 2, expedientes 2). RENAME a `__pre_rollback_…`. Restore `--rollback-in-place`: exit 0 en **2,5 s**, 128 tablas, `reinyeccion: conservada`, registro intacto `SUSPENDED`. Re-ejecución **rechazada** (exit 2, schema presente, sin escrituras). Grants H-1 exit 0 (1,18 s). Post: conteos idénticos. Health 200, reactivación + login + contrato `ACTIVE` con evidencia. RENAME inverso 0,11 s: original con datos intactos (`SUSPENDED`), restaurado en cuarentena |

## Incidencias del ensayo (resueltas, sin ocultar)

1. **Smoke 1 → 403** al crear tenant: el bootstrap de plataforma exige rotación de contraseña en el primer ingreso (token de alcance `password-change`). Se rotó por el endpoint aprobado y el smoke continuó.
2. **Smoke 2 → provisioning atascado**: el worker desechable falló por rol `iwana_app` ausente; se aplicó `apply-least-privilege` en modo docker contra el contenedor del ensayo (exit 0) y se reintentó el provisioning (tenant `ACTIVE`). El tenant huérfano del intento se cerró a `INACTIVE`.
3. **Smokes 3–4 → login de Portal sin navegación**: el Portal manual apuntaba con URL absoluta a la API `:3100` y el navegador quedó bloqueado por CORS/`connect-src`. Causa raíz verificada (el proxy responde, el navegador no). Fix: API desechable en `:3000` + Portal same-origin (comportamiento estándar del `webServer` de Playwright) → smoke 5 en verde.
4. **8c en development → 503 `STORAGE_MUST_BE_PRIVATE`**: `.env.development` define `S3_PUBLIC_BASE_URL` y la guarda de estrato hace fail-closed correctamente. 8c se validó contra una API `staging` desechable (sin `envFile`, misma base/Redis/MinIO): upload 200 + `ttlSeconds=300`. El 503 queda como evidencia de que la guarda rechaza storage no privado.
5. **Integración del procesador, primer intento `skipped`**: la variable de entorno no se propagó en esa invocación; reintento limpio → 1/1 passed. Se conservan ambos hechos.

## Límites y desviaciones declaradas

- **Confirmación TTY del CLI**: el harness no ofrece TTY y `restore-tenant.mjs` exige TTY real para misma base (`confirmSameDatabaseRestore`). Sin modificar código, se operó con `DB_NAME` divergente (`…_base`) e `--into` = base vigente, más verificación doble del schema (sidecar + pre-chequeo). Gate fail-closed, `pg_restore --exit-on-error`, ausencia de `injectTenantRow` y resumen son código real sin modificar; en operación rige la confirmación TTY. Los tests unitarios del CLI ya cubren la confirmación (M4).
- **K2 sobre tenant vacío**: 0 candidatos; la idempotencia y el verify en cero quedan demostrados, no el recifrado de filas (cubierto por K2Δ).
- **Catálogo de retención (paso 7)**: no se verificó explícitamente el `GET retention-policies` en este ensayo; el texto vigente sí se publicó y consumió en el smoke.
- **Primer `POST /privacy/authorizations`**: la respuesta es `{ data: { authorizationId } }` (no `id`); el proof posterior usó el identificador correcto.

## Limpieza y restricciones

- Procesos `:3000/:3100/:3001` detenidos y `:3002` libre; bases `iwana_it_g7_m2c_*` eliminadas (0 restos); contenedores `iwana_it_g7_*` eliminados (solo `*_dev` en pie); directorio temporal del ensayo eliminado; dump global del ensayo retirado de `.backups/`; runtime/ claves/ tokens/ URLs firmadas nunca escritos en repo ni en este informe.
- Sin PII real en fixtures, logs ni informe. Sin commit. `dbiw` y servicios compartidos intactos (solo se usó lectura incidental de imágenes Docker).

## Cierre

M2c ejecuta los pasos 1–11 con evidencia viva: conciliación G7-4 sin parada, K2 verificado en 0, texto legal antes del smoke, Media validado (privado + TTL 300 + negativos), alertas pasando por BullMQ desechable hasta `completed`, y rollback `--rollback-in-place` con conteos idénticos más reversión. Las desviaciones (TTY, tenant K2 vacío, retención no verificada) quedan registradas arriba. **Ningún gate de release queda concedido por este ensayo**; la decisión CTO/G7 está fuera de su alcance.
