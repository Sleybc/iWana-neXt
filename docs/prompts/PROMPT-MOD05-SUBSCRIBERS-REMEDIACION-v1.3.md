# PROMPT DE EJECUCIÓN — MOD05/MOD08 Suscriptores · Remediación de cumplimiento

**Version:** 1.3 — sucede a [v1.2](PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.2.md) (superado)
**Estado:** Emitido — G4 vigente (firmado 2026-10-12)
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-11-mod05-subscribers-remediacion-cumplimiento.md](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md) v1.3

## 0. Estado verificado y disposición del cierre

| Bloque / hallazgo | Disposición AI-EM-ARCH |
| --- | --- |
| B10 | ✅ Cerrado. Portal: 291 suites / 2.927 tests |
| B7 · **B7-01** (Alta) | **Confirmado en código.** `party-write.adapter.ts:47-53` busca sin `status <> MERGED`; `party-read.adapter.ts:56` busca solo por tipo y HMAC. `PartyService` sí filtra (`party.service.ts:69-75`). **Bloquea el cierre de fase** → B11 |
| B7 · **B7-02** (G7) | **No es gate de cierre de fase: es precondición de release (G7)**, ya declarada en v1.2 §5. No bloquea G6 ni G6.5. Se prepara su runbook ahora → B13 |
| B7 · **B7-03** (Media) | Es el efecto de E-3 (placeholders), ya escalada al CTO. Sin bloque hasta la decisión |
| B7 · **B7-04** (Media) | `AuditService.log` es fail-open para **todo** el sistema (`audit.service.ts:88-102`): es deuda **transversal**, no de MOD05. Se registra con dueño `sr-backend` + `sec-eng` para un plan transversal; no bloquea este cierre |
| B8 · cobertura | **Bloquea el cierre.** El gate de ≥80 % se mide en statements **y** branches, según el precedente del cierre de MOD04 (`INFORME-MOD04-CIERRE-MODULO-v1.0.md:15,82`). `crm/subscribers`: 78,28 % / 62,19 %; `parties`: 96,51 % / **40 %** → B12 |
| `docs-governance` | Hallazgo bloqueante resuelto por AI-EM-ARCH: `docs/RegladeiVA.md` → `docs/ideas/regla-iva-internet-fijo-isp.md`, con cabecera de insumo no verificado. Observaciones menores resueltas: enlace a plantilla en los prompts y estado del informe B4 |
| `contract-drift-reviewer` | Observaciones menores (OpenAPI, referencias de versión, comentario del selector) → B11 las absorbe si están en `crm/subscribers` o `parties`; si no, deuda baja |

## 1. Bloques (los tres en paralelo; propiedad de archivos disjunta)

### B11 · `sr-backend` — B7-01 y observaciones de deriva

**Propiedad exclusiva:** `apps/api/src/modules/parties/adapters/**` (código y specs), más los comentarios y la OpenAPI de `crm/subscribers` que señaló `contract-drift-reviewer`.
1. Toda resolución de identidad por documento en `PartyWriteAdapter` y `PartyReadAdapter` excluye `status = MERGED` y los eliminados lógicamente. Mismo criterio que `PartyService` y que `uq_party_document_hmac_active`.
2. `PartyReadAdapter.findByDocument`: si lo único que existe es un Party `MERGED`, devuelve el canónico siguiendo `merged_into_party_id` (un solo salto; si el destino también está `MERGED` o eliminado, devuelve `null`). Así el consumidor de MOD12 (`inventory/ports/supplier-party.port.ts:134`) nunca recibe una identidad retirada.
3. Regresiones unitarias **y** un caso en `b5-identity-conversion.postgres.integration.spec.ts` contra PostgreSQL real: coexistencia de un Party `MERGED` y su canónico con el mismo HMAC → la conversión enlaza al canónico; Party eliminado → no se reutiliza.
4. Observaciones de `contract-drift-reviewer` dentro de esta propiedad.
**Fuera de alcance:** `AuditService`, placeholders, `crm/subscribers/**/*.spec.ts` (es de B12).
**Stop/go:** `pnpm exec turbo run test --filter=@iwana/api --force` con conteo real, y la integración B5 en verde con el caso nuevo.

### B12 · `sr-qa` — Cobertura a ≥80 % en statements y branches

**Propiedad exclusiva:** archivos de test bajo `apps/api/src/modules/crm/subscribers/**` y `apps/api/src/modules/parties/{services,party-pii.util}*`. **No** toca `parties/adapters/**` (es de B11) ni código productivo.
1. Medir con el comando de B8 y listar las ramas sin cubrir por archivo.
2. Escribir tests sobre comportamiento observable de las ramas sin cubrir: rechazos, fallos cerrados, caminos de error de descifrado y HMAC, y la proyección por rol. **Prohibido** subir cobertura con tests sin aserción de comportamiento o excluyendo archivos del denominador.
3. Si una rama solo se alcanza modificando código productivo, o es código muerto, emitir `[BLOQUEO]` con la lista, en lugar de cambiar código.
**Stop/go:** `crm/subscribers` y `parties` ≥ 80 % en statements y branches, medido **después** de que B11 esté en el árbol: la cifra final la confirma `gate-verifier` en la re-verificación.

### B13 · `plat-ops` — Runbook G7 de migración y backfill

**Propiedad exclusiva:** `docs/runbooks/RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md`. Sin ejecución contra ningún entorno.
Secuencia por tenant:
1. Backup verificable.
2. Migración 143.
3. `backfill:party-pii --dry-run`.
4. Resolución humana de candidatos a fusión y fallos.
5. `--apply`.
6. Verificación por conteo: cero `party.document_number_hmac` nulos fuera de `NODATA`; cero `party_contact.value_encrypted` nulos.
7. Despliegue del código de B5 en el mismo release.
8. Rollback: `down` de la 143 solo antes de `--apply`; después de `--apply`, restaurar el backup.

Incluye la contracción posterior (retiro de `party_contact.value` y `subscribers.whatsapp` en claro) como migración separada, con su criterio de entrada: `--apply` completado en todos los tenants. Debe leer `docs/runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md` para no contradecir la ventana de rotación de ADR-058.
**Stop/go:** runbook revisable por `sec-eng`, con comandos exactos y criterios de abortar.

## 2. Re-verificación de cierre (tras B11, B12 y B13)

- `gate-verifier`: suites de API, portal, shared y db sin caché, más cobertura focalizada de `crm/subscribers` y `parties`.
- `sec-eng`: re-verificación **solo** de B7-01 contra el código, y lectura del runbook B13.

Con ambos en GO, la fase cierra en G6. G6.5 queda pendiente de la corrida de CI por SHA tras el commit. G7 queda pendiente de B13 ejecutado por tenant y de las escalaciones E-1, E-2 y E-3, que siguen abiertas para el módulo.

## 3. Deuda registrada (no bloquea esta fase)

| ID | Severidad | Dueño | Destino |
| --- | --- | --- | --- |
| B7-03 | Media | CTO (E-3) → `sr-backend` | Prompt posterior a la decisión E-3 |
| B7-04 | Media | `sr-backend` + `sec-eng` | Plan transversal de auditoría fail-closed (afecta a todo `AuditService`) |
| ADR-058 fase 2 (SUB-M02) | Media | `plat-ops` + `sr-backend` | Plan propio |
