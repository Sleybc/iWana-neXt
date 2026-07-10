# Informe - MOD12 Inventario / SCM Definicion

**Version:** 1.0  
**Fecha:** 2026-06-25  
**Estado:** Aprobado  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Clasificacion:** Confidencial - Uso interno

---

## Identificacion

- **Modulo:** MOD12 Inventario / SCM
- **Fase:** Definicion arquitectonica y funcional
- **Origen:** docs/ideas/cadenadesuministros.md
- **Perfil activo:** docs/roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md
- **Artefactos generados:**
  - docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
  - docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md
  - docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
  - docs/prompts/PROMPT-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md
  - docs/plans/2026-06-25-mod12-inventario-scm-fase-01.md
  - docs/quality/CHECKLIST-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md
  - docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md
  - docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
  - docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
  - docs/plans/2026-06-25-mod12-compras-workspace-hibrido-fase-02.md
  - docs/prompts/PROMPT-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md
  - docs/quality/CHECKLIST-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md
  - docs/informes/INFORME-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md

## 1. Resumen ejecutivo

Se definio MOD12 Inventario / SCM como bounded context propio para cubrir el ciclo de vida completo de productos y activos fisicos del ISP:

```text
Cotizacion -> Orden de compra -> Recepcion -> Inventario ->
Salida por venta / tecnico / consumo interno -> Comodato -> Vida util ->
Retorno / reparacion / refurbish / baja
```

La decision principal es **no reutilizar MOD11**. MOD11 ya esta aprobado como Ejecucion Operativa / Tareas; Inventario / SCM debe ser owner de stock, bodegas, seriales, custodia, movimientos, compras, comodato y vida util.

## 2. Decisiones tomadas

| Decision | Resultado |
| --- | --- |
| Numeracion | Proponer MOD12 para evitar colision con MOD11 |
| Compras | Incluir solicitud, cotizaciones, aprobacion, OC y recepcion en Fase 01 |
| Comodato | Activo instalado conserva propiedad del ISP y referencia logica a suscriptor/contrato |
| Vida util | Control operativo completo; depreciacion contable queda fuera de Fase 01 |
| Venta directa | Inventario registra salida y referencia comercial; Billing factura |
| MOD11 | Solicita movimientos y guarda `stockMovementId`; no descuenta stock |
| Ledger | Inmutable; correcciones por reverso o ajuste aprobado |
| Cobertura comodato via OT | Se acepta por contrato backend MOD11 -> MOD12; no exige E2E propio de MOD12 en Fase 01 |

## 3. Referencias externas evaluadas

- Odoo Inventory: seriales, lotes, bodegas, compras, barcode, calidad y reabastecimiento.
- Oracle Fusion Cloud Inventory Management: recepcion, transferencias, conteos, LPN, dashboards y replenishment.
- SAP EWM: transparencia de stock, procesos de bodega y trazabilidad.
- TM Forum TMF639: referencia telco para inventario de recursos.
- NetBox: referencia para source of truth de red/IPAM; queda como insumo para fase posterior de Resource Management logico.

## 4. Riesgos y controles

| Riesgo | Severidad | Control |
| --- | --- | --- |
| Colision con MOD11 | Alta | ADR-048 separa ownership |
| Stock inconsistente | Alta | Ledger + balance en transaccion e idempotencia |
| PII en comodato | Alta | Referencias logicas y labels minimos |
| Alcance contable crece | Media | Depreciacion contable fuera de Fase 01 |
| Compras crece demasiado | Media | Scoring, portal proveedor y contratos marco fuera de Fase 01 |
| IPAM se mezcla con stock fisico | Media | IPAM/VLAN/QoS queda Fase 2 |

## 5. Estado documental

| Artefacto | Estado |
| --- | --- |
| ADR-048 | Aprobado por CTO |
| PRD-MOD12 | Aprobado por CTO |
| HLD-MOD12 | Aprobado por CTO |
| Prompt Fase 01 | Aprobado por CTO |
| Plan de implementacion | Aprobado por CTO |
| Checklist calidad | Aprobado por CTO |

## 6. Decision de salida

- **Puede pasar a ejecucion:** Si.
- **Requiere correcciones previas:** No.
- **Aprobadores pendientes:** Ninguno.
- **Recomendacion EM-ARCH:** Ejecutar Fase 01 con el paquete documental aprobado.

## 7. Actualizacion 2026-06-25 - Refinamiento del submodulo Compras

Se agrego un paquete documental especifico para evolucionar Compras sin alterar ADR-048 ni crear un nuevo bounded context. La decision es tratar Compras como submodulo enriquecido de MOD12 con:

- workspace hibrido;
- solicitudes con lineas;
- politica por tipo + monto;
- proveedor desde MOD08 Parties;
- cotizacion preparada para adjudicacion por linea;
- recepciones parciales con trazabilidad.

### Resultado documental

| Artefacto | Proposito |
| --- | --- |
| `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md` | Diseno aprobado de la experiencia y reglas |
| `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md` | Alcance funcional del submodulo |
| `docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md` | Aterrizaje tecnico y boundaries |
| `docs/plans/2026-06-25-mod12-compras-workspace-hibrido-fase-02.md` | Plan detallado para fullstack |
| `docs/prompts/PROMPT-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md` | Prompt operativo de ejecucion |
| `docs/quality/CHECKLIST-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md` | Checklist de salida de la fase |
| `docs/informes/INFORME-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md` | Informe vivo para evidencia de ejecucion |

### Decision EM-ARCH

- **Requiere nuevo ADR:** No.
- **Requiere cambio de boundary:** No.
- **Estado Fase 02 (2026-06-25):** Implementada. Ver `docs/informes/INFORME-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md` para evidencia de comandos, tests y decision stop/go.
- **Recomendacion:** ejecutar esta evolucion como siguiente fase de MOD12, manteniendo proveedor en MOD08 y stock bajo control de recepcion + ledger.
