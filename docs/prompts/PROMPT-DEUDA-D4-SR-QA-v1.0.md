---
description: "QA deuda D-4 hash + meta + limit abuse — AI-SR-QA"
name: "Deuda D-4 QA"
agent: "sr-qa"
---

# PROMPT — AI-SR-QA · verificación deuda CRM

**Emisor:** AI-EM-ARCH  
**Skills:** `testing-patterns`

## Alcance

Tras el diff SR-FULL de D-4 + meta:

1. Spec: filtro `documentNumber` usa hash (mock de QB espera `documentNumberHash` / param hash; **no** rama decrypt+slice).
2. Spec: `limit=10000` en subscribers y/o expedientes → ≤100 filas / meta.limit≤100.
3. Spec o aserción: respuesta list expedientes incluye `meta` con `page`/`limit`/`total`.
4. Correr Jest acotado a archivos tocados.

Veredicto GO/NO-GO. Sin commit. Fix mínimo de spec solo si el productor dejó hueco obvio y está en tu alcance de verificación.
