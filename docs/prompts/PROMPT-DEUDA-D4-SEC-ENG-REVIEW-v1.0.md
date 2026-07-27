---
description: "Review AppSec D-4 hash documentNumber expedientes — AI-SEC-ENG"
name: "Deuda D-4 SEC review"
agent: "sec-eng"
---

# PROMPT — AI-SEC-ENG · D-4 hash expedientes

**Emisor:** AI-EM-ARCH  
**Depende de:** diff de `docs/prompts/PROMPT-DEUDA-D4-HASH-META-CRM-v1.0.md`

## Verificar

1. List por `documentNumber` no descifra en masa (solo lookup por hash).
2. Hash = digest determinista (SHA-256); no se loguea documento ni hash junto a PII en claro de forma inútil.
3. Respuesta de list sigue anulando `*Encrypted`.
4. Migración no escribe plaintext en SQL.
5. Backfill no filtra PII a logs.

Dictamen: aceptable / aceptable con ajustes / bloqueante.  
Persistir `docs/informes/INFORME-DEF2-D4-SEC-ENG-REVIEW-v1.0.md` si el entorno lo permite; si no, cuerpo completo en la respuesta.
Sin código. Sin commit.
