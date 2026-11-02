# LAUNCH — privacy · DT-3 R-ER (Ola 3-G: P2 de B4)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0 · **Spec:** v1.2
**Reemplaza a:** LAUNCH v1.6. B4 en GO condicionado: sin P0 ni P1; un P2 (orden de errores en la creación de contratos); los P3 documentales, ya corregidos.
**Cerrado, no re-despachar:** B1 a B4, B1-F y B3-R2.
**Archivo congelado:** B1-G solo puede editar `contracts.service.ts`, y solo para mover `assertActiveBillingCycle` en las dos creaciones. Referencia de hash vigente: `21D44C54…1BD1205` (B1-F). Sin stash ni commit (C4e).

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-DT3-RER-v1.0.md` §B1-G | `nestjs-expert`, `testing-patterns`, `iwana-test-evidence` | spec v1.2 D-RER-3.4 |
| 2 | `test-change-reviewer` | Pruebas de B1-G | según su perfil | spec v1.2 |

**Secuencia:** 1 → 2. Con 2 sin hallazgos C, avisar a la sesión del clúster para lanzar C4d (G1 conjunto con las integraciones DT-3, CA-RER-12 y la cobertura por servicio).

```text
===== B1-G · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B1-G. Spec v1.2, D-RER-3 punto 4.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, testing-patterns, iwana-test-evidence.
Primero comprueba que el SHA-256 de contracts.service.ts sea 21D44C5467AEC76D3ED9DDE32C5B4D356704F0B81DC733676B79993E71BD1205; si no, [BLOQUEO].
Solo mueve assertActiveBillingCycle detrás del bloqueo del suscriptor en las dos creaciones (líneas 155 y 255). No toques nada más.
Pruebas: sano con ciclo inválido → 422 BILLING_CYCLE_INVALID; sano sin ciclo obligatorio → 422 BILLING_CYCLE_REQUIRED; anonimizado con ciclo inválido → 409.
No regresión (condición del clúster): contracts.service.spec, billing-cycles.* e integraciones de contratos y de ciclo de vida, con conteo real y 0 omitidas.
Registra los hashes antes y después como pide §B1-G. Sin stash ni commit.
Entrega: diff, hashes y suite completa de api con --force.

===== Revisión · test-change-reviewer (tras B1-G) =====
Revisa las pruebas nuevas o modificadas por B1-G contra la spec DT-3 v1.2. Solo lectura; hallazgos C con archivo:línea.
```
