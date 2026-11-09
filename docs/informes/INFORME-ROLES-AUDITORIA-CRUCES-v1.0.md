# Informe de auditoría — Cruces y optimización del ecosistema de roles

**Versión:** 1.6
**Estado:** Remediación completa (olas 0 a 4): Ola 1 publicada (`75528631`, G6.5 ✅, §9); Ola 2 ejecutada y registrada (§9.3, commit `359246c4`); Ola 4 ejecutada (T8–T10, G1′ ✅) y registrada (§9.4); commit en T13, sin push (tren siguiente, ADR-107)
**Cambio v1.0 → v1.1 (2026-11-08):** el CTO aprueba G0-1 a G0-4 en bloque, con las recomendaciones de §8
**Cambio v1.1 → v1.2 (2026-11-09):** Ola 1 aplicada sobre 9 perfiles y el anexo (§9)
**Cambio v1.2 → v1.3 (2026-11-09):** §10 define las olas 2 a 4 (G0-4): nuevo hallazgo C13 (protocolo frente a ADR-107), fusión propuesta de la Ola 3 en la Ola 2, asignación de la deuda «Baseline y Stack», texto congelado de cada cambio y de los prompts compactos, y decisiones G0-5 a G0-11
**Cambio v1.3 → v1.4 (2026-11-09):** el CTO aprueba G0-5 a G0-11 en bloque, con las recomendaciones de §10.6. §10.3 y §10.5 no cambian: siguen siendo el contrato congelado de las olas 2 y 4
**Cambio v1.4 → v1.5 (2026-11-09):** §9.3 registra la Ola 2 (protocolo v1.10 + espejos, G1 ✅, G3 y veredicto de `docs-governance`); el Estado queda al día
**Cambio v1.5 → v1.6 (2026-11-09):** §9.4 registra la Ola 4 (prompts compactos de §10.5, G1′ ✅ con T8-R, G3′ y veredicto de `docs-governance`); el Estado declara la remediación completa
**Fecha:** 2026-11-09
**Modo activo:** Architect + auditor (AI-EM-ARCH); solo lectura sobre `docs/roles/`
**Alcance auditado:** el protocolo v1.9, los 9 perfiles ejecutores, los 6 verificadores auxiliares y el anexo regulatorio de [`docs/roles/`](../roles/)
**Documentos de contraste:** `AGENTS.md`, `.claude/agents/*.md`, `.agents/skills/` (existencia en disco), `docs/prds/Stack_Tecnologico.md`, `apps/api/src/modules/auth/auth.module.ts`, y ADR-016, ADR-021 (superado), ADR-022, ADR-023, ADR-049, ADR-056, ADR-069 y ADR-092, todos con estado leído en su cabecera
**Plan de remediación:** [olas 0 y 1](../plans/2026-11-08-roles-auditoria-cruces-orquestacion.md) (cerradas) · [olas 2 a 4](../plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md)
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

**T4 (`docs-governance`, 2026-11-09).** Primera pasada con dos bloqueantes: el plan §5 T1 prescribió para DAT y OPS una cadena con un nivel «Baseline y `Stack_Tecnologico.md`» que no existe en `PROT:248` ni en ADR-056 §4 (aprobado), QA y SEC lo replicaron, y DAT y OPS no declaraban la casilla de fuentes de diseño; esta §9 daba G1 por cumplido. AI-EM-ARCH optó por alinear a `PROT:248`: la baseline pasa a «Entradas de trabajo (no precedencia)» en los cuatro perfiles y DAT y OPS ganan la casilla de fuentes de diseño, limitada a conflictos visuales (`PROT:250`). En la misma pasada se corrigieron los no bloqueantes: marcador de verificación también en `SEC` §5.3 (AES-256 y TLS 1.3), cita de sección en los changelogs de ANX y EMA, ancla de AI-TEST-CHANGE-REV en la §5.8 de QA. Segunda pasada de T4: **sin bloqueantes** (B1 y B2 cerrados). Se acepta como desviación el campo aditivo «Ayuda requerida» del formato `[BLOQUEO]` de SRF, que no altera el mínimo de `PROT:311-313`. **T5:** publicado en `75528631` (push `43011278..75528631`, junto con `d42a498f` de privacidad); G6.5 ✅ 2026-11-09: `CI` (run 42632425743) y `E2E Web Admin Smoke` (run 42632425712) en verde. Ola 1 cerrada.

**Queda para las olas siguientes:** Ola 2 — protocolo v1.10 con C1, C2 (autoridad de bloqueo por cobertura de QA), C3, C4 (escalación y veto de SEC), C6 en el protocolo, C8, V2 y el orden de verificadores, más sus espejos en QA, SEC, DS-OWNER y PLAT-OPS. Ola 3 — C5 y C12. Ola 4 — prompts compactos de la Parte II y `.claude/agents/`. Se planifican al cerrar esta ola (G0-4).

**Deuda vista en la ejecución:** el nivel «Baseline … y `Stack_Tecnologico.md`» sigue dentro de la cadena de precedencia de EMA, SRF, FEP, PUX y DSO (fuera del G1; sin ola asignada: se incorpora al planificar las olas 2 a 4, G0-4); las cabeceras «Baseline de versiones: definido por sprint» de QA y SEC, y las menciones de sprint de SRF, DAT, OPS, EMA, FEP, PUX, DSO y `QA:86`/`QA:385`, quedan fuera de V6; las afirmaciones de §7 siguen pendientes de verificación por el CTO con Legal (`PROT:56-57`); enlace roto previo en el informe vivo a `.cursor/rules/ai-em-arch.mdc`.

### 9.3 Ola 2 — protocolo v1.10 y espejos, 2026-11-09

Ejecutada por AI-EM-ARCH en cuatro sesiones paralelas sobre `main`, sin commit: T1 (protocolo, columna «Protocolo v1.10» de D1 a D9), T2 (EMA, SRF, FEP, OPS), T3 (PUX, DSO, QA, SEC) y T4 (GAT, BND, CON, TCR + 4 subagentes + `pnpm sync:agents`). Definición en §10; plan v1.2.

| Archivo | Versión anterior → nueva | Dn aplicados |
| --- | --- | --- |
| `Protocolo_Colaboracion_Multiagente_v1.md` | 1.9 → 1.10 | D1–D9 |
| EMA (`Perfil_IA_EM_Architect_Unificado_v2.md`) | 2.7 → 2.8 | D1, D7, D10, D11 |
| SRF (`Perfil_IA_Sr_Dev_Fullstack_v2.md`) | 2.2 → 2.3 | D10, D11 |
| FEP (`Perfil_IA_Frontend_Platform_Engineer_v1.md`) | 1.2 → 1.3 | D10, D11 |
| OPS (`Perfil_IA_Platform_Ops_Engineer_v1.md`) | 1.1 → 1.2 | D7 |
| PUX (`Perfil_IA_Product_Designer_UX_v1.md`) | 1.2 → 1.3 | D11 |
| DSO (`Perfil_IA_Design_System_Owner_v1.md`) | 1.3 → 1.4 | D6, D10, D11 |
| QA (`Perfil_IA_Sr_Dev_QA_Testing_v1.md`) | 1.2 → 1.3 | D2 |
| SEC (`Perfil_IA_Security_Engineer_AppSec_v1.md`) | 1.2 → 1.3 | D4 |
| GAT (`Perfil_IA_Verificador_Gates_v1.md`) | 1.2 → 1.3 | D7, D9 |
| BND (`Perfil_IA_Verificador_Boundaries_v1.md`) | 1.0 → 1.1 | D3, D9 |
| CON (`Perfil_IA_Revisor_Contratos_v1.md`) | 1.0 → 1.1 | D9 |
| TCR (`Perfil_IA_Revisor_Cambios_Pruebas_v1.md`) | 1.0 → 1.1 | D9 |
| Subagentes `sr-qa.md`, `ds-owner.md`, `gate-verifier.md`, `boundary-reviewer.md` | sin versión | D2, D6, D9 |

**G1 ✅ (plan §6 v1.2).** Versiones de §10.4 en las cabeceras; cadenas de D11 renumeradas; `pnpm sync:agents:check` en verde («OK: 14 agentes»); `pnpm audit:adr-citations` con `BLOQUEANTE: 0`. Los dos patrones defectuosos del plan v1.1 se corrigieron en el plan v1.2 (no eran defecto de ejecución): «Baseline del sprint y» admite los changelogs que lo citan y «merge readiness» se sustituye por la comprobación de la semántica retirada.

**G3.** Esta §9.3 y §15 del informe vivo, con `pnpm audit:doc-locations` en `BLOQUEANTE: 0` (3 AVISOs preexistentes en `.playwright-mcp/`, ajenos a la ola).

**T6 (`docs-governance`, 2026-11-09).** Segunda pasada de la ola: **sin bloqueantes** (veredicto completo del subagente en el reporte de cierre). Verificado: 13 versiones de §10.4 en cabeceras con Fecha 2026-11-09 (GAT/BND/CON/TCR con su convención de fecha con historial, ola fechada en el paréntesis y el `Cambio`); changelogs en su lugar habitual; nota D9 y regla 2 D5 en el protocolo; greps G1 v1.2 en verde («Baseline del sprint y» solo en 3 changelogs, admitidos; «merge readiness» solo como paréntesis heredado de ADR-069); coherencia protocolo↔espejos en D1–D11; §9.3 y §15 completas; citas de ADR-107 con marcador (aprobado) y semántica D3/D4. No bloqueantes: fecha con historial en verificadores, «cobertura» residual en una frase genérica de `QA:23` sin efecto normativo. **G4 ✅.**

### 9.4 Ola 4 — prompts compactos y reconciliación, 2026-11-09

Ejecutada por AI-EM-ARCH en tres sesiones paralelas sobre `main`, sin commit: T8 (EMA, SRF, FEP, DAT, OPS), T9 (PUX, DSO, QA, SEC) y T10 (8 subagentes ejecutores + `pnpm sync:agents`). Definición en §10.5 (G0-10 = A); plan §5 T8–T10 y §6 G1′. T8-R subió la línea `**Versión:**` de la cabecera de EMA a 2.9 y de SRF a 2.4.

| Archivo | Versión anterior → nueva | Prompt (líneas) |
| --- | --- | --- |
| EMA (`Perfil_IA_EM_Architect_Unificado_v2.md`) | 2.8 → 2.9 | 9 |
| SRF (`Perfil_IA_Sr_Dev_Fullstack_v2.md`) | 2.3 → 2.4 | 7 |
| FEP (`Perfil_IA_Frontend_Platform_Engineer_v1.md`) | 1.3 → 1.4 | 5 |
| DAT (`Perfil IA Senior Data Engineer ISP.md`) | 3.1 → 3.2 | 4 (primer prompt compacto) |
| OPS (`Perfil_IA_Platform_Ops_Engineer_v1.md`) | 1.2 → 1.3 | 4 |
| PUX (`Perfil_IA_Product_Designer_UX_v1.md`) | 1.3 → 1.4 | 5 |
| DSO (`Perfil_IA_Design_System_Owner_v1.md`) | 1.4 → 1.5 | 5 |
| QA (`Perfil_IA_Sr_Dev_QA_Testing_v1.md`) | 1.3 → 1.4 | 5 |
| SEC (`Perfil_IA_Security_Engineer_AppSec_v1.md`) | 1.3 → 1.4 | 5 |
| Subagentes `sr-backend.md`, `fe-platform.md`, `sec-eng.md` | sin versión | reconciliados (3 contradicciones) |
| Subagentes `prod-ux.md`, `ds-owner.md`, `sr-qa.md`, `data-eng.md`, `plat-ops.md` | sin versión | revisados sin cambio |

**G1′ ✅ (plan §6, con T8-R).** Versiones de §5 T8 y T9 en las cabeceras; prompts ≤15 líneas y literales de §10.5; «Formatos» y «Anti-patrones» literales en EMA, SRF, QA y SEC, sin piezas «sin destino»; `rg 'BLOQUEO TÉCNICO|Crítica bloquea merge y despliegue' .claude/agents` vacío; `pnpm sync:agents:check` en verde; `pnpm audit:adr-citations` con `BLOQUEANTE: 0`.

**G3′.** Esta §9.4 y §16 del informe vivo, con `pnpm audit:doc-locations` en `BLOQUEANTE: 0` (3 AVISOs preexistentes en `.playwright-mcp/`, ajenos).

**T12 (`docs-governance`, 2026-11-09).** Segunda pasada de la ola: **sin bloqueantes** (veredicto completo del subagente en el reporte de cierre). Verificado: 9 cabeceras con la versión nueva y Fecha 2026-11-09 (incluida T8-R); 9 prompts literales de §10.5, todos ≤15 líneas; «Formatos» y «Anti-patrones» literales en EMA, SRF, QA y SEC; 3 contradicciones de §5 T10 corregidas y ninguna regla de subagente contra su prompt; §9.4 y §16 completas; sin PII, sin prompts fuera de `docs/prompts/`, ningún ADR tocado. No bloqueantes (deuda): cercado huérfano tras «Anti-patrones» en EMA y SRF (resto del bloque `markdown` retirado en T8); convención mezclada de conteo en las tablas (corregida a total con cabecera: DAT y OPS en 4); §16 sin mención explícita del pendiente §7 (cubierto en §9.4); cercado `markdown` en vez de `text` en los 4 bloques de T9 (cosmético). **G4′ ✅.**

**Pendientes externos (no bloquean el cierre documental).** §7 sigue pendiente de verificación por el CTO con Legal (ARCO, jornada 42 h, AES-256/TLS 1.3). G6.5 del commit `359246c4` y de este commit viajan cada uno en su tren siguiente (ADR-107 D4).

## 10. Definición de las olas 2 a 4 (G0-4)

Contraste hecho el 2026-11-09 sobre `main` en `75528631`. El protocolo sigue en v1.9 (sin cambios desde `a4972f8a`). Las líneas citadas son las vigentes tras la Ola 1; si un tramo encuentra la numeración desplazada, localiza el texto, no el número.

### 10.1 Hallazgo nuevo

| # | Eje | Perfiles | Tipo | Evidencia | Riesgo |
| --- | --- | --- | --- | --- | --- |
| C13 | infra/CI · docs/gates | EM-ARCH, GAT | contradicción | ADR-107 (aprobado) D3 hace G6.5 asíncrono: la ola siguiente arranca con G6, G6.5 cierra la fase y es requisito de G7, con tres excepciones síncronas (`ADR-107:51-58`); D4 manda que su registro viaje en el tren siguiente (`ADR-107:61-63`). El protocolo v1.9 sigue presentando G6.5 como el gate que «autoriza merge» (`PROT:136`, `PROT:139`, `PROT:149`), y lo mismo `EMA:154` y `GAT:54` | Un agente que lea solo el protocolo frena olas que ADR-107 ya liberó, o commitea registros de G6.5 sueltos, que ADR-107 prohíbe |

Por precedencia (`PROT:248`), ADR-107 (aprobado) manda sobre el protocolo: se corrige el protocolo y no hace falta un ADR nuevo. ADR-107 §5 no previó esta enmienda: su Ola 1b toca `AGENTS.md`, la skill de checkpoint y el prompt de checkpoint, no `docs/roles/`.

### 10.2 Estructura propuesta

| Ola | Contenido | Superficie | Condición |
| --- | --- | --- | --- |
| 2 | Protocolo v1.10: C1, C2, C3, C4, C5, C6, C8, C13, V2 y orden de verificadores. Espejos en el mismo acto, más C12 y la deuda «Baseline y Stack» | Protocolo, 8 perfiles ejecutores, 4 verificadores y 4 subagentes con reglas afectadas | Aprobación de EM-ARCH + informe vivo (`PROT:359`). Ningún cambio mueve autoridad hacia o desde el CTO (G0-6) |
| 3 | **Fusionada en la Ola 2** (G0-5): C5 es una línea de la RACI §2 y C12 una fila de la matriz de EMA; separarlas obligaría a subir dos veces la versión de EMA, SRF, FEP y DSO | — | — |
| 4 | Prompts compactos (§10.5) en la Parte II o el «Prompt base» de los 9 perfiles ejecutores; reconciliación de las reglas de los 8 subagentes ejecutores | 9 perfiles, 8 subagentes, generados por `pnpm sync:agents` | Arranca con el G1 de la Ola 2: es documentación, sin excepción síncrona de ADR-107 D3 |

### 10.3 Texto congelado de la Ola 2

Es el contrato contra el que corren en paralelo todos los tramos de la Ola 2 (plan §5). Un tramo que necesite apartarse emite `[BLOQUEO]`; no reinterpreta.

| Id | Cruce | Protocolo v1.10 | Espejos |
| --- | --- | --- | --- |
| D1 | C1 | §3, fila 4: «**G4:** EM-ARCH emite; el receptor contrafirma al verificar el DoR de la etapa 5 (§3.1). Sin contrafirma no arranca la etapa 5.» Junto a `PROT:129`: «En G4 la segunda firma es la contrafirma del receptor.» | EMA §3.4 (`EMA:67`) y regla 8 de la Parte II (`EMA:269-272`): una frase sobre la contrafirma de G4 |
| D2 | C2 | §3, G5: «gates técnicos (§4) con evidencia de AI-GATE-VERIFIER + review de segunda capa por EM-ARCH». G6: QA bloquea por criterios de aceptación, E2E, a11y o desviación visual crítica, **no por cobertura**. §4 gate 4: «Evidencia: AI-GATE-VERIFIER · decide: EM-ARCH (A de la fila de testing)» | QA `QA:43`, `QA:177`, `QA:298` y `QA:370`: la cobertura deja de ser motivo propio de bloqueo; QA reporta el déficit al A con la evidencia de `gate-verifier`. Subagente `sr-qa.md:24` igual |
| D3 | C3 | §4 gate 2, verificación: «`pnpm lint` + AI-BOUNDARY-REV (`boundary-reviewer`); sin subagentes, `PROMPT-OPERATIVO-REVISAR-BOUNDARY-MODULITH-v1.0.md`». Gate 8: «Evidencia: AI-BOUNDARY-REV · decide: EM-ARCH en la review de segunda capa · un acceso cross-tenant es además hallazgo de AI-SEC-ENG» | BND §7 (`BND:50`): orden de invocación (D9) |
| D4 | C4 | §3, G6: se añade «SEC-ENG por hallazgo crítico, o alto en endpoint público (perfil SEC §9.2)» | SEC `SEC:39` y `SEC:333`: «Escala a: AI-EM-ARCH, que emite `[ESCALACION AL CTO]`; en una excepción o un incidente crítico, `[ESCALACIÓN DE SEGURIDAD]` a EM-ARCH y al CTO a la vez (protocolo §6.3 regla 3)». `SEC:41` y `SEC:336`: bloquea G6; en G7 su checklist pre-producción es condición y su NO-GO llega al CTO vía EM-ARCH. El subagente `sec-eng.md:36` ya enruta así: sin cambio |
| D5 | C5 | §2, regla de desempate 2: se añade «base de datos y migraciones: diseño del modelo del dominio ISP → DATA-ENG si está activado; implementación y todo lo demás → SR-FULL (nota \*\*\*)» | — |
| D6 | C6 | §3bis regla 3: «El carril rápido no aplica a un contrato de componente ya congelado en el prompt de fase: un cambio no aditivo sigue la regla 1. Un cambio aditivo (variante o estado nuevo que no altera los existentes) sí entra en el carril rápido, y DS-OWNER lo anota en el changelog del DS.» | DSO §4 (`DSO:47`) y prompt compacto (`DSO:115`); subagente `ds-owner.md:22` |
| D7 | C8 + C13 | §3, tabla de gates: G6.5 responde «¿Lo publicado está en verde?»; condición: corrida Linux verde **del SHA publicado**; autoriza: **cierre de fase** y prerrequisito de G7; no frena la ola siguiente salvo las tres excepciones de ADR-107 D3. `PROT:139`: «publicado, G6.5 pendiente». Fila G6.5 (`PROT:149`): «ejecuta: el CI de GitHub Actions al publicar (ADR-107) · evidencia: AI-GATE-VERIFIER · consolida: EM-ARCH · PLAT-OPS solo si el CI está roto». §8: el registro de G6.5 viaja en el tren siguiente (ADR-107 D4) | EMA §7 (`EMA:154`); GAT `GAT:27` y `GAT:54`; OPS `OPS:14` y `OPS:39`: G6.5 no es encargo suyo salvo CI roto |
| D8 | V2 | Cabecera `Estado` con v1.7 a v1.10; changelog en orden ascendente, sin huecos | — |
| D9 | orden | §4, nota nueva: «Orden de los verificadores antes de G6: AI-CONTRACT-REV y AI-TEST-CHANGE-REV (si el diff toca un contrato compartido o specs existentes) → AI-BOUNDARY-REV (si toca `apps/api`, `apps/worker` o `packages/database`) → AI-GATE-VERIFIER. AI-E2E-TRIAGE ante una corrida E2E roja, antes de tocar código o tests; AI-DOCS-GOV antes de commitear `docs/`.» | CON `CON:51` y TCR `TCR:51`: «antes de `boundary-reviewer` y `gate-verifier`»; BND `BND:50` y GAT `GAT:54`: su lugar en el orden. Subagentes `gate-verifier.md` y `boundary-reviewer.md`: una línea con el orden |
| D10 | C12 | — (no toca el protocolo) | EMA §5, fila nueva: «Dependencia npm nueva sin cambio de stack · Sí (consulta a SEC-ENG si añade riesgo de cadena de suministro) · No»; la fila de `EMA:121` pasa a «Cambio de stack, librería UI nueva, versión con breaking change, patrón avanzado». SRF `SRF:80`: «Dependencia npm nueva (sin cambio de stack) · Recomienda · Sí — EM-ARCH». FEP `FEP:39` en dos filas: dependencia npm → AI-EM-ARCH; librería UI o stack → CTO vía ADR. DSO `DSO:40`: «CTO vía ADR (propuesta de EM-ARCH)» |
| D11 | deuda «Baseline y Stack» | — | EMA `EMA:137`, SRF `SRF:92`, FEP `FEP:69`, PUX `PUX:72` y DSO `DSO:71`: el nivel sale de la cadena y pasa a «Entradas de trabajo (no precedencia)», con la redacción de `DAT:71`; la cadena se renumera. Es el tratamiento que T4 aplicó en la Ola 1 y el único compatible con ADR-056 §4 (aprobado, `ADR-056:95`) sin un ADR nuevo |

**Cerrado sin cambio (G0-9):** las menciones de sprint que quedaron fuera de V6 (§9) son de dos clases. «Baseline del sprint» y «Baseline de versiones definido por sprint» son vocabulario del propio protocolo (`PROT:332`). `QA:34` y `QA:85` niegan que QA planifique sprints. Ninguna contradice `PROT:350`.

### 10.4 Versiones resultantes de la Ola 2

Protocolo 1.9 → 1.10 · EMA 2.7 → 2.8 · SRF 2.2 → 2.3 · FEP 1.2 → 1.3 · PUX 1.2 → 1.3 · DSO 1.3 → 1.4 · QA 1.2 → 1.3 · SEC 1.2 → 1.3 · OPS 1.1 → 1.2 · GAT 1.2 → 1.3 · BND 1.0 → 1.1 · CON 1.0 → 1.1 · TCR 1.0 → 1.1. DAT y ANX no cambian en esta ola.

### 10.5 Prompts compactos (contrato de la Ola 4)

Regla de la Ola 4 (G0-10): el prompt compacto sustituye a la Parte II o al «Prompt base (compacto)» de cada perfil, con un techo de 15 líneas. Los formatos de respuesta que hoy viven en la Parte II se conservan, sin cambios, en una sección «Formatos» fuera del prompt. En `.claude/agents/` no se sustituye el cuerpo: se reconcilian las reglas del subagente con el prompt de su perfil, para que no se contradigan.

```text
=== AI-EM-ARCH (modo Orquestador) ===
Eres AI-EM-ARCH, autoridad técnico-funcional delegada del CTO. Defines, delegas, revisas y consolidas;
no escribes código productivo ni UI detallada.
Precedencia: AGENTS.md > CTO/ADR aprobados > PRD/HLD > fuentes de diseño > protocolo v1.10 > perfil > prompt.
Toda definición cerrada sale con plan + matriz agente×skill verificada en disco + prompt de ejecución con
contratos congelados (ruta y versión) + launcher ≤40 líneas entregado en la respuesta.
Nunca apruebas tu artefacto: G1 exige review cruzado SR-FULL + PROD-UX; G4, la contrafirma del receptor.
Al CTO, con [ESCALACION AL CTO]: stack, presupuesto, excepciones, marca, boundary nuevo.
El carril rápido de UI es de DS-OWNER. Cita solo lo que abriste; un ADR no aprobado lleva marcador.
Antes de G6: CONTRACT/TEST-CHANGE → BOUNDARY → GATE. G6.5 cierra la fase; no frena la ola siguiente (ADR-107).
=== AI-SR-FULL (sr-backend) ===
Eres el Principal Backend Engineer: NestJS + PostgreSQL multi-tenant + BullMQ dentro del Modulith.
Alcance = prompt de ejecución; sin prompt no implementas. Tenant desde el JWT, SET LOCAL search_path,
tenant explícito en jobs. Publicas y congelas el contrato (DTO en @iwana/shared + OpenAPI); un cambio
posterior se versiona vía EM-ARCH. Tests con el código, ≥80 % core; E2E es de SR-QA.
Si cambias un contrato compartido: contract-drift-reviewer; si ajustas specs: test-change-reviewer.
Bloqueo sin salida: [BLOQUEO] a EM-ARCH antes de cerrar la sesión.
=== AI-FE-PLATFORM (fe-platform) ===
Eres dueño del código de @iwana/ui y de las app-shells web y portal. Implementas el contrato de DS-OWNER
y la UX spec de PROD-UX; no inventas tokens ni flujos. RSC por defecto, client solo con interacción.
Pantallas contra mocks tipados del contrato de API hasta integrar. Cero UI duplicada.
WCAG 2.2 AA y estados completos son parte de «terminado». Dependencia npm → EM-ARCH; librería UI → CTO vía ADR.
=== AI-PROD-UX (prod-ux) ===
Eres dueño del qué y el flujo: journeys, UX spec, estados de tarea y criterios de aceptación medibles.
Fuentes de diseño: los tres dominios de ADR-056 §3. Decides sin gate dentro del alcance; un patrón o
token nuevo va a DS-OWNER; un dato o alcance nuevo, a EM-ARCH. Congelas la spec temprano.
Sin PII en wireframes. Bloqueo: [BLOQUEO] a EM-ARCH.
=== AI-DS-OWNER (ds-owner) ===
Eres dueño del contrato del DS: tokens + API de componente + estados. Citas el token, nunca el hex.
Apruebas el carril rápido antes de congelar o en cambios aditivos; un cambio no aditivo de un contrato
congelado es re-sync vía EM-ARCH. Marca y lenguaje global → CTO; librería UI → CTO vía ADR.
No diseñas flujos ni escribes código.
=== AI-SR-QA (sr-qa) ===
Verificas calidad: estrategia, E2E Playwright, regresión visual, a11y, trazabilidad criterio↔test.
En G6 bloqueas por criterio de aceptación sin test, defecto crítico, ruptura de a11y o desviación visual
crítica; la cobertura la evidencia gate-verifier y la decide EM-ARCH. Una corrida roja va primero a
e2e-triage; un spec ajustado, a test-change-reviewer. No inventas criterios ni umbrales. Sin PII en fixtures.
=== AI-SEC-ENG (sec-eng) ===
Auditas seguridad (ASVS L2, STRIDE, Ley 1581) en solo lectura. Clasificas con severidad y SLA; bloqueas
en G6 por un hallazgo crítico, o alto en endpoint público. Escalas a EM-ARCH; una excepción o un
incidente crítico va con [ESCALACIÓN DE SEGURIDAD] a EM-ARCH y al CTO a la vez. Los boundaries mecánicos
son de boundary-reviewer. Regulación no confirmada: «requiere verificación con fuente oficial».
=== AI-DATA-ENG (data-eng, on-demand) ===
Diseñas el modelo y las integraciones de datos ISP sobre PostgreSQL + TypeORM + Redis + BullMQ.
Idempotencia, retry, auditoría y aislamiento por schema. SR-FULL implementa en el Modulith; en una
disputa de BD decides el diseño y SR-FULL la implementación. Streaming, OLAP o lakehouse solo vía ADR.
=== AI-PLAT-OPS (plat-ops, on-demand) ===
Eres dueño de CI/CD, Compose, Nginx/TLS, backup/DR por tenant y la ejecución de releases tras G7.
Un pipeline roto es tu prioridad; G6.5 con CI verde no te requiere. pgBouncer no persiste
search_path. Backup no probado = no existe. Herramienta nueva → CTO vía ADR.
```

### 10.6 Decisiones G0 de las olas 2 a 4

| G0 | Decisión | Opciones | Recomendación |
| --- | --- | --- | --- |
| G0-5 | Fusionar la Ola 3 (C5, C12) en la Ola 2 | A: un solo acto de protocolo v1.10 · B: mantener la Ola 3 aparte | **A**: evita subir dos veces la versión de EMA, SRF, FEP y DSO |
| G0-6 | Texto de C12 (D10) | A: dependencia npm sin cambio de stack → EM-ARCH; librería UI o stack → CTO vía ADR · B: toda dependencia frontend → CTO vía ADR | **A**: ratifica `EMA:121` y `SRF:80`, no mueve autoridad y no requiere ADR. B sí la movería hacia el CTO y exigiría ADR (`PROT:359`) |
| G0-7 | C13: alinear el protocolo con ADR-107 (D7) | A: en la Ola 2 · B: esperar a una enmienda de ADR-107 | **A**: el ADR aprobado ya manda; el protocolo solo se pone al día |
| G0-8 | Deuda «Baseline y Stack» (D11) | A: entrada de trabajo en EMA, SRF, FEP, PUX y DSO · B: llevar la baseline a la cadena de `PROT:248` | **A**: es lo hecho en la Ola 1; B contradiría ADR-056 §4 (aprobado) y exigiría ADR |
| G0-9 | Menciones de sprint residuales | Cerrar sin cambio (§10.3) | Aprobar |
| G0-10 | Alcance de la Ola 4 (§10.5) | A: prompt ≤15 líneas + «Formatos» conservados; subagentes reconciliados, no sustituidos · B: sustituir también el cuerpo de los subagentes | **A**: los subagentes llevan lecturas y procedimiento que el prompt compacto no cubre |
| G0-11 | Ejecución de la Ola 2 | A: 4 tramos en paralelo contra §10.3 como contrato congelado · B: protocolo primero y espejos después | **A**: los tramos no comparten archivos y el texto ya está fijado aquí |

**Resolución de G0-5 a G0-11 (2026-11-09):** el CTO aprueba en bloque, con las recomendaciones de la tabla: G0-5 = A (la Ola 3 se fusiona en la Ola 2), G0-6 = A (C12 sin mover autoridad, sin ADR), G0-7 = A, G0-8 = A, G0-9 aprobado, G0-10 = A y G0-11 = A (cuatro tramos en paralelo contra §10.3).
