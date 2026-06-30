# Informe de auditoria UI/UX del submodulo Marca

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-05-28

## 1. Objetivo

Evaluar la calidad UI/UX del submodulo Marca del portal empresarial en la ruta `/dashboard/settings/branding`, con foco en jerarquia visual, claridad operativa, consistencia con la identidad iWana, accesibilidad visible y cobertura de validacion.

## 2. Alcance y evidencia

La auditoria se ejecuto sobre la implementacion actual del portal y sus pruebas asociadas. Las fuentes principales fueron:

- [Pagina del submodulo](../../apps/portal/src/app/dashboard/settings/branding/page.tsx)
- [Orquestador de la vista](../../apps/portal/src/components/settings/BrandingSettingsClient.tsx)
- [Formulario principal](../../apps/portal/src/components/settings/BrandingForm.tsx)
- [Patron de panel de settings](../../apps/portal/src/components/settings/SettingsSectionPanel.tsx)
- [Primitives compartidas del portal](../../apps/portal/src/components/shared/portal-ui.tsx)
- [Preview de sello del tenant](../../apps/portal/src/components/layout/TenantSeal.tsx)
- [Reglas de validacion de branding](../../apps/portal/src/lib/branding-validation.ts)
- [Formulario de login](../../apps/portal/src/components/auth/LoginForm.tsx)
- [Experiencia de login](../../apps/portal/src/components/auth/LoginExperience.tsx)

Verificacion ejecutable realizada:

- `runTests` sobre [BrandingForm.spec.tsx](../../apps/portal/src/components/settings/BrandingForm.spec.tsx) y [branding-validation.spec.ts](../../apps/portal/src/lib/branding-validation.spec.ts): 9 pruebas en verde.
- `runTests` sobre [LoginExperience.spec.tsx](../../apps/portal/src/components/auth/LoginExperience.spec.tsx): 4 pruebas en verde.
- Playwright focalizado sobre [portal-login-branding.spec.ts](../../e2e/tests/portal-login-branding.spec.ts): 2 fallos reproducibles.

## 3. Hallazgos priorizados

### Criticos

#### 3.1 Sobrecarga cognitiva en la seccion de activos visuales

La seccion de activos presenta una grilla plana de ocho tarjetas visualmente equivalentes, sin un agrupador fuerte por tipo de activo. El problema nace en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L568) y se materializa en la grilla [grid-cols-1/xl:grid-cols-2](../../apps/portal/src/components/settings/BrandingForm.tsx#L575).

Impacto:

- El usuario debe reconstruir mentalmente la relacion entre uso (`sello`, `logo`, `favicon`, `fondo`) y variante (`clara`, `oscura`).
- La pantalla prioriza repeticion de cards por encima de agrupacion semantica.
- En mobile, el costo de scroll crece mucho para una sola tarea de marca.

Recomendacion:

- Reagrupar por tipo de activo con cuatro bloques principales y dos subvariantes por bloque.
- Mantener la descripcion y reglas al nivel del grupo, no repetidas ocho veces.

#### 3.2 La via alternativa por URL queda escondida y debilita el flujo

La opcion de pegar una URL HTTPS esta oculta dentro de un `details` en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L678). Aunque tecnicamente existe, desde UX queda como una ruta secundaria poco visible para una operacion que puede ser frecuente en entornos empresariales.

Impacto:

- Baja descubribilidad de una accion valida del sistema.
- La pantalla transmite que el camino principal es siempre subir archivo, aunque el modulo acepta URLs externas.
- En teclado y lector de pantalla el patron pierde claridad adicional.

Recomendacion:

- Mostrar ambas rutas de entrada de forma explicita: `Subir archivo` o `Usar URL HTTPS`.
- Si se mantiene un colapsable, debe tener affordance mas fuerte y mover foco al input al expandirse.

#### 3.3 Accion destructiva sin confirmacion previa

La accion `Restaurar base` se expone como boton directo en el toolbar de [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L543) y ejecuta el reseteo sin una confirmacion intermedia visible.

Impacto:

- Riesgo de perdida accidental de activos y metadata.
- El estado `loading` no sustituye la necesidad de confirmacion cuando la accion es destructiva.

Recomendacion:

- Interponer un dialogo de confirmacion con resumen claro de impacto.
- Separar visualmente esta accion del CTA primario de guardado.

### Altos

#### 3.4 El preview esta desacoplado de la edicion y reduce el feedback inmediato

La vista previa arranca en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L722) como un bloque separado del area de edicion. El texto explicativo en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L725) dice que el portal refleja los cambios, pero el layout no conecta de forma fuerte la causa con el efecto.

Impacto:

- El usuario edita arriba y verifica abajo, con una relacion visual debil.
- La pantalla no aprovecha el preview como refuerzo de confianza operativa.

Recomendacion:

- Llevar el preview a una columna sticky en desktop.
- O integrar micro-previews junto a cada grupo de activo.

#### 3.5 El copy operativo es correcto, pero aun ambiguo en el flujo real

Hay copy util en `Fuente actual` [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L604), `Reglas` [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L660) y el bloque de preview [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L725), pero no deja completamente claro que cambia al subir un activo, que cambia al guardar el formulario y que se conserva si una URL queda vacia.

Impacto:

- Confusion sobre el orden de aplicacion de cambios.
- Menor confianza en el resultado cuando se combinan upload, URL y metadata.

Recomendacion:

- Explicitar el ciclo de vida por slot: `sube o pega URL`, `guarda si cambias metadata o URLs`, `el preview muestra el resultado esperado`.
- Simplificar expresiones como `en caliente` por lenguaje mas operable.

#### 3.6 La capa base ya soporta accesibilidad, pero el formulario no la extiende de forma completa

El sistema ya incluye `aria-live` en [PortalAlert](../../apps/portal/src/components/shared/portal-ui.tsx#L227) y `aria-describedby` en [Input](../../packages/ui/src/components/Input.tsx#L83), pero el flujo de branding deja huecos en la operacion de archivos y estados transitorios:

- Overlay de `Subiendo...` sin anuncio accesible dedicado en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L637).
- Input de archivo oculto sin nombre accesible explicito en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L643).
- Reglas del slot visibles, pero no enlazadas semanticamente al control en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L660).
- Checkbox de visibilidad bien presentado, pero sin `htmlFor` explicito porque usa `label` contenedor, lo cual es valido pero deja menos margen para evolucionar el patron en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L779).

Impacto:

- La experiencia accesible queda por debajo de lo que la base del portal ya permite.
- El mayor riesgo esta en usuarios de lector de pantalla y en feedback de estados dinamicos.

Recomendacion:

- Añadir nombres accesibles y `aria-describedby` dedicados para file inputs.
- Anunciar progreso y resultado de uploads con una region viva adicional.

#### 3.7 La consistencia de marca en login tiene una desalineacion entre experiencia y automatizacion

La experiencia publica de login obtiene branding usando `tenantSlugCommitted` en [LoginExperience](../../apps/portal/src/components/auth/LoginExperience.tsx#L72) y consulta branding con debounce de 350 ms en [LoginExperience](../../apps/portal/src/components/auth/LoginExperience.tsx#L118) y [LoginExperience](../../apps/portal/src/components/auth/LoginExperience.tsx#L138). El commit del slug ocurre en `onBlur` en [LoginForm](../../apps/portal/src/components/auth/LoginForm.tsx#L126).

Hallazgo observable:

- El Playwright focalizado sobre [portal-login-branding.spec.ts](../../e2e/tests/portal-login-branding.spec.ts) falla porque espera lookup luego de `fill()` sin blur.
- El unit test vigente en [LoginExperience.spec.tsx](../../apps/portal/src/components/auth/LoginExperience.spec.tsx#L112) confirma que el comportamiento esperado hoy es consultar branding al confirmar el slug, no mientras se escribe.

Impacto:

- No es una regresion funcional evidente del producto, pero si una desalineacion importante entre test E2E y comportamiento real.
- Desde UX, la marca publica no responde mientras el usuario escribe; responde cuando sale del campo.

Recomendacion:

- Decidir explicitamente si el comportamiento deseado es `al escribir` o `al confirmar`.
- Ajustar el E2E al comportamiento vigente o redisenar la experiencia si se quiere feedback mas inmediato.

### Medios

#### 3.8 La seccion de metadata queda mas densa y menos jerarquizada que la de activos

La seccion `Nombres e identidad` arranca en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L800) y termina con una previsualizacion textual compacta en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L861). El ritmo visual ahi es notablemente mas apretado que en la seccion de activos.

Impacto:

- La pantalla cambia de densidad de forma brusca.
- La metadata pierde protagonismo pese a definir titulo, descripcion y superficie publica.

Recomendacion:

- Dar mas separacion entre inputs y preview textual.
- Tratar la preview textual como bloque de cierre del formulario, no como simple lista compacta.

#### 3.9 Contraste y tono de textos secundarios mejorables

Textos como `Fuente actual`, ayudas y etiquetas de preview usan grises suaves en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L604), [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L660) y [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx#L861). No todos son necesariamente un fallo AA, pero si conforman una tendencia a rebajar demasiado la señal visual secundaria.

Recomendacion:

- Revisar contraste de todos los textos informativos de 12 px o menos.
- Priorizar tokens mas robustos cuando el contenido sea operativo y no meramente decorativo.

## 4. Cobertura y validacion

### Cobertura verificada

- [BrandingForm.spec.tsx](../../apps/portal/src/components/settings/BrandingForm.spec.tsx) y [branding-validation.spec.ts](../../apps/portal/src/lib/branding-validation.spec.ts) cubren happy path del formulario, validaciones de archivo y parte de metadata.
- [LoginExperience.spec.tsx](../../apps/portal/src/components/auth/LoginExperience.spec.tsx) cubre resolucion de branding publico con slug confirmado.

### Huecos principales

- Sin pruebas WCAG automatizadas para Marca.
- Sin validacion real de teclado y lector de pantalla en el flujo de uploads.
- Sin cobertura seria de responsive mobile del submodulo.
- Sin pruebas fuertes para errores 403, 500 y timeouts en la pantalla de Marca.
- Sin validacion dark mode especifica para previews de activos y legibilidad cruzada.

### Resultado E2E relevante

El test [portal-login-branding.spec.ts](../../e2e/tests/portal-login-branding.spec.ts) fallo en ambos casos porque espera que la consulta de branding ocurra tras escribir el slug. La implementacion actual requiere commit del campo por blur, lo que convierte ese fallo en una alerta de desalineacion entre especificacion ejecutable y UX real.

## 5. Lluvia de ideas

### Opcion 1. Editor por grupos con variantes en paralelo

Organizar Marca en cuatro bloques: sello, logo, favicon y fondo. Cada bloque muestra sus variantes clara y oscura lado a lado, una sola descripcion y reglas comunes.

Ventaja:

- Reduce carga cognitiva sin rehacer el dominio.

Riesgo:

- Exige refactor de layout en [BrandingForm](../../apps/portal/src/components/settings/BrandingForm.tsx).

### Opcion 2. Preview inspector sticky

Mantener el formulario actual, pero mover la vista previa a una columna sticky en desktop y a un modulo fijo al inicio en mobile.

Ventaja:

- Mejora la relacion entre edicion y resultado sin cambiar demasiado la estructura de datos.

Riesgo:

- Requiere cuidar responsive y no invadir pantallas medianas.

### Opcion 3. Modo guiado por fuente de activo

Para cada slot, exponer una eleccion explicita: `Subir archivo` o `Usar URL HTTPS`. Segun la opcion elegida, se muestra el control adecuado y se aclara cuando aplica guardar.

Ventaja:

- Hace el flujo mas entendible para perfiles no tecnicos.

Riesgo:

- Introduce mas estados UI por slot y exige una buena estrategia de defaults.

## 6. Recomendacion ejecutiva

La mejor secuencia de mejora no es un rediseño completo. La ruta mas pragmatica es:

1. Resolver primero accesibilidad operativa de uploads y confirmacion destructiva.
2. Reagrupar la grilla de activos por tipo de recurso.
3. Fortalecer el preview y el copy del flujo.
4. Alinear la experiencia publica de login con la especificacion E2E y decidir si el branding debe reaccionar al escribir o al confirmar.

## 7. Conclusión

El submodulo Marca parte de una base visual correcta y reutiliza patrones sanos del portal, pero todavia no alcanza una experiencia sobresaliente ni una validacion suficiente para considerarlo un submodulo de configuracion maduro. El mayor valor de mejora esta en ordenar la carga cognitiva del formulario, cerrar la deuda accesible del flujo de archivos y clarificar la relacion entre lo que se edita en settings y lo que realmente se ve en el login publico.