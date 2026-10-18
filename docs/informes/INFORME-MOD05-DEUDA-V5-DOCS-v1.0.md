# INFORME — MOD05 · Deuda de código · V5 Gobernanza documental

**Versión:** 1.0 · **Fecha:** 2026-10-17 · **Estado:** Emitido · **Agente:** `docs-governance`

## Resultado

**NO-GO documental** hasta resolver el conflicto de instrucciones de migración sobre `dbiw` señalado abajo. Las auditorías mecánicas terminaron con exit code 0 y sin bloqueantes. No se modificaron los documentos auditados.

## Auditorías mecánicas

| Comando | Resultado exacto | Exit code |
| --- | --- | ---: |
| `node scripts/audit-doc-locations.mjs` | `BLOQUEANTE: 0 · AVISO: 3 (1868 archivos .md escaneados; los AVISO no bloquean)` | 0 |
| `node scripts/audit-adr-citations.mjs` | `BLOQUEANTE: 0 · AVISO: 144 (80 ADRs indexados; los [revisar] son heurísticos y requieren confirmación manual)` | 0 |

Los avisos mecánicos no se duplican en los hallazgos semánticos.

## Hallazgos

| Archivo | Regla | Hallazgo | Severidad |
| --- | --- | --- | --- |
| [PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.1.md](../prompts/PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.1.md):5 | Instrucciones coherentes y seguras | La precondición de V1 ordena `pnpm db:backup` y `pnpm db:migrate:all` sobre `dbiw`; el bloque de ejecución del mismo launcher dice «No migres `dbiw`» (línea 25). El encargo V1 de esta ola además exige comprobar la 157 antes de probar. La contradicción deja ambiguo si hay que mutar `dbiw`. Alinear la precondición con la comprobación de solo lectura y aclarar quién acredita la migración. | **bloqueante** |
| [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md):3 | Estado visible en documentos mayores | El plan presenta fecha y versión, pero no declara `Estado`. | menor |
| [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md):88 | Trazabilidad al launcher vigente | El plan señala el launcher v1.0 como vigente; el launcher v1.1 declara estado «Vigente» y es la referencia de V1–V4. Actualizar la referencia vigente, conservando v1.0 como antecedente si corresponde. | menor |
| [INFORME-MOD05-DEUDA-B2-v1.0.md](INFORME-MOD05-DEUDA-B2-v1.0.md):3 | Estado visible en documentos mayores | El informe indica fecha y agente, pero no declara `Estado`. | menor |
| [INFORME-MOD05-DEUDA-V1-QA-v1.0.md](INFORME-MOD05-DEUDA-V1-QA-v1.0.md):3 | Estado visible en documentos mayores | Tiene fecha, versión y un veredicto NO-GO, pero no un campo `Estado` documental. | menor |
| [INFORME-MOD05-DEUDA-V4-GATES-v1.0.md](INFORME-MOD05-DEUDA-V4-GATES-v1.0.md):3 | Estado visible en documentos mayores | Tiene fecha y resultados de gates, pero no un campo `Estado` documental. | menor |

## Verificaciones sin hallazgo

- **Nombres y ubicación:** los 17 artefactos listados abajo cumplen la convención de plan, prompt o informe y están en su carpeta canónica. Ningún prompt está fuera de `docs/prompts/`.
- **Launchers:** v1.0 y v1.1 tienen 27 líneas físicas cada uno, contando el salto final; ambos cumplen el máximo de 40.
- **Enlaces internos:** comprobados archivos y encabezados locales de Markdown en los 17 documentos; 0 destinos rotos.
- **PII y secretos:** el escaneo de los 17 documentos no encontró coincidencias de correos, móviles colombianos, números de identidad junto a etiquetas, asignaciones de credenciales ni claves privadas.
- **Fases e informes:** el plan refleja entregas B0–B3, cuyos informes existen. V1–V4 también tienen informe. G4/G6 permanecen NO-GO según V4, por lo que no se declara una fase cerrada sin informe de cierre.
- **Ruta de este informe:** estaba libre antes de crearlo.

## Rutas auditadas

- `docs/plans/2026-10-17-mod05-deuda-codigo.md`
- `docs/prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md`
- `docs/prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.1.md`
- `docs/prompts/PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.0.md`
- `docs/prompts/PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.1.md`
- `docs/informes/INFORME-MOD05-DEUDA-B0-v1.0.md`
- `docs/informes/INFORME-MOD05-DEUDA-B0-v1.1.md`
- `docs/informes/INFORME-MOD05-DEUDA-B0-v1.2.md`
- `docs/informes/INFORME-MOD05-DEUDA-B1-v1.0.md`
- `docs/informes/INFORME-MOD05-DEUDA-B1-v1.1.md`
- `docs/informes/INFORME-MOD05-DEUDA-B2-v1.0.md`
- `docs/informes/INFORME-MOD05-DEUDA-B2-v1.1.md`
- `docs/informes/INFORME-MOD05-DEUDA-B3-v1.0.md`
- `docs/informes/INFORME-MOD05-DEUDA-V1-QA-v1.0.md`
- `docs/informes/INFORME-MOD05-DEUDA-V2-SEC-v1.0.md`
- `docs/informes/INFORME-MOD05-DEUDA-V3-REV-v1.0.md`
- `docs/informes/INFORME-MOD05-DEUDA-V4-GATES-v1.0.md`
