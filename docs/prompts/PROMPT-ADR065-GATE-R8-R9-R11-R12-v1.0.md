---
description: "R-8 umbral 088, R-9 vector cripto, R-11 mover spec, R-12 mensaje guardián — AI-SR-FULL"
name: "Gate R-8 R-9 R-11 R-12"
agent: "sr-backend"
---

# PROMPT — AI-SR-FULL · menores R-8 / R-9 / R-11 / R-12

**Emisor:** AI-EM-ARCH  
**Disposición:** [INFORME-ADR065-OLA1-GATE-R10-DISPOSICION-v1.0](../../docs/informes/INFORME-ADR065-OLA1-GATE-R10-DISPOSICION-v1.0.md)  
**Skills:** `nestjs-expert`, `database-migration`, `testing-patterns`, `backend-security-coder`

## R-8
En `088_backfill_expediente_document_number_hash.ts` (JSDoc): mantener `transactional = true`; anotar umbral **~50.000 filas** por tenant → considerar `transactional = false` + commit por lote (ADR-066). No cambiar el flag ahora.

## R-9 (vector = dato, no import)
1. Elegir plaintext + clave de test (no secreto real; hex 64 chars con entropía).
2. Generar **una vez** ciphertext con `apps/api` `aes-gcm` (script local / REPL); embeber el **literal** `iv:tag:ciphertext` en:
   - un spec bajo `apps/api` que descifra con la util de la API → plaintext esperado;
   - un spec bajo `packages/database` que descifra con el helper de migración → mismo plaintext.
3. **Cero** import `apps/api` ↔ `packages/database`. Si el formato diverge, falla el test del lado que no coincida.

## R-11
Mover `apps/api/.../backfill-expediente-document-number-hash.migration.spec.ts` a `packages/database` (p. ej. junto al util o `migrations/shared/*.spec.ts`). Imports cortos / del package. Ajustar jest de `@iwana/db` si hace falta para descubrir el spec. Eliminar el archivo viejo y el path de 7 `../`.

## R-12
En el throw de `processed > 0 && updated === 0`, el mensaje debe citar ambas causas: clave incorrecta **o** ciphertext(s) corrupto(s)/no descifrable(s). Mantener el throw.

## Fuera de alcance
R-10 (FE). No instalar plugins ESLint.

## Stop / Go
Specs verdes del package db + api tocados. Sin commit.
