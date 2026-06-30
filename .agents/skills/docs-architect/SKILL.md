---
name: docs-architect
description: Documentacion tecnica y funcional para iWana neXt con gobernanza documental, trazabilidad entre artefactos y foco en PRD, HLD, ADR, informes y prompts operativos.
---

# Docs Architect

## Proposito

Usa esta skill cuando la tarea requiera diseñar, estructurar, revisar o consolidar documentacion tecnica o funcional dentro del sistema documental real de iWana neXt.

El foco no es escribir texto largo por defecto. El foco es producir documentos utiles, trazables, gobernados y coherentes con AGENTS.md, las reglas de docs del repo y la cadena PRD → HLD → ADR → planes → informes → prompts.

## Cuando usarla

Activa esta skill para tareas como:

- Crear o actualizar PRDs, HLDs, ADRs, informes o checklists.
- Revisar consistencia entre documentos del mismo modulo o fase.
- Consolidar trazabilidad entre arquitectura, ejecucion y evidencia.
- Corregir estructura, naming o gobernanza documental.
- Diseñar documentacion tecnica que sirva para ejecucion, revision o onboarding.

## Reglas del repo

### 1. La documentacion tiene gobernanza explicita

Todo documento mayor debe respetar:

- titulo claro
- version
- estado
- fecha
- nombre segun convencion del repo cuando aplique

### 2. No inventar artefactos ni contexto

- Si falta un PRD, HLD, ADR o plan, dejalo explicito.
- No rellenes huecos estructurales con supuestos silenciosos.
- Si la decision exige escalacion o aprobacion, documentalo asi.

### 3. Los documentos deben ser ejecutables, no decorativos

- Un PRD debe servir para definir alcance.
- Un HLD debe guiar implementacion.
- Un ADR debe fijar una decision estructural.
- Un informe debe dejar evidencia de lo ejecutado.
- Un prompt debe enlazar artefactos fuente y restricciones reales.

### 4. Markdown y Mermaid como baseline

- Usa Markdown como formato principal.
- Usa Mermaid cuando el diagrama realmente aclare.
- No insertes PII, secretos ni datos sensibles.

## Patrones preferidos

### Estructura documental

- Secciones cortas y con funcion clara.
- Referencias concretas entre documentos.
- Estado documental visible.
- Razonamiento ligado al stack y al modulo real.

### Trazabilidad

Conecta siempre que aplique:

- PRD del sistema o del modulo
- HLD del modulo
- ADRs relacionados
- plan o sprint vigente
- informe vivo o de cierre
- prompt arquitectonico u operativo de origen

### Calidad editorial

- lenguaje tecnico directo
- nada de relleno aspiracional
- decisiones, riesgos y pendientes explicitados
- tablas y listas cuando aporten claridad real

## Checklist de revision

- El documento tiene titulo, version, estado y fecha.
- El nombre sigue la convencion del repo si corresponde.
- Hay trazabilidad con los artefactos fuente relevantes.
- El contenido no contradice AGENTS.md ni ADRs aprobados.
- No hay secretos, PII ni datos sensibles.
- El documento sirve a una decision o ejecucion real.

## Heuristica para revisar documentos

Busca y corrige estas señales:

- documentos sin estado o version
- decisiones sin referencia a fuentes
- texto generico no aterrizado al stack real
- prompts sin enlaces a PRD, HLD o ADRs
- informes duplicados en vez de actualizacion del documento vivo
- diagramas que no representan el sistema aprobado

## Anti-patrones

Evita:

- documentacion larga sin utilidad operativa
- duplicar informes o prompts cuando existe un documento vivo
- cambiar naming o estructura sin respetar la convencion del repo
- describir una arquitectura distinta a la aprobada
- usar documentacion como sustituto de una decision que aun no existe

## Escalacion

Usa [ESCALACION AL CTO] si:

- el documento requiere aprobar un cambio de stack, boundary o seguridad
- hay conflicto entre artefactos fuente y no existe autoridad documental clara
- falta informacion critica que bloquea una salida confiable
