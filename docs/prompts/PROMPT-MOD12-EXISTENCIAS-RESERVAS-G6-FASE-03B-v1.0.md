# PROMPT — MOD12 Existencias Fase 03B — Review G6 (experiencia / DS / QA)

**Version:** 1.0  
**Fecha:** 2026-07-20  
**Estado:** Emitido (G4 handoff G6) — **EJECUTABLE**  
**Autorización:** CTO 2026-07-20 (ciclo G6→G7)  
**Emisor:** AI-EM-ARCH (Orquestador)  
**Destinatarios:** AI-PROD-UX · AI-DS-OWNER · AI-SR-QA (paralelo §3bis)  
**Protocolo:** etapa 6 — el aprobador del gate no es el productor de la implementación

---

## 1. Objetivo

Emitir el informe G6 de Fase 03B (Reservas efectivas) con veredicto **GO / GO condicionado / NO-GO**, sin reabrir el motor de reservas salvo hallazgo bloqueante de experiencia, identidad, a11y o CA.

**Entregable único consolidado:**  
`docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-G6-REVIEW-v1.0.md`  
(formato de referencia: `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-G6-REVIEW-v1.0.md`)

---

## 2. Entradas obligatorias

| Artefacto | Ruta |
| --- | --- |
| PRD §7 Fase 3B | `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` |
| ADR-055 | `docs/adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md` |
| Spec D-F3B-1…11 / CA | `docs/specs/2026-07-18-mod12-existencias-reservas-fase03B-design.md` |
| Prompt implementación | `docs/prompts/PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md` |
| Informe fase + EV-1 | `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-v1.0.md` (v1.1) |
| Auditoría G5 | `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-AUDITORIA-ARCH-v1.0.md` (**nota:** snapshot pre-EV-1; EV-1 ya cerrado por productor) |
| Commits | `d5f72cd1` (impl) · `635c2a4d` (EV-1 + migración 073) |

Skills: `iwana-identity-ui-review` (modo review), `wcag-audit-patterns`, `system-vocabulary-review`, `testing-patterns` / `playwright-skill` (SR-QA).

---

## 3. Alcance por rol

### AI-PROD-UX (flujo)

- Matriz Por bodega: columnas Existencia / Reservado / Disponible y semántica `disponible = onHand − reserved`.
- Mensajes 400 en español al intentar consumir stock comprometido (transferencia / despacho / salidas).
- Que el operador entienda el compromiso sin enums crudos.
- **No** exigir rediseño de salidas fuera del contrato 3B.

### AI-DS-OWNER (contrato / Firma iWana)

- Tokens y primitives `Portal*` en la matriz y labels.
- Contraste AA; sin enums crudos; densidad alineada al resto de Existencias.
- Puntaje identidad P0–P3; P0/P1 bloquean G6.

### AI-SR-QA (CA + evidencia)

- Trazabilidad CA-F3B-01…11 vs Jest / EV-1 / Playwright `Portal Inventario / Reservas (Fase 03B)`.
- Re-ejecutar Playwright Reservas (4 tests) si el entorno lo permite; si no, declarar lectura + riesgo.
- Confirmar que no hay regresión de labels «disponible» vs «existencia».
- Anotar migración **073** (CHECK) como entregable post-EV1 no listado en informe 03B §2 — deuda documental, no bloqueante salvo fallo de runtime.

---

## 4. Fuera de alcance G6

- Reimplementar motor / invariante / migraciones 072–073.
- Cerrar G7 (eso es AI-EM-ARCH tras G6 GO).
- Definir Fase 4.
- Remediaciones de código: si hay P0/P1, emitir hallazgos y **stop** para FE-PLATFORM/SR-FULL; no auto-remediar en esta sesión de review salvo instrucción explícita de EM-ARCH.

---

## 5. Criterios stop / go

| Resultado | Condición |
| --- | --- |
| **GO** | Sin P0/P1; CA trazados; deuda solo P2/P3 aceptada |
| **GO condicionado** | Hallazgos importantes remediables en la misma sesión FE; re-verificar antes de firmar |
| **NO-GO** | Flujo ciego, a11y crítica, vocabulario engañoso (p. ej. rotular onHand como disponible), o CA sin evidencia |

**Stop inmediato a EM-ARCH:** duda de boundary, cambio de alcance, o evidencia EV-1 contradictoria en runtime.

---

## 6. Restricciones

- Sin PII, secretos ni credenciales.
- Texto de hallazgos en español, sentence case.
- Aprobador G6 ≠ productor de la implementación F3B.
- No declarar G7 ni producción.

---

## 7. Salida esperada del informe

1. Resumen ejecutivo + veredicto consolidado.  
2. Tabla de veredictos por rol.  
3. Hallazgos (bloqueante / importante / deuda) con evidencia (path:línea o test).  
4. Evidencia Playwright / CA.  
5. Decisión: habilita o no G7.
