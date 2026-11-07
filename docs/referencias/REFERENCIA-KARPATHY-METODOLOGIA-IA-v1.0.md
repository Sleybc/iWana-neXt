# Referencia — Metodología de Andrej Karpathy para trabajo con IA y agentes

**Tipo:** Referencia técnica comparativa  
**Ámbito destino:** gobernanza de agentes (`AGENTS.md`, `.claude/`, `docs/prompts/`), gates de pruebas y gestión del conocimiento del workspace  
**Versión:** 1.0. Reemplaza al borrador sin versionar `metodolog_a_de_andrej_karpathy.md`, que atribuía a Karpathy varias prácticas sin fuente.  
**Estado:** Documento de consulta; no normativo  
**Fecha:** 2026-11-07  
**Audiencia:** arquitectura, orquestación de agentes, QA y documentación

## 1. Propósito y autoridad

Este documento sistematiza la forma de trabajar de Andrej Karpathy en tres frentes: entrenamiento de redes, programación con LLM y agentes, y conocimiento compilado por LLM. Lo contrasta con las prácticas de iWana neXt.

Karpathy es un referente, no una fuente de requisitos. Nada de lo aquí descrito modifica `AGENTS.md`, los gates ni los perfiles de rol. Si una recomendación de §10 se adopta, debe formalizarse en `AGENTS.md`, en un ADR o en el prompt o hook correspondiente.

## 2. Base de evidencia

Fuentes primarias consultadas el 2026-11-07:

- `karpathy.ai`, el blog actual (`karpathy.bearblog.dev`, posts 2025–2026) y el blog antiguo (`karpathy.github.io`).
- Repositorios oficiales `karpathy/autoresearch` (README y `program.md` completos) y `karpathy/llm-council` (README).
- Gist *LLM Wiki* (`442a6bf5…`, abril de 2026).

No se pudieron leer:

- El post *Software 2.0* en Medium (HTTP 403). Se cita por referencias del propio autor en posts posteriores.
- Los videos y los posts de X. Las afirmaciones que solo constan en X o en resúmenes de terceros se marcan como tales.
- La transcripción de la charla de Sequoia 2026 sí está en su blog, pero el autor declara que la generó un LLM.

**Convención de marcas** usada en todo el documento:

| Marca | Significado |
|---|---|
| **[V]** | Verificado en fuente primaria (post, repositorio o gist del autor) |
| **[P]** | Práctica observada en sus proyectos, no formulada por él como principio |
| **[T]** | Solo consta en resúmenes de terceros o en X sin lectura directa |
| **[✗]** | Sin fuente o contradicho por las fuentes primarias |

Las citas se parafrasean en español. Los términos acuñados por el autor (*jagged*, *autonomy slider*, *context engineering*) se conservan en inglés.

## 3. Entrenamiento de redes: *A Recipe for Training Neural Networks* (abril de 2019) [V]

**Premisa.** El entrenamiento de redes es una abstracción con fugas y falla en silencio: una red mal configurada suele entrenar igual, solo que peor. Por eso un enfoque rápido y temerario no funciona. Las cualidades que más se correlacionan con el éxito son la paciencia y la atención al detalle.

**Principio transversal.** Evitar introducir mucha complejidad no verificada de una sola vez: avanzar de lo simple a lo complejo, con una hipótesis explícita antes de cada cambio.

El proceso tiene **seis pasos**; el borrador anterior decía cinco.

1. **Conocer los datos a fondo.** Inspeccionar a mano miles de ejemplos antes de tocar el modelo.
2. **Esqueleto completo con líneas base triviales.**
   - Fijar la semilla aleatoria.
   - Verificar la pérdida inicial: unos −ln(1/N) para N clases.
   - Sobreajustar un solo lote.
   - Visualizar justo lo que entra a la red.
   - Comparar contra una línea base humana y otra que ignora la entrada.
3. **Sobreajustar.**
   - Copiar la arquitectura del paper más cercano en lugar de inventar.
   - Usar Adam con tasa 3e-4 como opción segura.
   - Añadir complejidad de a un componente.
   - Desconfiar de los valores por defecto del decaimiento de la tasa de aprendizaje.
4. **Regularizar**, en este orden de preferencia:
   1. Más datos reales.
   2. Aumentación.
   3. Preentrenamiento.
   4. Modelo más chico.
   5. *Weight decay*.
   6. *Early stopping*.
5. **Afinar** con búsqueda aleatoria, no en rejilla.
6. **Exprimir:** ensambles y dejar entrenar más tiempo.

**microGPT** (febrero de 2026) [V] aplica la misma pedagogía: un GPT entrenable en unas 200 líneas de Python sin dependencias, construido por capas, de bigramas a Adam. El post separa explícitamente lo que cambia en producción (datos, tokenizador, escala, *post-training*) y recuerda que los equipos hacen muchos experimentos pequeños antes de una corrida grande.

## 4. Paradigmas de software y naturaleza de los LLM

| Concepto | Fecha | Contenido | Marca |
|---|---|---|---|
| **Software 1.0** | — | Reglas escritas a mano | [V] |
| **Software 2.0** | nov 2017 | Programar creando datasets y entrenando redes; el programa vive en los pesos | [V] por referencia propia; texto original no leído |
| **Software 3.0** | YC jun 2025; Sequoia abr 2026 | Se programa al LLM con prompts, contexto, herramientas, ejemplos, memoria e instrucciones. La ventana de contexto es la palanca principal | [V] |
| **Verificabilidad** | 17-nov-2025 | El 1.0 automatiza lo que se puede especificar; el 2.0, lo que se puede verificar. Un entorno se puede optimizar si es reiniciable, eficiente y medible con una recompensa | [V] |
| ***Jagged intelligence*** | 2025 | Por lo anterior, los modelos progresan rápido en lo verificable (matemáticas, código) y lento en lo creativo o estratégico. El perfil de capacidad es irregular | [V] |
| **Fantasmas, no animales** | 1-oct-2025 | Los LLM no son animales aprendices sino «fantasmas» invocados desde datos humanos; el preentrenamiento es una evolución pobre. Una memoria tipo `CLAUDE.md` funciona como aprendizaje en tiempo de prueba | [V] |
| **Espacio de mentes** | 29-nov-2025 | Los LLM los moldea una evolución comercial: resolver la tarea y obtener aprobación. De ahí la complacencia y los picos irregulares | [V] |
| **¿Sobre los rieles del modelo?** | abr 2026 | La capacidad depende de cuatro factores: verificabilidad, atención de entrenamiento, cobertura de datos y valor económico. Fuera de los rieles hacen falta mejor contexto, herramientas, evaluaciones propias o un entorno de RL | [V] (transcripción generada por LLM) |
| **Pérdida de confianza en benchmarks** | 19-dic-2025 | Los benchmarks públicos están contaminados; entrenar sobre el conjunto de prueba se volvió un arte | [V] |

## 5. Investigación autónoma: `karpathy/autoresearch` (marzo de 2026) [V]

Un agente modifica el código de entrenamiento, entrena 5 minutos, mide y conserva o descarta el cambio, en bucle, por ejemplo durante la noche. El humano **no edita Python**: edita `program.md`, que el README describe como una *skill* muy liviana. La tesis es que se programa la organización de investigación, no el modelo.

### 5.1 Contrato de tres archivos

| Archivo | Quién lo edita | Contenido |
|---|---|---|
| `prepare.py` | Nadie (solo lectura) | Constantes, preparación de datos, tokenizador, *dataloader* y **evaluación**. `evaluate_bpb` es la verdad de referencia |
| `train.py` | Solo el agente | Modelo, optimizador y bucle de entrenamiento. Todo cambio está permitido ahí |
| `program.md` | Solo el humano | Instrucciones del agente: el «código» de la organización |

### 5.2 Reglas del `program.md` oficial

1. **Arranque acordado.** El agente propone una etiqueta de corrida, crea una rama dedicada, lee los archivos en alcance, verifica que existan los datos y pide confirmación antes de empezar.
2. **Prohibiciones explícitas.**
   - No tocar `prepare.py` ni el arnés de evaluación.
   - No instalar dependencias.
3. **Presupuesto fijo** de 5 minutos por corrida. Hace comparables los experimentos aunque cambie el tamaño del modelo. Si una corrida pasa de 10 minutos, se mata y cuenta como fallo.
4. **Línea base primero.** La primera corrida siempre es el código sin cambios.
5. **Criterio de simplicidad.** A igualdad de resultado, gana lo más simple. Ejemplos del propio archivo:
   - Una mejora mínima que añade unas 20 líneas improvisadas probablemente no vale la pena.
   - La misma mejora obtenida **borrando** código se conserva siempre.
   - Una mejora nula con código más simple también se conserva.
6. **Carraca (*ratchet*).** Cada experimento se commitea en la rama. Si la métrica mejora, la rama avanza; si empata o empeora, `git reset` al punto anterior.
7. **Bitácora fuera de git.** `results.tsv` registra commit, métrica, memoria, estado (`keep`/`discard`/`crash`) y descripción. Se registran también los descartes y los fallos.
8. **Higiene de contexto.** La salida se redirige a `run.log` y solo se extraen las métricas con `grep`, para no inundar la ventana de contexto.
9. **Política de fallos.** Si el fallo es trivial (una errata, un import faltante), se corrige y se reintenta. Si la idea está rota, se registra `crash` y se sigue. Tras varios intentos sin éxito, se abandona.
10. **No detenerse.** Una vez iniciado el bucle, el agente no pregunta si debe continuar.

La regla 10 solo es sensata porque las nueve anteriores acotan el sistema: rama propia, un archivo editable, una métrica escalar inmutable y presupuesto duro. **La autonomía total es consecuencia del sandbox, no un principio independiente.**

Según el README, el agente se lanza con los permisos deshabilitados. Esto también depende de que el entorno sea desechable.

## 6. Conocimiento compilado: *LLM Wiki* (gist, abril de 2026) [V]

El gist es un «archivo de idea» para pegarle a un agente propio. En lugar de recuperar fragmentos en cada consulta, como hace RAG, el LLM mantiene una wiki persistente que acumula valor.

| Capa | Rol |
|---|---|
| `raw/` | Fuentes originales **inmutables**. El LLM las lee, nunca las modifica, para poder verificar contra el original |
| `wiki/` | Markdown interconectado que **escribe el LLM** y lee el humano |
| Esquema (`CLAUDE.md` / `AGENTS.md`) | Reglas de operación del agente sobre la wiki |

Operaciones:

- **ingest:** incorporar una fuente nueva.
- **query:** responder desde la wiki.
- **lint:** detectar contradicciones, huérfanos y vacíos.

Archivos de control:

- `index.md`: catálogo que se actualiza en cada operación.
- `log.md`: bitácora cronológica, una entrada por operación.

La analogía del autor: Obsidian es el IDE, el LLM es el programador y la wiki es la base de código.

**Corrección al borrador anterior.** La terna «Especificación / Verificador / Entorno» no aparece en el gist; era una interpretación de terceros.

## 7. Práctica con agentes de código

| Fuente | Fecha | Aprendizaje | Marca |
|---|---|---|---|
| *Vibe coding* (término) | feb 2025 | Programar describiendo y aceptando el código sin leerlo; útil para prototipos desechables | [T] origen en X |
| *Vibe coding MenuGen* | 27-abr-2025 | Construyó una app sin escribir código. La fricción real no estuvo en el código, sino en APIs obsoletas inventadas por el modelo, variables de entorno, un repo privado desplegado en una URL pública, dominios y conciliación de identidades entre Stripe y Google. Concluye que la infraestructura debe ser legible por agentes: documentación en Markdown, CLI y `curl`, no paneles de clics | [V] |
| *Year in Review 2025* | 19-dic-2025 | Seis cambios de paradigma. Para agentes importan: RLVR como etapa estándar; apps LLM que hacen *context engineering*, orquestan llamadas equilibrando rendimiento y costo y ofrecen un *autonomy slider*; agentes que corren en la máquina local con tu contexto; código gratuito, efímero y desechable | [V] |
| *Auto-grade HN* | 10-dic-2025 | LLM como juez con prompt estructurado en seis secciones y formato de salida fijo para parsearlo. Costo y tiempo medidos: 930 consultas, unos USD 58. El código lo escribió un agente | [V] |
| `llm-council` | nov 2025 | Varios modelos responden; cada uno evalúa y ordena de forma **anónima** las respuestas de los demás; un modelo «presidente» sintetiza | [V] |
| *Agentic engineering* | feb 2026 (X); Sequoia abr 2026 | El *vibe coding* sube el piso y la ingeniería agéntica empuja el techo. La práctica incluye specs, revisión de planes y diffs, tests, bucles de evaluación, permisos y worktrees aislados. Desde diciembre de 2025 la unidad de trabajo pasó de teclear líneas a delegar macroacciones | [V] Sequoia; [T] post de X |
| Supervisión humana | Sequoia abr 2026 | Hoy los agentes son como pasantes. Se puede delegar el pensamiento, pero no la comprensión | [V] |
| Límite del gusto | microGPT / Sequoia 2026 | Pidió una y otra vez al LLM simplificar más y no lo logró: la simplicidad extrema sigue siendo trabajo humano | [V] |
| *HackerTube* | 31-oct-2026 | Proyecto de unas 2 horas: un modelo económico filtró el volumen masivo dentro de un workflow y el modelo grande hizo el resto. El autor solo aportó API key, VPS y dominio. Modelo por defecto: el de mayor capacidad con esfuerzo de razonamiento **medio** | [V] |
| Formatos de salida (ASD-STE100) | 2-oct-2026 | Escalera de explicación: inglés técnico controlado, luego diagramas, luego HTML interactivo y luego video. La norma ASD advierte que la IA imita STE sin aplicar su vocabulario | [T] solo en X; no figura en el blog |

## 8. Principios operativos depurados

Contraste de los «7 principios» del borrador anterior con la evidencia primaria:

| # | Principio del borrador | Veredicto | Formulación sustentada |
|---|---|---|---|
| 1 | El humano dirige, la IA ejecuta todo | **Matizado** [V] | El humano delega la ejecución pero conserva la comprensión, la revisión de planes y diffs y el gusto. La autonomía es una perilla por tarea, no un sí o no |
| 2 | Esfuerzo de razonamiento medio por defecto | **Práctica** [P] | Usa esfuerzo medio por defecto (HackerTube). No hay regla publicada sobre cuándo subirlo; «tras dos intentos fallidos» no tiene fuente [✗] |
| 3 | Prompts escuetos con verbos («endurece») | **Contradicho** [✗] | Sus prompts reales son largos y estructurados: `program.md` tiene 114 líneas con prohibiciones, presupuestos y formato de bitácora. Su tesis es *context engineering* |
| 4 | Respuestas en ASD-STE100 | **De terceros** [T] | Es el primer escalón de cuatro formatos de explicación, no una política de respuesta general |
| 5 | Benchmarks privados | **Sustentado** [V] | Desconfía de los benchmarks públicos y recomienda evaluaciones propias fuera de los rieles del modelo. «10 a 20 pruebas» no tiene fuente [✗] |
| 6 | El valor está en los datos | **Coherente** [V] | Se deriva de Software 2.0 y de la verificabilidad: lo verificable y con datos propios es lo automatizable |
| 7 | Orquestar modelos por costo | **Práctica** [P] | Modelo económico para volumen y modelo grande para el resto (HackerTube); equilibrio rendimiento-costo en apps LLM (Year in Review) |

Principios ausentes del borrador y presentes en las fuentes:

- **A. Verificabilidad antes que autonomía.** Solo se automatiza con confianza lo que tiene un verificador reiniciable, rápido y medible.
- **B. Evaluador inmutable.** El agente nunca puede editar la métrica con la que se lo juzga.
- **C. Línea base primero.** Ningún cambio se evalúa sin una medición previa del estado actual.
- **D. Simplicidad como criterio de aceptación.** Se mide el costo de complejidad contra la magnitud de la mejora.
- **E. Carraca con bitácora completa.** Avanzar solo con mejora medida y registrar también descartes y fallos.
- **F. Higiene de contexto.** No inundar la ventana: redirigir salidas y extraer solo lo necesario.
- **G. Presupuestos duros.** Tiempo fijo por intento y corte automático.
- **H. Infraestructura legible por agentes.** Documentación en Markdown, CLI y pasos copiables.
- **I. Memoria como aprendizaje en tiempo de prueba.** El archivo de reglas del agente (`CLAUDE.md`/`AGENTS.md`) es el mecanismo de mejora entre sesiones.

## 9. Correspondencia con iWana neXt

| Principio | Equivalente actual en el workspace | Estado |
|---|---|---|
| B. Evaluador inmutable | Revisión de specs ajustadas por `test-change-reviewer`. La memoria del proyecto registra fixtures «obsoletos» que ocultaban regresiones | Cubierto por revisión, no por diseño |
| C/E. Línea base y carraca | Gates G6/G6.5, CI verde de `main` y el hook `post-push-ci` | Cubierto. Hubo fallos conocidos: tests verdes que no corrieron por la caché de Turbo y CI rojo sin detectar durante días |
| E. Bitácora de descartes | Causa obligatoria de cada NOT_EXECUTED en los gates de cierre e informes de cierre | Parcial |
| F. Higiene de contexto | Subagentes verificadores que devuelven conteos en lugar de logs | Parcial, sin regla escrita |
| H. Infraestructura legible | `AGENTS.md`, skills en `.agents/skills/`, prompts en `docs/prompts/` y launcher de 40 líneas | Cubierto |
| I. Memoria | Memoria persistente de Claude Code y `AGENTS.md` como esquema | Cubierto |
| LLM Wiki (`raw/` → `wiki/`) | `docs/referencias/` como fuente frente a PRD/HLD/ADR como síntesis; informes de cierre como bitácora | Análogo, sin operación «lint» |
| D. Simplicidad | Skill `simplify` y revisión de código | Sin criterio de aceptación explícito en los gates |
| 5. Evaluaciones propias | Memorias de errores reales (`feedback`/`project`) | No formalizado como set de evaluación |

## 10. Candidatas a formalizar (no normativas)

Cada una requiere decisión del CTO y formalización en el artefacto indicado.

**Estado al 2026-11-07:** se adoptaron la 1 (criterio de simplicidad, `AGENTS.md` → General Recommendations) y una carraca de conteos de pruebas contra la línea base de la ola (gate 14 del protocolo v1.9, `gate-verifier` paso 10, skill `iwana-test-evidence`), derivada de los principios C y E. La 2, la 4 y la 5 se descartaron porque el método vigente ya las cubre; la 3 queda diferida. Registro en el [informe vivo de roles](../informes/INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md) §13.

1. **Criterio de simplicidad en G6** (`AGENTS.md` → Gates). Un diff que añade complejidad por una ganancia marginal se rechaza; uno que elimina código y conserva el comportamiento se prefiere. Es el principio D, tomado casi literal del `program.md`.
2. **Evaluador inmutable por diseño** (hook `guard-paths`). Cuando una ola de implementación edita código de producción, impedir que el mismo agente modifique specs existentes sin una marca de revisión. Pasaría de control por revisión a control por permiso.
3. **Set de evaluación privado** (`docs/specs/` o skill nuevo). Convertir las memorias de errores reales en 10 a 20 casos reproducibles: test verde que no corrió, fixture que oculta regresión, `$n` con dos tipos en PG, rollback que borra el contador de intentos, etc. Serviría para comparar modelos, esfuerzo de razonamiento y perfiles de agente con datos propios.
4. **Higiene de contexto explícita** (`AGENTS.md` o prompts operativos). Las corridas largas redirigen su salida a archivo y el agente extrae solo conteos y fallos.
5. **Operación «lint» documental** (`docs-governance`). Una pasada periódica que busque contradicciones entre referencias, PRD, HLD y ADR, como la *lint* del LLM Wiki.

**No trasladables:**

- El «no detenerse nunca» y la ejecución sin permisos de autoresearch. Requieren un sandbox desechable con una métrica escalar, condiciones que un SaaS multi-tenant con datos personales no reúne. Las confirmaciones y los hooks de `guard-bash` siguen siendo necesarios.
- La tesis de «código efímero y desechable» (`llm-council`, *vibe coding*). Aplica a prototipos personales, no a un producto con contratos versionados.

## 11. Límites de esta referencia

- No se encontró en fuentes primarias:
  - Una regla sobre cuándo subir el esfuerzo de razonamiento.
  - Una política de prompts concisos.
  - Un tamaño recomendado para el set de evaluación privado.
  - Una definición desarrollada del *autonomy slider*.
- ASD-STE100 y el post fundacional de *agentic engineering* solo constan en X y en resúmenes de terceros.
- El texto completo de *Software 2.0* no se leyó (Medium devolvió 403).
- Los videos (*Zero to Hero*, *How I use LLMs*, YC 2025, Dwarkesh 2025) no se transcribieron. Una v1.1 podría cubrirlos.

## 12. Fuentes

**Primarias:**

- [karpathy.ai](https://karpathy.ai/) · [Blog actual](https://karpathy.bearblog.dev/blog/) · [Blog antiguo](https://karpathy.github.io/)
- [A Recipe for Training Neural Networks](https://karpathy.github.io/2019/04/25/recipe/) · [microGPT](https://karpathy.github.io/2026/02/12/microgpt/)
- [Verifiability](https://karpathy.bearblog.dev/verifiability/) · [2025 LLM Year in Review](https://karpathy.bearblog.dev/year-in-review-2025/) · [Animals vs Ghosts](https://karpathy.bearblog.dev/animals-vs-ghosts/) · [The space of minds](https://karpathy.bearblog.dev/the-space-of-minds/) · [Power to the people](https://karpathy.bearblog.dev/power-to-the-people/)
- [Vibe coding MenuGen](https://karpathy.bearblog.dev/vibe-coding-menugen/) · [Auto-grading HN](https://karpathy.bearblog.dev/auto-grade-hn/) · [Sequoia Ascent 2026](https://karpathy.bearblog.dev/sequoia-ascent-2026/) · [HackerTube](https://karpathy.bearblog.dev/hacker-tube/)
- [karpathy/autoresearch](https://github.com/karpathy/autoresearch) (README y `program.md`) · [karpathy/llm-council](https://github.com/karpathy/llm-council) · [Gist LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

**Secundarias**, solo para las afirmaciones marcadas [T]:

- [Search Engine Journal — ASD-STE100](https://searchenginejournal.com/karpathy-llm-aircraft-manual-writing/591813)
- [travis.media — Vibe coding vs agentic engineering](https://travis.media/blog/vibe-coding-agentic-engineering-karpathy/)
- [Latent Space — Software 3.0](https://www.latent.space/p/s3)

## 13. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-11-07 | Reescritura sobre fuentes primarias del borrador `metodolog_a_de_andrej_karpathy.md`. Corrige la receta (6 pasos), las capas del LLM Wiki y los principios 2, 3 y 4. Añade verificabilidad, el `program.md` completo de autoresearch, la práctica con agentes 2025–2026 y la correspondencia con iWana neXt |
