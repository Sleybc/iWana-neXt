---
description: "D-4 hash documentNumber expedientes + meta R2/R3 + tests limit — AI-SR-FULL"
name: "Deuda D-4 hash + meta CRM"
agent: "sr-backend"
---

# PROMPT — AI-SR-FULL · Deuda D-4 + residuales CRM

**Emisor:** AI-EM-ARCH  
**Plan:** [INFORME-ADR065-DEUDA-PAGO-PLAN-v1.0](../../docs/informes/INFORME-ADR065-DEUDA-PAGO-PLAN-v1.0.md)  
**Skills:** `nestjs-expert`, `database-migration`, `backend-security-coder`, `testing-patterns`

## Objetivo

Cerrar **D-4/O-6** (búsqueda por documento sin scan AES) y residuales SEC **H-1-R-P3a/c** (meta en R2/R3 + prueba de abuso `limit`).

## Diseño fijado (no reabrir)

1. **Patrón canónico:** `subscribers` (`documentNumberHash` SHA-256, índice parcial, filtro SQL). Reutilizar la misma función de hash (extraer a `common/crypto/hash-document.util.ts` si hoy es método privado del service — DRY).
2. **Columna** en `expediente_records`: `document_number_hash VARCHAR(64) NULL` + índice parcial `WHERE document_number_hash IS NOT NULL`.
3. **Migración tenant** siguiente número libre tras `086` (p. ej. `087_add_expediente_document_number_hash.ts`), **`transactional = true`** (no CONCURRENTLY). Reversible.
4. **Escritura:** en create/update de identidad, persistir hash junto al ciphertext. Cero PII en logs.
5. **Listado:** si `documentNumber` presente → `andWhere('expediente.documentNumberHash = :docHash', { docHash })` + `skip`/`take` + `getManyAndCount`. **Eliminar** la rama de `getMany` + decrypt + `DOCUMENT_NUMBER_SCAN_CAP`.
6. **Backfill:** método de servicio (o script interno) que, por tenant, descifra filas con `document_number_encrypted` y `hash IS NULL`, escribe hash en lotes. Invocable en tests con fixtures; documentar en comentario de migración que el schema solo no rellena hashes legacy. No dejar fallback AES en el list.
7. **Meta R2/R3:** `list` expedientes y `contact-attempts` emiten `meta` vía `buildPageMeta` (mismo patrón que subscribers). Controllers/DTOs alineados.
8. **Test abuso:** al menos un spec por R1 o pipe/service que demuestre `limit=10000` → efectivo ≤100.

## Fuera de alcance

- ADR-066 runner (prompt hermano).
- Índices Ola 2 / 31 endpoints.
- UI.

## Stop / Go

| Condición | Acción |
| --- | --- |
| Filtro documentNumber sin decrypt en list | GO D-4 |
| Migración reversible + entidad + specs | GO |
| meta en R2/R3 + test limit | GO P3 |
| Duda de backfill multi-tenant | `[BLOQUEO]` |

## Entregables

Diff + migración + tests. Resumen para SEC. **Sin commit.**
