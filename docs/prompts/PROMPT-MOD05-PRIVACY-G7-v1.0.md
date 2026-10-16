# PROMPT DE EJECUCIÓN — MOD05 + `privacy` · Camino a G7 (frentes K, M y C)

**Versión:** 1.0 · **Estado:** Emitido · **Fecha:** 2026-10-15 · **Emisor:** AI-EM-ARCH
**Plan:** [2026-10-15-mod05-privacy-g7-release.md](../plans/2026-10-15-mod05-privacy-g7-release.md)
**Fuera de este prompt:** el frente P (plataforma), que sigue su [plan propio](PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md) cuando el CTO tome las seis decisiones. **Ningún bloque marca G7.**

## 1. Frente K — ADR-058 fase 2 (`PII_ENCRYPTION_KEY`)

**Fuente:** [ADR-058 §3](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md). Hoy, las 12 piezas que cargan clave usan `MFA_ENCRYPTION_KEY` (`loadAesGcmKeyPair`, `common/crypto/aes-gcm.util.ts:97`): una sola clave abre los secretos MFA y los documentos de identidad.

### C-K1 — Configuración y carga

| Punto | Contrato |
| --- | --- |
| Variables | `PII_ENCRYPTION_KEY` (64 hex, misma validación Joi que MFA) y `PII_ENCRYPTION_KEY_PREVIOUS` (opcional), en `app.config.ts` junto a `MFA_ENCRYPTION_KEY` (`:254`) |
| Producción | **Fail-closed**: sin `PII_ENCRYPTION_KEY` o con una clave igual a `MFA_ENCRYPTION_KEY`, la API no arranca |
| No producción | Si falta, se usa `MFA_ENCRYPTION_KEY`, con un aviso único en el arranque, sin la clave |
| Cargador | `loadPiiAesGcmKeyPair(config)` → `{ activeKey, previousKey }` |
| Escritura | Toda la PII se escribe con la clave PII activa |
| Lectura | Prueba en orden: PII activa → PII previa → **MFA activa y MFA previa como respaldo legado**, mientras `PII_DECRYPT_LEGACY_MFA` sea `true` (por defecto). Tras el recifrado verificado en todos los tenants (K2), plataforma la pasa a `false` sin cambiar código |

**Clasificación de los consumidores**, que K1 confirma pieza por pieza:

| Pieza | Clave |
| --- | --- |
| `crm/subscribers` (2), `crm/expedientes`, `crm/contacts`, `crm/potentials`, `parties/party-pii.util.ts`, `privacy/requests` y `cli/anonymize-titular` | **PII** |
| `auth/auth.service.ts`, `auth/platform-bootstrap.service.ts` y `platform-users` | **MFA**, sin cambio |

Si alguna pieza mezcla las dos, se separa y se informa.

### C-K2 — Recifrado de los datos existentes

- Se extiende `apps/api/src/cli/reencrypt-aes.ts` y `reencrypt-aes.targets.ts` con un modo **MFA → PII** para los objetivos de PII: suscriptores, contactos, potenciales, expedientes, `party` y `party_contact`, y la identidad del solicitante de privacidad.
- Se agregan los objetivos que falten.
- Opera por tenant: dry-run por defecto, `--apply`, idempotente y en lotes. Entrega conteos sin PII, respeta los `NULL` y no toca los objetivos MFA.
- Su verificación: cero filas de PII que solo se descifren con la clave MFA.

## 2. Frente M — Release por tenant

### C-M1 — Runbook

`docs/runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md`, con los pasos 0 a 11 del plan §2. Cada paso lleva el comando exacto, la evidencia que produce (conteos, sin PII), su condición de parada y su rollback.

- **Integra y enlaza; no copia:** B13 (143), el runbook manual de privacidad, el de release y rollback, el de MinIO y el de rotación.
- **Además actualiza** `RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md` con la sección de `PII_ENCRYPTION_KEY`: generación, orden de despliegue, uso de `PII_DECRYPT_LEGACY_MFA` y rotación posterior.

### C-M2 — Ensayo

**Estado de partida realista:**
1. Una base desechable (`iwana_it_g7_*`) migrada **solo hasta la 142**, con el código de `59e425ee^` (último commit antes de la 143, que entra en `59e425ee`).
2. Un tenant sintético sembrado con lo que la producción tendría antes del release:
   - documentos de Party en claro y cifrados con IV aleatorio;
   - `consent_records`, `habeas_data_consents` y `arco_requests` heredados;
   - suscriptores con placeholders;
   - PII cifrada con la clave MFA.

**Ejecución:** con el código de `main` se recorre el runbook completo, de los pasos 1 a 11, incluido el recifrado de K2.

**Se mide:**
- el tiempo de cada paso;
- los conteos de cada backfill y del recifrado;
- un ensayo de rollback (restore del tenant después del paso 3);
- el smoke del paso 9.

**Al terminar:** la base se elimina y el informe lo confirma, sin datos ni secretos.

## 3. Frente C — Calidad

**C1:** elevar los branches de `apps/api/src/modules/crm/expedientes/**` a ≥ 80 % (hoy 58,23 %, `INFORME-MOD05-E3-E4-GATES-v1.3.md`). Solo con tests de comportamiento, **sin bajar** statements, functions ni lines.

## 4. Bloques

| Bloque | Subagente | Propiedad | Stop/go |
| --- | --- | --- | --- |
| K1 | `sr-backend` | `app.config.ts` (solo las variables PII), `common/crypto/aes-gcm.util.ts` (el cargador nuevo), los consumidores PII de §1 (solo la carga de la clave) y sus specs; `.env.example` (solo las variables nuevas, con valores vacíos) | Turbo API `--force`. Tests: fail-closed en producción (sin clave o con clave igual a MFA); respaldo en no producción; lectura legado MFA con la bandera en `true` y su rechazo en `false`; los consumidores MFA intactos. Inventario de las 12 piezas en el informe |
| K2 | `data-eng` | `apps/api/src/cli/reencrypt-aes*` | Después de K1. Integración contra Postgres real (sin depender del estado de migración del origen): dry-run, `--apply`, idempotencia, `NULL`, objetivos MFA intactos y verificación en cero |
| K3 | `sec-eng` | Solo lectura | GO o NO-GO sobre K1 y K2: separación de claves, fail-closed, sin claves en logs ni en salidas, recifrado sin PII en la salida |
| M1 | `plat-ops` | El runbook nuevo y la sección PII del runbook de rotación | Revisión de `sec-eng` sin bloqueantes. Cada paso con comando, evidencia, parada y rollback |
| M2 | `sr-qa` + `plat-ops` | Solo la base desechable y el informe | Después de M1 y K2. Ensayo completo según C-M2, con tiempos y conteos reales; base eliminada |
| C1 | `sr-qa` | Solo specs de `crm/expedientes/**` | Branches ≥ 80 % sin bajar las otras tres métricas; turbo API `--force` |

**Restricciones:**
- Ninguna clave real en el repositorio, los informes ni los logs.
- Nada se ejecuta contra `dbiw` ni contra un entorno compartido salvo lectura (ensayo solo en bases desechables).
- La clave HMAC sale siempre de `ConfigService`.
- Los specs de integración no dependen del estado de migración del origen.

## 5. Resultado de la Ola 1 y Ola 2 (v1.1, 2026-10-15)

| Bloque | Resultado |
| --- | --- |
| K1 | ✅ GO de código: fail-closed en producción, respaldo solo fuera de producción, lectura heredada con bandera |
| K2 | ✅ GO en su fixture (21 → 21 → 0; verificación en 0), con *hardening* de `sec-eng` |
| K3 `sec-eng` | ✅ GO de K1 y K2 |
| C1 | ✅ Branches de `crm/expedientes` en **81,44 %**; las otras tres métricas suben |
| M1 | Runbook en borrador; revisión documental de `sec-eng` sin bloqueantes; **3 gates operativos abiertos** |
| M2 ensayo | **NO-GO:** se detuvo en el paso 6 por 4 objetivos de recifrado sin tabla, y el smoke falló en el login de plataforma (HTTP 500). El rollback del tenant en una base nueva funcionó (5,94 s). Infraestructura desechable eliminada |

### 5.1 Decisiones de AI-EM-ARCH

| # | Hallazgo | Causa verificada | Decisión |
| --- | --- | --- | --- |
| G7-1 | K2 falla con `subscriber_contacts.*` y `potential_leads.*` | **Ninguna de las dos tablas tiene migración:** las entidades existen (`crm/contacts/entities/subscriber-contact.entity.ts:11`, `crm/potentials/...`) pero nunca se crearon. Los objetivos ya estaban en `reencrypt-aes.targets.ts` (`:173-197` en `8a234c38`), y C-K2 pidió «contactos, potenciales» sin verificarlo: **defecto del emisor**, porque `potential_leads` ya estaba diagnosticada en A-1 | El CLI **solo** recifra tablas que crean las migraciones tenant. Se retiran los 4 objetivos y se agrega un **test invariante**: todo objetivo de `reencrypt-aes.targets.ts` corresponde a una tabla creada por una migración del runner |
| G7-2 | `ContactsModule` **está montado** (`crm.module.ts:41`) con `subscribers/:subscriberId/contacts` (POST, GET, PATCH y DELETE), sin tabla y sin consumidor en el portal ni en la web | Mismo patrón que D-POT, pero vivo: cualquier llamada falla con 500 | **D-CONT ✅ aprobado por el CTO (2026-10-15) y aplicado por AI-EM-ARCH:** se retiró de `crm.module.ts`, y `crm.module.spec.ts` comprueba que no vuelva a montarse. El código del módulo se conserva. La verificación por ejecución corre dentro del turbo API `--force` de K2Δ y L1. Motivo:: el contacto canónico es `party_contact` (ADR-030) y la 360° devuelve `contacts: []`. Si se quieren contactos adicionales, van con una fase propia y su migración |
| G7-3 | Login de plataforma con HTTP 500 en el entorno del ensayo | No diagnosticado. **Hipótesis a descartar primero:** los servicios de auth y plataforma calculan el HMAC del correo con respaldo en `process.env` (deuda P3 de R8: `auth.service.ts:192,354,908,1232`, `platform-bootstrap.service.ts:53`, `platform-users.service.ts:156`), y el contenedor del ensayo pudo no exportar la variable; o un efecto de K1 en la carga de claves | Diagnóstico con el log de la API en un entorno desechable equivalente. Si la causa es la deuda P3, **se paga ahora**: la clave sale de `ConfigService`, como en R8. Si es configuración del ensayo, se corrige el procedimiento |
| M1-G1 | Compose no cablea `PII_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY_PREVIOUS` ni `PII_DECRYPT_LEGACY_MFA` en `api` ni en `migrator` (`docker-compose.prod.yml:144, 413`) | Falta de infraestructura | `plat-ops` las cablea en ambos servicios y en `.env.production.example` (con `approval-required`); `compose config` valida |
| M1-G2 | El rollback de un tenant sobre su schema existente no tiene mecanismo: el restaurador aborta si el schema existe | El contrato de [SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0](../specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md) es correcto: no reemplaza | **Mecanismo aprobado, sin cambiar la herramienta**, con el tenant suspendido y las escrituras congeladas: (1) `ALTER SCHEMA <t> RENAME TO <t>__pre_rollback_<ts>`; (2) `db:restore:tenant`, que ya encuentra el nombre libre; (3) re-aplicar los grants (H-1); (4) verificar los conteos; (5) reactivar el tenant. El schema renombrado se conserva hasta que el CTO autorice borrarlo. Para revertir el rollback, se invierte el `RENAME`. Nunca `DROP SCHEMA` en la ventana |
| M1-G3 | El runner de migraciones tenant procesa la flota entera | Diseño del runner | **Confirmado:** la ventana de G7 es **de flota** para las migraciones (pasos 1–2: backup de todos los tenants y migraciones una vez); los pasos 3–10 se iteran **por tenant** dentro de la misma ventana. Con 3 tenants activos hoy es viable. El runbook se ajusta a ese orden |

### 5.2 Bloques de la Ola 2

| Bloque | Subagente | Propiedad | Stop/go |
| --- | --- | --- | --- |
| K2Δ | `data-eng` | `apps/api/src/cli/reencrypt-aes*` | G7-1: se retiran los 4 objetivos sin migración y se agrega el test invariante objetivo ↔ migración. Turbo API `--force` |
| L1 | `sr-backend` (con `plat-ops` para el entorno) | Diagnóstico; si la causa es la deuda P3, solo la carga de la clave HMAC en `auth.service.ts`, `platform-bootstrap.service.ts` y `platform-users.service.ts`, con sus specs | G7-3: causa raíz con evidencia del log, sin secretos. Si se corrige el código: un test por servicio sin `PII_HASH_KEY` en `process.env` y con la clave inyectada, y valores HMAC iguales cuando ambas fuentes coinciden |
| M3 | `plat-ops` | `docker-compose.prod.yml` (las 3 variables en `api` y `migrator`), `.env.production.example`, el runbook de release por tenant (orden de flota y mecanismo de rollback de M1-G2) y §6.3 del runbook de release y rollback | `compose config` válido; runbook actualizado; revisión de `sec-eng` sin bloqueantes |
| M2b | `sr-qa` + `plat-ops` | Solo la base desechable y el informe | Tras K2Δ, L1 y M3: repetir el ensayo **completo**, con el paso 6 aplicado y verificado en 0, el smoke del paso 9 completo y el rollback con el mecanismo de M1-G2 sobre el schema existente. Base eliminada |

## 6. Resultado de la Ola 2 y Ola 3 (v1.2, 2026-10-15)

| Bloque | Resultado |
| --- | --- |
| K2Δ | ✅ GO: cada objetivo corresponde a una tabla migrada; test invariante agregado |
| L1 | ✅ GO: la causa del HTTP 500 era la deuda P3 (`hashEmail()` tomaba la clave de `process.env`). Corregido para usar `ConfigService` |
| D-CONT | ✅ GO: `ContactsModule` desmontado, sin imports fuera de su carpeta |
| M3 | M1-G1 ✅ cableado en Compose (GO de `sec-eng`) · M1-G3 ✅ documentado · **M1-G2 NO-GO** |
| M2b | Smoke del paso 9 ✅: login, autorización, conversión, contacto pendiente, solicitud y suplantación, más el procesador de alertas contra Postgres real. **NO-GO** del release por el paso 4, el paso 8 sin validar y M1-G2 |

### 6.1 Decisiones de AI-EM-ARCH

| # | Hallazgo | Causa verificada | Decisión |
| --- | --- | --- | --- |
| G7-4 | El paso 4 se detuvo: `habeas_data_consents` y `arco_requests` no existen en el origen | **Ninguna de las dos tiene migración**: solo aparecen como fixtures en `146_privacy_module.integration.spec.ts`. Nunca existieron en ningún tenant; la 146 ya informa «origen no disponible». El paso 4 del plan las daba por existentes: **defecto del emisor**, el mismo de G7-1 | El paso 4 concilia **solo los orígenes que existen** (`consent_records`). Cada origen ausente se registra como «no aplica: la tabla nunca se creó», con la evidencia de que ninguna migración la crea. No es una parada |
| G7-5 | **Patrón sistémico:** cuatro entidades TypeORM sin tabla (`potential_leads`, `subscriber_contacts`, `habeas_data_consents`, `arco_requests`) | Entidades declaradas sin su migración | **Auditoría transversal de solo lectura (TA1):** cada entidad y su tabla en las migraciones, y si su módulo está montado. Una entidad montada sin tabla es un 500 latente, como pasó con `ContactsModule` |
| M1-G2 | El rollback por RENAME choca con el CLI: `assertNoRegistryConflicts` rechaza porque la fila de `public.tenants` sigue existiendo (`restore-tenant.mjs:342-345, 613-619`), e `injectTenantRow` volvería a insertarla (`:278-285, 462-465, 630-633`) | **Defecto del emisor:** aprobé el mecanismo sin leer la herramienta | **Cambio de contrato** en `SPEC-PLAT-OPS-RESTORE-POR-TENANT` v1.1, con un modo explícito `--rollback-in-place` (ver abajo). El resto del contrato v1.0 no cambia |
| Paso 8 | Media sin validar | El ensayo se detuvo antes | Debe validarse en M2c: bucket privado sin política pública, URL firmada de 300 s para `stratum_evidence` y `privacy_evidence`, y los endpoints genéricos bloqueados |
| Paso 9 | Las alertas se probaron llamando al procesador, sin pasar por la cola | Alcance del ensayo | M2c encola el job en un Redis desechable y comprueba que el worker de la API lo consume |
| Paso 9 | La primera corrida de privacidad falló por falta del texto legal | Es la precondición del paso 7, que el ensayo no llegó a ejecutar | Sin cambio: el paso 7 va antes del smoke |

**Contrato de `--rollback-in-place`:**
- **Precondiciones:**
  - el schema destino **no existe**, porque se renombró antes;
  - la fila de `public.tenants` **existe y coincide exactamente** con el sidecar `.tenant.json` del backup en `id`, `slug` y `schema_name`;
  - el tenant está `SUSPENDED`.
- **Comportamiento:** omite `assertNoRegistryConflicts` e `injectTenantRow`; todo lo demás sigue igual (restore del schema, grants H-1, verificación).
- **Rechazos:** si una precondición no se cumple, aborta sin escribir nada. Nunca modifica `public.tenants`. Nunca `DROP SCHEMA`.

### 6.2 Bloques de la Ola 3

| Bloque | Subagente | Propiedad | Stop/go |
| --- | --- | --- | --- |
| M4 | `plat-ops` → `sec-eng` | `scripts/db/restore-tenant.mjs`, `scripts/db/lib/tenant-tooling.mjs`, sus tests, `SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.1.md` (nueva; la v1.0 queda superada en este punto) y los pasos 4, 8 y 11 del runbook de release por tenant | Tests del modo nuevo: el camino feliz y cada precondición incumplida (schema presente, fila ausente o distinta, tenant no suspendido), sin escrituras en los rechazos. Ensayo en una base desechable: RENAME → restore en sitio → grants → conteos → reactivar → **deshacer el rollback** con el RENAME inverso. Revisión de `sec-eng` sin bloqueantes |
| TA1 | `data-eng` (solo lectura) | Solo el informe | Inventario de entidades TypeORM contra las tablas creadas por las migraciones públicas y tenant, con el módulo y su estado (montado o no) y el riesgo. Sin cambios de código |
| M2c | `sr-qa` + `plat-ops` | Solo la base desechable y el informe | Tras M4: ensayo completo de los pasos 1 a 11, con el paso 4 según G7-4, el paso 8 validado, el job de alertas pasando por BullMQ y el rollback en sitio con `--rollback-in-place` sobre el schema existente. Infraestructura eliminada |
