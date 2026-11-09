# Informe de auditoría — Cruces y optimización del ecosistema de roles

**Versión:** 1.2
**Estado:** Ola 1 aplicada (ver §9); olas 2 a 4 por planificar
**Cambio v1.0 → v1.1 (2026-11-08):** el CTO aprueba G0-1 a G0-4 en bloque, con las recomendaciones de §8
**Cambio v1.1 → v1.2 (2026-11-09):** Ola 1 aplicada sobre 9 perfiles y el anexo (§9)
**Fecha:** 2026-11-09
**Modo activo:** Architect + auditor (AI-EM-ARCH); solo lectura sobre `docs/roles/`
**Alcance auditado:** el protocolo v1.9, los 9 perfiles ejecutores, los 6 verificadores auxiliares y el anexo regulatorio de [`docs/roles/`](../roles/)
**Documentos de contraste:** `AGENTS.md`, `.claude/agents/*.md`, `.agents/skills/` (existencia en disco), `docs/prds/Stack_Tecnologico.md`, `apps/api/src/modules/auth/auth.module.ts`, y ADR-016, ADR-021 (superado), ADR-022, ADR-023, ADR-049, ADR-056, ADR-069 y ADR-092, todos con estado leído en su cabecera
**Plan de remediación:** [2026-11-08-roles-auditoria-cruces-orquestacion.md](../plans/2026-11-08-roles-auditoria-cruces-orquestacion.md)
**Informe vivo relacionado:** [INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md](INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md) — el registro se hace al cerrar la Ola 1 (plan T3)

---

## 1. Método y abreviaturas

Cuatro pasos, en orden: inventario, matriz de cruces por eje (DB/migraciones, API/contratos, UI/UX/DS, testing/E2E, seguridad/tenancy, infra/CI, docs/gates), evidencia `archivo:línea` con el archivo abierto (protocolo §7.4) y propuesta por cruce con su efecto en la RACI §2, el workflow §3 y la consulta §6.1. Precedencia aplicada: `AGENTS.md` > CTO/ADR aprobados > PRD/HLD > protocolo > perfil.

**Base auditada:** el árbol de trabajo del 2026-11-08. Cinco perfiles tienen cambios sin commit, que corresponden a la Ola 4 (B4) de la [consolidación de skills](../plans/2026-11-08-skills-consolidacion-orquestacion.md): son reemplazos de una línea por otra, así que la numeración citada coincide con HEAD.

| Abrev. | Archivo |
| --- | --- |
| PROT | [Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md) (v1.9) |
| EMA | [Perfil_IA_EM_Architect_Unificado_v2.md](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) (v2.6) |
| SRF | [Perfil_IA_Sr_Dev_Fullstack_v2.md](../roles/Perfil_IA_Sr_Dev_Fullstack_v2.md) (v2.1) |
| FEP | [Perfil_IA_Frontend_Platform_Engineer_v1.md](../roles/Perfil_IA_Frontend_Platform_Engineer_v1.md) (v1.1) |
| PUX | [Perfil_IA_Product_Designer_UX_v1.md](../roles/Perfil_IA_Product_Designer_UX_v1.md) (v1.1) |
| DSO | [Perfil_IA_Design_System_Owner_v1.md](../roles/Perfil_IA_Design_System_Owner_v1.md) (v1.2) |
| QA | [Perfil_IA_Sr_Dev_QA_Testing_v1.md](../roles/Perfil_IA_Sr_Dev_QA_Testing_v1.md) (v1.1) |
| SEC | [Perfil_IA_Security_Engineer_AppSec_v1.md](../roles/Perfil_IA_Security_Engineer_AppSec_v1.md) (v1.1) |
| DAT | [Perfil IA Senior Data Engineer ISP.md](<../roles/Perfil IA Senior Data Engineer ISP.md>) (v3.0) |
| OPS | [Perfil_IA_Platform_Ops_Engineer_v1.md](../roles/Perfil_IA_Platform_Ops_Engineer_v1.md) (v1.0) |
| GAT · BND · CON · TCR · E2E | Verificadores de gates, boundaries, contratos, pruebas ajustadas y E2E |
| ANX | [Anexo_Regulatorio_Integraciones_ISP.md](../roles/Anexo_Regulatorio_Integraciones_ISP.md) (v1.0) |

## 2. Veredicto

**GO con ajustes.** Los 12 cruces tienen evidencia abierta y cada propuesta declara su efecto en RACI, workflow y consulta. Ninguna propuesta de las olas 1 y 2 mueve autoridad hacia o desde el CTO; C12 la movería solo si se elige quitar al CTO de las librerías UI, y en ese caso requiere ADR (PROT §9, `PROT:359`). El ajuste que impide aplicar ya es que la base no está limpia: la Ola 4 de la consolidación de skills edita cinco de los perfiles sin subir su versión.

Hallazgos: **12 cruces** (7 contradicciones, 3 huecos, 1 duplicación, 1 solapamiento con contradicción) · **9 contradicciones de versión** · **3 datos regulatorios o de stack** por verificar.

## 3. Inventario

| Perfil | Objetivo | RACI §2 | Entregables | Decide / escala |
| --- | --- | --- | --- | --- |
| AI-EM-ARCH | Autoridad técnico-funcional delegada del CTO | R en roadmap, arquitectura y gobierno de releases; A en el resto de lo operativo | PRD, HLD, ADR propuesto, plan, prompt, launcher, informes | `EMA:113-124` |
| AI-SR-FULL | Backend y contrato de API tipado | R en API, BD (implementación), pruebas unitarias, rendimiento | Código, DTO + OpenAPI, migraciones, dictamen | `SRF:72-82` |
| AI-FE-PLATFORM | Código de `@iwana/ui` y app-shells | R en implementación de UI, pruebas unitarias, rendimiento, a11y | Primitives, pantallas, dictamen de UI | `FEP:41-48` |
| AI-PROD-UX | El qué y el flujo | R en UX y a11y | UX spec, journeys, wireframes, criterios | `PUX:41-50` |
| AI-DS-OWNER | Contrato del design system | R en contrato del DS y a11y | Spec de tokens, contrato, veredicto del carril rápido | `DSO:41-49` |
| AI-SR-QA | Verificación de calidad | R en E2E, regresión visual, a11y y fidelidad a la Estrella Polar | Suite E2E, reporte, trazabilidad | `QA:161-173` |
| AI-SEC-ENG | Seguridad aplicativa | R en seguridad aplicativa | Threat model, checklist, `[SEC-REVIEW]` | `SEC:150-162` |
| AI-DATA-ENG | Datos ISP (on-demand) | R*** en diseño de BD del dominio | Modelo, migración, diseño de integración | `DAT:47-56` |
| AI-PLAT-OPS | Plataforma (on-demand) | R en infra/CI y ejecución de releases | Pipelines, runbook, backup/DR | `OPS:52-62` |
| 6 verificadores | Evidencia sobre un diff | Ninguno (`PROT:362`) | Tabla de hallazgos | Clasifican; no aprueban ni bloquean el merge |

## 4. Cruces

| # | Eje | Perfiles | Tipo | Evidencia | Riesgo |
| --- | --- | --- | --- | --- | --- |
| C1 | docs/gates | EM-ARCH | contradicción | `PROT:129` «ningún gate se auto-aprueba» vs `PROT:146` (EM-ARCH produce el prompt y emite G4); `EMA:67` | El prompt de ejecución sale sin segunda firma |
| C2 | testing | QA, GAT, SR-FULL, EM-ARCH | solapamiento + contradicción | `QA:42` y `QA:167` bloquean el merge por cobertura; `PROT:148` limita a QA a criterios de aceptación; `PROT:106` lo hace C; `GAT:28` también mide cobertura | Tres veredictos de cobertura; un rol Consulted con veto |
| C3 | seguridad/tenancy | EM-ARCH, BND, SEC | duplicación | `PROT:231` (gate 8, revisión de EM-ARCH); `PROT:225` (gate 2 remite a un prompt operativo, no al verificador); `BND:23`; `SEC:102` | Revisión triple o ninguna |
| C4 | seguridad | SEC, EM-ARCH | contradicción | `SEC:40` veta merge y despliegue, pero `PROT:148` no lo nombra en G6; `SEC:38` escala directo al CTO frente a `PROT:77` y `PROT:306` | Veto sin anclaje en el gate; escalación que se salta a EM-ARCH |
| C5 | DB/migraciones | SR-FULL, DATA-ENG | hueco | Doble R en `PROT:104` sin regla de desempate por superficie (`PROT:125`); los dos deciden sobre migraciones (`DAT:52`, `SRF:75`) | Disputa sin árbitro de primer nivel |
| C6 | API/contratos | DS-OWNER, EM-ARCH | contradicción | `DSO:56` notifica directo; `PROT:210-213` exige adenda vía EM-ARCH; `PROT:215` (carril rápido) no aclara qué pasa tras congelar | Los tracks divergen |
| C7 | UI/UX/DS | PROD-UX, DS-OWNER | contradicción | `PUX:13` y `DSO:13` usan la Estrella Polar de ADR-049 (aprobado); `PUX:67` usa los tres dominios de ADR-056 (aprobado); `EMA:126` la llama base superada | Aprobación contra una base superada (`PUX:104`) |
| C8 | infra/CI | PLAT-OPS, GAT | hueco | `PROT:149` asigna G6.5 a PLAT-OPS; `OPS:38` no lo menciona y `OPS:13` se declara latente; en la práctica lo hace `GAT:27` | Un gate de cada merge asignado a un dueño latente |
| C9 | docs/gates | SR-FULL, EM-ARCH | contradicción | `[BLOQUEO TÉCNICO]` en `SRF:143`, `SRF:199` y `SRF:214` vs `PROT:323`; `[ESCALACIÓN AL CTO]` con tilde en `EMA:169` y `EMA:309` vs `PROT:324` | El grep no encuentra el marcador: bloqueo silencioso |
| C10 | testing/E2E | QA, E2E, TCR | hueco | El perfil QA no nombra verificadores ni el gate 14; `QA:311` trata los flaky por su cuenta; `E2E:18` clasifica antes de tocar nada | QA ajusta un test rojo sin triaje y oculta una regresión |
| C11 | docs/gates | QA, SEC, DAT, OPS | contradicción | Cadena canónica en `PROT:248`; el perfil EM-ARCH al nivel del protocolo en `QA:54`, `SEC:52` y `DAT:63`; el checklist de SEC como nivel en `QA:56`, `DAT:64` y `OPS:72`; QA sin la casilla de diseño, aunque `EMA:338` afirma que ADR-056 lo alineó | El mismo conflicto se resuelve distinto según el perfil; choca con `PROT:360` |
| C12 | API/dependencias | SR-FULL, FE, DS, EM-ARCH | contradicción + hueco | `SRF:80` (EM-ARCH), `FEP:38` (EM-ARCH / CTO vía ADR), `DSO:39` (CTO/EM-ARCH vía ADR); `EMA:113-124` no tiene la fila | Dos autoridades para la misma dependencia |

## 5. Propuesta por cruce

| # | Acción | Dueño | RACI §2 | Workflow §3 / §4 | Consulta §6.1 | Ola | ¿ADR? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Recortar: G4 = emisión de EM-ARCH + contrafirma del receptor vía el DoR de la etapa 5 (`PROT:179`) | EM-ARCH | sin cambio | fila 4 | sin cambio | 2 | No |
| C2 | Recortar QA: la cobertura es evidencia de GAT para el A (G5); QA bloquea en G6 solo por criterios, E2E y a11y | EM-ARCH | formaliza testing unitario | G5, G6 | sin cambio | 2 | No |
| C3 | Mover la evidencia mecánica de los gates 2 y 8 a BND; EM-ARCH decide; SEC trata lo cross-tenant como vulnerabilidad | EM-ARCH | sin cambio | §4, gates 2 y 8 | sin cambio | 2 | No |
| C4 | Mantener el veto y anclarlo en G6; escalar a EM-ARCH y al CTO a la vez (`PROT:325`) | EM-ARCH | sin cambio | G6 | sin cambio | 2 | No |
| C5 | Añadir BD a la regla 2: diseño → DATA-ENG si está activado; implementación → SR-FULL | EM-ARCH | regla 2 | — | sin cambio | 3 | No |
| C6 | En el perfil: re-sync vía EM-ARCH (alinea con `PROT:210`). En el protocolo: el carril rápido aplica antes de congelar o a cambios aditivos | DS-OWNER / EM-ARCH | sin cambio | §3bis reglas 1 y 3 | sin cambio | 1 (perfil) · 2 (protocolo) | No |
| C7 | Recortar ambas cabeceras a una remisión a su §6 | PROD-UX / DS-OWNER | sin cambio | etapa 2 | sin cambio | 1 | No |
| C8 | Mover: la corrida la ejecuta el CI; la evidencia la reúne GAT y la consolida EM-ARCH; PLAT-OPS entra solo si el CI está roto | EM-ARCH | sin cambio | fila G6.5 | sin cambio | 2 | No |
| C9 | Recortar al vocabulario canónico de §6.3 | SR-FULL / EM-ARCH | — | — | — | 1 | No |
| C10 | QA gana la sección «Verificadores que invoca», con el orden que ya declaran `TCR:51` y `E2E:50` | SR-QA | sin cambio | etapa 6 | sin cambio | 1 | No |
| C11 | Recortar la precedencia de QA, SEC, DAT y OPS a la cadena de `PROT:248`; el checklist de SEC pasa a entrada de trabajo; QA gana la casilla de diseño | cada perfil | — | — | — | 1 | No |
| C12 | Fila nueva en EMA §5: dependencia npm sin cambio de stack → EM-ARCH (+ SEC si toca la cadena de suministro); librería UI o stack → CTO vía ADR | EM-ARCH | matriz de decisiones | — | — | 3 | Sí, solo si se quita al CTO |

**Orden de verificadores propuesto (Ola 2, PROT §4):** CONTRACT / TEST-CHANGE → BOUNDARY → GATE. Hoy solo `CON:51` y `TCR:51` declaran ir antes de GATE; BND no declara orden.

## 6. Contradicciones de versión

| # | Evidencia | Corrección | Ola |
| --- | --- | --- | --- |
| V1 | `EMA:10`, `EMA:136` y `EMA:269` citan el protocolo «v1.5 vigente»; vigente es v1.9 (`PROT:3`) | v1.9 | 1 |
| V2 | `PROT:4` enumera hasta v1.6; el changelog `PROT:11-15` está fuera de orden | Reordenar en v1.10 | 2 |
| V3 | Ediciones de B4 sin subida de versión: `EMA:286`, `FEP:63`, `OPS:68`, `PUX:64`, `QA:14` (contra `PROT:361`) | Regularizar (G0-1) | 0–1 |
| V4 | `PUX:5-7` v1.1 del 2026-07-12, pero `PUX:65` cita un hecho del 2026-07-19 | Subida de versión con la fecha real | 1 |
| V5 | `DSO:6` v1.2 del 2026-07-18; `DSO:7` dice 2026-07-12 | Sincronizar la fecha | 1 |
| V6 | Sprint u horas contra la unidad de fase y sesión (`PROT:168`, `PROT:350`): `SRF:158`, `QA:299`, `QA:328`, `SEC:242`, `SEC:266`, `SEC:289` | Fase y sesión | 1 |
| V7 | `OPS:68` cita `deploy-checklist`, que no existe en `.agents/skills/` | `docker-expert` (verificada en disco) | 1 |
| V8 | `ANX:24` atribuye la idempotencia al protocolo §4, que no la contiene (`PROT:218-237`); la fuente es `EMA:50` | Corregir la cita | 1 |
| V9 | `QA:22` y `QA:466` usan «Sr. Dev Fullstack», nombre anterior a ADR-049 (aprobado) | AI-SR-FULL y AI-FE-PLATFORM | 1 |

## 7. Regulación y stack: requiere verificación

No son hallazgos: son afirmaciones sin fuente verificada en el repo.

| Afirmación | Ubicación | Estado |
| --- | --- | --- |
| «ARCO ≤15 días» | `SEC:133`, `SEC:368` | Requiere verificación con fuente oficial |
| «Jornada 42h» | `ANX:52` | Requiere verificación con fuente oficial |
| AES-256 en reposo y TLS 1.3 | `SEC:64`, `SEC:107-108` | No figuran en `Stack_Tecnologico.md`; requieren verificación contra stack o ADR |
| JWT RS256 | `SEC:65` | **Verificado** en `apps/api/src/modules/auth/auth.module.ts:52` |

Un texto escrito por la IA no constituye un dictamen jurídico: el cierre de las dos primeras filas corresponde al CTO, que consulta a Legal (`PROT:56-57`).

## 8. Plan por olas y decisiones G0

| Ola | Contenido | Condición |
| --- | --- | --- |
| 0 | Publicación de B4–B6 de la consolidación de skills | Precondición: nadie más en vuelo sobre `docs/roles/` |
| 1 | C7, C9, C10, C11, C6 (solo el perfil), V1, V3–V9 y los marcadores de §7 | Solo perfiles y anexo; sin RACI ni gates |
| 2 | Protocolo v1.10: C1, C2, C3, C4, C6 (protocolo), C8, V2 y orden de verificadores; espejos en QA, SEC, DS-OWNER y PLAT-OPS | Aprobación de EM-ARCH + informe vivo (`PROT:359`) |
| 3 | C5 y C12 | Igual que la 2; ADR solo si C12 quita al CTO |
| 4 | Prompts compactos en la Parte II y en `.claude/agents/` | `pnpm sync:agents` + gate 13 |

| G0 | Decisión | Opciones | Recomendación |
| --- | --- | --- | --- |
| G0-1 | Cómo se regulariza la versión de las 5 ediciones de B4 | A: con una línea de changelog por perfil dentro de la Ola 1 (precedente: EMA v2.2, `EMA:336`) · B: que B6 de la consolidación suba la versión antes de publicar | **A**: no reabre un plan en vuelo |
| G0-2 | Alcance de la Ola 1 | Solo perfiles y anexo, sin RACI, gates ni capas | Aprobar |
| G0-3 | Marcadores de §7 | A: añadirlos ahora en los perfiles y el anexo · B: esperar el dictamen | **A**: el marcador no afirma nada y cierra el riesgo de cita sin fuente |
| G0-4 | Olas 2 a 4 | Planificarlas al cerrar la Ola 1 | Aprobar |

**Resolución de G0 (2026-11-08):** el CTO aprueba G0-1 a G0-4 en bloque, con las recomendaciones de la tabla: G0-1 = A, G0-2 aprobado, G0-3 = A y G0-4 aprobado. Queda abierta la Ola 0 (precondición P1 del plan).

## 9. Remediación

### 9.1 Ola 0 — consolidación de skills publicada

`43011278` (2026-11-09), G6.5 ✅ (CI 42624717247 y E2E 42624717223). Con ella cerró P1 y `docs/roles/` quedó limpio.

### 9.2 Ola 1 — perfiles y anexo, 2026-11-09

Ejecutada por AI-EM-ARCH en dos sesiones paralelas sobre `main`, sin commit: T1 (EMA, SRF, FEP, DAT, OPS, ANX) y T2 (PUX, DSO, QA, SEC).

| Perfil | Versión | Hallazgos cerrados |
| --- | --- | --- |
| EMA (`Perfil_IA_EM_Architect_Unificado_v2.md`) | 2.6 → 2.7 | V1, C9, V3 |
| SRF (`Perfil_IA_Sr_Dev_Fullstack_v2.md`) | 2.1 → 2.2 | C9, V6 |
| FEP (`Perfil_IA_Frontend_Platform_Engineer_v1.md`) | 1.1 → 1.2 | V3 |
| DAT (`Perfil IA Senior Data Engineer ISP.md`) | 3.0 → 3.1 | C11 |
| OPS (`Perfil_IA_Platform_Ops_Engineer_v1.md`) | 1.0 → 1.1 | V7, C11, V3 |
| ANX (`Anexo_Regulatorio_Integraciones_ISP.md`) | 1.0 → 1.1 | V8, §7 (jornada 42 h) |
| PUX (`Perfil_IA_Product_Designer_UX_v1.md`) | 1.1 → 1.2 | C7, V4, V3 |
| DSO (`Perfil_IA_Design_System_Owner_v1.md`) | 1.2 → 1.3 | C7, V5, C6 (perfil) |
| QA (`Perfil_IA_Sr_Dev_QA_Testing_v1.md`) | 1.1 → 1.2 | C11, C10, V6, V9, V3 |
| SEC (`Perfil_IA_Security_Engineer_AppSec_v1.md`) | 1.1 → 1.2 | C11, V6, §7 (ARCO, AES-256/TLS 1.3) |

Fuera de la Ola 1, como fijó el plan: C2 en QA (`QA:42`, `QA:167`) y C4 en SEC (`SEC:38`, veto en G6) quedan sin tocar.

**G1 ✅ (tras T4).** Los greps del plan §6 están limpios fuera de changelogs y `PROT:323-325` (el único resultado de `deploy-checklist` es el changelog de OPS, que nombra la skill retirada); las cadenas de precedencia de DAT, OPS, QA y SEC siguen `PROT:248`; `pnpm audit:adr-citations` y `pnpm audit:doc-locations` con `BLOQUEANTE: 0`.

**T4 (`docs-governance`, 2026-11-09).** Primera pasada con dos bloqueantes: el plan §5 T1 prescribió para DAT y OPS una cadena con un nivel «Baseline y `Stack_Tecnologico.md`» que no existe en `PROT:248` ni en ADR-056 §4 (aprobado), QA y SEC lo replicaron, y DAT y OPS no declaraban la casilla de fuentes de diseño; esta §9 daba G1 por cumplido. AI-EM-ARCH optó por alinear a `PROT:248`: la baseline pasa a «Entradas de trabajo (no precedencia)» en los cuatro perfiles y DAT y OPS ganan la casilla de fuentes de diseño, limitada a conflictos visuales (`PROT:250`). En la misma pasada se corrigieron los no bloqueantes: marcador de verificación también en `SEC` §5.3 (AES-256 y TLS 1.3), cita de sección en los changelogs de ANX y EMA, ancla de AI-TEST-CHANGE-REV en la §5.8 de QA. Segunda pasada de T4: **sin bloqueantes** (B1 y B2 cerrados). Se acepta como desviación el campo aditivo «Ayuda requerida» del formato `[BLOQUEO]` de SRF, que no altera el mínimo de `PROT:311-313`. Pendiente: T5 (commit y G6.5).

**Queda para las olas siguientes:** Ola 2 — protocolo v1.10 con C1, C2 (autoridad de bloqueo por cobertura de QA), C3, C4 (escalación y veto de SEC), C6 en el protocolo, C8, V2 y el orden de verificadores, más sus espejos en QA, SEC, DS-OWNER y PLAT-OPS. Ola 3 — C5 y C12. Ola 4 — prompts compactos de la Parte II y `.claude/agents/`. Se planifican al cerrar esta ola (G0-4).

**Deuda vista en la ejecución:** el nivel «Baseline … y `Stack_Tecnologico.md`» sigue dentro de la cadena de precedencia de EMA, SRF, FEP, PUX y DSO (fuera del G1; sin ola asignada: se incorpora al planificar las olas 2 a 4, G0-4); las cabeceras «Baseline de versiones: definido por sprint» de QA y SEC, y las menciones de sprint de SRF, DAT, OPS, EMA, FEP, PUX, DSO y `QA:86`/`QA:385`, quedan fuera de V6; las afirmaciones de §7 siguen pendientes de verificación por el CTO con Legal (`PROT:56-57`); enlace roto previo en el informe vivo a `.cursor/rules/ai-em-arch.mdc`.
