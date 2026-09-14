---
description: "Analisis de dispatch del modo Orquestador AI-EM-ARCH: al emitir los artefactos de una fase, derivar que agente ejecuta cada bloque, que skills debe leer y emitir el prompt corto de lanzamiento."
name: "Analisis de dispatch (AI-EM-ARCH)"
argument-hint: "Fase, modulo o alcance cuya definicion se acaba de cerrar"
agent: "ask"
---

Cierra la definicion de una fase con su **analisis de dispatch**: quien la ejecuta, con que skills, y el **prompt corto de lanzamiento** que la arranca.

**Complementa, no sustituye:**

- [`PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md`](PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md) — activa la identidad y los limites del modo Orquestador. Si no esta activo, activalo primero.
- [`PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md`](PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md) — el procedimiento de **despacho** de un plan ya aprobado. Este prompt corre **antes**: produce el insumo que aquel consume.

**Cuando se ejecuta:** en el mismo acto en que se emite el PRD, la spec, el plan de orquestacion o el informe que cierra un alcance. No es un paso posterior opcional. Una definicion sin analisis de dispatch esta incompleta: obliga al orquestador de la sesion siguiente a rederivar agentes y skills desde cero, que es justo el trabajo que este analisis elimina.

## Fuente de verdad (leer antes de analizar)

1. `AGENTS.md` — gobernanza maestra y **Skills Dispatch** (mapa dominio → skill).
2. [`docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`](../roles/Protocolo_Colaboracion_Multiagente_v1.md) v1.5 — §2 RACI, §3 gates, §3bis ejecucion paralela.
3. [`.claude/agents/`](../../.claude/agents/) — **fuente canonica** de los ocho subagentes ejecutores. AI-EM-ARCH no esta ahi: es el agente padre que despacha.
4. [`.agents/skills/INDEX.md`](../../.agents/skills/INDEX.md) — catalogo activo, y `MANIFEST.json` para el conteo vigente.
5. La spec, el PRD o el plan cuya definicion se esta cerrando.

---

## Paso 1 — Descomponer en bloques ejecutables

La unidad del analisis es el **bloque**: un encargo que un solo agente puede cerrar en una sesion, con un artefacto de salida localizable.

Un bloque mal cortado se reconoce por tres sintomas: dos agentes distintos aparecen como responsables, no tiene artefacto de salida nombrable, o su alcance depende de una decision todavia abierta. En los tres casos se corrige el corte antes de asignar, nunca despues por merge.

## Paso 2 — Asignar el agente ejecutor

Cada bloque recibe **un** agente de `.claude/agents/`, citado por su **nombre de subagente** —el que se invoca— y no solo por su identificador de gobernanza.

| Dominio del bloque | Subagente | Identidad |
| --- | --- | --- |
| Endpoints, servicios, entidades, migraciones, jobs BullMQ, contrato de API tipado | `sr-backend` | AI-SR-FULL |
| Componentes de `@iwana/ui`, pantallas de `apps/web` y `apps/portal`, RSC/client split, Tailwind v4 | `fe-platform` | AI-FE-PLATFORM |
| Flujo, user journey, UX spec, copy de producto, criterios de aceptacion de UX | `prod-ux` | AI-PROD-UX |
| Tokens, contrato de componente, estados requeridos, carril rapido de UI | `ds-owner` | AI-DS-OWNER |
| Tests, E2E, regresion visual, a11y, trazabilidad criterio-test | `sr-qa` | AI-SR-QA |
| Review de seguridad, threat model, tenant isolation, PII | `sec-eng` | AI-SEC-ENG |
| Modelo de datos e integraciones ISP (RADIUS, OLT, CDR, DIAN, ETL) | `data-eng` | AI-DATA-ENG |
| CI/CD, Docker, Nginx/TLS, backups/DR, ejecucion de releases | `plat-ops` | AI-PLAT-OPS |

Reglas de asignacion:

1. **Un bloque, un responsable.** Los demas entran como C o I del RACI, no como co-ejecutores.
2. **`sec-eng` y `sr-qa` son auditores:** reportan, no implementan. Si el hallazgo exige codigo, se abre un bloque nuevo para el agente dueño del area.
3. **El carril rapido de UI es de `ds-owner`** por delegacion (protocolo §3bis regla 3). No lo toma el orquestador ni `fe-platform`.
4. **Ningun bloque se asigna a AI-EM-ARCH.** Si el trabajo resultante es de gobierno, no es un bloque de dispatch: es un artefacto propio del orquestador.

## Paso 3 — Resolver las skills de cada bloque

Para cada bloque, tres listas. Las tres son obligatorias — **la tercera tambien**:

| Lista | Que contiene |
| --- | --- |
| **Obligatorias** | Las que el agente **lee antes de escribir codigo**. Salen del mapa dominio → skill de `AGENTS.md` → Skills Dispatch. Rara vez mas de tres por bloque. |
| **De apoyo** | Se consultan si aparece el caso que cubren. Se citan con su condicion (*si el bloque toca formularios*), nunca sueltas. |
| **Descartadas con motivo** | Las que el dominio sugiere pero **no** aplican, y por que. Es la lista que evita que el agente las abra por su cuenta y amplie alcance. |

Cuatro reglas que no se omiten:

1. **Verificar cada skill contra el disco antes de citarla.** El `INDEX.md` puede ir por delante del filesystem. La comprobacion es `ls .agents/skills/<nombre>/SKILL.md`; si no existe, la skill no se cita y la divergencia se reporta contra el `INDEX.md`.
2. **Claude Code, Copilot y Codex leen el `SKILL.md` como documentacion**, no lo invocan como tool nativa (`AGENTS.md` → Matriz operativa). El encargo lo dice literalmente: *leer antes de escribir codigo*, con la ruta.
3. **`ui-ux-pro-max` va siempre subordinada** a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y los tokens reales del repo. Nunca fundamenta por si sola la severidad de un hallazgo.
4. **Los scripts ejecutables que el plan exige como gate** (por ejemplo `audit-ui.mjs`) se declaran junto a las skills, con el comando exacto. Una skill no sustituye a un gate ejecutable.

### Formato en el plan de orquestacion

El analisis se deposita en el plan, seccion **Dispatch de agentes y skills**, con una fila por bloque:

```markdown
| Bloque | Subagente | Skills obligatorias | Apoyo (condicion) | Descartadas y por que | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| C0 — contrato | `sr-backend` | `nestjs-expert`, `openapi-spec-generation` | `postgresql` si toca query | `database-migration`: no hay cambio de schema | `pnpm typecheck` |
```

Una tabla de tres filas genericas para doce fases no es un analisis de dispatch: es el vacio que este prompt cierra.

## Paso 4 — Emitir el prompt corto de lanzamiento

El **launcher** es el artefacto que arranca la ejecucion: un bloque copiar-pegar que cabe en una pantalla y no obliga a leer el plan entero para saber a quien se llama primero.

- **Archivo propio y fuente unica:** `docs/prompts/PROMPT-{MODULO}-{FASE}-LAUNCH-v{VERSION}.md`, segun [`TEMPLATE-PROMPT-LANZAMIENTO.md`](TEMPLATE-PROMPT-LANZAMIENTO.md).
- **Espejo en el plan:** el plan cierra con una seccion **Lanzamiento** que reproduce el bloque y declara, en una linea, que el archivo `-LAUNCH` es la fuente y prevalece si divergen.
- **Techo de tamaño: 40 lineas.** Si no cabe, el alcance de la ola esta mal cortado, o el launcher esta absorbiendo contenido que pertenece al prompt de ejecucion.
- **No repite el encargo:** lo referencia por ruta. El launcher dice *a quien se llama, en que orden y leyendo que*; el prompt de ejecucion dice *que hacer*.

---

## Limites

- **El launcher no reemplaza al prompt de ejecucion por fase.** Sin G4 no hay implementacion (protocolo §3 etapa 4); un launcher que apunta a un prompt inexistente es un despacho sin encargo.
- **No emitas el analisis con escalaciones abiertas sin marcarlas.** Un bloque bloqueado se emite con `[BLOQUEO]` visible en su fila; no se omite de la tabla.
- **El analisis no aprueba gates.** Declara el estado que encontro; cerrar el gate es un acto aparte, y el aprobador nunca es el productor.

## Anti-patrones

- Citar una skill sin haber comprobado que existe en disco.
- Omitir la lista de skills descartadas: el agente las abre igual, y con peor criterio.
- Asignar un bloque a dos agentes "para que se coordinen": el reparto esta mal cortado.
- Un launcher de 150 lineas que duplica el plan — deja de ser lanzamiento y vuelve a ser lectura.
- Emitir el plan y el prompt de ejecucion, y dejar el analisis de dispatch "para cuando se despache".
