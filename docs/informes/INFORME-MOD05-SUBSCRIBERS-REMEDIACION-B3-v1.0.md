# Informe B3 — Consumo de contratos de suscriptores

**Fecha:** 2026-10-12  
**Estado:** `[BLOQUEO]` — B3 no implementado; no apto para cierre  
**Bloque:** B3 · `fe-platform`  
**Contrato aplicado:** C-API-1 y C-API-2, prompt `PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md` §2

## Entregables y estado final

- Los cambios parciales en `apps/portal/src/lib/api-client.ts`, `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`, `apps/portal/src/components/crm/subscribers/subscriber-ui.ts` y `apps/portal/src/components/operations/TaskCoreFields.tsx` fueron revertidos.
- La prueba no ejecutada `apps/portal/src/lib/api-client-subscribers.spec.ts` fue eliminada.
- No quedan artefactos B3 de código en el árbol. El informe es el único entregable B3.

## `[BLOQUEO]`

B2 confirmó que `SubscriberListItem` excluirá `firstName`, `lastName`, `businessName` y `commercialName`, además de `documentType`, `nit` y su dígito de verificación, porque no tienen finalidad declarada en C-API-2 §6.3. El listado usa nombre/razón social como etiqueta principal de cada fila (`SubscribersListClient.tsx`, `formatSubscriberName`) y `TaskCoreFields` lo usa como etiqueta del resultado del selector (`formatSubscriberOption`).

Por tanto, aplicar C-API-2 íntegramente obliga a sustituir esas etiquetas por otros valores o placeholders; eso cambia contenido visible/copy, expresamente fuera del alcance de B3. Mantener su lectura mediante casts o un tipo paralelo violaría el contrato congelado. No se amplió C-API-2 ni se inventó una etiqueta alternativa. AI-EM-ARCH confirmó que el bloqueo sigue vigente y que B2 no publicará los exports de tipos mientras no se resuelva.

No se ejecutó `pnpm --filter portal test` y la prueba preparada fue eliminada: **0 suites y 0 tests ejecutados**. No hay conteo de suite verde.

## Evidencia y cierre

- Contratos: `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md` §2 C-API-1/C-API-2; lista de finalidades en el informe de origen §6.3.
- Consumidores que usan campos sin finalidad declarada: `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx` y `apps/portal/src/components/operations/TaskCoreFields.tsx`.
- El contrato C-API-1 exige `POST /crm/subscribers/search` con criterios en el cuerpo; C-API-2 retira los campos que hoy sirven de etiquetas principales en ambos consumidores identificados.
- Verificación final del árbol: los cuatro archivos de portal enumerados arriba no presentan cambios B3 y `api-client-subscribers.spec.ts` no existe.
- Estado de pruebas: **0 suites / 0 tests ejecutados**. B3 no satisface el criterio de salida.

## Deuda nueva por severidad

- **Alta — bloqueo de contrato/producto:** definir una finalidad aprobada para las etiquetas de nombre/razón social o acordar, fuera de B3, el cambio visible que permita operar el listado y el selector con C-API-2. El contrato congelado permanece intacto hasta decisión de AI-EM-ARCH.
- **Media — verificación pendiente:** correr la suite completa del portal con conteo real cuando C-API-2 esté disponible y el bloqueo de etiquetas esté resuelto.
