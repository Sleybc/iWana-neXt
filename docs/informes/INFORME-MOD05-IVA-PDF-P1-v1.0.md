# INFORME MOD05 · IVA/PDF · P1 — Migraciones 026 (pública) y 145 (tenant)

**Fecha:** 2026-10-12 · **Versión:** 1.0 · **Emisor:** data-eng (AI-DATA-ENG), Ola 1 del [plan D-PDF](../plans/2026-10-12-mod05-iva-soporte-pdf.md)
**Contratos:** C-DDL-3 v1.0 y el valor `MediaUsage.STRATUM_EVIDENCE` de C-MEDIA-1 v1.0, según [PROMPT-MOD05-IVA-PDF-v1.0.md](../prompts/PROMPT-MOD05-IVA-PDF-v1.0.md) §1–§2 (bloque P1)
**Decisión de origen:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) D5

**Estado: IMPLEMENTADO · NO CERRADO.** Los tests unitarios y el typecheck pasan. La verificación contra Postgres real (`up/down/up`, aborto del `down` de la 026, preflight de la 145) **no se ha ejecutado**: la base de integración `iwana_it_p1` no existe.

> **[BLOQUEO]** Integración PostgreSQL: la base `iwana_it_p1` no existe en `127.0.0.1:5433`. Error literal: `database "iwana_it_p1" does not exist` (código `3D000`). Lo crea el responsable del proyecto. Pendiente de este punto: integración de la 026 (7 casos) y de la 145 (4 casos). El resto de P1 avanza.

---

## 1. Resumen

- **026 (pública):** amplía `chk_media_assets_usage` con `stratum_evidence`. Sigue el patrón idempotente de la 020. Su `down()` aborta sin borrar si hay filas `stratum_evidence`.
- **145 (tenant):** crea el índice único parcial `uq_contracts_stratum_evidence`. Antes aplica un preflight que aborta con el listado de duplicados si un asset respalda más de un contrato.
- **Enum:** `MediaUsage.STRATUM_EVIDENCE = 'stratum_evidence'`.
- **Efecto colateral (bloqueante para el merge):** el valor nuevo rompe el typecheck de `@iwana/api` en `media/media.service.ts:17`, que es de P2. Detalle en §6.

## 2. Entregables y propiedad

| Ruta                                                                                               | Tipo              | Estado          | Nota                                                     |
| -------------------------------------------------------------------------------------------------- | ----------------- | --------------- | -------------------------------------------------------- |
| `packages/database/src/migrations/public/026_media_usage_stratum_evidence.ts`                      | migración pública | nuevo           | `MediaUsageStratumEvidence1784419214000`                 |
| `packages/database/src/migrations/public/026_media_usage_stratum_evidence.spec.ts`                 | unit              | nuevo           | 7 tests, SQL con `QueryRunner` simulado                  |
| `packages/database/src/migrations/public/026_media_usage_stratum_evidence.integration.spec.ts`     | integración       | nuevo           | 7 casos, **pendiente de base**                           |
| `packages/database/src/migrations/tenant/145_contract_stratum_evidence_unique.ts`                  | migración tenant  | nuevo           | `ContractStratumEvidenceUnique1450000000000`             |
| `packages/database/src/migrations/tenant/145_contract_stratum_evidence_unique.spec.ts`             | unit              | nuevo           | 6 tests                                                  |
| `packages/database/src/migrations/tenant/145_contract_stratum_evidence_unique.integration.spec.ts` | integración       | nuevo           | 4 casos, **pendiente de base**                           |
| `packages/database/src/migrations/public/index.ts`                                                 | registro          | modificado (+2) | import y entrada en `PUBLIC_MIGRATIONS`                  |
| `packages/database/src/migrations/tenant/runner.ts`                                                | registro          | modificado (+2) | hunk de la 145; el hunk de la 144 **no es mío** (ver §6) |
| `packages/database/src/entities/media-asset.entity.ts`                                             | enum              | modificado (+2) | `STRATUM_EVIDENCE`                                       |
| `packages/database/src/migrations/public/025_platform_users_password_reset_required.spec.ts`       | test ajeno        | modificado      | ver §3.8                                                 |

No se tocó `crm/contracts/**` (T11), `media/**` (P2) ni los ficheros de la 144 (fase IVA).

## 3. Decisiones frente al contrato

1. **Timestamps.** La 026 usa `1784419214000`, la secuencia de la 012–025 (+1000 por número). La 145 usa `1450000000000`, la convención de las tenant 140–144.
2. **`down()` de la 026 sin override destructivo.** La 020 tiene `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN`. El contrato pide abortar sin borrar, así que la 026 no lo incorpora. No hay forma de forzar su `down` con filas de estrato.
3. **Constraint ausente.** Si `chk_media_assets_usage` no existe, la 026 lo crea (patrón de la 020). Si existe con una definición que no contiene los seis valores previos, aborta sin DDL.
4. **Dependencia explícita de la 144 en la 145.** Antes del preflight, la 145 comprueba que existe `contracts.stratum_evidence_media_id`. Si falta, aborta con un mensaje que nombra la 144. Es una comprobación adicional al contrato.
5. **Detalle acotado en el preflight.** La 145 lista hasta 20 grupos de duplicados y declara el total. Solo expone UUID de asset y de contrato, nunca datos personales.
6. **Sin `CONCURRENTLY` en la 145.** El contrato C-DDL-3 dice `CREATE UNIQUE INDEX`. Ver deuda D-7.
7. **Guarda de la base de integración.** Con la base disponible, los specs de integración solo se ejecutan si `DB_NAME` es `test` (CI) o `iwana_it_*`. Con cualquier otro nombre fallan al cargar, antes de ejecutar ninguna sentencia de la prueba. La probe ya ha abierto una conexión de `SELECT 1` con ese `DB_NAME` para decidir la disponibilidad; ver D-6. Motivo: la probe toma `DB_NAME` de `.env.development`, que apunta a `dbiw`, la base de desarrollo (ver D-6).
8. **Cambio en un spec ajeno.** `025_…spec.ts` afirmaba que la 025 era la última de `PUBLIC_MIGRATIONS`. Al registrar la 026 esa aserción dejaba de ser cierta. Ahora comprueba que la 025 precede inmediatamente a la 026. El comportamiento probado no cambia.
9. **Consumidores de `MediaUsage` revisados** (antes de fijar el valor, según la regla de contratos «leer consumidores»):
   - `media/media.service.ts:17`, `Record<MediaUsage, …>` exhaustivo: **roto** hasta que P2 añada la entrada (D-1).
   - `media/dto/upload-media.dto.ts`, `@IsIn(GENERIC_MEDIA_USAGES)`: el upload genérico no admite `stratum_evidence`. No hay bypass por la ventana entre esta migración y P2.
   - `media.service.ts` `validateFile`: un uso sin restricciones devuelve 400 («no tiene restricciones configuradas»). Falla cerrado.
   - `tenant/`, `platform-branding/`: usan solo valores concretos o uniones explícitas. Sin efecto.

## 4. Verificación ejecutada (conteo real)

| Comando                                                                                           | Resultado                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@iwana/db --force --ui=stream`                                 | **Test Suites: 62 passed, 62 total · Tests: 381 passed, 381 total** · sin `skipped` · `Tasks: 2 successful` |
| `pnpm --filter @iwana/db typecheck`                                                               | exit 0                                                                                                      |
| `eslint` sobre los 10 ficheros tocados                                                            | exit 0                                                                                                      |
| `pnpm exec prettier --write` sobre los ficheros nuevos y tocados                                  | sin cambios                                                                                                 |
| `jest --config jest.integration.config.js` (026 + 145), con `DB_NAME=iwana_it_p1`, `DB_PORT=5433` | **Test Suites: 2 skipped · Tests: 11 skipped** · el probe emite el `[BLOQUEO]` con el error literal         |
| `pnpm --filter @iwana/api typecheck`                                                              | **1 error TS** (el único del proyecto): `src/modules/media/media.service.ts(17,7) TS2741` — ver §6          |

Los 13 tests unitarios nuevos (7 + 6) están dentro de los 381. La guarda de integración se comprobó por regex sobre nombres de base, sin conectar a ninguna: `iwana_it_p1` y `test` admitidos; `dbiw`, `iwana`, `i4_qa_20261006_a1` y cadena vacía rechazados.

**Lo que los tests unitarios no demuestran:** el SQL contra Postgres real. Los specs unitarios comprueban la forma de las sentencias y las ramas de aborto con un `QueryRunner` simulado. No validan la semántica del servidor: `pg_get_constraintdef`, el CHECK real, el índice parcial, el comportamiento de los SAVEPOINT.

## 5. Verificación pendiente

Criterios de cierre de P1 según el encargo:

| Criterio                                                              | Estado                                                        | Evidencia                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| 026 pasa `up/down/up` contra Postgres real                            | **pendiente**                                                 | `026…integration.spec.ts`, bloqueado por la base |
| `down` de la 026 aborta con filas `stratum_evidence`                  | **pendiente de integración**; la rama de aborto sí tiene unit | unit verde; integración escrita                  |
| Preflight de la 145 reporta duplicados                                | **pendiente de integración**; la rama de aborto sí tiene unit | unit verde; integración escrita                  |
| 145 pasa `up/down/up` contra Postgres real                            | **pendiente**                                                 | `145…integration.spec.ts`                        |
| Registro de la 145 en `TENANT_MIGRATIONS` y `migration-order.spec.ts` | **cumplido**                                                  | `migration-order.spec.ts` verde                  |

**Comando para cerrar, cuando exista la base:**

```bash
DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=iwana_it_p1 pnpm --filter @iwana/db exec jest --config jest.integration.config.js src/migrations/public/026_media_usage_stratum_evidence.integration.spec.ts src/migrations/tenant/145_contract_stratum_evidence_unique.integration.spec.ts
```

Criterio de aceptación: `Tests:` con 11 passed y 0 skipped. Si algún caso falla, el fallo se corrige en la migración o en el spec, según la causa. No se acepta un verde con skipped.

## 6. Coordinación: commit y secuencia

**No he commiteado.** Tres motivos:

1. **La integración no está verificada.** Un commit de la 026 y la 145 llegaría a `main` sin el paso de integración.
2. **El enum rompe el typecheck del API.** `media/media.service.ts:17` declara `MEDIA_CONSTRAINTS: Record<MediaUsage, …>`, que exige todas las claves del enum. Con el valor nuevo falta `[MediaUsage.STRATUM_EVIDENCE]`. Es el único error TS del API. Ese fichero es de P2, así que no lo toco. Commitear el enum solo dejaría `main` en rojo hasta que P2 añada la entrada.
3. **`runner.ts` está compartido con la fase IVA.** Ya lleva sin commitear el registro de la 144 y sus ficheros `144_vat_service_point*.ts`. La 145 depende de la columna que crea la 144. Un commit de la 145 sin la 144 dejaría `main` con una migración que aborta en cualquier tenant en esquema 143. Commitear el hunk de la 144 sin los ficheros de la 145 dejaría el registro apuntando a un fichero inexistente.

**Secuencia propuesta** (la decide el coordinador):

1. P2 añade la entrada de `STRATUM_EVIDENCE` en `MEDIA_CONSTRAINTS` y se commitea junto con el enum.
2. T11/IVA comitea la 144 **con** `145_contract_stratum_evidence_unique*.ts` y el hunk de la 145 de `runner.ts`, todo en el mismo commit.
3. La 026 y sus specs se commitean cuando la integración haya pasado.

Cada commit con rutas explícitas. Nunca `git add -A` ni `git commit -a`.

## 7. Deuda nueva por severidad

| ID  | Sev.     | Deuda                                                                                                                                                                                                                                                                                | Dueño                         | Acción                                                                                                                     |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| D-1 | **Alta** | Typecheck de `@iwana/api` roto por el enum: `media.service.ts(17,7) TS2741`. Es el único error TS del API.                                                                                                                                                                           | P2 (`media/**`)               | Añadir `[MediaUsage.STRATUM_EVIDENCE]` a `MEDIA_CONSTRAINTS` en el mismo commit que el enum (§6)                           |
| D-2 | **Alta** | Verificación de integración pendiente (`[BLOQUEO]`). El SQL de 026 y 145 no se ha ejecutado contra Postgres real.                                                                                                                                                                    | Responsable del proyecto      | Crear `iwana_it_p1`; ejecutar el comando de §5                                                                             |
| D-3 | Media    | Secuencia 144 → 145: la 145 requiere la columna de la 144, todavía sin commitear.                                                                                                                                                                                                    | T11/IVA                       | Commitear 144 con los ficheros de 145 (§6). Mientras tanto, la guarda de columna aborta con mensaje claro, sin DDL parcial |
| D-4 | Media    | `contract.entity.ts` no declara el `@Index` `uq_contracts_stratum_evidence` que pide C-DDL-3. El modelo TypeORM y la base divergen en un índice.                                                                                                                                     | P2 (`crm/contracts/**`) o T11 | Añadir el `@Index` en la entidad                                                                                           |
| D-5 | Media    | El `down()` de la 026 queda bloqueado mientras existan filas `stratum_evidence`. No hay procedimiento documentado para resolverlas.                                                                                                                                                  | CTO / operador                | Redactar un runbook de resolución. El contrato prohíbe borrarlas desde la migración                                        |
| D-6 | Media    | **Preexistente, no introducido aquí.** `test/integration-db-probe.js` toma `DB_NAME` de `.env.development` (`dbiw`, la base de desarrollo) si nadie lo exporta. Los specs de integración que no tienen guarda (p. ej. el de la 144, que crea schemas) se ejecutarían sobre esa base. | data-eng                      | Guardia en la probe, con la misma allowlist que uso en mis specs                                                           |
| D-7 | Baja     | La 145 crea el índice sin `CONCURRENTLY` (contrato). Bloquea escrituras en `contracts` durante la construcción.                                                                                                                                                                      | data-eng                      | Con tablas pequeñas en esta fase es aceptable. Para un tenant grande, `transactional = false` con `CONCURRENTLY` (ADR-066) |
| D-8 | Baja     | Cambio en `025_…spec.ts`, fuera de mi propiedad (§3.8).                                                                                                                                                                                                                              | data-eng                      | Justificado; sin cambio de comportamiento                                                                                  |
| D-9 | Baja     | El banner de la probe se etiqueta `[089-integration]` para toda la suite. Etiqueta heredada.                                                                                                                                                                                         | data-eng                      | Cosmético                                                                                                                  |

## 8. Lo que no se hizo, y por qué

- **No se creó la base de integración** ni ningún contenedor. Lo crea el responsable (encargo).
- **No se buscaron credenciales de superusuario.** La comprobación de existencia de la base intentó conectar con las credenciales del migrador de `.env.development`. El servidor respondió `3D000` y no se leyó ni escribió nada.
- **No se ejecutó `pnpm install`** ni se reconstruyó `packages/database/dist`. `apps/api` resuelve `@iwana/db` contra `src`, así que no hacía falta.
- **No se tocó la base de desarrollo** (`dbiw`) ni la de T11.
- **No se revirtió ningún cambio** de la fase IVA. El árbol tenía cambios sin commitear de otras sesiones y los conservé.
