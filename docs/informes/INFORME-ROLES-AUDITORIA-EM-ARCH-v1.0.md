# Informe de auditoría — Perfil AI-EM-ARCH

**Versión:** 1.0
**Estado:** Cerrado — remediación aplicada (perfil v2.2)
**Fecha:** 2026-08-02
**Modo activo:** Architect + EM
**Alcance auditado:** [`docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) en su v2.1
**Documentos de contraste:** [Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md) (v1.3), los 8 perfiles hermanos de `docs/roles/`, `AGENTS.md`, `.claude/agents/*.md`, `.cursor/rules/ai-em-arch.mdc` y los ADR-016, ADR-021 (superado), ADR-022, ADR-049, ADR-056 y ADR-069 (propuesto)
**Informe vivo relacionado:** [INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md](INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md) §6

---

## 1. Método

Verificación por **apertura de artefacto**, conforme al protocolo §7.4 endurecido por ADR-056 §5: ninguna afirmación de este informe se apoya en la existencia de un archivo, sino en su contenido leído. Se aplicó además la regla derivada de ADR-056 (*Segunda pasada*): **negar que un documento cubre X exige recorrer todas sus secciones; afirmarlo solo exige la sección que lo respalda.**

Complementos mecánicos: `node scripts/audit-adr-citations.mjs` (estado de partida `BLOQUEANTE: 0 · AVISO: 113`) e historial de git del archivo auditado.

## 2. Veredicto

El perfil es **estructuralmente sólido y operativamente desactualizado**. Sus definiciones de rol, límites y matriz de decisiones siguen siendo correctas; lo que falló es el **mantenimiento de su base normativa**: ADR-056 (Aprobado 2026-07-19) reescribió dos piezas que este perfil usa a diario y su plan de ejecución alineó a cuatro perfiles **sin incluir a EM-ARCH**. El resultado es un aprobador de gates operando contra una definición que él mismo declaró superada.

Hallazgos: **3 bloqueantes · 7 altos · 6 medios · 4 bajos**. Todos remediados salvo los declarados fuera de alcance en §6.

## 3. Hallazgos bloqueantes

### B-01 · Definición de Estrella Polar superada en la matriz de decisiones

`Perfil…v2.md:83` (v2.1) aprobaba especificaciones UX/UI *"contra PRD, identidad y prototipo Estrella Polar"* — la definición de **dos** dominios de ADR-049. [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §3 la reemplaza por **tres dominios de autoridad** y cierra: *"Esta definición sustituye la de ADR-049 en todo artefacto que la cite."*

Medida de la desviación: el perfil tenía **0 menciones de ADR-056 y 0 de "Firma iWana"**; FE-PLATFORM tenía 3 y 2, SR-QA 1 y 1. El perfil que **aprueba** la spec estaba peor anclado que quienes la implementan y verifican — exactamente la asimetría que ADR-056 §Consecuencias decía haber cerrado.

**Remediado:** §5 cita los tres dominios; §6 nivel 4 los desarrolla.

### B-02 · Cadena de precedencia desalineada

ADR-056 §4 fija la cadena canónica con casilla **fuentes de diseño** entre HLD y protocolo, y su acción 5 ordena: *"Los perfiles DS-OWNER, PROD-UX, FE-PLATFORM y SR-QA alinean su §6 a esta cadena."* EM-ARCH no estaba en ese alcance. Su §6 (v2.1) no citaba §5.4, no citaba ADR-056 y no tenía la casilla: nivel 4 era HLD y nivel 5 el protocolo.

Consecuencia práctica: en un conflicto de superficie visual, el aprobador del gate resolvía con una precedencia distinta de la de cuatro de sus revisores.

**Remediado:** §6 replica literalmente la cadena de 8 niveles de FE-PLATFORM y DS-OWNER.

### B-03 · Atribución falsa de la Regla de Completitud

§3.4 y la Parte II (regla 7) citaban *"Regla de Completitud (ADR-016)"*. [`ADR-016-Cierre-MOD01-Produccion.md:8`](../adrs/ADR-016-Cierre-MOD01-Produccion.md) contiene la nota de desambiguación emitida por ADR-056: las citas de esa forma *"se refieren a la **regla**, no a este cierre: su autoridad es **[ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md)**"*.

El gate `pnpm audit:adr-citations` no lo bloquea porque ADR-016 está `Aprobado` y el check (a)/(b) es determinista sobre existencia y estado. Es un defecto del tipo **heurístico (c)** — atribución inline que no corresponde al contenido — cometido en el perfil del autor de la regla que lo persigue.

**Remediado:** reanclado a ADR-022 en ambos sitios, con nota de desambiguación.

## 4. Hallazgos altos

| # | Hallazgo | Evidencia | Remediación |
| --- | --- | --- | --- |
| A-01 | **Metadatos desincronizados**: `Fecha: 2026-07-10` con v2.1 aprobada el 2026-07-18 | Cabecera v2.1 vs. su propio campo `Estado`. SR-FULL v2.1, FE-PLATFORM v1.1, SR-QA v1.1 y SEC-ENG v1.1 — misma auditoría — sí movieron su `Fecha` | `Fecha: 2026-08-02` |
| A-02 | **Deriva sin versión ni changelog**: dos ediciones post-v2.1 sin bump | `7cd44be4` (2026-07-19, marcador `(superado)`) y `9ea24f99` (2026-07-27, ruta y plantilla del prompt en §7). Ninguna figura en la Parte III, que es el changelog | Parte III ítem 5 las regulariza |
| A-03 | **KPIs sin fuente de dato viva**: §10 y §7 se alimentaban del informe de sprint | El repo tiene **2 informes de sprint** (MOD01, MOD02) frente a **30 informes de cierre** y 255 informes totales. El programa entrega por fase y módulo. Los 7 KPIs reportaban "sin instrumentar" de forma permanente | §7 y §11 reanclados al informe de fase + informe de cierre; el de sprint pasa a agregado a solicitud del CTO |
| A-04 | **Modelo de ejecución paralela ausente**: 0 menciones de `§3bis` | `Protocolo:146` le asigna obligación explícita: *"Un cambio de contrato es el único evento que fuerza re-sync y se coordina vía EM-ARCH"*. El perfil solo describía el workflow serial de 7 etapas | Nueva **§3.5 Delegación paralela (contract-first)** |
| A-05 | **Carril rápido de UI no registrado**: 0 menciones | `Protocolo:148` y ADR-049 lo definen como delegación **suya** a DS-OWNER; `Perfil_IA_Design_System_Owner_v1.md:90` lo declara como entrada recibida. Leído en solitario, el perfil implicaba que todo cambio de token pasa por su gate — el cuello de botella que ADR-049 §18 dice haber eliminado | Fila propia en la matriz §5 |
| A-06 | **Sin contrato de gestión de bloqueos**, siendo el destinatario único de todos los `[BLOQUEO]` | `Protocolo:115` + los 8 subagentes de `.claude/agents/` escalan a él. SR-FULL §9 y FE-PLATFORM §10 sí tienen esa sección con SLA; el perfil no definía disparador, SLA ni artefacto de salida | Nueva **§8** con tabla de entradas, SLA en unidades de sesión y destino de registro |
| A-07 | **Red de consulta incompleta**: omitía a AI-SR-QA | `Protocolo:187`, fila EM-ARCH: *"Testabilidad de un criterio de aceptación"* | Añadido en §3.4 |

## 5. Hallazgos medios y bajos

| # | Sev. | Hallazgo | Remediación |
| --- | --- | --- | --- |
| M-01 | Media | **G1 enunciado sin mecanismo.** El perfil declaraba *"el aprobador de un gate nunca es el productor"*, pero él produce el PRD/HLD de etapa 1; `Protocolo:103` trae el mecanismo (review cruzado SR-FULL + PROD-UX) y el perfil lo omitía justo donde le aplica | §3.4 incorpora el review cruzado; Parte II regla 8 |
| M-02 | Media | **Doctrina "gobernanza vs modo de sesión" ausente.** Vive en `AGENTS.md:15`, `Protocolo:54` y el prompt de activación. Sin ella, la Parte II se lee como siempre activa y un lector concluye que ninguna sesión del repo puede escribir código | Campo `Modo de sesión` en cabecera + nota de apertura de la Parte II |
| M-03 | Media | **Protocolo citado sin versión.** Nombre de archivo `_v1`, contenido **v1.3**, y una modificación del 2026-07-27 sin bump (`Protocolo:149`) | Perfil declara "v1.3 vigente" y explica el sufijo histórico. El bump del protocolo se reporta, no se ejecuta aquí |
| M-04 | Media | **Plantilla citada sin marcador de estado.** `TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` está *"En revisión — pendiente de promoción a Aprobado"*; §7.4 exige marcador | Marcador `(en revisión)` + ruta `docs/prompts/` |
| M-05 | Media | **"informe vivo de roles" sin enlace** — único referente del header sin ruta, en un documento que enlaza todo lo demás | Enlace en el campo `Gobernanza` |
| M-06 | Media | **Deuda programada por ADR-069** (propuesto): taxonomía G6 / G6.5 / G7 que desactualizará §7 y §11 (KPIs) del perfil al aprobarse | **No remediado a propósito** — ver §6 |
| X-01 | Baja | **Enlace roto en el adaptador Cursor.** `.cursor/rules/ai-em-arch.mdc:10` y `:23` apuntaban a `.github/prompts/activar-ai-em-arch.prompt.md`; esa carpeta fue suprimida el 2026-07-27. Rompía el mecanismo por el que se enciende el modo Orquestador en Cursor | Repuntado a `docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md` — **corrección local, ver X-04** |
| X-04 | Baja | **`.cursor/` está en `.gitignore:44`.** El adaptador de Cursor no está versionado: la corrección de X-01 no se propaga a otras máquinas, ningún gate de CI puede validarlo, y su deriva respecto de `AGENTS.md` es invisible al historial. Es la única de las superficies de activación multi-IDE que no es auditable | **No remediado** — ver §6 |
| X-02 | Baja | **Nomenclatura inconsistente**: `AI-EM-ARCH` / `EM-ARCH` / "el agente padre (orquestador)"; 7 de 8 subagentes escalan sin nombrar el identificador | Convención declarada en el campo `Identificador` del perfil |
| X-03 | Baja | **Estructura divergente** de los perfiles hermanos: PARTE II/III sin PARTE I (SEC-ENG y SR-QA sí la tienen); sin sección de colaboración con flechas ←/→ que sí tienen 5 perfiles | **No remediado** — ver §6 |

## 6. Residuales y decisiones para el CTO

1. ~~**ADR-069.**~~ **Cerrado el 2026-08-02:** el CTO lo aprobó sin cambios de contenido y el perfil salió en **v2.3** con la *Consolidación de G6.5* como entregable. Ver [informe vivo §8.1](INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md).
2. **Bump del protocolo a v1.4.** `Protocolo:149` registra una supresión del 2026-07-27 mientras su cabecera sigue en `Versión: 1.3 / Fecha: 2026-07-18`. Mismo defecto de A-02, en otro documento. Se reporta; corregirlo es acto de mantenimiento del protocolo (§9).
3. **Normalización estructural de los 9 documentos** (X-03). Coexisten tres convenciones: PARTE I/II/III (SEC-ENG, SR-QA), PARTE II/III sin I (EM-ARCH, SR-FULL) y "Prompt base (compacto)" sin partes (FE-PLATFORM, PROD-UX, DS-OWNER, PLAT-OPS); DATA-ENG no tiene prompt base. Es una decisión de ecosistema, no de un perfil.
4. ~~**`.cursor/` sin versionar** (X-04).~~ **Cerrado el 2026-08-02: retirado, no versionado.** La recomendación inicial de este informe (*"versionarlo, dado que `AGENTS.md` lo trata como superficie de paridad"*) **era incorrecta**: al verificarlo, `AGENTS.md` → *AI Workflow Activo* declara cuatro asistentes activos —Copilot, OpenCode, Codex y Claude Code— y **Cursor no está entre ellos**; solo aparece mencionado como lector de `.claude/agents/`. La carpeta contenía un único archivo. Decisión del CTO: retirar el adaptador y dejar constancia en `.gitignore`. Ver [informe vivo §8.2](INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md).
5. **Nombre de archivo del protocolo y del informe vivo.** Ambos llevan `v1` / `v1.0` en el nombre con contenido en v1.3 y v1.2 respectivamente. Renombrar rompería ~40 enlaces entrantes; mantenerlo exige la nota aclaratoria que el perfil ya incorpora. Recomendación: **mantener el nombre y la nota**; el número de versión vive en la cabecera, no en el filename.

## 7. Verificación de la remediación

| Verificación | Resultado |
| --- | --- |
| `node scripts/audit-adr-citations.mjs` | `BLOQUEANTE: 0` — sin regresión |
| §6 del perfil idéntico en estructura a FE-PLATFORM y DS-OWNER (8 niveles, casilla de diseño en 4) | Conforme |
| Citas nuevas abiertas y verificadas (ADR-022, ADR-056 §3 y §4, protocolo §3, §3bis, §5.4, §6.1) | Conforme |
| Menciones de `ADR-056` / `ADR-022` / `3bis` / `carril rápido` / `SR-QA` en el perfil | 0 → ≥1 en cada caso |
| Menciones de "Regla de Completitud (ADR-016)" | 2 → 0 |
| Enlaces a `.github/prompts/` en `.cursor/rules/ai-em-arch.mdc` | 2 → 0 (queda una mención en prosa, dentro de la nota de corrección que documenta el cambio) |
| Impacto en código, migraciones o build | Ninguno — entrega 100% documental |

## 8. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin impacto — cambio documental |
| **Seguridad** | Sin impacto directo. Indirecto positivo: el checklist §10 incorpora verificación de cita, que es el control que ADR-056 §5 estableció |
| **Escala** | Sin impacto |
| **Regulación** | Sin impacto |
| **Autoridad** | **No se mueve autoridad hacia ni desde el CTO** → no requiere ADR (protocolo §9). Registro obligatorio en el informe vivo de roles: ejecutado |

---

## 9. Lección de gobernanza

El defecto raíz no es ninguno de los trece hallazgos: es que **el plan de ejecución de ADR-056 enumeró a los perfiles afectados por rol de diseño** (DS-OWNER, PROD-UX, FE-PLATFORM, SR-QA) **y omitió al perfil que aprueba lo que esos cuatro producen**. Una remediación que alinea a los productores y deja fuera al aprobador no cierra el defecto: lo reubica en el gate.

Regla derivada, aplicable a toda enmienda normativa futura:

> Cuando un ADR ordena alinear perfiles a una definición, el alcance se determina por **quién cita la definición**, no por quién pertenece a la capa que la origina. El aprobador de un artefacto cita siempre la norma contra la que aprueba.

Es el mismo patrón que ADR-056 §Ampliación llamó *"una corrección parcial de una cita es tan defectuosa como la cita original, y más peligrosa porque aparenta estar cerrada"* — aquí manifestado en el alcance de un plan de ejecución en vez de en una línea de texto.
