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
- [x] Progreso por usuario para roadmaps y lecciones: modelo, APIs,
  vista `Mis roadmaps`, porcentaje y tiempo aproximado.
- [x] Quizzes por modulo con intentos, notas y estadisticas por usuario.
- [x] Estados de progreso `iniciado`, `en curso`, `pausado` y `completado`.
- [x] Auditoria de robustez del progreso: calculos derivados, reanudacion,
  concurrencia, validacion y recuperacion ante errores de red.
- [x] Favicon propio de CanteraHub para la pestana del navegador.

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

### [x] Progreso por usuario

Estado: hecho.

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

#### [x] Fase 1. Modelo de datos de progreso

Estado: hecho.

Tareas:

- Crear tabla de progreso por leccion y usuario.
- Crear tabla resumen por roadmap y usuario si compensa para consultas rapidas.
- Definir campos minimos: `started_at`, `last_activity_at`, `completed_at`, `time_spent_seconds`.
- Preparar la base para guardar intentos y nota de quiz por usuario.

Hecho cuando:

- La base de datos soporta progreso individual sin ambiguedades.
- Las migraciones son idempotentes.
- Hay tests de bootstrap y persistencia.

#### [x] Fase 2. Escritura de progreso

Estado: hecho para acceso a roadmaps/modulos y avance de lecciones.
La escritura de intentos de quiz queda en la fase 6.

Tareas:

- Marcar una leccion como completada por usuario, no como estado global.
- Registrar inicio de roadmap al primer acceso o primera accion.
- Actualizar `last_activity_at` al abrir modulo, completar leccion o enviar quiz.
- Registrar tiempo de estudio con una aproximacion simple y robusta.

Hecho cuando:

- Dos usuarios pueden avanzar en el mismo roadmap sin interferirse.
- El progreso sobrevive reinicios de sesion.
- Hay tests de API para flujos de avance y reanudacion.

#### [x] Fase 3. Resumen visible al iniciar sesion

Estado: hecho.

Tareas:

- Crear una vista o dashboard ligero post-login para `Mis roadmaps`.
- Mostrar solo roadmaps iniciados y opcionalmente sugerir otros disponibles.
- Enseñar porcentaje, ultimo modulo visto, ultima actividad y boton de continuar.
- Si hay varios roadmaps activos, ordenarlos por actividad reciente o prioridad.

Hecho cuando:

- Tras el login el usuario entiende en segundos por donde continuar.
- El estado de cada roadmap se ve sin entrar en el detalle.
- Hay tests de UI del dashboard de inicio.

#### [x] Fase 4. Detalle de roadmap y modulo con progreso

Estado: hecho.

Tareas:

- Mostrar barra o indicador de progreso por roadmap.
- Marcar modulos completados, en curso o no iniciados.
- Mostrar progreso por lecciones dentro del modulo.
- Incluir un bloque de `siguiente paso recomendado`.

Hecho cuando:

- El detalle de roadmap y modulo refleja progreso persistente.
- La lectura del contenido sigue siendo limpia y no se vuelve recargada.

#### [x] Fase 5. Tiempo de estudio

Estado: hecho con estimacion simple por interaccion al completar
lecciones y acumulado visible en `Mis roadmaps`.

Tareas:

- Definir una estrategia simple de tracking, por ejemplo tiempo
  estimado por interaccion o sesiones activas con timeout.
- Acumular tiempo por modulo y por roadmap.
- Mostrar tiempo total y tiempo reciente al usuario.

Hecho cuando:

- El tiempo mostrado es consistente aunque sea aproximado.
- No depende de mantener la pestana abierta de forma perfecta.
- Hay tests para acumulacion basica.

#### [x] Fase 6. Quizzes y notas

Estado: hecho. Los quizzes se generan desde contenidos, actividades,
recursos y evidencias del modulo. Los intentos quedan persistidos por
usuario y se muestran mejor nota, media y ultimo intento.

Tareas:

- Extraer o normalizar preguntas de quiz desde los roadmaps.
- Guardar intentos, respuestas y puntuacion por usuario.
- Mostrar nota mas alta, ultimo intento y fecha.
- Decidir si el quiz puntua progreso o solo evaluacion.

Hecho cuando:

- Un usuario puede responder un quiz y recuperar su nota despues.
- La nota aparece en el contexto del roadmap o modulo.
- Hay tests de intento, correccion y consulta.

#### [x] Fase 7. Estadisticas de aprendizaje

Estado: hecho. `Mis roadmaps` muestra iniciados, completados,
pausados, lecciones completadas, tiempo acumulado y media de quiz.

Tareas:

- Mostrar roadmaps iniciados, completados y pausados.
- Mostrar lecciones completadas, tiempo acumulado y media de quiz.
- Preparar base para futuras metricas admin sin duplicar logica.

Hecho cuando:

- El usuario ve un resumen util de su actividad.
- Las metricas no requieren consultas fragiles ni lentas.

#### [x] Fase 8. Reglas de negocio y experiencia

Estado: hecho. `Iniciado` significa roadmap abierto sin avance real;
`en curso`, actividad reciente con modulo o lecciones; `pausado`,
roadmap sin completar con actividad anterior a 14 dias; `completado`,
todas las lecciones cerradas. El quiz suma evaluacion y actividad,
pero no bloquea el cierre del modulo.

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

#### [x] Fase 9. Auditoria de robustez y puntos de ruptura

Estado: hecho.

Hallazgos corregidos:

- El dashboard confiaba en contadores y tiempo duplicados en la tabla resumen;
  al borrar o anadir lecciones podian quedar obsoletos. Ahora se derivan del
  progreso real por leccion en cada consulta.
- Un roadmap podia seguir figurando como completado despues de anadir una
  leccion nueva. La finalizacion ahora exige que todas las lecciones actuales
  esten completadas.
- `Continuar` podia recomendar la ultima leccion visitada aunque ya estuviera
  terminada. Ahora busca la primera leccion pendiente segun el orden del roadmap.
- Volver a guardar una leccion completada reemplazaba su fecha original. Se
  conserva la primera finalizacion y se limpia correctamente al reabrirla.
- Las escrituras de progreso usaban lectura seguida de escritura y eran
  vulnerables a colisiones. Ahora usan `UPSERT` y el tiempo se acumula en SQL.
- El cliente podia enviar cantidades de tiempo arbitrariamente altas. El API
  valida el dato y limita cada incremento a 30 minutos.
- IDs decimales y respuestas parciales o invalidas de quiz podian aceptarse.
  Ahora se rechazan antes de persistir intentos o progreso.
- La ausencia de intentos de quiz podia convertirse en `0%` y la media global
  no tenia en cuenta cuantos intentos habia en cada roadmap. Ahora `sin nota`
  sigue siendo nulo y la media se pondera por intentos reales.
- Abrir un modulo autenticado podia mostrarlo como `no iniciado` en esa misma
  respuesta. Ahora el estado visible es coherente con la actividad registrada.
- Los fallos de carga o guardado podian parecer estados vacios o cargas
  infinitas. Las pantallas de progreso ofrecen error explicito y reintento.

Hecho cuando:

- Cambios en el catalogo no dejan porcentajes ni estados obsoletos.
- La reanudacion siempre apunta a contenido pendiente.
- Repeticiones y peticiones concurrentes no pierden tiempo ni duplican filas.
- Los limites de confianza se aplican en servidor y estan cubiertos por tests.

### [x] Buscador y filtros

Estado: hecho. Fases 1 a 5 completadas.

Valor: prepara la aplicacion para crecer sin perder usabilidad.

Situacion actual y decisiones:

- El listado actual solo recibe titulo, descripcion y numero de modulos. La
  busqueda sobre contenido de modulos debe resolverse en servidor, sin enviar
  todo el contenido tecnico al navegador.
- No existen campos normalizados de categoria o tags. No se deben inferir de
  titulos porque produciria filtros inconsistentes al crecer el catalogo.
- Algunos seeds incluyen `level`, pero el dato no se persiste en `modules`.
  Las duraciones se guardan como texto libre y no permiten rangos fiables.
- La URL sera la fuente de verdad de busqueda, filtros y orden para conservar
  estado al recargar, navegar atras o compartir un resultado.
- La busqueda sera insensible a mayusculas y acentos. Los caracteres especiales
  de SQL se trataran como texto y todas las consultas seran parametrizadas.
- Se aplicara `AND` entre familias de filtros y `OR` dentro de una misma familia;
  por ejemplo: tema `AWS` o `DevOps`, con nivel `intermedio`.

#### [x] Fase 1. Busqueda textual en API

Estado: hecho.

Tareas:

- Ampliar `GET /api/roadmaps` con un parametro `q` opcional y retrocompatible.
- Buscar por titulo, descripcion, objetivos y metodologia del roadmap, y por
  titulo, objetivo y contenidos de sus modulos mediante una unica consulta
  agregada, evitando duplicados y N+1.
- Normalizar espacios, mayusculas y acentos, limitar la longitud de la consulta
  y escapar comodines de `LIKE` como texto literal.
- Definir un orden estable: coincidencia en titulo, coincidencia en descripcion,
  coincidencia en modulo y, como desempate, titulo o id.
- Mantener la respuesta actual cuando no se envia `q`.
- Eliminar el texto agregado de modulos antes de construir la respuesta publica.

Hecho cuando:

- La API encuentra coincidencias de roadmap y modulo sin exponer contenido extra.
- Consultas vacias, con acentos o caracteres especiales son predecibles y seguras.
- Hay tests de API para coincidencias, ausencia de resultados y compatibilidad.

#### [x] Fase 2. Experiencia de busqueda en el catalogo

Estado: hecho. El catalogo sincroniza la busqueda con la URL, aplica debounce,
cancela peticiones obsoletas y diferencia los estados de carga, error y vacio.

Tareas:

- Incorporar un campo de busqueda accesible, boton de limpiar y contador de
  resultados en `/roadmaps`.
- Sincronizar `q` con la URL y restaurarlo al recargar o navegar atras.
- Aplicar un debounce corto y cancelar peticiones anteriores para impedir que
  una respuesta lenta sobrescriba una busqueda mas reciente.
- Diferenciar claramente carga inicial, error con reintento, catalogo vacio y
  busqueda sin coincidencias.
- Mantener visible y funcional el formulario admin sin que los filtros lo oculten.

Hecho cuando:

- Buscar, limpiar y usar atras/adelante conserva un estado coherente.
- La UI no parpadea ni muestra resultados antiguos durante escritura rapida.
- Teclado y lectores de pantalla pueden identificar busqueda, estado y resultados.

#### [x] Fase 3. Metadatos fiables para filtros

Estado: hecho. Los roadmaps tienen categoria y topics normalizados, los modulos
usan niveles estables y tanto modulos como roadmaps guardan limites de duracion
en semanas. La API publica las facetas disponibles desde los datos persistidos.

Tareas:

- Definir una categoria principal y topics normalizados para cada roadmap,
  preferiblemente con una tabla relacional para evitar tags duplicados.
- Persistir `level` en modulos y acordar los valores permitidos en espanol o
  mediante claves estables (`beginner`, `intermediate`, `advanced`, `capstone`).
- Guardar limites de duracion comparables en semanas en vez de filtrar el texto
  mostrado; conservar el texto original para presentacion.
- Actualizar migraciones, seeds, tipos, altas/ediciones admin y tests de
  idempotencia sin perder roadmaps existentes.
- Generar las opciones disponibles desde los datos de la API, no desde listas
  duplicadas en React.

Hecho cuando:

- Todos los roadmaps sembrados tienen metadatos explicitos o un estado visible
  de `sin clasificar`.
- Nivel y duracion se pueden consultar sin parsear textos en el navegador.
- Las migraciones sobreviven bases existentes y ejecuciones repetidas.

#### [x] Fase 4. Filtros combinables y ordenacion

Estado: hecho. El catalogo combina categoria, topics, nivel y rangos de
duracion con busqueda textual, muestra chips eliminables y permite ordenar por
relevancia, titulo o duracion. Todo el estado se conserva en una URL canonica.

Tareas:

- Filtrar por categoria o topic, nivel y rangos de duracion.
- Permitir combinar filtros con `q` y mostrar cada filtro activo como chip
  eliminable, junto con una accion unica `Limpiar todo`.
- Incorporar ordenacion minima por relevancia, titulo y duracion.
- Incluir filtros y orden en la URL con valores validados y canonicos.
- Devolver las facetas y cantidades necesarias sin ejecutar una consulta por
  tarjeta ni ocultar opciones por el orden accidental de las respuestas.

Hecho cuando:

- Las combinaciones siguen las reglas `AND`/`OR` documentadas.
- Quitar un chip solo elimina ese criterio y `Limpiar todo` restaura el catalogo.
- URLs invalidas se normalizan sin romper la pagina ni la API.

#### [x] Fase 5. Calidad, rendimiento y cierre

Estado: hecho. La consulta agregada evita el producto cartesiano entre modulos
y topics, usa indices por roadmap y queda medida con 300 roadmaps, 2.400 modulos
y 900 relaciones de topics. Se reforzaron URL canonica, facetas de duracion,
layout con opciones largas, foco visible, regiones vivas y cobertura API/UI.

Tareas:

- Cubrir busqueda, combinacion de filtros, orden, URL, borrado, errores y estados
  vacios con tests de API y UI.
- Verificar que el layout funciona en movil, con nombres largos y muchas opciones.
- Medir consultas con el volumen esperado e incorporar indices utiles.
- Mantener la consulta agregada y el filtrado en servidor mientras el catalogo
  sea pequeno; valorar SQLite FTS5 solo si las medidas muestran que aporta valor
  y encapsularlo para el futuro cambio de base de datos previsto en despliegue.
- Revisar copy, foco, regiones `aria-live` y contraste antes de cerrar la tarea.

Hecho cuando:

- El usuario puede localizar un roadmap concreto en pocos segundos.
- Puede combinar y compartir filtros sin perder el contexto de navegacion.
- Los filtros no rompen el layout ni la creacion admin actual.
- La busqueda no expone SQL, no devuelve duplicados y evita respuestas fuera de orden.
- Hay cobertura para estados vacios, errores, combinaciones, URL y borrado.
- El rendimiento esta medido y es suficiente para el volumen objetivo.

### [x] Importador JSON de roadmaps

Estado: completado.

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

Notas de implementacion:

- La importacion requiere rol admin, admite archivo o contenido pegado y limita el JSON a 1 MB.
- La vista previa muestra errores asociados a su ruta dentro del JSON antes de guardar.
- La actualizacion busca el roadmap por titulo y los modulos por posicion o titulo.
- Actualizar no elimina modulos omitidos ni su progreso asociado.

### [x] Evidencias y portfolio por modulo

Estado: completado.

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

Notas de implementacion:

- Cada usuario dispone de una unica evidencia actualizable por modulo.
- Se admiten enlaces de GitHub, demo o documento, y entregas basadas en nota.
- El detalle del roadmap distingue `Solo lectura` y `Con evidencia`.
- El panel admin permite consultar la evidencia con su usuario, roadmap,
  modulo y fecha de actualizacion.

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
