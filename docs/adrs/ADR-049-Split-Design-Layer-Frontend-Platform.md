# ADR-049: Split del Design Layer y extracción de Frontend Platform Engineer

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-10
**Modo activo:** Architect + Orchestrator
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano (2026-07-10)

---

## Contexto

La iniciativa de modernización frontend (design system iWana, simplificación UX, escalabilidad de la arquitectura de UI) expuso tres problemas estructurales en el ecosistema de perfiles IA vigente (6 roles + [Protocolo v1.0](../roles/Protocolo_Colaboracion_Multiagente_v1.md)), documentados en [INFORME-ROLES-REFACTOR-FRONTEND-v2.0.md](../informes/INFORME-ROLES-REFACTOR-FRONTEND-v2.0.md):

1. **`AI-SR-UI-SYS` sobrecargado:** un solo rol cargaba UX research + product design + arquitectura del design system + auditoría de UI. Solapamiento interno y ownership difuso.
2. **Sin dueño del código del design system:** `@iwana/ui` (tokens, primitives, build, DRY) lo escribía `AI-SR-FULL` junto a features → deriva a duplicación de UI y estilos aislados.
3. **Cuello de botella de serialización:** todo cambio de UI pasaba por el gate único de `AI-EM-ARCH` (workflow de 7 etapas), incluso cambios de bajo riesgo (componente/token/estado).

El CTO aprobó el split propuesto en el informe. Este ADR lo formaliza. Las directrices de optimización fijadas fueron: **reducir solapamiento, aumentar autonomía por rol y maximizar ejecución en paralelo**.

## Decisión

**Definición canónica — "Estrella Polar" (fuente de verdad de UI).** No es un archivo único con ese nombre; es el **alias operativo del conjunto** formado por:

- **`docs/identity/`** — contrato de marca y design system: tokens, colores (azul noche `#17163A`, lima `#A5C330`), tipografía (Exo 2), anatomía de componentes y estados (`Manual de Identidad Iwana.pdf` + `Manual_Implementacion_Identidad_Iwana.md`).
- **`docs/prototipo/`** — prototipo HTML validado: composición, shell, layout (kit TailAdmin + prototipos propios de iWana).

Ambos gobernados por [ADR-023](ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) y con tokens vivos en `packages/ui`. Cuando cualquier perfil cita "Estrella Polar", se refiere a este conjunto. Reparto de dominio: `docs/identity/` es el **contrato** (dueño AI-DS-OWNER); `docs/prototipo/` es la **composición** (interpreta AI-PROD-UX).

Sobre esa base se adopta la siguiente reestructuración del ecosistema de perfiles IA:

1. **División de `AI-SR-UI-SYS`** (Design Layer) en dos roles autónomos:
   - [`AI-PROD-UX`](../roles/Perfil_IA_Product_Designer_UX_v1.md) — Product Designer / UX: dueño del **"qué" y el flujo** (journeys, user flows, simplificación UX, arquitectura de información).
   - [`AI-DS-OWNER`](../roles/Perfil_IA_Design_System_Owner_v1.md) — Design System Owner: dueño del **"con qué"** (contrato del design system: tokens + API de componentes + estados requeridos).

2. **Extracción del frontend de `AI-SR-FULL`** a un rol nuevo:
   - [`AI-FE-PLATFORM`](../roles/Perfil_IA_Frontend_Platform_Engineer_v1.md) — Frontend Platform Engineer: dueño del **"cómo"** (código de `@iwana/ui` + app-shells de `apps/web`/`apps/portal`, DRY, rendimiento).
   - `AI-SR-FULL` conserva el backend y provee el **contrato de API tipado** que el frontend consume.

3. **Extensión de `AI-SR-QA`** a QA / Auditor: añade regresión visual, auditoría de fidelidad al prototipo validado (ADR-023) y accesibilidad automatizada (WCAG 2.2 AA) como gates.

4. **Carril rápido de UI:** `AI-EM-ARCH` **delega en `AI-DS-OWNER`** la aprobación de cambios de componente/token/estado que **no** alteran alcance, contrato de datos, boundary ni tokens de marca. EM-ARCH solo interviene cuando sí se alteran. Los tokens de marca y el lenguaje visual global siguen siendo competencia del CTO.

5. **Modelo de ejecución paralela (contract-first):** la implementación se paraleliza en tracks (UX, design-system, frontend, backend, QA) que corren contra **contratos congelados** (contrato de componente de DS-OWNER; contrato de API de SR-FULL), no contra trabajo terminado. Formalizado en [Protocolo v1.1 §3bis](../roles/Protocolo_Colaboracion_Multiagente_v1.md).

6. **`AI-DATA-ENG`** se marca **on-demand** para esta iniciativa y se realinea al baseline (retiro del stack fuera de ADR).

Separación de responsabilidades de la cadena de UI (regla anti-solapamiento):
**qué/flujo** = PROD-UX · **con qué/contrato** = DS-OWNER · **cómo/código** = FE-PLATFORM · **datos/servidor** = SR-FULL · **verifica** = SR-QA.

## Alcance de la decisión

### Incluye
- Emisión de los perfiles `AI-PROD-UX`, `AI-DS-OWNER`, `AI-FE-PLATFORM` (v1) bajo `docs/roles/`.
- Actualización del Protocolo de Colaboración a v1.1 (estructura, RACI de 9 columnas, red de consulta, §3bis ejecución paralela, carril rápido).
- Marca de sucesión en `AI-SR-UI-SYS` v2 (dividido) y `AI-SR-FULL` v2 (frontend extraído).
- Extensión de `AI-SR-QA` y realineación de `AI-DATA-ENG`.

### No incluye
- Cambio de stack frontend: se mantiene Next.js App Router + Tailwind v4 + shadcn/ui + `packages/ui` ([ADR-023](ADR-023-Referencia-TailAdmin-Shell-Dashboard.md)).
- Cambio de tokens de marca (azul noche `#17163A`, lima `#A5C330`) — competencia del CTO.
- Cambios de boundary del Modulith backend ni de multi-tenancy.
- Contratación real: los roles son perfiles de agente IA, no headcount humano.

## Consecuencias

### Positivas
- Ownership único por eslabón (experiencia / contrato / código / verificación): elimina el solapamiento de `AI-SR-UI-SYS`.
- Dueño explícito del código del design system → base para erradicar la duplicación de UI (DRY).
- Mayor autonomía: cada rol decide dentro de su contrato sin gate; el carril rápido quita el cuello de botella de UI de bajo riesgo.
- Ejecución paralela real por tracks contra contratos → menor tiempo de entrega sin romper boundaries.

### Negativas / Riesgos
- Más roles = más handoffs; se mitiga con contratos congelados y artefactos localizables (no acuerdos verbales).
- Riesgo de que un contrato mal definido bloquee dos tracks; se mitiga congelándolo temprano y versionando los cambios vía EM-ARCH.
- Deuda de migración: los perfiles v2 quedan como referencia histórica; hay que evitar que se activen por error (mitigado con la marca de sucesión).

## Criterios de revisión

Esta decisión se revisará si: el volumen de trabajo de UI no justifica un rol frontend dedicado (se replegaría FE-PLATFORM en SR-FULL), o si el overhead de coordinación entre PROD-UX y DS-OWNER supera el beneficio de la separación (se reunificarían).

## Referencias

- [INFORME-ROLES-REFACTOR-FRONTEND-v2.0.md](../informes/INFORME-ROLES-REFACTOR-FRONTEND-v2.0.md)
- [Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md) (v1.1)
- [ADR-021](ADR-021-Perfil-Unificado-EM-Architect.md), [ADR-023](ADR-023-Referencia-TailAdmin-Shell-Dashboard.md)
- Perfiles nuevos: [AI-PROD-UX](../roles/Perfil_IA_Product_Designer_UX_v1.md), [AI-DS-OWNER](../roles/Perfil_IA_Design_System_Owner_v1.md), [AI-FE-PLATFORM](../roles/Perfil_IA_Frontend_Platform_Engineer_v1.md)

---

## Estado de aprobación

**Aprobado por el CTO Humano el 2026-07-10.** Quedan vigentes: los perfiles `AI-PROD-UX`, `AI-DS-OWNER`, `AI-FE-PLATFORM`, los `AI-EM-ARCH` / `AI-SR-FULL` v2 y el Protocolo v1.1. Los perfiles superados (`AI-SR-UI-SYS` v1/v2, `AI-SR-FULL` v1, `AI-EM-ARCH` v1, Engineering Manager Senior v1 y Lead Software Architect Senior v1) pasan a **archivo histórico** en `docs/roles/_historico/`; sus referencias se migran a esa ruta o al perfil sucesor.
