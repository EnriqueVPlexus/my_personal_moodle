# Backlog de CanteraHub

Documento vivo para planificar, implementar y revisar la evolucion
del producto poco a poco.

## Como usar este backlog

- Marca cada iniciativa principal cuando este realmente terminada.
- Actualiza la seccion `Estado` de cada bloque cuando pase de idea
  a trabajo en curso.
- Usa `Hecho cuando` como criterio de cierre minimo antes de dar una
  tarea por completada.
- Si una iniciativa crece demasiado, crea una issue o documento
  tecnico aparte y deja aqui solo el resumen.

## Estado actual

- [x] Login, sesiones y setup inicial.
- [x] Roles `admin` y `user`.
- [x] CRUD de roadmaps, modulos y lecciones.
- [x] Gestion admin de usuarios.
- [x] Auditoria de acciones sensibles.
- [x] Seed inicial de roadmaps segmentados.
- [x] Roadmap `IA para DevOps`.
- [x] Suite de tests con cobertura automatizada.

## Orden recomendado

1. Progreso por usuario.
2. Buscador y filtros.
3. Importador JSON para roadmaps.
4. Evidencias y portfolio por modulo.
5. Preparacion para despliegue.
6. Quizzes reales.
7. Versionado de roadmaps.
8. Dashboard admin.
9. Guia Google Skills badges.

## Prioridad alta

### [ ] Progreso por usuario

Estado: pendiente.

Valor: convierte la app en una herramienta de seguimiento real, no
solo en un catalogo de contenido.

Objetivo de experiencia:

- Cuando un usuario inicie sesion, debe ver rapidamente todos los
  roadmaps empezados y en que punto va de cada uno.
- Si tiene mas de un roadmap activo, la app debe dejar claro cual es
  el siguiente paso recomendado en cada uno.

Alcance funcional:

- Guardar progreso por usuario y por leccion.
- Mostrar porcentaje completado por roadmap.
- Mostrar ultimo modulo visitado, ultima actividad y siguiente paso sugerido.
- Registrar tiempo de estudio aproximado por roadmap y por modulo.
- Guardar notas o puntuaciones de quiz por usuario.
- Evitar que el progreso sea global para todos los usuarios.

Desglose tecnico propuesto:

#### [ ] Fase 1. Modelo de datos de progreso

Estado: pendiente.

Tareas:

- Crear tabla de progreso por leccion y usuario.
- Crear tabla resumen por roadmap y usuario si compensa para consultas rapidas.
- Definir campos minimos: `started_at`, `last_activity_at`, `completed_at`, `time_spent_seconds`.
- Preparar la base para guardar intentos y nota de quiz por usuario.

Hecho cuando:

- La base de datos soporta progreso individual sin ambiguedades.
- Las migraciones son idempotentes.
- Hay tests de bootstrap y persistencia.

#### [ ] Fase 2. Escritura de progreso

Estado: pendiente.

Tareas:

- Marcar una leccion como completada por usuario, no como estado global.
- Registrar inicio de roadmap al primer acceso o primera accion.
- Actualizar `last_activity_at` al abrir modulo, completar leccion o enviar quiz.
- Registrar tiempo de estudio con una aproximacion simple y robusta.

Hecho cuando:

- Dos usuarios pueden avanzar en el mismo roadmap sin interferirse.
- El progreso sobrevive reinicios de sesion.
- Hay tests de API para flujos de avance y reanudacion.

#### [ ] Fase 3. Resumen visible al iniciar sesion

Estado: pendiente.

Tareas:

- Crear una vista o dashboard ligero post-login para `Mis roadmaps`.
- Mostrar solo roadmaps iniciados y opcionalmente sugerir otros disponibles.
- Enseñar porcentaje, ultimo modulo visto, ultima actividad y boton de continuar.
- Si hay varios roadmaps activos, ordenarlos por actividad reciente o prioridad.

Hecho cuando:

- Tras el login el usuario entiende en segundos por donde continuar.
- El estado de cada roadmap se ve sin entrar en el detalle.
- Hay tests de UI del dashboard de inicio.

#### [ ] Fase 4. Detalle de roadmap y modulo con progreso

Estado: pendiente.

Tareas:

- Mostrar barra o indicador de progreso por roadmap.
- Marcar modulos completados, en curso o no iniciados.
- Mostrar progreso por lecciones dentro del modulo.
- Incluir un bloque de `siguiente paso recomendado`.

Hecho cuando:

- El detalle de roadmap y modulo refleja progreso persistente.
- La lectura del contenido sigue siendo limpia y no se vuelve recargada.

#### [ ] Fase 5. Tiempo de estudio

Estado: pendiente.

Tareas:

- Definir una estrategia simple de tracking, por ejemplo tiempo
  estimado por interaccion o sesiones activas con timeout.
- Acumular tiempo por modulo y por roadmap.
- Mostrar tiempo total y tiempo reciente al usuario.

Hecho cuando:

- El tiempo mostrado es consistente aunque sea aproximado.
- No depende de mantener la pestana abierta de forma perfecta.
- Hay tests para acumulacion basica.

#### [ ] Fase 6. Quizzes y notas

Estado: pendiente.

Tareas:

- Extraer o normalizar preguntas de quiz desde los roadmaps.
- Guardar intentos, respuestas y puntuacion por usuario.
- Mostrar nota mas alta, ultimo intento y fecha.
- Decidir si el quiz puntua progreso o solo evaluacion.

Hecho cuando:

- Un usuario puede responder un quiz y recuperar su nota despues.
- La nota aparece en el contexto del roadmap o modulo.
- Hay tests de intento, correccion y consulta.

#### [ ] Fase 7. Estadisticas de aprendizaje

Estado: pendiente.

Tareas:

- Mostrar roadmaps iniciados, completados y pausados.
- Mostrar lecciones completadas, tiempo acumulado y media de quiz.
- Preparar base para futuras metricas admin sin duplicar logica.

Hecho cuando:

- El usuario ve un resumen util de su actividad.
- Las metricas no requieren consultas fragiles ni lentas.

#### [ ] Fase 8. Reglas de negocio y experiencia

Estado: pendiente.

Tareas:

- Definir que significa `iniciado`, `en curso`, `pausado` y `completado`.
- Definir cuando un roadmap pasa a `iniciado`.
- Definir si un quiz es obligatorio para cerrar modulo.
- Revisar copy y estados vacios para que todo suene claro.

Hecho cuando:

- No hay dudas funcionales sobre el significado del progreso.
- La experiencia es coherente en login, roadmap y modulo.

Hecho cuando:

- Cada usuario ve su propio progreso sin afectar al resto.
- Al iniciar sesion se ven claramente los roadmaps empezados y el
  punto actual de cada uno.
- El listado de roadmaps muestra porcentaje o estado de avance.
- El detalle de roadmap y modulo refleja progreso persistente.
- Hay tiempo de estudio y notas de quiz por usuario.
- Hay tests de API y UI para el flujo principal.

### [ ] Buscador y filtros

Estado: pendiente.

Valor: prepara la aplicacion para crecer sin perder usabilidad.

Alcance inicial:

- Buscar por titulo, descripcion y contenido de roadmap o modulo.
- Filtrar por categoria o tema, por ejemplo `AWS`, `IA`, `Kubernetes`, `DevOps`.
- Filtrar por duracion y por nivel si existe el dato.

Hecho cuando:

- El usuario puede localizar un roadmap concreto en pocos segundos.
- Los filtros no rompen el layout actual.
- Hay cobertura para estados vacios, combinacion de filtros y borrado de busqueda.

### [ ] Importador JSON de roadmaps

Estado: pendiente.

Valor: evita meter nuevos roadmaps a mano en codigo cada vez.

Alcance inicial:

- Pantalla admin para subir o pegar un JSON.
- Validacion del esquema antes de guardar.
- Vista previa antes de publicar.
- Insercion o actualizacion controlada del roadmap.

Hecho cuando:

- Un admin puede importar un roadmap sin tocar archivos del repo.
- Los errores de formato son legibles y accionables.
- El roadmap importado respeta el formato visual actual.
- Hay tests de validacion y del flujo feliz.

### [ ] Evidencias y portfolio por modulo

Estado: pendiente.

Valor: conecta el aprendizaje con entregables reales y empleabilidad.

Alcance inicial:

- Permitir adjuntar enlace a GitHub, demo, documento o nota.
- Guardar evidencias por usuario y por modulo.
- Mostrar estado de entrega y fecha de actualizacion.

Hecho cuando:

- Cada usuario puede registrar una evidencia por modulo.
- El admin puede revisar o al menos consultar evidencias.
- El roadmap refleja si un modulo esta completado solo por lectura o
  con evidencia real.

### [ ] Preparacion para despliegue

Estado: pendiente.

Valor: permite publicar la app con bajo coste y mantener mejoras via GitHub.

Alcance inicial:

- Sustituir SQLite local por una base de datos apta para hosting gestionado.
- Endurecer credenciales y configuracion de produccion.
- Documentar deploy automatizado con GitHub.

Hecho cuando:

- La app se puede desplegar fuera de local sin perder datos.
- Existe una guia de despliegue reproducible.
- La contraseña admin por defecto deja de ser un riesgo.

## Prioridad media

### [ ] Quizzes reales por modulo

Estado: pendiente.

Valor: reutiliza los datos ya presentes en los roadmaps y aporta evaluacion ligera.

Alcance inicial:

- Convertir preguntas del roadmap en mini evaluaciones.
- Guardar respuestas por usuario.
- Mostrar resultado o feedback basico.

Hecho cuando:

- Al menos un roadmap usa quizzes reales.
- Las respuestas quedan persistidas por usuario.
- Hay tests del flujo de respuesta y consulta.

### [ ] Versionado de roadmaps

Estado: pendiente.

Valor: permite evolucionar contenido sin perder historico.

Alcance inicial:

- Guardar version y fecha de validacion.
- Mantener varias versiones o al menos historial basico.
- Mostrar cambios visibles entre versiones si compensa.

Hecho cuando:

- Un roadmap puede actualizarse sin borrar contexto anterior.
- El usuario distingue claramente la version activa.

### [ ] Dashboard admin

Estado: pendiente.

Valor: da visibilidad del uso real y ayuda a priorizar mejoras.

Alcance inicial:

- Usuarios activos.
- Roadmaps mas usados.
- Modulos mas completados.
- Usuarios atascados o sin actividad reciente.

Hecho cuando:

- El panel muestra datos utiles de un vistazo.
- No depende de consultas fragiles o lentas.

### [ ] Guia de Google Skills badges

Estado: pendiente.

Valor: aprovecha el contenido ya preparado en el roadmap de IA y da
mas profundidad al producto.

Alcance inicial:

- Pagina propia con pasos, enlaces y orden recomendado.
- Integracion visible desde el roadmap `IA para DevOps`.

Hecho cuando:

- La guia se puede descubrir desde la UI sin perderse.
- Conserva la estetica actual de la app.

## Ideas a revisar mas adelante

### [ ] Asignacion de roadmaps a usuarios

Estado: idea.

Valor: permitiria uso mas cercano a formacion interna o mentoring.

### [ ] Comentarios o feedback del admin en evidencias

Estado: idea.

Valor: cerraria mejor el ciclo de aprendizaje.

### [ ] Notificaciones o recordatorios

Estado: idea.

Valor: puede ayudar a la continuidad, aunque no es prioritario
mientras falte progreso por usuario.

## Notas de producto

- La app esta evolucionando desde un catalogo de roadmaps hacia una
  herramienta de seguimiento formativo.
- Conviene mantener el tono visual sobrio y utilitario actual,
  evitando convertir la interfaz en una landing o en un LMS
  recargado.
- Cada funcionalidad nueva deberia llegar con tests y sin degradar
  la experiencia de lectura de los roadmaps ya existentes.
