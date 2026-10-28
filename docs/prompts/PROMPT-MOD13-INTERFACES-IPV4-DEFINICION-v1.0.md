# PROMPT — MOD13: definición de interfaces y registro asistido de IPv4

**Versión:** 1.0  
**Estado:** En ejecución — opción B aprobada por el usuario; encargo documental  
**Fecha:** 2026-10-26  
**Emisor:** AI-EM-ARCH, modo Orchestrator  
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md), en revisión; adaptada al alcance documental. Prevalecen AGENTS.md y el protocolo.

## 1. Objetivo y límites de Ola 0

**Autorización registrada el 2026-10-26:** «Apruebo la opción B». Ejecutar esta ola documental sin volver a pedir la misma decisión. Los gates y contratos posteriores conservan sus verificaciones propias.

Formalizar la opción B del [análisis](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md): múltiples interfaces/direcciones por router, alta contextual de red, nombre sugerido, gateway asistido confirmado y exclusiones claras. Preparar adendas PRD/HLD y la revisión de G1. Esta ola no implementa código, contratos runtime, pantallas, migraciones ni cambios de datos.

Fuera: NMS, un tipo «Nodo» en Sedes, reutilizar cobertura como nodo técnico, descubrimiento/escritura RouterOS, credenciales, configurar VLAN/bridges, VRF, solapamientos e IPv6. El botón y las ayudas ya corregidos localmente se conservan.

## 2. Entradas obligatorias

- `AGENTS.md`, bootstrap `.github/copilot-instructions.md`, instrucciones de docs y catálogo de skills.
- Perfil `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`, Parte II, y protocolo multiagente vigente.
- [Plan de orquestación v1.0](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) y análisis v1.0, ambos en revisión.
- [PRD v1.1 aprobado](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md), [HLD v1.1 aprobado](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md), [ADR-044 aprobado](../adrs/ADR-044-Separacion-OrganizationSite-NmsNode.md), [ADR-098 aprobado](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md).
- [Spec UX vigente](../specs/2026-10-22-mod13-aprovisionamiento-ux.md), [informe UI y corrección previa](../informes/INFORME-MOD13-REVISION-UI-v1.0.md), entidades/contratos/servicios actuales.

No existen todavía los contratos nuevos congelados ni el G4 de implementación. Las rutas de salida son destinos por crear; no se citan como entradas existentes.

## 3. Encargo O0-D — `data-eng`

**Responsabilidad exclusiva:** propuesta del modelo y transición de datos; no implementar backend. Leer como documentación las skills `postgresql` y `architect-review`; apoyo `iwana-tenant-migration` al diseñar la secuencia. AGENTS prevalece sobre cualquier consejo genérico de generación automática de migraciones.

Diseñar cardinalidades router→interfaces→direcciones; red→interfaz nullable de transición; distinción `inet` de interfaz y `cidr` del pool; claves tenant/router/interfaz e índices justificados. Definir protección de IP locales, ocupación deduplicada y coordinación de locks con reservas y altas de pools. Especificar migración aditiva, normalización humana del legacy y rollback con datos. Conservar `/16–/30` de pools y tratar `/32` de interfaz por separado.

**Salida:** `docs/specs/2026-10-26-mod13-interfaces-modelo.md`, v1.0 en revisión. **Cierre:** invariantes comprobables, escenarios concurrentes y compatibilidad de redes/servicios existentes; sin tablas o migraciones creadas.

## 4. Encargo O0-U — `prod-ux`

**Responsabilidad exclusiva:** propuesta de flujo y criterios; no código ni tokens nuevos. Leer `brainstorming`, `system-vocabulary-review`, `iwana-identity-ui-review`; apoyo visual según matriz.

Definir alta básica, «Guardar y añadir red», contexto de router/filtro heredado, varias interfaces/redes y nombre de red sugerido editable. Reutilizar IP registradas con origen visible; múltiples candidatas exigen selección; modo manual cuando no sea inferible. Gateway confirmado no cambia por editar una interfaz. Separar sede física/cobertura y protecciones automáticas/exclusiones adicionales. Cubrir errores, recuperación entre etapas, lectura, estado del catálogo y CA-R01–12.

**Salida:** `docs/specs/2026-10-26-mod13-interfaces-ux.md`, v1.0 en revisión. **Cierre:** recorrido viable, vocabulario claro, datos conocidos no repetidos y criterios medibles; no afirmar UX final congelada antes de G1/G2.

## 5. Encargo O0-B — `sr-backend`

**Responsabilidad exclusiva:** factibilidad y contrato preliminar documental. Leer `nestjs-expert`, `architect-review`, `openapi-spec-generation`; apoyo `typescript-expert`/`postgresql` según matriz. Consultar desde el inicio y consolidar después de D/U.

Proponer operaciones/DTO/errores y su compatibilidad con productores/consumidores reales. Resolver PATCH omisión/null/UUID; validación tenant-aware de sede/cobertura por puertos; alcance de asociaciones históricas inactivas; exclusiones válidas dentro del bloque; alternativas de entrada para CIDR/gateway. Describir defensa de IPAM manual/automático/ocupación y conflictos sin reasignación. Estimar complejidad de C/H/M; no escribir todavía `packages/shared` ni OpenAPI productiva.

**Salida:** `docs/specs/2026-10-26-mod13-interfaces-api.md`, v1.0 en revisión. **Cierre:** dictamen viable/viable con ajustes/inviable y compatibilidad explícita; no declarar API congelada con un documento de propuesta.

## 6. Consolidación y restricciones

AI-EM-ARCH consolida las tres propuestas en adendas PRD/HLD, registra divergencias y solicita revisión cruzada de factibilidad/UX o decisión del CTO para G1. No se autofirma el gate. Una propuesta de alterar ADR-044/098 se detiene y se eleva como decisión explícita, sin ejecutarla.

Todos trabajan con propiedad de archivos definida, sin revertir cambios de otras sesiones. Mantener el stack y tenancy aprobados; sin PII real, secretos, datos de relleno, dependencias nuevas ni accesos directos a tablas de otro módulo. Los especialistas auditores revisan; las correcciones futuras pertenecen a SR-FULL/FE-PLATFORM.

## 7. Evidencia y stop/go

Ejecutar `pnpm audit:adr-citations` y `pnpm audit:doc-locations`; comprobar enlaces, rutas existentes/destinos futuros y consistencia de versión. Los tres destinos documentales deben cubrir los seis puntos y CA-R01–12 sin decisiones contradictorias.

Emitir `[BLOQUEO]` si se exige inferir datos legacy, mezclar nodo/sede/cobertura, cambiar un contrato congelado vigente sin versionado o autorizar implementación sin G1–G4. Documentar responsable, alternativas y siguiente paso. **Salida de Ola 0:** documentos revisables y estado real de G1; ninguna escritura productiva. Los prompts posteriores se emiten cuando sus dependencias y aprobaciones existan.
