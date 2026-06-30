# Rediseño UX/UI - Usuarios del portal empresarial

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-06-03

## 1. Contexto

La pantalla de usuarios del portal empresarial en `/dashboard/users` ya cumple la función base de listar, buscar, filtrar, crear, editar, eliminar y restablecer contraseñas. Sin embargo, la experiencia visual y operativa todavía se percibe desigual frente a otros módulos del portal.

La auditoría identificó cuatro tensiones principales:

- los overlays de usuarios no reutilizan el primitivo compartido de diálogo,
- la tabla usa patrones locales donde el portal ya tiene primitives aprobadas,
- el modal de edición concentra demasiadas tareas en una sola superficie,
- la jerarquía visual del módulo todavía se siente más cercana a un CRUD funcional que a una herramienta operativa madura.

## 2. Objetivo del rediseño

Elevar la pantalla de usuarios a un patrón operativo consistente con iWana neXt: clara, sobria, accesible, más fácil de escanear y con mejor separación entre tareas rutinarias y acciones sensibles.

## 3. Objetivos específicos

- unificar la experiencia de modales y diálogos con el primitivo compartido,
- mejorar la legibilidad y el ritmo visual de la tabla,
- reducir la carga cognitiva del flujo de edición,
- reforzar affordances para acciones por fila,
- hacer que los estados vacíos, alertas y credenciales temporales se sientan parte del sistema,
- mantener compatibilidad con el diseño actual del portal y con WCAG AA.

## 4. Fuera de alcance

- cambios de contrato API,
- cambios de permisos o reglas de negocio,
- creación de nuevos endpoints,
- rediseño del shell global del portal,
- incorporación de librerías externas de UI.

## 5. Alternativas evaluadas

### Opción A - Ajuste incremental

Mantener la estructura actual y corregir solo inconsistencias visibles: diálogos compartidos, empty state, toolbar de acciones y tokens.

**Ventajas:** menor riesgo, entrega rápida, impacto inmediato.  
**Desventajas:** deja intacta la densidad del modal de edición y conserva parte de la sensación de CRUD.

### Opción B - Refinamiento estructural recomendado

Mantener la tabla como eje del módulo, pero reorganizar overlays, separar acciones sensibles y reforzar jerarquía visual con patterns compartidos.

**Ventajas:** mejora fuerte sin reabrir arquitectura del flujo, más coherencia interna, mejor base para evolución futura.  
**Desventajas:** requiere tocar varios componentes de usuarios y ajustar tests UI.

### Opción C - Rediseño de interacción más ambicioso

Transformar el módulo en un directorio operativo con panel de detalle lateral, summary chips y edición más contextual.

**Ventajas:** experiencia más rica y madura, mejor para escalas mayores de usuarios.  
**Desventajas:** más costo, mayor riesgo de alcance, necesita validación adicional de producto.

## 6. Recomendación

Adoptar la **Opción B** como baseline inmediato.

La Opción B corrige las fricciones reales encontradas en la auditoría sin sobredimensionar el trabajo. Deja la puerta abierta a evolucionar luego hacia la Opción C si el módulo crece en complejidad o volumen de uso.

## 7. Propuesta visual priorizada

### 7.1 Quick wins

- migrar `CreateUserModal`, `EditUserModal`, `DeleteUserDialog`, `ResetPasswordDialog` y el overlay de contraseña temporal al primitivo `Dialog` compartido,
- reemplazar el estado vacío de la tabla por `PortalEmptyState` con acción primaria visible,
- sustituir el fondo hardcodeado del header de tabla por token aprobado del sistema,
- agrupar las acciones por fila con `PortalActionToolbar` compacta,
- reforzar el estado MFA con tratamiento visual más comparativo, no solo texto plano,
- agregar pruebas de Escape y cierre correcto en overlays.

### 7.2 Mejoras de mediano alcance

- separar en edición el bloque de datos del usuario del bloque de restablecimiento de contraseña,
- reorganizar el modal de alta por bloques visuales: identidad, acceso, perfil operativo y seguridad,
- mejorar el mensaje y la presentación de la contraseña temporal para que se perciba como evidencia sensible y controlada,
- introducir mejor feedback contextual en usuarios protegidos o acciones deshabilitadas,
- ajustar el header del módulo para bajar peso visual del contenedor superior y dar más protagonismo a la tabla.

### 7.3 Rediseño mayor opcional

- convertir la pantalla en un directorio operativo con resumen superior de salud del módulo,
- mostrar selección de usuario con detalle rápido en panel lateral,
- mover edición pesada a overlay contextual y dejar acciones rápidas en la tabla,
- incorporar métricas cortas como activos, pendientes de verificación y cobertura MFA.

## 8. Estructura objetivo de la pantalla

### 8.1 Encabezado

- título: `Usuarios internos`,
- subtítulo corto con total,
- acción primaria: `Nuevo usuario`,
- opcional a futuro: chips de resumen con métricas mínimas.

### 8.2 Bloque principal

- panel principal único para directorio,
- header del panel con `Directorio interno`, título, descripción y contador,
- toolbar de filtros con búsqueda dominante, dos filtros y limpieza secundaria,
- tabla con mejor contraste jerárquico y acciones agrupadas.

### 8.3 Overlays

- **Alta:** modal mediano con bloques visuales y CTA clara,
- **Edición:** modal centrado en perfil y accesos,
- **Reinicio de contraseña:** diálogo breve de confirmación,
- **Eliminar usuario:** diálogo sensible con confirmación fuerte,
- **Contraseña temporal generada:** diálogo breve de resultado, no overlay local artesanal.

## 9. Reglas visuales

- no usar colores hardcodeados si ya existe token equivalente,
- evitar iconos sueltos sin agrupación cuando representan un set de acciones,
- preservar `rounded-2xl`, sombras suaves y superficies limpias del portal,
- evitar cards dentro de cards sin función operativa clara,
- mantener copy breve, profesional y orientado a tarea,
- diferenciar visualmente tareas rutinarias y acciones sensibles.

## 10. Accesibilidad y comportamiento

- todos los diálogos deben cerrar con Escape,
- foco inicial y retorno de foco deben ser consistentes,
- overlays deben bloquear scroll del body,
- botones icon-only deben mantener nombre accesible,
- estados vacíos y alertas deben comunicar siguiente acción,
- el color no debe ser el único canal para comunicar estado MFA o criticidad.

## 11. Impacto esperado

- menor carga cognitiva en edición,
- mejor escaneo de la tabla,
- percepción visual más coherente con el portal,
- menos deuda local de UI al reutilizar primitives existentes,
- mejor base para futuras mejoras del módulo sin rehacerlo.

## 12. Validación sugerida

- prueba manual desktop y mobile de tabla y overlays,
- validación de teclado en alta, edición, reinicio y eliminación,
- actualización de tests del módulo para cubrir cierre con Escape, empty state y toolbar de acciones,
- revisión visual comparativa contra settings/access como referencia interna.

## 13. Entregable recomendado por fases

### Fase 1

- diálogos compartidos,
- empty state,
- toolbar de acciones,
- tokens y ajustes de jerarquía ligera.

### Fase 2

- refactor del modal de edición,
- refactor del modal de alta,
- resultado de contraseña temporal unificado.

### Fase 3 opcional

- evolución a directorio operativo con summary y detalle contextual.