---
description: "Cobertura ≥80% en CI + alinear turbo test outputs — AI-PLAT-OPS"
name: "Cobertura 80 CI"
agent: "plat-ops"
---

# PROMPT — AI-PLAT-OPS · Deuda cobertura (D-4 del registro vivo)

**Emisor:** AI-EM-ARCH  
**Registro:** [INFORME-ADR065-DEUDA-VIVA-POST-OLA1-v1.0](../../docs/informes/INFORME-ADR065-DEUDA-VIVA-POST-OLA1-v1.0.md)  
**Prerrequisito:** R-13 GO (`pnpm test` ya en CI).  
**Consulta:** AI-SR-QA (umbrales por paquete core).

## Contexto cosmético (enganche)

`turbo.json` → tarea `test` → `outputs: ["coverage/**"]` sin que Jest emita coverage → avisos de cache vacía. **No** silenciar quitando outputs a solas: el día del umbral 80% esos outputs deben existir.

## Alcance

1. Activar `--coverage` (o config Jest) en paquetes **core** acordados con SR-QA (mínimo `@iwana/api`; valorar portal/web/db).
2. Hacer que `coverage/**` se genere de verdad (turbo deja de avisar en vacío).
3. Umbral ≥80% en CI **solo** sobre el perímetro core definido — fallo = rojo. Sin `--passWithNoTests` que oculte el umbral.
4. Documentar en el workflow / informe qué paquetes entran en el gate.

## Fuera de alcance

- Ola 2 índices, envelopes 31 endpoints, pepper HMAC.

## Stop / Go

CI verde con coverage real; umbral enforceable. Sin commit salvo indicación.
