# PROMPT — MOD13: ejecución integral de interfaces e IPv4

**Versión:** 1.0  
**Estado:** Emitido — opción B aprobada; habilitación técnica por etapas  
**Fecha:** 2026-10-26  
**Emisor:** AI-EM-ARCH, modo Orchestrator  
**Autorización humana:** «Apruebo la opción B». No volver a solicitar esa misma decisión.  
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md), en revisión; prevalece AGENTS.md.

## 1. Objetivo

Ejecutar la opción B hasta entregar interfaces/direcciones por router, registro contextual de redes y protección IPAM verificados. El padre opera como AI-EM-ARCH: define, revisa y delega código a sus dueños; no implementa código productivo por sí mismo.

Completar definiciones pendientes, resolver sus gates, publicar/congelar contratos reales, delegar backend/frontend y verificar la integración. No detenerse en otro plan cuando el siguiente bloque ya esté autorizado y habilitado. No sustituir la solución por ayudas de texto.

Este encargo integral no declara G1–G4 cerrados ni contratos nuevos congelados por su sola emisión. La habilitación de cada etapa debe registrarse con sus artefactos y revisores. La aprobación de B resuelve la elección de alcance, sin suprimir controles de arquitectura o calidad.

## 2. Entradas y estado real

**Continuidad:** las líneas de estado de esta versión son la fotografía de su emisión. Para retomar, prevalecen el plan de orquestación y el informe vivo más recientes. En su corte inicial, AI-EM-ARCH había cerrado G1–G3 y habilitado O2-C. El estado actual —O2-C parcial y G4 bloqueado— está en el plan v1.6, el informe §8.2 y el launcher vigente v1.2. No reabrir aprobaciones o gates ya cerrados.

Leer AGENTS.md, bootstrap, instrucciones por path, perfil `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md` Parte II, protocolo y catálogo de skills.

Entradas del trabajo:

- [Análisis y aprobación de B](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md).
- [Plan y matriz de dispatch](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md).
- [Adenda PRD v1.0, en revisión](../prds/PRD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.0.md).
- Borradores v1.0 en revisión: [modelo](../specs/2026-10-26-mod13-interfaces-modelo.md), [UX](../specs/2026-10-26-mod13-interfaces-ux.md), [API](../specs/2026-10-26-mod13-interfaces-api.md).
- [PRD Fase 01 v1.1 aprobado](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md), [HLD Fase 01 v1.1 aprobado](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md), [ADR-044 aprobado](../adrs/ADR-044-Separacion-OrganizationSite-NmsNode.md), [ADR-098 aprobado](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md).

Ya existen la corrección local del botón/ayudas, la aprobación humana de B, la adenda PRD y borradores de modelo/UX/API. No rehacerlos desde cero. Las sesiones autoras de O0 se interrumpieron antes de cerrar sus dictámenes: su existencia no demuestra revisión cruzada ni freeze.

**Pendientes al emitir v1.0 (histórico):** consolidación de borradores, adenda HLD, contrato DS, factibilidad frontend y G1–G3. Esa definición ya se completó. Continúan pendientes publicación runtime/freeze, implementación y pruebas; HLD/DS vigentes se citan desde el plan actual.

## 3. Definición y habilitación

Usar el subagente canónico y su perfil. Cada bloque lee antes de actuar sus SKILL.md como documentación; apoyos condicionales y descartes son los de la matriz del plan. Verificar DoR y emitir `[BLOQUEO]` si falta una entrada que su dueño no pueda producir; no inventar un contrato o dictamen.

| Bloque / responsable único | Encargo y salida                                                                                   | Skills obligatorias                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| O0-D · `data-eng`          | Revisar/cerrar su spec de modelo: claves, índices, locks, transición y rollback                    | `postgresql`, `architect-review`                                            |
| O0-U · `prod-ux`           | Revisar/cerrar su spec UX y CA; continuidad, sugerencias, errores, contexto                        | `brainstorming`, `system-vocabulary-review`, `iwana-identity-ui-review`     |
| O0-B · `sr-backend`        | Consolidar spec API tras D/U; compatibilidad, errores y factibilidad                               | `nestjs-expert`, `architect-review`, `openapi-spec-generation`              |
| O1-DS · `ds-owner`         | Producir `docs/specs/2026-10-26-mod13-interfaces-ds.md` con componentes existentes, estados y a11y | `core-components`, `iwana-identity-ui-review`, `system-vocabulary-review`   |
| O1-F · `fe-platform`       | Factibilidad frontend y costos por bloque en la ruta definida por el plan                          | `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `architect-review` |
| O1-S · `sec-eng`           | Revisión de tenancy, referencias, transacciones y rollback; sin corregir código                    | `security-auditor`, `backend-security-coder`                                |
| O1-Q · `sr-qa`             | Matriz CA→prueba y estrategia de integración, visual y a11y                                        | `testing-patterns`, `e2e-testing-patterns`                                  |

D/U trabajan en paralelo; B consulta desde el inicio y consolida después. AI-EM-ARCH produce `docs/hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.0.md` y alinea PRD/HLD. Registrar G1 con la decisión humana ya otorgada y la revisión independiente de los documentos; resolver G2/G3 con UX/DS y factibilidad backend/frontend. No pedir de nuevo aprobación de B.

## 4. Publicación, congelación e implementación

Tras G1–G3 autorizar O2-C: SR-FULL publica Zod/tipos/DTO/OpenAPI y pruebas compatibles en las superficies reales del repositorio, sin activar todavía el comportamiento nuevo. Leer `openapi-spec-generation`, `typescript-expert` y `nestjs-expert`.

Luego AI-EM-ARCH registra habilitación G4 en el informe vivo citando esta sección, UX/DS y los contratos runtime realmente publicados por ruta/versión. No considerar congelado un API descrito solo en Markdown. Un cambio posterior exige re-sync registrado de tracks afectados.

- **O2-H, sr-backend:** puertos Organización/cobertura; validación de referencias, PATCH nullable, exclusiones y compatibilidad histórica. Skills: `nestjs-expert`, `backend-security-coder`, `test-driven-development`.
- **O2-M, sr-backend:** entidades, migración tenant manual numerada al ejecutar y registrada en runner, índices, estado, IPAM manual/automático/ocupación y concurrencia. Skills: `postgresql`, `iwana-tenant-migration`, `test-driven-development`.
- **O2-FE, fe-platform:** interfaces/direcciones en el contexto de router; continuidad router→red, datos derivados, modo manual y exclusiones claras. Skills: `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review`.

H→M es secuencial por compartir archivos backend/contratos. FE avanza en paralelo contra mocks derivados de los tipos congelados y se integra después de M. Cada agente tiene propiedad exclusiva de su superficie; nadie revierte cambios ajenos ni inventa tipos paralelos.

## 5. Reglas obligatorias de la solución

1. Varias interfaces por router; cero o varias direcciones/redes por interfaz. No imponer unicidad global de IP local que impida declarar una IP virtual en más de un router: IPAM deduplica por host. No introducir VRF ni pools solapados.
2. Sede física, nodo técnico y cobertura separados según ADR-044. Sin tipo/capacidad Nodo en Organización, NMS, descubrimiento/escritura RouterOS, credenciales ni configuración VLAN/bridges. Consultas entre módulos por puertos, nunca tablas ajenas.
3. Guardar router una vez y conservar su ID al añadir red; fallo posterior no duplica equipo. Heredar filtro/contexto y sugerir nombre editable.
4. Fuentes inequívocas: dirección registrada, entrada rápida IP del gateway/prefijo o bloque/gateway separados. La entrada rápida no crea infraestructura implícita. Mostrar origen, elegir entre candidatas y confirmar; nunca asumir .1, IP de gestión o pool mayor desde /32.
5. Gateway confirmado es snapshot sin FK viva a dirección ni cambios en cascada. CIDR/gateway de redes existentes conservan inmutabilidad. Direcciones de interfaz admiten /32; pools conservan /16–/30.
6. Proteger todas las IP locales declaradas del tenant dentro del bloque, también de otros routers o interfaces inactivas. Misma disponibilidad deduplicada en validación manual, reserva automática y ocupación; no mezclarlas silenciosamente con exclusiones manuales.
7. Alta/cambio de IP local frente a reserva/servicio vivo: conflicto atómico, sin reasignar ni liberar. Coordinar locks catálogo→pools ordenados→filas y cubrir carreras con reservas/alta de pool.
8. Interfaz inactiva bloquea nuevas asociaciones/reservas vinculadas y conserva servicios/protecciones. Sin borrado físico de referencias en este corte. Cambio host/prefijo explícito/versionado; rechazar si altera coherencia del gateway confirmado de una red vinculada.
9. PATCH: omisión conserva, null desasocia, UUID valida y asigna. Referencias históricas inactivas siguen legibles sin exigir sustitución para editar otro campo; asociación nueva exige destino activo. ID ajeno/inexistente no revela diferencia pública.
10. Migración aditiva y legacy intacto; no inferir interfaces/gateways desde texto ni cambiar redes/servicios existentes. Backend protector antes de captura UI. Rollback conserva protección o suspende reservas nuevas hasta reconciliarla; no basta mantener tablas.
11. Tenant autenticado, SET LOCAL por transacción, permisos/versiones/auditoría y Zod/DTO/OpenAPI coherentes. Sin PII real, secretos o dependencias nuevas. Conservar el botón corregido y distinguir estado del catálogo de encendido/telemetría.

## 6. Validación y entregables

SR-QA verifica CA-R01–CA-R12 y aprovisionamiento vigente; SEC-ENG revalida seguridad; PROD-UX/DS-OWNER verifican flujo/contrato. Auditores reportan; SR-FULL/FE-PLATFORM corrigen su superficie. Ejecutar comandos del plan, no sustituirlos por autodeclaraciones.

Inventariar pruebas, ejecutar sin caché y reportar conteos reales/cobertura core ≥80 %. PostgreSQL real con migraciones, además de fixtures simplificados. Mantener 20 reservas concurrentes distintas; probar carreras IP local↔reserva en ambos órdenes e IP local↔alta pool con barreras/locks, no sleeps. Cubrir tenancy, estados, IP virtual/manual, /32, ocupación deduplicada, exclusiones y compatibilidad legacy.

Probar up/down/up aislado y recuperación con datos poblados sin borrar información real. E2E usa `e2e/playwright.portal.config.ts`; visual 375/768/1280 claro/oscuro y WCAG 2.2 AA. Ejecutar lint/typecheck, OpenAPI, auditoría UI, citas y ubicaciones. Revisores auxiliares de boundaries/contratos/gates no sustituyen pruebas.

Entregar adendas/specs coherentes, contratos publicados, código, migración y pruebas; actualizar informe vivo `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md`, informes especializados y plan con rutas, decisiones, gates/evidencia y deuda. Entregar cada launcher como bloque completo además de archivarlo.

## 7. Stop/go

Parar el bloque afectado ante pérdida de aislamiento, inferencia de legacy, cambio de ADR/boundary, contrato incompatible o protección IPAM incompleta. Registrar `[BLOQUEO]`, `[CONSULTA]` o `[DESEMPATE]` con causa, dueño y próximo paso; continuar lo independiente autorizado.

Si un experto no está disponible, registrar esa revisión como pendiente; no atribuirle un dictamen no emitido. No pedir nuevamente aprobación de B: intervención humana solo ante decisión nueva fuera de alcance o excepción reservada al CTO.

## 8. Cierre

Entregar comportamiento implementado y verificado, no otro plan como sustituto. Separar G6 de calidad, G6.5 de CI Linux por SHA y G7 productivo; no reutilizar evidencia previa como validación de esta evolución. Si existe bloqueo externo, informar lo terminado y pendiente sin marcar completa la implementación. Esta ejecución no sustituye aprobación productiva.
