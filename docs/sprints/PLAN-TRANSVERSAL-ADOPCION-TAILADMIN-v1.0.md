# PLAN — Adopcion Transversal de TailAdmin

**Version:** 1.0
**Estado:** En revision
**Fecha:** 2026-03-13
**Modo activo:** Mixto
**Autor:** AI-EM-ARCH
**HLD base:** `docs/hlds/HLD-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`
**ADR principal:** `docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md`
**Prompt arquitectonico origen:** `docs/prompts/PROMPT-ARCHITECT-TRANSVERSAL-ADOPCION-TAILADMIN.md`

---

## 1. Objetivo del plan

Planificar la adopcion progresiva del patron TailAdmin en el shell de dashboard de iWana neXt para `apps/web` y `apps/portal`, sin cambiar el stack aprobado y sin mezclar codigo demo con implementacion productiva.

---

## 2. Artefactos de entrada

- `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md`
- `docs/prds/Stack_Tecnologico.md`
- `docs/plans/2026-03-12-frontend-prototype-design.md`
- `docs/prototipo/tailadmin/src/partials/header.html`
- `docs/prototipo/tailadmin/src/partials/sidebar.html`
- `docs/prototipo/tailadmin/src/partials/top-card-group.html`
- `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md`
- `docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md`
- `docs/hlds/HLD-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`

---

## 3. Fases

| Fase | Objetivo | Alcance principal | Dependencias | Salida esperada |
| --- | --- | --- | --- | --- |
| FASE-01 | Estabilizar shell y tema | sidebar, header, dropdown user, dark mode, buscador, tokens, responsive | HLD + ADR-023 | shell funcional y reusable en web y portal |
| FASE-02 | Adaptar dashboard admin | grid principal, metric cards, paneles, tabla principal, menus de accion | FASE-01 | dashboard admin coherente con TailAdmin e identidad iWana |
| FASE-03 | Adaptar dashboard portal | widgets de plan, conexion, facturacion, soporte y perfil | FASE-01 | portal suscriptor alineado al mismo shell |
| FASE-04 | Hardening y cierre | accesibilidad, mobile polish, persistencia de estado, validacion y evidencia | FASE-02 + FASE-03 | cierre tecnico y documental |

---

## 4. Detalle por fase

### FASE-01 — Shell y tema

**Incluye**

- Sidebar con colapso desktop y drawer mobile
- Header sticky
- Buscador claro y consistente
- Dark mode funcional
- Dropdown de usuario accesible
- Normalizacion de tokens y clases visuales necesarias

**No incluye**

- Charts productivos
- Busqueda global real
- Tablas avanzadas con datos reales

**Criterio de salida**

- `apps/web` y `apps/portal` comparten el mismo patron de shell
- dark mode funciona realmente
- dropdown de usuario y sidebar cumplen teclado y cierre accesible

### FASE-02 — Dashboard admin

**Incluye**

- metric cards
- paneles de actividad o target
- tabla principal de datos
- menus contextuales secundarios

**Criterio de salida**

- dashboard admin deja de ser un ensamblaje provisional y adopta una gramatica visual estable

### FASE-03 — Dashboard portal

**Incluye**

- widgets del dominio suscriptor
- tarjetas de plan, facturacion, soporte, perfil y estado de servicio

**Criterio de salida**

- portal suscriptor usa el mismo shell y adapta solo contenido de negocio

### FASE-04 — Hardening

**Incluye**

- accesibilidad
- responsive validation
- limpieza de deuda visual
- evidencia de validacion

**Criterio de salida**

- typecheck en verde
- pruebas visuales y de interaccion basicas ejecutadas
- informe vivo actualizado

---

## 5. Riesgos de ejecucion

| Riesgo | Fase afectada | Mitigacion |
| --- | --- | --- |
| Mezclar estado desktop y mobile del sidebar | FASE-01 | separar estado persistido y estado transitorio |
| Duplicacion entre web y portal | FASE-01 a FASE-03 | shell compartido y adaptadores por app |
| Exceso de imitacion visual sin utilidad funcional | FASE-02 y FASE-03 | priorizar jerarquia, accesibilidad y mantenibilidad |

---

## 6. Stop/Go

- Detenerse si la implementacion requiere cambiar el stack base o introducir una dependencia estructural sin validacion.
- Detenerse si la capa compartida no permite mantener coherencia entre admin y portal.
- Escalar a CTO si aparece necesidad real de cambio de stack, boundary o patron transversal no contemplado por ADR-023.