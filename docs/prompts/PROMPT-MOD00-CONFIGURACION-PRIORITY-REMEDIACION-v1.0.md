# PROMPT - MOD00 prioridad dinámica y remediación del hub

**Versión:** 1.0
**Estado:** Aprobado para ejecución
**Fecha:** 2026-08-15
**Módulo:** MOD00 Configuración Control Plane
**Fase:** Correctiva — prioridad dinámica y alineación UI del hub
**Generado por:** AI-EM-ARCH

## 1. Fuentes obligatorias

- `AGENTS.md`
- `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/specs/2026-05-30-mod00-settings-hub-redesign-design.md`
- `docs/specs/2026-08-15-mod00-settings-priority-dynamic-design.md`
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## 2. Encargo

Implementar el read-model `GET /api/v1/configuration/settings-priority` y alinear el hub `/dashboard/settings` con la spec dinámica. El endpoint debe usar puertos tipados de Tenant, Users y Organization, mantener aislamiento por schema y no importar servicios, entidades ni tablas de otros módulos.

## 3. Responsabilidades

- **AI-SR-FULL:** enums/DTO compartidos, puertos, evaluator puro, adapters, controller, OpenAPI y pruebas backend.
- **AI-FE-PLATFORM:** consumo tipado, estados, copy, primitives `@iwana/ui`, contraste, foco, responsive y pruebas portal.
- **AI-SR-QA:** mock contractual de auditoría, E2E de prioridad y navegación, axe, cobertura y reporte de evidencia.
- **AI-DS-OWNER:** revisión del diff visual; no crear tokens ni primitivas nuevas.
- **AI-EM-ARCH:** validar boundaries, contrato congelado, gates G2–G6 y actualización documental.

## 4. Reglas no negociables

- No inferir prioridad desde el registry ni mostrar un CTA sin permiso.
- No devolver títulos, descripciones, cantidades, PII o mensajes de excepción desde API.
- No aceptar tenant/schema desde cliente.
- No migraciones, caché, dependencias nuevas ni acceso cross-module.
- Copy visible en español, sentence case y vocabulario canónico.
- CTA y reintento ≥44 px con foco visible; dark mode AA.
- Las capacidades futuras siguen no accionables y subordinadas.

## 5. Verificación y stop/go

Ejecutar pruebas unitarias backend/portal, typecheck, lint focalizado, cobertura del núcleo, E2E portal autenticado y axe en mobile/tablet/desktop. Detenerse y escalar si el contrato exige acceso directo a tablas ajenas, si falla el aislamiento tenant o si una prueba crítica permanece roja.

El cierre requiere informe vivo actualizado, evidencia visual vigente y todos los criterios de `docs/specs/2026-08-15-mod00-settings-priority-dynamic-design.md` satisfechos.
