# **Objetivo del módulo WFM (WorkForce Management)**  
Para iWana neXt, el WFM no debe sentirse como un ERP pesado ni como una tabla infinita.  
  Debe parecer más un:  
- **Centro Operacional Visual**  
-  orientado a:   
- técnicos ISP  
- cuadrillas  
- instalaciones  
- soporte  
- agenda operacional  
- SLA  
- capacidad operativa  
- geolocalización  
- productividad  
La clave es:  
“Entender el estado operativo completo en menos de 10 segundos”.  
# **Concepto UX/UI**  
## **Filosofía visual**  
Tomando el stack actual: Next.js + React 19 + Tailwind 4 + shadcn/ui   
La UI debería inspirarse en:  
- Linear  
- Notion  
- Plane  
- Monday (solo lo bueno)  
- ClickUp simplificado  
- Datadog dashboards  
- Uber Fleet  
Pero adaptado a ISP/técnicos de campo.  
# **Principios del módulo**  
## **1. “Overview First”**  
El usuario debe ver:  
- qué está atrasado  
- qué está en riesgo  
- qué técnico está saturado  
- qué zonas tienen problemas  
- cuántas órdenes están activas  
SIN entrar a tablas.  
## **2. Visualización tipo Command Center**  
La pantalla principal NO debe ser CRUD-first.  
Debe ser:  
- métricas  
- timeline  
- mapa  
- alertas  
- capacidad  
- estado en tiempo real  
## **3. Jerarquía visual fuerte**  
Prioridades:  
| | |  
|-|-|  
| **Prioridad** | **Elemento** |   
| Alta | SLA roto / retrasos |   
| Media | Técnicos saturados |   
| Media | Órdenes próximas |   
| Baja | Históricos |   
# **Lluvia de ideas — vistas principales**  
# **1. Dashboard Operacional (Main View)**  
La pantalla más importante.  
## **Layout ideal**  
------------------------------------------------  
  HEADER  
 ------------------------------------------------  
  KPIs  
 ------------------------------------------------  
  Timeline Operacional  
 ------------------------------------------------  
  Mapa + Técnicos + OT  
 ------------------------------------------------  
  Alertas / SLA / Riesgos  
 ------------------------------------------------  
## **KPIs ultra visuales**  
Cards minimalistas:  
- Órdenes activas  
- Instalaciones hoy  
- Tickets críticos  
- SLA en riesgo  
- Técnicos en ruta  
- Técnicos offline  
- Tiempo promedio atención  
## **Ideas UX**  
### **Estado por color muy limpio**  
Verde   → OK  
 Amarillo → Riesgo  
 Rojo → Crítico  
 Azul → En ruta  
Sin exceso de colores.  
# **2. Timeline Inteligente**  
Una de las vistas más importantes.  
## **Inspiración**  
- Google Calendar  
- Linear roadmap  
- Jira Timeline  
- Dispatching systems  
## **Características**  
### **Vista horizontal**  
08:00 ─────────────────────── 18:00  
   
 Técnico A  
 [ Instalación ][ Soporte ][ Corte ]  
   
 Técnico B  
 [ Migración ][ Disponible ]  
## **Interacciones**  
- drag & drop  
- resize tareas  
- detectar conflictos  
- capacidad automática  
- sugerencias IA  
## **Ideas avanzadas**  
### **Heatmap de saturación**  
🟢 libre  
 🟡 carga media  
 🔴 sobrecargado  
# **3. Vista Mapa (MUY IMPORTANTE)**  
En ISP esto es clave.  
## **Vista tipo Uber/Fleet**  
Mostrar:  
- técnicos en tiempo real  
- órdenes  
- zonas saturadas  
- nodos  
- clientes críticos  
- cortes masivos  
## **Ideas visuales**  
### **Clustering automático**  
Si hay muchas órdenes:  
[12]  
 [8]  
 [25]  
## **Rutas**  
- optimización automática  
- tiempo estimado  
- tráfico  
- distancia  
# **4. Panel “Ahora”**  
Un panel tipo NOC operacional.  
## **Debe responder:**  
- ¿Qué está pasando ahora?  
- ¿Quién está atrasado?  
- ¿Qué SLA se rompe primero?  
- ¿Qué técnico necesita ayuda?  
## **Componentes**  
### **Feed operacional en tiempo real**  
10:02 - Técnico Juan inició OT-1922  
 10:04 - SLA riesgo alto OT-1881  
 10:08 - Cliente VIP sin atención  
# **5. Vista de Técnicos**  
NO una tabla aburrida.  
## **Tipo cards operacionales**  
--------------------------------  
 👤 Carlos Pérez  
 Zona Norte  
 ██████░░ 70% carga  
   
 • 4 órdenes activas  
 • 1 retrasada  
 • ETA próxima: 12 min  
 --------------------------------  
## **Acciones rápidas**  
- reasignar  
- llamar  
- WhatsApp  
- ver ruta  
- bloquear agenda  
- agregar OT urgente  
# **6. Planificador Drag & Drop**  
El “core” del WFM.  
## **Ideas importantes**  
### **Asignación inteligente**  
Al mover una OT:  
El sistema evalúa:  
- distancia  
- tráfico  
- skills  
- SLA  
- carga  
- disponibilidad  
- inventario  
## **Recomendaciones IA**  
“Sugerencia:  
 Mover OT-1991 a Juan reduce 32 min”  
# **7. Vista tipo Kanban Operacional**  
Muy útil para supervisores.  
## **Columnas**  
Pendiente  
 Asignada  
 En ruta  
 En sitio  
 Finalizada  
 Bloqueada  
## **UX**  
- cards compactas  
- SLA visible  
- badges críticos  
- prioridad visual  
# **8. Centro de Alertas**  
Minimalista.  
NO modal invasivo.  
## **Tipos**  
- SLA riesgo  
- técnico detenido  
- OT vencida  
- GPS offline  
- cliente VIP  
- inventario faltante  
## **UX moderna**  
Panel lateral:  
⚠️ 3 órdenes vencen en 20 min  
 ⚠️ Zona Norte saturada  
 ⚠️ Técnico sin movimiento 40 min  
# **9. Capacity Planning**  
MUY diferencial.  
## **Visualización**  
Zona Norte  
 █████████░ 90%  
   
 Zona Sur  
 █████░░░░░ 50%  
## **Predicción**  
- saturación mañana  
- backlog semanal  
- horas hombre  
- capacidad por skill  
# **10. Mobile-first para técnicos**  
Crítico.  
## **App técnica ultra simple**  
Solo:  
- siguiente OT  
- mapa  
- check-in  
- evidencia  
- firma  
- materiales  
- cerrar OT  
## **UX**  
Máximo:  
- 2 taps por acción  
- offline-first  
- fotos rápidas  
- dictado voz  
# **Ideas diferenciales MUY potentes**  
# **A. “Mission Control”**  
Pantalla gigante tipo centro de operaciones.  
Ideal para NOC.  
# **B. Playback Operacional**  
Ver:  
“Cómo evolucionó el día operacional”.  
Como replay.  
# **C. Smart Dispatch**  
IA propone automáticamente:  
- reasignaciones  
- agrupaciones geográficas  
- optimización rutas  
- balance carga  
# **D. SLA Radar**  
Visual circular:  
Crítico → 3  
 Riesgo → 12  
 OK → 88  
# **E. Operational Health Score**  
Score único:  
92/100  
Basado en:  
- puntualidad  
- SLA  
- backlog  
- saturación  
- tiempos muertos  
# **Arquitectura recomendada para iWana**  
Con el stack actual   
## **Frontend**  
- Next.js App Router  
- React Server Components  
- Tailwind 4  
- shadcn/ui  
- TanStack Query  
- Zustand (estado realtime UI)  
- Framer Motion  
## **Realtime**  
Recomendado:  
- WebSockets  
- SSE para dashboards  
- Redis Pub/Sub  
## **Mapa**  
Opciones:  
| | |  
|-|-|  
| **Tecnología** | **Recomendación** |   
| Mapbox | Mejor UX |   
| Leaflet | Más económico |   
| Google Maps | Costoso para escala |   
## **Timeline**  
Opciones:  
| | |  
|-|-|  
| **Librería** | **Uso** |   
| react-calendar-timeline | Base |   
| dnd-kit | Drag/drop |   
| visx | Custom charts |   
# **Diseño visual recomendado**  
## **Estilo**  
- Mucho espacio en blanco  
- Bordes suaves  
- Sombras sutiles  
- Tipografía limpia  
- Cards compactas  
- Información escaneable  
## **NO hacer**  
❌ tablas gigantes  
  ❌ exceso de modales  
  ❌ demasiados colores  
  ❌ formularios eternos  
  ❌ nested menus complejos  
  ❌ dashboards recargados  
# **Feature roadmap sugerido**  
## **Fase 1 — MVP visual**  
- Dashboard  
- Timeline  
- Kanban  
- Técnicos  
- Mapa básico  
- Alertas  
- SLA  
## **Fase 2**  
- Optimización rutas  
- Capacity planning  
- Mobile app  
- GPS realtime  
## **Fase 3**  
- IA dispatching  
- Predicción saturación  
- Recomendaciones automáticas  
- Replay operacional  
# **Nombre conceptual interno**  
Podrían manejarlo como:  
- iWana Flow  
- iWana Ops  
- iWana Dispatch  
- iWana FieldOps  
- iWana Mission Control  
- iWana Workforce  
# **Mi recomendación conceptual**  
El módulo NO debe sentirse como:  
“Gestión de órdenes”.  
Debe sentirse como:  
“Control operacional en tiempo real”.  
   
