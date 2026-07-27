# INFORME-PORTAL-CTA-LIMA-VS-AZUL-DESEMPATE-v1.0

**Modo:** AI-EM-ARCH Orchestrator · desempate + escalación CTO  
**Fecha:** 2026-07-23  
**Disparador:** Preferencia visual humana — CTAs de página “se ven mejor en azul” tras adopción lima (UI-18 / G7)

---

## 1. Convergencia Design Layer

| Agente | Opción | Postura |
| --- | --- | --- |
| AI-PROD-UX | **A** — mantener lima | Azul empeora opener≠submit e Importar≠Nuevo; preferencia = hábito SaaS, no fallo de tarea |
| AI-DS-OWNER | **C** — enmendar Firma; **escala CTO** | Quitar lima del CTA filled de página = lenguaje visual global; B (revert sin enmendar) crea doble fuente de verdad |

Ambos rechazan **D híbrido** y **B sin C**.

---

## 2. Desempate EM-ARCH

**Regla de gobierno:** no se implementa revert (B) mientras Firma diga “lima = acción principal de página”.

| Camino | Condición | Acción FE |
| --- | --- | --- |
| **A** | CTO ratifica Firma / lima | Ninguna — hold termina; lima permanece |
| **C** | CTO aprueba enmienda DS-OWNER | Pase `lime`→`primary` en openers de página; actualizar skill + UI-18 + informes |

**Hold operativo (vigente hasta tu decisión):** sin más adopción lima en CTAs de página; **sin revert**.

**Recomendación EM-ARCH:** si la preferencia es estética y no hay evidencia de misclicks/fallo de tarea → **A**. Si producto confirma que el portal operativo debe leer CTAs en azul noche como norma de marca → **C** (enmienda primero, código después).

---

## 3. Escalación a CTO (bloqueante)

### Opción A — Ratificar lima (sin enmienda)
- Contrato UI-18 / Firma sin cambio.
- Portal se queda como está (CTAs página lima).

### Opción C — Enmendar Firma (texto DS-OWNER)
> Lima = avance, éxito, completitud, señal de interacción (nav, progreso, badges, focus). Lima **≠** botón filled de CTA de página.  
> CTA de página + submit modal/sección = `primary`. Secundarias = ghost/outline/link.  
> `variant="lime"` se conserva en API para marca/auth/avances explícitos. Hex sin cambio.

Tras GO C: FE ejecuta prompt DS-OWNER (portal + Users openers lima→primary).

---

## 4. Decisión CTO

**C — aprobada 2026-07-23.** Hold levantado. Enmienda Firma + migración FE openers `lime`→`primary`.

## 5. Ejecución post-C

| Gate | Resultado |
| --- | --- |
| Docs (Firma, firma-elements, Button CVA comments) | Hecho |
| G5 FE — openers página → primary | GO |
| G6 SR-QA | **GO con deuda** (specs sin assert de variant; web fuera de alcance) |
| G7 EM-ARCH | **GO** — enmienda C cerrada en portal |

**Residuales lime autorizados:** BulkImport wizard; ack credencial Users («Ya la guardé»).  
**Deuda diferida:** aserciones de variant en specs; paridad `apps/web` si CTO la pide.

## 6. Inventario post-G7 (2026-07-23) — botones a cambiar

Fuente: FE inventario + **DS-OWNER GO FE web** (portal STOP).

| Sev | Archivo | Label | Actual → Debe |
| --- | --- | --- | --- |
| **P1** | `apps/web/.../users/page.tsx` | Crear usuario interno | lime → **primary** |
| **P1** | `apps/web/.../tenants/page.tsx` | Nueva empresa | lime → **primary** |

Portal openers: OK (STOP FE portal). Lime portal restante: autorizado (BulkImport + ack).

**Pase FE web:** **GO** — ambos P1 → `primary`; grep `variant="lime"` en `apps/web` = 0.

**G7 paridad web:** cerrada (EM-ARCH verify + FE). Sin más IN de openers lime en portal/web.

---

*Consultas: PROD-UX + DS-OWNER. CTO = C. G6 ≠ productor FE.*
