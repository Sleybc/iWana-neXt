# INFORME-TRANSVERSAL-ADR-CITAS-HEURISTICAS-REMEDIACION

**Versión:** 1.0
**Estado:** Cerrado — remediación verificada
**Fecha:** 2026-07-27
**Autor:** AI-SR-QA (remediación delegada por AI-EM-ARCH)

## Trazabilidad

- Gate: `scripts/audit-adr-citations.mjs` — regla (c) `adr-attribution-mismatch` [H/AVISO], implementación de **ADR-056 §Ampliación 2026-07-19** (propuesta SR-QA #13) y exigencia del **protocolo §7.4** (una cita solo confiere autoridad si el artefacto existe, está Aprobado y dice lo que se afirma).
- Origen del repaso que destapó los hallazgos: [`docs/prompts/PROMPT-TRANSVERSAL-GATE-UBICACION-DOCUMENTAL-v1.0.md`](../prompts/PROMPT-TRANSVERSAL-GATE-UBICACION-DOCUMENTAL-v1.0.md).
- Skill aplicada: `docs-architect`. Scripts del gate tratados como solo lectura; sin mutaciones git.

## Alcance

El gate reportaba 108 AVISO: 104 `adr-historic-space` (recordatorios permanentes por diseño sobre el espacio de numeración histórico del PRD §14.6 — **no se tocan**) y 4 `adr-attribution-mismatch [revisar]`, únicos accionables. Este informe documenta la verificación manual y corrección de esos 4.

## Hallazgos y remediación

| # | Ubicación | Cita original | Veredicto de verificación | Corrección aplicada | Evidencia |
| --- | --- | --- | --- | --- | --- |
| 1 | `docs/adrs/ADR-032-Retiro-Feature-Flag-TAXATION-USE-CATALOG.md:28` → ADR-031 | `*"el cierre del checklist D6 de ADR-031 (cutover checklist)"*` | **Falso positivo por diseño.** La línea es una nota de corrección de referencia (2026-07-19, ADR-056) que documenta, entre comillas y cursiva, la cita errónea que la sección tenía antes de corregirse. Verificado: «cutover» y «checklist» aparecen 0 veces en `ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md` (`grep -ci` → 0). La atribución es metadato sobre una cita removida, no una afirmación vigente. | Se añadió en la línea anterior `<!-- adr-cite-ignore: … -->` con justificación explícita (metadato entrecomillado sobre cita errónea ya removida). El texto visible quedó intacto. | Gate post-remediación: 0 hallazgos `adr-attribution-mismatch`. |
| 2 | `docs/informes/INFORME-MOD02-FRONTEND-FASE-01-v1.0.md:67` → ADR-019 | `ADR nuevo o referenciado: ADR-022, ADR-019 (referenciados estructuralmente).` | **Confirmado: no es atribución de contenido.** El paréntesis es una nota de rol (ambos ADRs se citan como marco estructural, sin atribuirles afirmación). Verificado: «referenciad»/«estructural» aparecen 0 veces en `ADR-019-JWT-RS256-Refresh-Rotation.md` (`grep -ci` → 0). | Reescrito sacando la nota del paréntesis: `ADR nuevo o referenciado: ADR-022 y ADR-019, ambos referenciados estructuralmente.` — ya no se parsea como atribución. | Idem. |
| 3 | `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md:139` → ADR-059 | `ADR-059 (Propuesto) + spec + prompt NO ejecutable` (historial 2026-07-20) | **Confirmado: genealogía legítima desactualizada.** El 2026-07-20 ADR-059 se emitió como Propuesto y ese mismo día el CTO lo aprobó (entradas 140–141 del propio historial). Hoy `ADR-059-Costeo-Promedio-Movil-Valoracion-Inventario.md` declara `**Estado:** ✅ Aprobado` en cabecera, por lo que «(Propuesto)» se evaluaba como atribución y «propuesto» no aparece en su cuerpo (`grep -ci` → 0). | Reescrito dejando el hecho histórico claro y con término presente en el ADR: `ADR-059 (emitido como Propuesto; hoy Aprobado)` — «aprobado» está en la cabecera y cuerpo normalizado de ADR-059. | Idem. |
| 4 | `docs/security/SECURITY-REVIEW-TRANSVERSAL-AUDIT-RESPONSE-SWEEP-v1.0.md:55` → ADR-058 | `documentación ADR-058 (sin volcar hex en este informe).` | **Confirmado: nota del propio informe, no atribución.** El paréntesis aclara que el informe no vuelca el hex de la clave débil referenciada en ADR-058; no atribuye contenido al ADR. | Paréntesis sustituido por guion: `documentación ADR-058 — sin volcar hex en este informe.` — ya no se parsea como atribución. | Idem. |

## Salida del gate (literal)

**Antes** (extracto de los 4 hallazgos accionables + resumen; salida completa con 108 AVISO):

```text
docs/adrs/ADR-032-Retiro-Feature-Flag-TAXATION-USE-CATALOG.md:28 — [AVISO][adr-attribution-mismatch] [revisar] ADR-031: Ningún término de la atribución "cutover checklist" aparece en docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md — verificar manualmente que el ADR dice lo que se le atribuye
docs/informes/INFORME-MOD02-FRONTEND-FASE-01-v1.0.md:67 — [AVISO][adr-attribution-mismatch] [revisar] ADR-019: Ningún término de la atribución "referenciados estructuralmente" aparece en docs/adrs/ADR-019-JWT-RS256-Refresh-Rotation.md — verificar manualmente que el ADR dice lo que se le atribuye
docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md:139 — [AVISO][adr-attribution-mismatch] [revisar] ADR-059: Ningún término de la atribución "Propuesto" aparece en docs/adrs/ADR-059-Costeo-Promedio-Movil-Valoracion-Inventario.md — verificar manualmente que el ADR dice lo que se le atribuye
docs/security/SECURITY-REVIEW-TRANSVERSAL-AUDIT-RESPONSE-SWEEP-v1.0.md:55 — [AVISO][adr-attribution-mismatch] [revisar] ADR-058: Ningún término de la atribución "sin volcar hex en este informe" aparece en docs/adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md — verificar manualmente que el ADR dice lo que se le atribuye

Resumen: BLOQUEANTE: 0 · AVISO: 108 (52 ADRs indexados; los [revisar] son heurísticos y requieren confirmación manual)
```

**Después** (resumen literal; `exit=0`):

```text
Resumen: BLOQUEANTE: 0 · AVISO: 104 (52 ADRs indexados; los [revisar] son heurísticos y requieren confirmación manual)
```

Los 104 AVISO restantes son íntegramente `adr-historic-space` (recordatorio permanente por diseño, espacio de numeración histórico del PRD §14.6); la única mención a `[revisar]` en la salida posterior es el texto del propio resumen, no un hallazgo.

## Gate complementario

```text
$ node scripts/audit-doc-locations.mjs
audit-doc-locations: sin hallazgos (856 archivos .md escaneados).
```

## Restricciones respetadas

- `scripts/audit-adr-citations.mjs` y `scripts/audit-doc-locations.mjs` sin modificar (solo lectura).
- Cero mutaciones git (`add`/`commit`/`stash`/`checkout` ni ninguna otra).
- Los 104 avisos `adr-historic-space` intactos.
- Correcciones mínimas: una línea por documento (más el comentario de justificación en ADR-032), sin reformateo adicional.
