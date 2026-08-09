---
description: "Ejecutar el cierre operativo SEC-P1 (secuencia S1 + A1/A2 + B1): fijar PII_HASH_KEY por entorno, ventana 1 expand, soak corto con fecha hard, ventana 2 contract."
name: "SEC-P1 Cierre ventanas expand/contract"
argument-hint: "Entorno objetivo (staging|producción) y fase (clave|ventana-1|soak|ventana-2|cierre-informe)"
agent: "agent"
---

Ejecuta (o orquesta) el cierre operativo de SEC-P1 según el plan **congelado** adoptado por el CTO/humano el 2026-08-06.

## Plan congelado (no renegociar en esta corrida)

| Código | Decisión |
| --- | --- |
| **S1** | Staging primero, luego producción |
| **A1/A2** | Secret store; **clave distinta por entorno** |
| **B1** | Soak 3–7 días con **fecha hard** de ventana 2 fijada por el CTO |

Fuente de verdad del procedimiento: [`docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md`](../runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md).  
Informe vivo: [`docs/informes/INFORME-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md`](../informes/INFORME-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md).  
**Entrada recomendada (G6.5 + staging ventana 1, sin prod):** [`PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md`](./PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md). Usar **este** prompt para prod / soak B1 / ventana 2 **después** de staging verde.  
Rotación de clave (si aplica más tarde): runbook cifrado §6bis — **no** mezclar con ventana 2.

## Gobernanza

1. `AGENTS.md` + bootstrap vigente.
2. No inventar regulacion; Ley 1581 / Habeas Data solo como contexto ya citado en el informe.
3. **Cero PII, secretos ni valores de hash/HMAC** en logs, chats, tickets ni informes — solo conteos y nombres de migración.
4. Escalaciones al CTO: go de secretos prod, fecha hard B1, go ventana 2 prod, cualquier excepción (clave temporal, B3 inmediato, oleadas).

## Roles a desplegar (protocolo multiagente)

| Fase | Quién | Qué |
| --- | --- | --- |
| Clave / infra | AI-PLAT-OPS | Secret store, inyección env, parada/arranque, backup/restore, `pnpm db:migrate:all` |
| Smoke / criterio 6 | AI-SR-QA | Checklist del runbook §2.2–2.3; evidencia sin PII |
| Re-medición volumen | AI-DATA-ENG | `reltuples`/`relpages` si el entorno ≠ perfil mínimo ADR-078 (propuesto) |
| G-SEC | AI-SEC-ENG | Re-review post-merge y tras ventana 2; cierre residual S-1 |
| Consolidación | AI-EM-ARCH | Actualizar informe vivo; no dejar diferimiento sin fecha |

## Fases (ejecutar solo la pedida en el argument-hint)

### Fase `clave`

1. Generar `openssl rand -hex 32` fuera del repo.
2. Guardar en secret store del entorno; **no** reutilizar entre staging y prod.
3. Verificar que API/worker/migrator ven la variable (sin imprimir el valor).
4. Smoke: el proceso **arranca** (Joi no aborta por falta de clave).

### Fase `ventana-1`

1. Preflight emails vacíos + (si aplica) peak `reltuples`.
2. Parada de servicio.
3. `pnpm db:migrate:all` **sin** `IWANA_APPLY_PII_CONTRACT`.
4. Exigir: todos ACTIVE OK + línea `[MIGRATOR] Paridad de migraciones OK…` + diferidas 022/109 anunciadas.
5. **Stop:** fallo o flota mixta → no rearrancar; remediar.
6. Arranque + smoke login/búsqueda.
7. Criterio 6 (SQL del informe, new+old, escalares) → `pending = 0`.

### Fase `soak`

1. Confirmar/registrar **fecha hard** de ventana 2 (D+3…D+7 o la que fije el CTO).
2. Monitorear incidentes login/búsqueda; no alargar el diferimiento sin nueva fecha.

### Fase `ventana-2`

1. Checklist go/no-go del runbook §4.1 (backup **del día** obligatorio).
2. Parada recomendada.
3. `IWANA_APPLY_PII_CONTRACT=true pnpm db:migrate:all`
4. Exigir: 022/109 aplicadas, paridad OK, smoke OK, columnas `*_hash` de búsqueda PII ausentes (solo existencia/conteos).
5. Rollback = **solo restore**.

### Fase `cierre-informe`

1. Actualizar el informe vivo: entorno, fechas, evidencia (paridad, criterio 6, ausencia de columnas), residual S-1 **cerrado** en ese entorno.
2. Si producción cerró ventana 2: marcar pendiente humano A/B como cerrado; dejar explícito si ADR-078 (propuesto) requiere actualización de estado por el CTO.

## Anti-patrones

- Imprimir o pegar `PII_HASH_KEY`.
- Copiar la clave de staging a prod.
- Arrancar con flota mixta.
- Ventana 2 sin backup del día.
- Oleadas por tenant sin ADR.
- Declarar S-1 cerrado en prod sin evidencia de ventana 2.

## Criterio de éxito de la iniciativa

Staging y producción han pasado ventana 1 + soak B1 + ventana 2; informe vivo con evidencia; digests SHA-256 de búsqueda PII retirados; paridad OK; criterio 6 = 0; sin PII en la evidencia.
