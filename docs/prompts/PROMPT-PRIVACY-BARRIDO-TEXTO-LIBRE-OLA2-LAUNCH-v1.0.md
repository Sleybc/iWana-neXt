# LAUNCH — privacy · Barrido de texto libre · Ola 2 (B3)

**Plan:** `docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md` v1.2 · **Spec:** `docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md` v1.1, Aprobada
**Ola que lanza:** 2, B3 · **Gates:** G0 {✅ 2026-11-07, spec §13 puntos 1 a 8} · Ola 1 {publicada en `90d42c7f`, G6.5 ✅}
**Bloqueos abiertos:** ninguno. P6 cerrada: el diff de K2 se publicó en `5d6a366b`. Se comprueba igual con `git status` al lanzar.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Plan §4 B3 · spec D-BT-2, D-BT-4, D-BT-7, D-BT-8, D-BT-9 y D-BT-13 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `architect-review`, `test-driven-development`, `iwana-test-evidence`; de apoyo `system-vocabulary-review`, `typescript-expert` |

**Paralelo:** ninguno: adaptador, módulo y CLI son comunes. **Siguiente:** Ola 3 (`sr-qa`, plan §4 B4).
**Cierre de ola (G2):** conteo real sin caché de unitarias e integraciones con `DB_NAME=test`; ninguna ruta fuera de plan §4 B3; suite completa de `apps/api`, porque cambian dos `@Module`.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.

```text
===== B3 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md v1.2 §1 y §4 B3, y la spec docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md v1.1, Aprobada: §4, §5, D-BT-1, D-BT-2, D-BT-4, D-BT-7, D-BT-8, D-BT-9 y D-BT-13.
Lee antes los SKILL.md de nestjs-expert, backend-security-coder, postgresql, architect-review, test-driven-development, iwana-test-evidence; de apoyo system-vocabulary-review y typescript-expert.
Antes de escribir: git status sin diff en apps/api/src/cli/anonymize-titular.ts ni en crm-titular-erasure.participant.ts; si hay, [BLOQUEO].
Primero las pruebas en rojo, unitarias e integración Postgres con DB_NAME=test y cadena completa, fijando iwana.titular_erasure como el adaptador.
1. Participantes nuevos: modules/network/privacy/ con R-2 y modules/assurance/privacy/ con R-3 a R-6. Alcance de tickets exacto de D-BT-2, comparando como texto. R-15 queda fuera (§7).
2. Orden de participantes de D-BT-2 en crm-personal-data-erasure.adapter.ts, crm-privacy-adapters.module.ts y apps/api/src/cli/anonymize-titular.ts (paridad R13).
3. wfm y tasks: alcance A-1 a A-4 y reglas R-12 y R-13 (D-BT-4); en R-13 el asiento conserva fechas y el texto pasa a marca.
4. D-BT-7: 409 titularAnonymizedConflict al crear ticket, comentario y regularización, por el puerto de lectura de CRM, sin importar entidades de otro módulo.
5. D-BT-8: bloqueante de vista previa si el Party tiene supplier_profiles.
6. D-BT-9: privacy-labels.ts:69 pasa a «Operación y soporte». Sin migración.
Lee los CHECK antes de fijar NULL: ck_sp_regularized en R-2 y NOT NULL en R-3, R-4, R-12 y R-13.
Solo las rutas de plan §4 B3. Sin migración, sin tocar audit-sanitize.policy.ts ni billing. main sin ramas, sin stash ni commit, cero PII, nunca tenant_iwana.
Entrega: diff, conteo real sin caché, integraciones con DB_NAME=test y número de migraciones, suite completa de apps/api, typecheck, ESLint y Prettier.
```
