# CHECKLIST - MOD09 Programacion / WFM Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Modo activo:** EM  
**Modulo:** MOD09 Programacion / WFM  
**Prompt:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md

---

## 1. Gate documental

- [x] ADR-037 aprobado por CTO.
- [x] PRD MOD09 aprobado para ejecucion.
- [x] HLD MOD09 aprobado para ejecucion.
- [x] Prompt Fase 01 revisado por EM-ARCH.
- [ ] Informe de fase creado o actualizado.

---

## 2. Gate arquitectura

- [ ] `WfmModule` no accede directamente a tablas de CRM, Assurance, Provisioning ni Inventory.
- [ ] No hay imports circulares entre bounded contexts.
- [ ] Referencias cross-module son IDs logicos o puertos tipados.
- [ ] Tablas WFM residen en schema tenant sin schema hardcodeado.
- [ ] Migracion TypeORM tiene `up` y `down` reversibles.

---

## 3. Gate seguridad

- [ ] Controllers protegidos con JWT y roles.
- [ ] `@Roles()` usa `UserRole.*`, no strings.
- [ ] `TECHNICIAN` y `CONTRACTOR` aplican ownership.
- [ ] No se almacena PII sensible innecesaria del suscriptor.
- [ ] Logs no incluyen secretos ni PII.
- [ ] Zod valida todos los boundaries de entrada.

---

## 4. Gate funcional

- [ ] Crear evento con Work Order ligera.
- [ ] Consultar agenda por dia, semana y mes.
- [ ] Filtrar por tecnico, tipo, estado y rango.
- [ ] Rechazar solapamientos activos por tecnico.
- [ ] Reagendar con motivo obligatorio.
- [ ] Cambiar estado de evento y Work Order.
- [ ] Dashboard muestra hoy, atrasados, proximos y carga por tecnico.

---

## 5. Gate frontend

- [ ] UI visible en `/dashboard/scheduling`.
- [ ] Textos visibles en espanol y sentence case.
- [ ] Enums mapeados a labels de negocio.
- [ ] Tablas con `align-middle` por defecto.
- [ ] No hay landing/hero; primera pantalla es la herramienta operativa.
- [ ] Responsive desktop/mobile sin solapes visibles.

---

## 6. Gate pruebas

- [ ] Unit tests backend de solapamiento.
- [ ] Unit tests backend de transiciones.
- [ ] Tests de ownership tecnico/contratista.
- [ ] Tests de aislamiento tenant.
- [ ] Tests frontend de formulario/filtros/labels.
- [ ] E2E portal crear/reagendar/completar.
- [ ] Typecheck API en verde.
- [ ] Typecheck portal en verde.

---

## 7. Gate salida

- [ ] OpenAPI actualizado.
- [ ] Informe de fase actualizado con comandos ejecutados.
- [ ] Deuda tecnica registrada y clasificada.
- [ ] Sin deuda critica pendiente.
- [ ] Stop/go final documentado.
