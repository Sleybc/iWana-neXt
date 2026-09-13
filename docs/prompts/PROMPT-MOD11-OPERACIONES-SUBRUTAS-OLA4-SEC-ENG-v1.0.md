# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 4 · AI-SEC-ENG

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 4 — verificación
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `sec-eng` (AI-SEC-ENG)
**Encargo:** **Re-verificación AppSec** (etapa 6 del protocolo)
**Cierra:** parte de **G6**

> Este encargo **no tiene prompt de fase**. G6 exige *"re-verificación AppSec"* (protocolo §3, tabla de gates de cierre); esta orden es autosuficiente.

---

## 1. Por qué se te convoca

Ya emitiste un dictamen en la ola 2 sobre el scoping de F1: **APROBADO CON OBSERVACIONES** (`INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SEC-ENG-v1.0.md`). Desde entonces **F5 integró el frontend contra ese endpoint**: la superficie cambió aunque el backend no.

Esta es la re-verificación de cierre, no una repetición: revisas lo que la ola 3 añadió y confirmas que tus observaciones siguen acotadas.

## 2. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §2 RACI (fila "Seguridad aplicativa": eres **R**), §3 tabla de gates (G6 exige re-verificación AppSec), §4 gates 1, 7 y 8, §6.3 marcadores.
3. **Tu propio dictamen de la ola 2** — punto de partida: qué observaste y qué condicionaste.
4. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md` — **§5.1 resuelve la degradación del picker; §7 lista la deuda**.
5. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 §5 — impacto declarado de multi-tenant, seguridad y regulación.
6. La tabla de finalidad por campo ADR-067 en `INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-BACKEND-v1.0.md` §7.

## 3. Alcance de la re-verificación

1. **Scoping por actor, extremo a extremo.** Confirmaste el `WHERE` del servicio en la ola 2. Ahora verifica que **el frontend no lo elude**: que la bandeja no construye consultas que amplíen el alcance, y que el `total` del pie sigue reflejando el alcance del actor (ADR-065 §15). El riesgo R1 sigue siendo el dominante: `@ExecutionOrderTenantScoped()` habilita la ruta **y desactiva el ABAC del guard**.
2. **Proyección de PII (ADR-067).** La bandeja de OT está ahora en pantalla. Verifica que lo proyectado coincide con la tabla de finalidad por campo y que no se filtró `serviceAddress`, `workInstructions` ni datos de contacto por la vía del frontend.
3. **SEC-O2 (tu propia observación).** Fallback a email en `responsibleLabel`: ¿sigue siendo aceptable ahora que esa etiqueta se pinta en tabla y drawer, o cambia de severidad al hacerse visible?
4. **SEC-D1 (tu propia recomendación).** Falta el caso CONTRACTOR en los tests unitarios de scoping. AI-SR-QA lo añade en esta misma ola: **verifica que lo hizo y que prueba lo que debe probar.** Precedente de la ola 2: un test de 403 que respondía 200 pasaba sin probar nada.
5. **Degradación del picker (D-P1).** La resolución fue Salida 2 — degradación visible, sin cambio de autorización. Confirma que no se introdujo superficie nueva y que el aviso no revela información que el 403 protegía.
6. **Gates 1, 7 y 8 del protocolo §4:** vulnerabilidades conocidas en lo tocado; logs, código y fixtures sin PII real ni credenciales; multi-tenancy respetada (tenant desde JWT, nunca desde input).

## 4. Skills — leer antes de revisar

**Obligatorias:** `security-auditor`, `backend-security-coder`, `frontend-security-coder`.
**De apoyo:** `testing-patterns` (para juzgar si los tests de scoping prueban lo que dicen).

## 5. Superficie

**Eres auditor de solo lectura: reportas hallazgos, no implementas.** Tu entregable es un dictamen en `docs/informes/`. Si un hallazgo exige corrección, tiene dueño: AI-SR-FULL (backend), AI-FE-PLATFORM (frontend) o AI-SR-QA (cobertura).

## 6. Restricciones

1. **No modifiques código de producción ni tests.**
2. **No apruebes excepciones de seguridad:** eso es del CTO. Si una hace falta, emite `[ESCALACION AL CTO]` (sin tilde, §6.3 regla 2) además de tu hallazgo.
3. Sin PII real en el dictamen.

## 7. Entregable

Dictamen en `docs/informes/` con veredicto explícito — **APROBADO · APROBADO CON OBSERVACIONES · RECHAZADO** — y, por cada hallazgo: evidencia `archivo:línea`, severidad, impacto y dueño de la corrección. Declara si tus observaciones de la ola 2 quedan cerradas, siguen abiertas o cambian de severidad.

## 8. Stop/go — tu re-verificación no cierra si

- No emites veredicto.
- SEC-D1 queda sin verificar (que el caso CONTRACTOR exista **y pruebe lo que debe**).
- Algún hallazgo carece de evidencia localizable o de dueño.

## 9. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[ESCALACION AL CTO]` si aparece una excepción de seguridad o cumplimiento. `[CONSULTA]` a AI-SR-FULL o AI-FE-PLATFORM (guía de corrección), a AI-SR-QA (cobertura de escenarios de abuso).

## 10. Reporte final

Declara qué skills leíste, el veredicto, el estado de SEC-O2 y SEC-D1, y los hallazgos nuevos con dueño y severidad.
