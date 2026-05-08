# Rediseño visual de Configuración empresarial del portal

**Tipo:** SPEC  
**Módulo:** TRANSVERSAL — Portal empresarial tenant-aware  
**Fase:** Rediseño visual de `/dashboard/settings`  
**Versión:** 1.0  
**Estado:** Listo para planificación  
**Fecha:** 2026-05-07  
**Modo activo:** Mixto + Senior UI Systems Designer  
**Responsable de gobierno:** AI-EM-ARCH

## 1. Contexto

La pantalla [apps/portal/src/app/dashboard/settings/page.tsx](apps/portal/src/app/dashboard/settings/page.tsx) es el centro de configuración empresarial del portal tenant-aware. Hoy resuelve correctamente el flujo funcional, pero su composición visual no acompaña la complejidad real del módulo: el resumen superior, las tabs principales y la pestaña `Marca` conviven con diferentes niveles de densidad, profundidad y criticidad sin una jerarquía clara.

El problema principal no es solo estético. La superficie actual dificulta escaneo, percepción de prioridad y continuidad operativa. La pestaña `Marca` mezcla identidad visual, catálogo, productos adicionales y cobertura geográfica en un único plano de navegación, lo que hace que la pantalla se sienta más como contenedor acumulativo que como centro de control.

## 2. Artefactos fuente

| Tipo | Artefacto | Uso |
|---|---|---|
| Perfil | [docs/roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md) | Baseline visual, alcance del rol y criterios WCAG |
| Skill | [.agents/skills/brainstorming/SKILL.md](../../.agents/skills/brainstorming/SKILL.md) | Método de descubrimiento y validación previa |
| Informe vivo | [docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md](../informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md) | Trazabilidad documental del frente portal/web |
| Referencia portal | [apps/portal/src/components/settings/SettingsClient.tsx](../../apps/portal/src/components/settings/SettingsClient.tsx) | Orquestación actual de la vista |
| Referencia portal | [apps/portal/src/components/settings/BrandingForm.tsx](../../apps/portal/src/components/settings/BrandingForm.tsx) | Superficie más sobrecargada |
| Referencia portal | [apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx](../../apps/portal/src/app/dashboard/crm/expedientes/%5Bid%5D/page.tsx) | Patrón interno de tabs por subdominio |
| Referencia web | [apps/web/src/components/dashboard/TenantsTable.tsx](../../apps/web/src/components/dashboard/TenantsTable.tsx) | Densidad operativa bien resuelta |

## 3. Diagnóstico visual actual

### 3.1 Hallazgos principales

1. La jerarquía entre tabs es plana, aunque el peso funcional de cada dominio no lo es.
2. `Marca` concentra demasiadas responsabilidades sin navegación secundaria explícita.
3. Los formularios usan una gramática visual aceptable, pero con ritmo irregular de espaciado y subsecciones débiles.
4. Los managers densos quedan incrustados en el mismo scroll del branding, lo que rompe orientación y foco de tarea.
5. El overview superior informa, pero aún no opera como panel de salud o centro de decisión del módulo.

### 3.2 Impacto operativo

- Más tiempo para ubicar dónde se configura cada cosa.
- Más scroll para tareas administrativas frecuentes.
- Menor percepción de producto premium y de sistema visual gobernado.
- Riesgo de crecer por acumulación en vez de por estructura.

## 4. Objetivos del rediseño

1. Convertir `/dashboard/settings` en un centro de control claro, legible y escalable.
2. Aumentar jerarquía visual sin introducir complejidad ornamental.
3. Separar mejor dominios de configuración y tareas de alta densidad.
4. Mejorar lectura, escaneo y velocidad operativa en desktop.
5. Mantener comportamiento robusto en tablet y mobile sin depender de scroll horizontal innecesario.
6. Reutilizar patrones existentes del repo siempre que ya estén validados.

## 5. Fuera de alcance

- Cambios de contratos API, DTOs o boundaries.
- Cambios de permisos, multi-tenancy o roles.
- Cambios de stack, librerías UI o arquitectura del portal.
- Reescritura funcional de managers más allá de su reorganización visual.
- Rediseño total del shell de dashboard fuera de los ajustes necesarios para settings.

## 6. Alternativas evaluadas

### Opción A — Configuración progresiva

Mantener las 4 tabs principales y añadir navegación secundaria en los dominios complejos, especialmente en `Marca`, con subsecciones como `Identidad visual`, `Planes`, `Productos` y `Cobertura`.

**Ventajas:**

- Reordena sin romper la estructura mental actual.
- Escala bien para crecimiento futuro.
- Se alinea con patrones de tabs ya presentes en el portal.

**Riesgos:**

- Puede sentirse como tab dentro de tab si no se diseña con suficiente intención jerárquica.

### Opción B — Centro de control lateral

Migrar a una navegación contextual lateral dentro de settings, con rail de secciones y contenido activo a la derecha.

**Ventajas:**

- Sube percepción premium.
- Hace más visible el mapa completo del módulo.

**Riesgos:**

- Más costoso de adaptar a mobile.
- Más alejamiento conceptual del patrón actual.

### Opción C — Hub ejecutivo con secciones profundas

Convertir settings en una portada-resumen con tarjetas de estado y entrada a submódulos o modales de trabajo más profundos.

**Ventajas:**

- Excelente lectura inicial.
- Muy buen framing visual.

**Riesgos:**

- Peor para trabajo continuo multi-sección.
- Puede sentirse más navegacional que operativo.

## 7. Decisión recomendada

Se aprueba una solución híbrida entre **Opción A** y elementos selectivos de **Opción C**.

### Tesis de diseño

`Configuración empresarial` debe sentirse como un centro operativo sobrio: arriba muestra salud y contexto; debajo organiza claramente dominios de configuración; dentro de los dominios complejos ofrece una segunda capa de navegación ligera y explícita.

### Qué implica esta decisión

1. Se mantienen las tabs principales: `General`, `Operación`, `Seguridad`, `Marca`.
2. El bloque superior evoluciona de overview informativo a resumen ejecutivo del módulo.
3. La pestaña `Marca` se divide internamente en subsecciones.
4. Los formularios largos se reagrupan por intención visual.
5. Los managers densos se presentan como superficies operativas independientes, no como apéndices del branding.

## 8. Propuesta de arquitectura visual

## 8.1 Estructura general

```text
PageHeader
Resumen ejecutivo de configuración
Tabs principales
Contenido del dominio activo
  ├─ Formulario principal o panel de seguridad
  └─ Navegación secundaria cuando el dominio lo requiera
```

## 8.2 Zonas de la pantalla

### Zona 1 — Header de módulo

- Mantener `PageHeader` como entrada estándar del portal.
- Subtítulo más ejecutivo y menos descriptivo, orientado a administración continua.
- Espacio para un estado transversal si el módulo requiere alertas críticas.

### Zona 2 — Resumen ejecutivo

Evolución de [apps/portal/src/components/settings/SettingsOverviewPanel.tsx](../../apps/portal/src/components/settings/SettingsOverviewPanel.tsx):

- estado del tenant,
- salud de seguridad,
- estado de branding,
- señales operativas relevantes,
- alertas accionables.

No debe sentirse como hero decorativo. Debe comportarse como panel de lectura rápida para decidir dónde entrar.

### Zona 3 — Navegación primaria

La navegación primaria sigue siendo horizontal, accesible y visible. Debe ganar más jerarquía de selección y más contraste entre activo e inactivo. Los badges no deben competir con la etiqueta principal.

### Zona 4 — Dominio activo

Cada tab activa una sola superficie principal. Dentro de esa superficie, se trabaja por bloques con títulos, microcopy y acciones consistentes.

## 8.3 Rediseño específico de la pestaña Marca

Nueva estructura:

```text
Marca
  ├─ Subnav: Identidad visual | Planes | Productos | Cobertura
  ├─ Panel activo
  │   ├─ Toolbar de contexto
  │   ├─ Contenido principal
  │   └─ Alertas y ayudas específicas del subdominio
```

### Identidad visual

- Reúne el branding actual.
- Se organiza por grupos claros: sello, logo, favicon, fondo de login, naming y metadata.
- Debe mejorar su preview y su sensación de “sistema de marca”, no de lista larga de inputs.

### Planes

- Aísla [apps/portal/src/components/settings/PlanCatalogManager.tsx](../../apps/portal/src/components/settings/PlanCatalogManager.tsx) como superficie densa propia.

### Productos

- Aísla [apps/portal/src/components/settings/AdditionalProductsManager.tsx](../../apps/portal/src/components/settings/AdditionalProductsManager.tsx) y [apps/portal/src/components/settings/AdditionalServicesManager.tsx](../../apps/portal/src/components/settings/AdditionalServicesManager.tsx).

### Cobertura

- Aísla [apps/portal/src/components/settings/CoverageCheckSection.tsx](../../apps/portal/src/components/settings/CoverageCheckSection.tsx), tablas y mapa como dominio de operación geográfica.

## 9. Sistema visual recomendado

## 9.1 Densidad

- Desktop: alta densidad controlada.
- Tablet: densidad media con colapso ordenado.
- Mobile: apilado intencional con foco en una tarea por vez.

## 9.2 Superficies

- Evitar cardificación excesiva.
- Reservar tarjetas para resumen o unidades repetibles.
- Usar paneles más sobrios para trabajo interno.

## 9.3 Jerarquía tipográfica

- Títulos de dominio claros.
- Subtítulos cortos y operativos.
- Labels y microcopy diferenciados por tamaño y peso, no por exceso de color.

## 9.4 Color y estado

- Color como refuerzo, no como único canal.
- Seguridad y alertas con semántica clara.
- `Marca` puede usar un poco más de expresividad visual, pero controlada y subordinada a claridad.

## 9.5 Acciones

- Acción primaria clara por superficie.
- Toolbars consistentes en managers.
- Acciones destructivas separadas del flujo de guardado.

## 10. Responsive

### Desktop

- Vista principal optimizada para trabajo repetido.
- Managers con toolbars claras y tablas compactas.

### Tablet

- Tabs y subtabs deben seguir siendo legibles sin saturación.
- El overview debe colapsar a 2 columnas o stack controlado.

### Mobile

- Una sección principal visible a la vez.
- Subnavegación de `Marca` debe comportarse como pills scrollables o stack selectable.
- Evitar depender de tablas completas; priorizar vista resumida y drill-down cuando sea necesario.

## 11. Accesibilidad

1. Foco visible consistente en tabs, subtabs, botones y acciones de tabla.
2. Contraste AA en copy, controles y badges.
3. Navegación por teclado en tabs y subtabs.
4. El overview no puede depender solo del color para expresar salud o alerta.
5. Las superficies densas deben conservar orden de lectura claro para screen readers.

## 12. Componentes a crear o refactorizar

### Crear

- `SettingsSubTabs.tsx`
- `SettingsSectionPanel.tsx`
- `SettingsStatusSummary.tsx` o equivalente si el overview se divide
- `settings-branding-navigation.ts` o constante equivalente

### Refactorizar

- [apps/portal/src/components/settings/SettingsClient.tsx](../../apps/portal/src/components/settings/SettingsClient.tsx)
- [apps/portal/src/components/settings/SettingsOverviewPanel.tsx](../../apps/portal/src/components/settings/SettingsOverviewPanel.tsx)
- [apps/portal/src/components/settings/BrandingForm.tsx](../../apps/portal/src/components/settings/BrandingForm.tsx)
- managers de settings según subsección activa

## 13. Criterios de aceptación visual

| ID | Criterio |
|---|---|
| CA-SET-UI-01 | La pantalla permite identificar en menos de un viewport qué áreas de configuración existen y cuál requiere atención. |
| CA-SET-UI-02 | La pestaña `Marca` deja de mezclar branding, catálogo, productos y cobertura en una misma superficie continua. |
| CA-SET-UI-03 | El overview superior funciona como resumen ejecutivo y no como bloque decorativo. |
| CA-SET-UI-04 | Formularios y managers usan una jerarquía visual consistente y más escaneable. |
| CA-SET-UI-05 | Desktop mejora velocidad operativa sin degradar tablet y mobile. |
| CA-SET-UI-06 | La solución cumple WCAG 2.2 AA en foco y contraste. |

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La subnavegación agregue complejidad visual | Diseñar subtabs compactas y subordinadas a la navegación principal |
| El refactor de `BrandingForm` se vuelva demasiado grande | Separar por secciones y usar componentes puente antes de mover lógica |
| Mobile pierda usabilidad en managers densos | Definir colapso específico y no depender del layout desktop |

## 15. Resultado esperado

Al cerrar esta fase, `/dashboard/settings` debe sentirse como una pantalla de configuración SaaS madura: clara, ordenada, premium, operativa y lista para crecer sin degradarse por acumulación.