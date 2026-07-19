# PLANTILLA — Informe de sprint (AI-EM-ARCH → CTO)

**Versión:** 1.0
**Estado:** Vigente (aprobada por el CTO, 2026-07-18; instrumenta la cadencia §8 del [Protocolo v1.3](../roles/Protocolo_Colaboracion_Multiagente_v1.md) y cierra el pendiente §5.5.2 del [informe vivo de roles](INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md))
**Uso:** copiar como `INFORME-SPRINT-{NN}-v1.0.md` en `docs/informes/` al cierre de cada sprint. Los campos entre `{}` se completan; ninguna celda de KPI se estima — **sin dato = "sin instrumentar"**.

---

## 1. Resumen del sprint

| Campo | Valor |
| --- | --- |
| Sprint | {NN} — {fechas} |
| Módulo/fase en curso | {MOD-XX Fase YY} |
| Objetivo del sprint | {una frase} |
| Resultado | Completado / Parcial / Bloqueado |

## 2. Entregables

| Entregable | Agente | Estado | Evidencia (ruta/commit/PR) |
| --- | --- | --- | --- |
| {…} | {AI-XXX} | {…} | {…} |

## 3. Calidad y cobertura

| Métrica | Valor | Fuente |
| --- | --- | --- |
| Cobertura unit core | {%} | Reporte de calidad SR-QA |
| Criterios de aceptación con test | {X/Y} | Trazabilidad criterio↔test |
| Defectos abiertos (C/A/M/B) | {…} | Catálogo de defectos SR-QA |
| Hallazgos de seguridad abiertos | {…} | Informe de postura SEC-ENG |

## 4. Deuda técnica (alimenta la regla de escalación de EM-ARCH §3.3)

| Severidad | Abierta al cierre | Nueva este sprint | Pagada este sprint | ¿Plan de pago? |
| --- | --- | --- | --- | --- |
| Crítica | {n} | {n} | {n} | — (crítica abierta al cierre de módulo escala al CTO) |
| Alta | {n} | {n} | {n} | Sí/No |
| Media/Baja | {n} | {n} | {n} | Backlog |

## 5. KPIs del protocolo (tabla instrumentada — cadencia §8)

Cada fila registra el dato del sprint y su fuente. Un KPI sin dato se marca **"sin instrumentar"**, nunca se estima.

| KPI | Dueño | Dato del sprint | Fuente del dato |
| --- | --- | --- | --- |
| PRDs/HLDs aprobados sin reescritura mayor | EM-ARCH | {n/n o s/i} | Registro de reescrituras en G1–G4 |
| Conflictos resueltos sin CTO | EM-ARCH | {n/n o s/i} | Desempates `[DESEMPATE]` emitidos |
| Adherencia al prompt de ejecución | SR-FULL / FE-PLAT | {% o s/i} | Desviaciones declaradas en reportes de fase |
| Cambios de contrato post-congelación | SR-FULL / DS-OWNER | {n} | Reportes de fase (campo "Contrato de API") + changelog del DS |
| Hallazgos bloqueantes de G6 por entrega | FE-PLAT / SR-FULL | {n} | Informes de hallazgos G6 |
| Violaciones de boundary post-merge | SR-FULL | {n o s/i} | Review de segunda capa G5 |
| Flakiness de la suite | SR-QA | {% o s/i} | Reporte de calidad SR-QA |
| Pipeline de CI roto (incidencias / tiempo caído) | PLAT-OPS | {n / h o s/i} | Historial de workflows |

## 6. Señales de división de EM-ARCH (informe vivo §5.4 — se observan, no se actúa sin ADR)

| Señal | Dato del sprint | Umbral de atención |
| --- | --- | --- |
| Latencia media de gates (emisión → aprobación, en sesiones) | {n o s/i} | > 2 sesiones sostenido |
| Desempates/consultas bloqueantes en cola al cierre | {n} | > 3 recurrente |
| Módulos activos en paralelo | {n} | > 1 (dispara evaluación de sharding vía ADR) |

## 7. Bloqueos y escalaciones

| `[BLOQUEO]` / `[ESCALACIÓN]` | Agente | Estado | Resolución |
| --- | --- | --- | --- |
| {…} | {…} | Abierto/Resuelto | {…} |

## 8. Decisiones que requieren CTO

| Decisión | Opciones (máx. 3) | Recomendación | Antes de |
| --- | --- | --- | --- |
| {…} | {…} | {…} | {fecha/evento} |
