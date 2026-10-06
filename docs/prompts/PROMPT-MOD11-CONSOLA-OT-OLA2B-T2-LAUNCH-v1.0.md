# LAUNCH — MOD11 · Ola 2b, tramo 2: R2 · R3 · R4 · E4-portal (+ guarda de la 136)

**Planes:** consola `2026-09-14-mod11-consola-ot-remediacion.md` v1.2 · origen `2026-09-14-mod11-origen-ot.md` v1.1
**Gates:** G2 y G3 cerrados · **B0 GO** · **E4-datos GO** (auditados el 2026-10-05) · G4: prompts adoptados por AI-EM-ARCH
**Precondición:** B0, E4-datos y la reparación de specs **commiteados** antes de lanzar. Cada bloque parte de `main` limpio.
**Cerrado, no re-despachar:** Ola 1, hotfixes, R0, R1, G3, B0, origen E1/E2/E3/E4-datos, corrección T0/T2.
**No se lanza:** T1, que tiene 4 consultas abiertas en `INFORME-MOD11-CORRECCION-OT-T1-PREPARACION-v1.0.md`; R5, que va después de este tramo.

| # | Subagente | Encargo (`docs/prompts/`) | Archivos propios (informe B0 §5) |
| --- | --- | --- | --- |
| 1 | `fe-platform` | `PROMPT-MOD11-CONSOLA-OT-OLA2B-R2-FE-PLATFORM-v1.0.md` | evidencia, firma, `use-execution-order-evidence.ts` |
| 2 | `fe-platform` | `PROMPT-MOD11-CONSOLA-OT-OLA2B-R3-FE-PLATFORM-v1.0.md` | material, `use-execution-order-custody.ts` |
| 3 | `fe-platform` | `PROMPT-MOD11-CONSOLA-OT-OLA2B-R4-FE-PLATFORM-v1.0.md` | `use-execution-order-refresh.ts` |
| 4 | `fe-platform` | `PROMPT-MOD11-ORIGEN-OT-E4-PORTAL-v1.0.md` | tabla, resumen y sus specs |
| 5 | `sr-backend` | `PROMPT-MOD11-CORRECCION-OT-SPEC-136-GUARDA-v1.0.md` | spec de anulación |

**Skills:** cada encargo §3 lista las suyas; leer los `SKILL.md` antes de escribir.
**Contratos congelados:** UX v1.1 · componente v1.0 · tablas v1.2 · `execution-orders.ts` v1.4 · completion v1.
**Paralelo:** los cinco a la vez, porque la propiedad de archivos es disjunta. Tocar un archivo de B0 es `[CONSULTA]`.
**Condición de R2:** p95 real del análisis más reanudación con el mismo `mediaAssetId`. Si no hay entorno real, `[BLOQUEO]` específico.
**Cierre:** cinco informes en GO. Después, R5 (`sr-qa`) integra y verifica, y se consolidan G6, G6.5 y G7 por separado.

---

### Bloque copiar-pegar — común para 1 a 4 (cambia el encargo)

> Actúa como `fe-platform`. Lee `AGENTS.md`, el plan de consola v1.2, el informe B0 §5 y tu encargo `docs/prompts/<ENCARGO>` completo.
> Lee los `SKILL.md` de su §3 antes de codificar. Solo editas tus archivos propios: un archivo de B0 es `[CONSULTA]`, nunca una edición.
> Conserva el baseline B0 (`operations/` 507 tests) sin borrar pruebas: muévelas si cambian de dueño.
> Cierras con el §4 de tu encargo: typecheck del portal, jest con `Cached: 0`, `audit-ui.mjs` limpio y evidencia en navegador. Sin commit.

### Bloque copiar-pegar — `sr-backend` (5)

> Actúa como `sr-backend`. Lee `AGENTS.md` y `docs/prompts/PROMPT-MOD11-CORRECCION-OT-SPEC-136-GUARDA-v1.0.md`. Lee los `SKILL.md` de `testing-patterns` y `postgresql`.
> El spec de anulación revierte la 136 sin condición y borra `is_annulled` de `tenant_iwana`, que ya la tenía. Replica la guarda condicional que E4-datos puso en la 135.
> Corre el spec dos veces y verifica con SQL que esquema y `typeorm_migrations` siguen coherentes. Lista cualquier otro `down()` incondicional. Sin commit.
