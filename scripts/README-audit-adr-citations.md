# `audit-adr-citations.mjs` — gate de integridad de citas normativas ADR

Implementa la propuesta de prevención SR-QA #13 recogida en
[ADR-056](../docs/adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §"Ampliación 2026-07-19", y
automatiza la regla endurecida del
[protocolo](../docs/roles/Protocolo_Colaboracion_Multiagente_v1.md) §7.4: **una cita solo confiere
autoridad si el artefacto existe, su estado es `Aprobado`, y dice lo que se afirma.**

Node puro, sin dependencias externas. Mismo contrato de CLI y de severidades que
`.agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs`.

## Cómo se corre en local

```bash
pnpm audit:adr-citations                        # rutas por defecto: docs/ y .agents/skills/
node scripts/audit-adr-citations.mjs --json     # salida JSON para tooling
node scripts/audit-adr-citations.mjs docs/prds  # acotado a una ruta
```

Exit code `1` **solo** si hay hallazgos BLOQUEANTES. Los avisos nunca cambian el exit code.

## Qué valida

| Check | Regla                                                                                | Tipo         | Severidad         |
| ----- | ------------------------------------------------------------------------------------ | ------------ | ----------------- |
| (a)   | `adr-missing` — el ADR citado no existe como archivo en `docs/adrs/`                 | Determinista | **BLOQUEANTE**    |
| (a')  | `adr-historic-space` — cita a `ADR-001…015` (espacio de numeración histórico)        | Determinista | AVISO             |
| (b)   | `adr-no-status` — el archivo existe pero no declara estado                           | Determinista | **BLOQUEANTE**    |
| (b')  | `adr-status-invalid` — estado fuera del vocabulario canónico                         | Determinista | **BLOQUEANTE**    |
| (b'') | `adr-not-approved` — estado distinto de `Aprobado` **y sin marcador histórico**      | Determinista | **BLOQUEANTE**    |
| (c)   | `adr-attribution-mismatch` — la atribución inline no se corresponde con el contenido | Heurístico   | AVISO `[revisar]` |

**Severidades.** `BLOQUEANTE` = evidencia directa, rompe el gate, se corrige o se justifica con
exclusión explícita. `AVISO` = no rompe nada. Los marcados `[revisar]` son heurísticos: **requieren
confirmación manual antes de entrar a un informe** (regla anti-falso-positivo del ecosistema); un
`[revisar]` sin verificar no es un hallazgo.

## Los tres formatos de estado

El validador lee los **tres** formatos que conviven en `docs/adrs/` (verificado sobre el repo, no
asumido). Leer menos produce falsos positivos sobre ADRs perfectamente válidos:

| Formato          | Ejemplo                  | Archivos             |
| ---------------- | ------------------------ | -------------------- |
| Markdown plano   | `**Estado:** Aprobado`   | 31                   |
| Blockquote       | `> **Estado:** Aprobado` | 5 (ADR-016…020)      |
| Frontmatter YAML | `status: "Aprobado"`     | 5 (ADR-028…031, 036) |

> El formato blockquote **no estaba declarado** en la propuesta original del gate. Es el de
> ADR-016…020, que acumulan ~400 citas entre los cinco: un validador que solo contemplara los dos
> formatos documentados habría reportado esas ~400 citas como `adr-no-status` y roto CI en el
> primer push.

Se aceptan variantes con emoji (`✅ Aprobado`) y cualificadas (`Aprobado (diseño de fase; …)`).
Vocabulario canónico: `Aprobado` · `En revisión` · `Propuesto` · `Superado`.

## Convención de cita histórica (marcador obligatorio)

Protocolo §7.4. Citar un ADR superado **como genealogía** es legítimo ("el perfil v2 sucede a v1 de
ADR-021 (superado)"); invocarlo **como autoridad** no lo es. Para que la distinción sea verificable
y no quede al juicio del lector:

> Toda cita de un ADR en estado `Superado`, `Propuesto` o `En revisión` lleva marcador explícito
> junto al número. **Sin marcador, el gate la bloquea.**

Sintaxis aceptada — insensible a mayúsculas y tildes, con o sin `*`/`_` de markdown:

| Forma                                       | Ejemplos                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Marcador propio, entre `()` o `[]`          | `ADR-021 (superado)` · `ADR-021 [superado]` · `ADR-021 (_en revisión_)` |
| Dentro del mismo paréntesis, tras separador | `(ADR-021, superado)` · `(ADR-021 — propuesto)`                         |
| Tras un enlace markdown                     | `[ADR-021](../adrs/ADR-021-….md) (superado)`                            |

Vocabulario: `superado/a` · `propuesto/a` · `en revisión` (se acepta `en revision`).

**Adyacencia.** El marcador se liga a _su_ cita: se busca desde el número hasta la siguiente cita
`ADR-` de la misma línea (o el fin de línea), con tope de 160 caracteres. En
`ADR-021, ADR-022 (superado)` el marcador **no** cubre a ADR-021 — cada cita lleva el suyo.

## Comentarios HTML

Los comentarios `<!-- … -->` se eliminan **antes** de buscar citas: un `<!-- ADR-021 retirado vía
ADR-056 -->` es metadato de trazabilidad sobre una cita _ya removida_, no una cita que invoque
autoridad. Sin este filtro, documentar correctamente una remediación volvía a disparar el mismo
bloqueante que se acababa de corregir. Los marcadores `adr-cite-ignore*` se evalúan antes del
borrado y siguen funcionando.

## Espacio de numeración histórico (ADR-001…015)

Estas entradas **no existen como archivo**: son `docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md` §14.6,
sin cabecera de estado, y por ADR-056 §12 no confieren autoridad normativa.

**Decisión de diseño:** no se distinguen por contexto inline. Se verificó que la mayoría de las 106
citas aparecen desnudas (`**ADRs:** ADR-001, ADR-002, …`) **sin** marcador `PRD §14.6`, de modo que
un detector de contexto sería frágil. Se usa el criterio determinista y estable —el rango
numérico— y se emite **AVISO, no bloqueo**: la ambigüedad es histórica y estructural, no un defecto
introducido por el autor de la cita. Bloquear aquí convertiría el gate en ruido el día uno.

## Cómo se excluye un caso legítimo

Tres mecanismos, de menor a mayor alcance. Toda exclusión **lleva razón escrita**.

1. **Línea** — el marcador aplica a su propia línea, o a la inmediatamente siguiente **sin línea en
   blanco de por medio**. La forma en la misma línea es la robusta:

   `El informe atribuía erróneamente la norma a ADR-021. <!-- adr-cite-ignore: errata citada como ejemplo -->`

2. **Archivo completo** — en cualquier punto del documento:

   ```markdown
   <!-- adr-cite-ignore-file: nota de errata; habla *sobre* ADRs defectuosos por diseño -->
   ```

3. **Allowlist de rutas** — `PATH_ALLOWLIST` en el script. Reservada a artefactos que existen para
   documentar citas defectuosas. Hoy contiene una sola entrada: el propio ADR-056.

Además, un `ADR-0NN-*.md` que se nombra a sí mismo nunca se reporta (autorreferencia).

> **Una exclusión no es una corrección.** Si el gate marca un `adr-not-approved` real, se escala a
> AI-EM-ARCH; no se silencia. La exclusión es para artefactos que _hablan sobre_ citas defectuosas,
> no para citas defectuosas.

## Estado del gate

**Bloqueante** desde 2026-07-19 (job `adr-citations` en `.github/workflows/ci.yml`, sin
`continue-on-error`). El repo sale limpio en bloqueantes: 0 BLOQUEANTE, 106 AVISO (104
`adr-historic-space` + 2 `adr-attribution-mismatch`).
