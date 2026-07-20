# INFORME — Limpieza profunda audit RLS (pre-prod)

**Versión:** 1.0  
**Estado:** Cerrado G7 — GO confirmado CTO 2026-07-20  
**Fecha:** 2026-07-20  
**Modo EM-ARCH:** Architect + Orchestrator  
**Alcance:** Transversal seguridad / `@iwana/db` — no módulo MOD12

---

## 1. Objetivo

Eliminar deuda de migraciones repair (018/079) y corregir el bootstrap audit (001/000) para que la inmutabilidad quede **solo en trigger**, compatible con SEC-04, en un proyecto aún **pre-producción**.

## 2. Consultas multiagente (Etapa 3)

| Agente | Veredicto |
| --- | --- |
| AI-SEC-ENG | **Opción B recomendada.** Opción C NO-GO. Blocker: merge sin DISABLE en 014/075. |
| AI-SR-FULL | Deep cleanup viable pre-prod; 079 es código muerto; editar 001/000/014/075 + reset volumen. |
| AI-PLAT-OPS | CI greenfield OK sin YAML changes; reset dev obligatorio post-merge; apply-least-privilege como cinturón brownfield. |

## 3. Opciones evaluadas

| Opción | Descripción | Veredicto |
| --- | --- | --- |
| **A** | Borrar 018/079; parchear 014/075; reset dev | GO mínimo |
| **B** | A + limpiar 001/000 bootstrap | **GO recomendado** |
| **C** | Squash/renumerar cadena audit | **NO-GO** (riesgo TypeORM/ledger) |

## 4. Decisión EM-ARCH

Adoptar **Opción B**. No requiere ADR nuevo: alinea implementación con diseño ya documentado en headers de 014/075. Escalación CTO solo si se intentara Opción C o excepción SEC-04.

## 5. Modelo de garantía (steady-state)

```text
INSERT audit  → iwana_app (GRANT SELECT/INSERT)
Inmutabilidad → BEFORE UPDATE/DELETE trigger reject_audit_mutation()
Remediación   → SET LOCAL iwana.audit_maintenance = 'on' en migraciones
RLS audit     → DISABLE (no participa en la garantía)
Owner tablas  → iwana_migrator (SEC-04)
```

## 6. Deuda registrada (no bloqueante)

| ID | Sev | Tema |
| --- | --- | --- |
| AUD-DOC-01 | P2 | Comentarios entidades/servicios aún citan RLS |
| AUD-GATE-01 | P2 | CI no verifica INSERT audit como iwana_app |
| AUD-ESC-01 | P2 | Escotilla audit_maintenance sin atar a rol migrator |

## 7. Próximo paso

Ejecutar [`PROMPT-TRANSVERSAL-AUDIT-RLS-DEEP-CLEANUP-v1.0.md`](../prompts/PROMPT-TRANSVERSAL-AUDIT-RLS-DEEP-CLEANUP-v1.0.md) — track SR-FULL + PLAT-OPS en paralelo; SEC-ENG y SR-QA en G6.

## 8. Evidencia de cierre

- [x] Implementación Opción B en main (commit pendiente de push)
- [x] Tests `migration-000-initial-tenant-schema.spec.ts` — 19/19 PASS
- [x] Eliminados 018/079; bootstrap 001/000 sin RLS audit
- [ ] Migrate greenfield local + CI (post-commit)
- [ ] Bulletin equipo: reset volumen dev post-merge
