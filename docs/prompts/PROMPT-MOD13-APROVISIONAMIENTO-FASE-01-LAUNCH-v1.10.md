# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 9-pre (B-mig: corregir la migración 163)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.10 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1 (§12, aclaración tras `db:migrate:all`)
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 9-pre · **Gates:** G0–G3 ✅ · G5 ✅ en código · G4 ⏳
**Estado al arrancar:** Docker, Postgres (5433) y Redis (6380) arriba. Pública 028 y tenant 160–162 aplicadas en los 6 `ACTIVE`. La 163 falló en 5 tenants por `chk_execution_order_template_requirements_kind` y quedó como no-op en `tenant_iwana`, que ya tenía una v3 sin `PROVISIONING`. `db:apply-least-privilege` no corrió.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Entregable |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | §B-mig | `database-migration`, `postgresql`, `iwana-tenant-migration`, `test-driven-development` | 163 corregida, 164 nueva y sus pruebas sobre un schema real |

**Paralelo:** ninguno. La Ola 9 (launcher v1.9) se relanza después, cuando el CTO haya vuelto a correr `pnpm db:migrate:all` y se haya verificado el resultado.
**Cierre:**
- pruebas de la 163 y la 164 en verde sobre un schema construido con las migraciones reales, en los tres casos de §B-mig;
- conteo real.

Nadie commitea ni migra tenants `ACTIVE`: eso lo hace el CTO al volver a correr `db:migrate:all`.

---

### Bloque copiar-pegar

===== 1 · data-eng =====
Actúa como `data-eng`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md` y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §B-mig. Antes de escribir código, lee los `SKILL.md` de `database-migration`, `postgresql`, `iwana-tenant-migration` y `test-driven-development`. Corrige la 163 y crea la 164 según HLD v1.1 §12. Prueba sobre un schema construido con las migraciones reales hasta la 162: tenant con v2, tenant con v3 previa sin `PROVISIONING` y reaplicación idempotente. No migres tenants `ACTIVE`, no borres filas de `typeorm_migrations`, no imprimas secretos y no dejes cachés de jest en el repo. No commitees. Cierras con el conteo real.
