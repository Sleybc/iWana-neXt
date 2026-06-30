# CHECKLIST - MOD00 Configuracion Fase 05

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-21  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 05 - Unificacion visible de sedes WFM  
**Plan:** docs/plans/2026-05-21-mod00-configuracion-fase-05-unificacion-sedes.md  
**Prompt:** docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-05-v1.0.md

---

## 1. Stop/go inicial

- [x] ADR-040 revisado.
- [x] Fase 02 WFM integration previa existe.
- [x] No se eliminaran tablas legacy en esta fase.
- [x] La UX objetivo evita duplicar sedes visibles.

## 2. Backend

- [ ] `dispatch-sites` o contratos equivalentes exponen mapping suficiente para portal.
- [ ] Horario por sede acepta ruta nativa basada en `organizationSiteId` o compatibilidad documentada equivalente.
- [ ] Overrides y blackouts aceptan `organizationSiteId` o compatibilidad equivalente validada.
- [ ] Los tests HTTP/Jest de WFM cubren la transicion.

## 3. Frontend

- [ ] `WfmOperatingHoursManager` no renderiza CRUD visible de `Sedes operativas`.
- [ ] Los selectores visibles usan sedes empresariales.
- [ ] Estados para sedes sin bridge operativo son claros y no bloquean toda la pantalla.
- [ ] No quedan labels finales que sugieran dos conceptos de sede al usuario.

## 4. Calidad y seguridad

- [ ] Sin acceso directo a tablas de otro modulo.
- [ ] Sin hardcode de tenant/schema.
- [ ] Sin PII ni secretos en logs, tests o docs.
- [ ] Compatibilidad legacy documentada y acotada.

## 5. Validacion final

- [ ] Jest backend WFM en verde.
- [ ] Jest portal settings/WFM en verde.
- [ ] Playwright portal field operations en verde.
- [ ] Informe MOD00 actualizado.
