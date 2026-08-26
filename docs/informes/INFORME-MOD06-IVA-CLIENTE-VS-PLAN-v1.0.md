# INFORME-MOD06-IVA-CLIENTE-VS-PLAN-v1.0

**Versión:** 1.2  
**Fecha:** 2026-08-20  
**Modo:** Orquestador AI-EM-ARCH  
**Estado:** G1 **cerrada** (5/5). Desempate vigente. Implementación **no** arranca (sin prompt G4).  
**Módulo:** MOD06 Comercial · MOD05 CRM (IVA)  
**Protocolo:** v1.5 etapa 1, consulta G1

---

## 1. Tesis (negocio)

El IVA de internet se aplica al **cliente**, no al plan: NATURAL estrato 1–2 EXEMPT; estrato 3 EXCLUDED; estrato 4–6 STANDARD; JURIDICA STANDARD.

Fuente Aprobada: [ADR-025](../adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md). PRD-MOD05 RF-IVA / CA-SUB **Propuesto**; la matriz fiscal del ADR prevalece. Tarifas y artículos DIAN: **requiere verificación con fuente oficial**.

## 2. Consulta G1

| Rol | Id | Veredicto |
| --- | --- | --- |
| AI-SR-FULL | dbb013e7-e8be-437c-8078-14a8b946793c | Modelo «IVA del plan» **inviable**. KPI defectuoso. |
| AI-DATA-ENG | 5801a976-1ea8-4aa1-8ba2-1ebfa0690d69 | Modelo **partido**. `[BLOQUEO]` tres dueños de la matriz. |
| AI-PROD-UX | 4a3573d9-d18f-4300-b473-7db8f7d2745e | **Inviable** 8=planes. Alerta binaria de cobertura + combos aparte. |
| AI-SEC-ENG | 7f49788e-7ead-4f48-878a-8a68f4505f1c | `[SEC-REVIEW]` P1 modelo/KPI; KPI no expone estrato. Sin excepciones. |
| AI-SR-QA | 82d966e1-5dd1-429d-87bb-d263a6609b7c | CA-SUB cubiertos en `VatTreatmentService`. KPI **no** es evidencia de IVA. |

## 3. [DESEMPATE]

**Área RACI:** Arquitectura (boundaries, modelo fiscal) + UX del resumen comercial.  
**Posiciones:** Las cinco consultas coinciden: IVA = `personType` + `stratum` en CRM; `tax_rules` = matcher de condiciones de cliente; el KPI `taxRulesCoverageGapCount = activePlansCount` miente y **no cierra CA-SUB**. AppSec: sembrar más IVA «para cubrir planes» **no se aprueba**.  
**Decisión:**

1. **Dueño de la verdad IVA:** CRM (`VatTreatmentService` → `subscribers.vatTreatment`). No persistir IVA en el plan.
2. **Commercial:** catálogo de impuestos + reglas de *cuándo* aplican a un **perfil de cliente**. No recodificar la matriz por `customerSegment` (choca RF-IVA-05 / ADR-025).
3. **KPI Q3 tributario:** deja de ser «N planes». Cobertura de reglas de aplicación = **binaria** (hay/no hay ≥1 regla+aplicación vigente). Combos con ítems inactivos = conteo **aparte**.
4. **Siembra 115:** no es la corrección de producto; deja una 2.ª matriz por segmento. Queda **deuda**: alinear o revertir en fase con prompt G4, no en silencio.
5. **CTA:** Aplicación de impuestos (configurar) / simulador (verificar cliente). Completar datos fiscales del subscriber = CRM.
6. **PII:** estrato es dato de persona natural (Ley 1581). El KPI actual no lo filtra ni lo loguea; G4 no debe empezar a loguear estrato. Persistencia «Estrato N» en `reason` de perfil/simulador queda a revisión AppSec en fase, no es el KPI.

**Justificación:** ADR-025 Aprobado + ADR-031 D1/D4 + las cinco consultas G1.  
**Corte DATA-ENG `[BLOQUEO]` tres dueños:** resuelto en este desempate — verdad IVA = CRM `vatTreatment`; Commercial = matcher, no 2.ª matriz; assignments = confirmación facturable, no recodificar IVA. ADR-031 D2 (`person_type` en `tax_rules`) queda **deuda de schema**, no se inventa columna en G1.  
**Requiere ADR:** No (no cambia stack ni boundary; reinterpreta KPI y copy).  
**Requiere CTO:** No para el desempate de modelo. Sí si se quisiera **anular** ADR-025.  
**Registro:** este informe.

## 4. Calidad (SR-QA)

CA-SUB-01..06 ya tienen tests en `vat-treatment.service.spec.ts` (réplicas en `subscribers.service.spec.ts`). El KPI comercial **no** es evidencia de esos CA.

Tests que quedan inválidos si el hueco deja de ser `activePlansCount`: `commercial-dashboard.service.spec.ts`; portal `commercial-alerts.spec.ts` y `CommercialAlertsStrip.spec.tsx`. E2E `portal-commercial-alerts-gate.spec.ts` no (fixture).

**Hallazgo colateral (fuera del KPI, entra a G4 CRM):** `subscriber-tax-profile.service.spec.ts` («Natural sin estrato → STANDARD») contradice CA-SUB-06 (NATURAL sin estrato → 400).

## 5. AppSec (SEC-ENG)

Sin P0 de emisión DIAN. Sin excepciones. Citas Decreto 1835/2021 y Ley 1819 Arts. 476-477 en código/presets: **requiere verificación con fuente oficial** (no están en ADR-025 ni en el Anexo).

| Sev | Hallazgo |
| --- | --- |
| P1 | KPI/semilla 115 miden «existe regla de catálogo», no IVA de cliente. Sembrar más por estrato **no** se aprueba. |
| P1 | Motor comercial por `customerSegment` vs ADR-025 / RF-IVA-05 (`personType` + `stratum`). |
| P2 | NATURAL sin estrato: `VatTreatmentService` rechaza; tax-profile aplica STANDARD (mismo hallazgo QA). |
| P3 | Comentarios/presets citan DIAN/Decreto sin artefacto Aprobado. |

El KPI no expone estrato (conteo tenant + `catalog_items.id`/`name`). Dual motor: riesgo de tasa distinta si Billing consume reglas de segmento en vez de `vatTreatment`.

## 6. Stop / go

- **Stop:** no implementar hasta prompt G4; no más semillas IVA-como-plan; no loguear estrato.
- **Go (fase siguiente):** prompt a SR-FULL (KPI binario + separar combos) + FE-PLATFORM (copy/CTA) + QA (reescribir tests del KPI) + CRM (alinear TaxProfile vs CA-SUB-06) + DATA-ENG (115: alinear o revertir).
