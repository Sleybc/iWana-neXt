# Dictamen — Finalidad y retención del dato personal en la línea de tiempo de la OT (MOD11 T1 B3)

**Versión:** 1.0
**Estado:** Aprobado por AI-SEC-ENG (cierra CA-07)
**Fecha:** 2026-09-14
**Autor:** AI-SEC-ENG (auditor — dictamina, no implementa)
**Alcance:** bloque B3 de `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` (pasos 9–12)
**Trazabilidad:** ADR-089 (Aprobado) Impacto Seguridad y PII, §D5, R2/R4 · ADR-067 (Aprobado, formato de finalidad) · spec `docs/specs/2026-09-14-mod11-linea-tiempo-ot-design.md` §6 + §8 CA-07
**Skills:** `security-auditor`, `backend-security-coder` (leídas antes de dictaminar); apoyo `docs-architect`

## 1. Decisión de tratamiento

Dato **personal del trabajador, no dato operativo**: la línea de tiempo describe cuándo y cuánto trabajó una persona identificable; Ley 1581 aplica a empleados igual que a suscriptores (ADR-089 Impacto Seguridad y PII; spec §6).

## 2. Finalidad por campo (formato ADR-067)

| Campo | Finalidad operativa (fase 1: productividad, no jornada) |
| --- | --- |
| `id` | Trazabilidad y referencia desde correcciones (B2). No es dato personal. |
| `tenantId` / schema | Aislamiento por tenant. Sostiene el no-acceso cross-tenant. |
| `executionOrderId` | Vínculo con la OT; sin él no hay línea de tiempo. |
| `fromStatus` / `toStatus` | El hecho auditable es la transición (bloqueo, reanudación, cierre, cancelación). |
| `changedAt` | Ordenar la línea y derivar bloqueado/total sin descontar (CA-03). Fuente de cómputo, no cómputo persistido (D2). |
| `actorUserId` / `changedBy` | Autoría del asiento y de la corrección. **Identificador directo del trabajador: dato personal.** Finalidad única: autoría. |
| `actorName` (snapshot en claro) | **Sin finalidad autónoma en fase 1.** Exigencia 1: eliminar o justificar por escrito. |
| `reasonCode` / `reason` | Porqué declarado del bloqueo/cancelación/corrección. Código cerrado preferente; texto libre solo tipado y validado. |
| `correctionOfId` (B2) | Corrección aditiva, original visible (CA-04). |
| `correctionReason` | Motivo de enmienda (puede reutilizar `reason`). |
| `createdAt` | Distinguir instante del hecho de instante de escritura (registro tardío). |
| `metadataJson` | **Sin finalidad en fase 1. Prohibido en T1** salvo allowlist tipada aprobada (exigencia 2). |
| `startedAt` / `closedAt` de la OT | Fuera del dictamen: proyección conservada (CA-05), no dato nuevo de T1. |

Principio: todo campo personal futuro parte de proyección mínima; añadirlo exige finalidad declarada y revisión sec-eng.

## 3. Retención con plazo (CA-07)

**24 meses desde el cierre o cancelación de la OT** (último asiento de cierre/cancelación; en su defecto `closedAt`). Vencido: supresión segura del vínculo identificable por schema de tenant (borrado o anonimización irreversible de `actorUserId`/`actorName`/`reason` identificable; agregados anonimizados solo si T3 los define y sec-eng los aprueba). Fundamento: ciclo anual + comparativa interanual del uso aprobado de productividad; techo de proporcionalidad que cierra R4.

1. El plazo **no corre en OT abiertas**; revisión anual de huérfanas con reporte a AI-EM-ARCH; prohibido inventar cierres (spec §4.5).
2. La corrección (B2) no reinicia el plazo de su OT.
3. Prohibido en fase 1: uso para jornada/horas extra/efectos laborales (D5); presentar transcurrido como trabajado (R1 — cada consumidor declara qué descontó); leer MOD09 para cómputo (A3); persistir duraciones (D2/R5).
4. Migraciones, fixtures, tests y logs: cero PII real; logs con identificadores operativos, nunca `reason` en claro ni volcado de asiento.
5. T3 no queda autorizado: su GO exige mapa campo × rol, registro de acceso masivo en `audit_logs`, cota de paginación y distinción de poblaciones sin historial. La exportación es acto distinto.
6. Purga por schema (`runInTenantSchema`); índice por orden e instante desde B1.

**Requiere verificación con fuente oficial:** plazo definitivo frente a normativa laboral (MinTrabajo/fase 2, D5), prescripción de acciones laborales, ejercicio de derechos de los trabajadores (Ley 1581/ARCO). Este dictamen fija el plazo técnico operativo; **no es dictamen jurídico**. Dueño: fase 2 con CTO + legal.

## 4. Exigencias con código (no implementadas por sec-eng)

1. `actorName` en claro → sr-backend: eliminar o justificar. **(Satisfecha por construcción en B1: la entidad no trae `actorName`.)**
2. `metadataJson` libre → prohibido en T1 salvo allowlist + re-dictamen. **(Satisfecha por construcción en B1: sin `metadataJson`.)**
3. Purga/anonimización por retención → deuda Media, SLA próximo ciclo; no bloquea T1, sí cualquier T3.
4. Trazabilidad de lectura masiva + mapa campo × rol → condición de GO de T3.

## 5. Cierre

**CA-07: APROBADO.** Finalidad por campo + retención 24 meses post-cierre. B4 puede dar GO de T1 sin esperar T3; T3 y T4 requieren dictamen/verificación independientes. Sin PII real en el dictamen.
