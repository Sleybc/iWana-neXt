# MOD12 Compras Separacion de Modos Workspace Design

**Fecha:** 2026-07-04  
**Estado:** Propuesto para ejecucion  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Modulo base:** MOD12 Inventario / SCM  
**Perfil activo:** `docs/roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md`  
**Referencias:** `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md`, `docs/specs/2026-07-02-mod12-compras-captura-masiva-design.md`, `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`, `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`, `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`, `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`

---

## 1. Contexto

El workspace de `Compras` ya tiene dos piezas valiosas y aprobadas:

- una `bandeja operativa` para trabajar solicitudes existentes;
- un flujo de `captura masiva` para crear nuevas solicitudes con multiples productos.

El problema actual no es de capacidad funcional sino de `colision de modos`.

En la implementacion vigente, `PurchaseWorkspace` mantiene la bandeja visible mientras el usuario abre `Nueva solicitud`, lo que deja activas a la vez tres tareas distintas:

1. revisar solicitudes existentes,
2. capturar una solicitud nueva,
3. afinar el borrador de la nueva solicitud.

Eso contradice la jerarquia declarada en el spec de captura masiva: cuando el usuario abre `Nueva solicitud`, la tarea dominante debe pasar a ser `Agregar productos`, y la bandeja no debe competir visualmente con esa tarea.

---

## 2. Problema a resolver

La pantalla actual mezcla dos contextos de trabajo con objetivos, ritmo y densidad distintos:

- `Modo bandeja`: triage, filtros, tabla, drawer lateral y seguimiento de solicitudes vivas.
- `Modo creacion`: contexto minimo, seleccion masiva, consolidacion en borrador y submit.

Ambos modos son validos, pero no deben vivir con el mismo peso visual dentro del mismo viewport.

Los sintomas esperables si se mantiene esta mezcla son:

- perdida de foco al crear solicitudes con `10-20+` productos;
- sobrecarga cognitiva por competir tabla, filtros, borrador y formulario;
- peor experiencia mobile por scroll largo y jerarquia difusa;
- dificultad para evolucionar la captura masiva hacia drafts, autosave o ruta dedicada.

---

## 3. Objetivo

Separar de forma explicita los modos de trabajo de `Compras` para que:

1. `Bandeja de solicitudes` siga siendo la mesa operativa de solicitudes existentes.
2. `Nueva solicitud` se convierta en un workspace de captura enfocado.
3. El usuario perciba una sola tarea dominante por vez.
4. La implementacion preserve el bounded context actual y no exija cambios de schema ni nuevo BC.

---

## 4. Alcance

### 4.1 En scope

- Redefinir la composicion de `PurchaseWorkspace`.
- Introducir una separacion explicita entre `modo bandeja` y `modo nueva solicitud`.
- Reorganizar `PurchaseRequestComposer` para trabajar mejor como canvas principal de captura.
- Ajustar desktop y mobile para que la separacion de modos sea consistente.
- Actualizar criterios de UX, pruebas y estados asociados al cambio.

### 4.2 Fuera de scope

- Crear un nuevo bounded context para Compras.
- Cambiar contratos backend o schema solo por esta separacion visual.
- Implementar drafts persistentes o autosave.
- Crear una ruta dedicada `.../compras/nueva` en esta fase.
- Rehacer el drawer de trabajo de solicitudes existentes.

---

## 5. Decision recomendada

Se aprueba un patron de `modo takeover dentro de la pestana Compras`.

Esto significa:

- `Compras` sigue siendo una sola pestana funcional de MOD12.
- Mientras `composerOpen === false`, se muestra el `modo bandeja`.
- Mientras `composerOpen === true`, la pestana entra en `modo nueva solicitud`.
- En `modo nueva solicitud`, la bandeja completa deja de compartir protagonismo visual con el composer.

No se recomienda, en esta fase, una ruta separada ni mantener la bandeja completa visible al lado del flujo de creacion.

### 5.1 Secuencia segura de adopcion

Para minimizar regresion, la implementacion debe introducir la separacion de modos en este orden:

1. crear `workspaceMode` en `PurchaseWorkspace`,
2. volver verificable el resultado de creacion,
3. forzar exclusividad entre `create` y `workbench`,
4. ocultar la bandeja completa en `create`,
5. despues pulir el flujo mobile de dos pasos reales.

---

## 6. Experiencia objetivo

### 6.1 Modo bandeja

Se mantiene el patron aprobado del workspace hibrido:

- KPIs arriba,
- filtros rapidos,
- tabla operativa densa,
- drawer lateral para trabajar una solicitud seleccionada.

La accion `Nueva solicitud` debe ser visible y clara, pero subordinada a la tarea principal del modo: operar solicitudes existentes.

Regla adicional:

- desktop y mobile deben exponer un entry point visible y consistente para entrar a `modo nueva solicitud`;
- no se puede depender de un CTA oculto por breakpoint para entrar a creacion.

### 6.2 Modo nueva solicitud

Cuando el usuario abre `Nueva solicitud`, la pestana completa cambia de modo y muestra un canvas de captura enfocado.

La estructura objetivo es:

1. `Header de creacion`
2. `Cabecera compacta`
3. `Agregar productos`
4. `Lineas seleccionadas`
5. `Justificacion y cierre`

La bandeja deja de mostrarse como panel completo en paralelo.

### 6.3 Header de creacion

Debe incluir:

- titulo `Nueva solicitud de compra`,
- accion visible `Volver a la bandeja`,
- microresumen contextual del tipo de tarea,
- opcionalmente un contador de lineas del borrador.

No debe parecer un modal sobre la bandeja. Debe sentirse como un cambio explicito de contexto dentro de la misma pestana.

---

## 7. Layout propuesto

### 7.1 Desktop

#### Modo bandeja

- `PurchaseWorkspaceSummary` arriba.
- `PortalPanel` principal con toolbar y tabla.
- `PurchaseRequestWorkbenchDrawer` como panel lateral para solicitudes existentes.

#### Modo nueva solicitud

Layout recomendado:

- bloque principal ancho para `Agregar productos`;
- rail secundario o seccion subordinada para `Lineas seleccionadas` y `Resumen previo`;
- footer sticky con CTA;
- sin tabla de bandeja visible.

La cabecera compacta de la solicitud debe ocupar poca altura y no competir con `Agregar productos`.

### 7.2 Mobile

El modo nueva solicitud no debe abrirse como una simple caja scrollable con todo el flujo completo.

Se aprueba un patron de `pantalla completa o dialog de takeover` con `2 pasos visuales reales`:

1. `Agregar productos`
2. `Revisar lineas y justificar`

Requisitos:

- CTA principal siempre visible;
- navegacion explicita entre pasos;
- no depender de tablas horizontales como patron base;
- accion clara para volver a la bandeja.

---

## 8. Jerarquia y densidad

### 8.1 Regla de jerarquia

En `modo nueva solicitud` debe existir `un solo bloque dominante`.

Ese bloque es `Agregar productos`.

Quedan subordinados:

- cabecera compacta,
- borrador,
- justificacion,
- resumen y CTA.

### 8.2 Regla de densidad

La separacion de modos no significa inflar la UI con mas cards o espaciado vacio.

Se busca:

- menor competencia visual,
- mejor escaneo,
- continuidad operativa,
- densidad B2B controlada.

Red flags:

- cards dentro de cards sin funcion,
- bandeja visible a tamano completo mientras se crea,
- demasiadas superficies con igual peso,
- cabecera larga antes de llegar a `Agregar productos`.

---

## 9. Comportamiento funcional

### 9.1 Entrada al modo nueva solicitud

Acciones validas para entrar:

- CTA `Nueva solicitud` desde la toolbar;
- CTA equivalente desde estado vacio o tabla.

Al entrar:

- se oculta la bandeja completa,
- se muestra el composer como experiencia principal,
- se limpia el drawer de trabajo si estaba abierto o se mantiene cerrado mientras dure la creacion.

### 9.2 Salida del modo nueva solicitud

Acciones validas:

- `Volver a la bandeja`,
- submit exitoso,
- cierre explicito del takeover.

Si existe borrador no vacio, debe quedar previsto un punto de confirmacion antes de salir del modo, aunque la implementacion puede iniciar con confirmacion simple en esta fase.

Si el submit falla:

- el usuario permanece en `modo nueva solicitud`,
- el error queda visible,
- el borrador y el contexto de captura no se pierden.

### 9.3 Convivencia con drawer de trabajo

El drawer de solicitudes existentes no debe competir con el modo nueva solicitud.

Regla:

- `selectedRequestId` y `composerOpen` no deben producir dos superficies protagonistas a la vez.

Regla de exclusividad aprobada:

- entrar a `create` cierra o desactiva `workbench`;
- abrir `workbench` desde bandeja sale de `create` o bloquea la accion mientras haya confirmacion pendiente;
- el drawer no se rediseña en esta entrega, solo se orquesta su convivencia.

### 9.4 Persistencia de estado de bandeja

Al salir de `modo nueva solicitud`, deben preservarse en memoria de sesion:

- filtros activos,
- KPI preset activo,
- conteo filtrado,
- scroll y contexto visible de la bandeja cuando sea razonable.

La separacion de modos debe `ocultar sin resetear` la bandeja.

---

## 10. Impacto tecnico esperado

### 10.1 Frontend

Se espera trabajo principal en:

- `apps/portal/src/components/inventory/PurchaseWorkspace.tsx`
- `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`
- subcomponentes del composer masivo

Cambios esperados:

- introducir un switch claro de modo en `PurchaseWorkspace`;
- introducir un contrato de salida de creacion verificable para el parent;
- separar layout de `bandeja` y `creacion`;
- dar al composer una variante de takeover mas fuerte;
- adaptar mobile a pasos reales;
- reducir dependencia de tablas horizontales en mobile.

### 10.2 Backend

No se requieren cambios obligatorios por este rediseño.

### 10.3 Testing

La cobertura minima debe validar:

- apertura del modo nueva solicitud oculta la bandeja completa;
- volver a bandeja restaura el workspace operativo;
- volver a bandeja conserva filtros y estado de bandeja;
- error de creacion mantiene al usuario en `create`;
- exito de creacion retorna a bandeja sin perder contexto;
- no coexisten `create` y `workbench`;
- mobile muestra dos pasos reales;
- no aparecen a la vez bandeja protagonista y composer protagonista;
- submit exitoso retorna al modo bandeja.

---

## 11. Criterios de aceptacion

1. Al abrir `Nueva solicitud`, la bandeja deja de competir visualmente con el flujo de captura.
2. El usuario percibe un cambio explicito de contexto entre `modo bandeja` y `modo nueva solicitud`.
3. `Agregar productos` se convierte en la tarea dominante del primer viewport del modo creacion.
4. Desktop ya no muestra la tabla de bandeja como panel completo junto al composer.
5. Mobile usa un flujo real de dos pasos para creacion.
6. El drawer de trabajo de solicitudes existentes no compite con el modo nueva solicitud.
7. La solucion conserva identidad iWana, claridad operativa y densidad B2B.
8. La entrada a creacion es visible en desktop y mobile.
9. Un error de creacion no saca al usuario del modo `create`.

---

## 12. Riesgos y mitigaciones

### 12.1 Riesgos

- perder contexto de la bandeja al cambiar de modo;
- introducir friccion si la salida del modo no es clara;
- dejar la cabecera del composer demasiado pesada aun sin la bandeja;
- resolver desktop y olvidar mobile.

### 12.2 Mitigaciones

- accion `Volver a la bandeja` siempre visible;
- transicion clara de modo, no solo esconder paneles;
- cabecera compacta obligatoria;
- criterios mobile y pruebas especificas desde el plan.

---

## 13. Decision arquitectonica

**Modo:** Mixto  
**Recomendacion:** aprobar la separacion de `modo bandeja` y `modo nueva solicitud` dentro de la misma pestana `Compras`, usando takeover interno en vez de split permanente.  
**Justificacion:** el workspace hibrido y la captura masiva resuelven dos momentos operativos distintos; mantener ambos con igual protagonismo degrada la UX y contradice el spec aprobado de captura masiva. La separacion de modos mejora foco, reduce carga cognitiva y no exige nuevo BC ni cambio de schema.  
**Impacto:** medio en frontend, bajo en backend, alto en experiencia de usuario.  
**Requiere ADR:** No.  
**Requiere CTO:** No para esta fase.
