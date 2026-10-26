# Backlog de Plexus Academy

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
- [x] Favicon propio de Plexus Academy para la pestana del navegador.
- [x] UI Redesign: header compacto, admin dropdown, branding actualizado.
- [x] Reset de contraseña admin en SQLite local.
- [x] Validacion de entradas y contratos de error con `zod` (`VALIDATION.md`).
- [x] Separacion de dominios y persistencia: servicios, puertos y repositorios por
  dominio (`ARCHITECTURE.md`).
- [x] Contratos API estables: esquemas de respuesta, OpenAPI 3.1 generado
  (`openapi.json`), tipos compartidos y tests de contrato (`API_CONTRACTS.md`).
- [x] Fuga de respuestas de quizzes y conteos en PostgreSQL (contrato 2.0.0).
- [x] Importador de roadmaps validado con Zod y documentado en OpenAPI (contrato 3.1.0).
- [x] Transacciones reutilizables (`DatabaseClient.transaction()` y puerto
  `UnitOfWork`) en las operaciones de varias escrituras.
- [x] Coherencia de la API: errores 401/403/405/429 en espanol, `405` en JSON,
  DELETE de roadmap idempotente y forma unica de usuario (contrato 3.0.0).
- [x] Pendientes de coherencia: un unico `401` en evidencias, alta de usuarios
  con `roadmap_access_ids` y reglas de version compartidas (contrato 3.2.0).
- [x] Errores 500 en JSON para toda la API con `withApiErrors` (contrato 3.3.0).

## Siguiente hoja de ruta tecnica

La base funcional principal ya esta implementada. Los siguientes pasos se
centran en convertir la aplicacion en una plataforma web multiusuario con
PostgreSQL central, manteniendo SQLite para desarrollo y tests.

1. [x] Capa de acceso SQL estructurada.
2. [x] Validacion de entradas y contratos con `zod`.
3. [x] Separacion de dominios: autenticacion, contenido, progreso,
   administracion y persistencia.
4. [x] Migraciones formales de PostgreSQL.
5. [x] Tests de integracion contra PostgreSQL real.
6. [x] Gestion de conexiones y transacciones.
7. [x] Contratos API estables y documentados.
8. [ ] Observabilidad, backups y recuperacion (pausado hasta decidir hosting).
9. Versionado completo de roadmaps.
10. PWA con manifest y service worker.

Cada punto debe mantener compatibilidad con SQLite local salvo que el propio
objetivo requiera PostgreSQL. La migracion `feature/migration_2_postgresql`
ya esta integrada en `main`; los detalles pendientes de esa integracion se
mantienen en los bloques tecnicos de abajo.

Integracion (2026-10-17): los puntos 1 a 7 y las correcciones derivadas estan
fusionados en `main` mediante la cadena de PRs #3 a #12 (sobre
`chore/audit-fix-force`) y el PR #14 (`chore/audit-fix-force` -> `main`).
Contrato API vigente: 3.5.0 (ver `API_CONTRACTS.md`). Siguiente punto de la
hoja de ruta: 9, versionado completo de roadmaps.

## Estrategia de ramas

- Usar una rama tematica por cambio con impacto funcional o de infraestructura.
- Nombrar las ramas como `feature/<tema>` o `chore/<tema>` cuando no haya
  comportamiento de usuario.
- Integrar en `develop` (rama por defecto) y llevar `develop` a `main` solo
  cuando lo integrado este probado (ver `WORKFLOW.md`).
- Mantener `main` siempre integrable y fusionar solo despues de tests, lint y
  build.
- Agrupar en una misma rama las tareas pequeñas que forman una sola unidad
  tecnica; no crear una rama por cada archivo o ajuste menor.
- Ramas previstas: `feature/sql-access-layer`, `feature/input-validation-zod`,
  `refactor/domain-separation`, `feature/postgres-migrations`,
  `test/postgres-integration`, `chore/db-transactions`,
  `feature/api-contracts`, `chore/observability-backups`,
  `feature/roadmap-version-history` y `feature/pwa`.

## Prioridad alta

### [x] Capa de acceso SQL estructurada

Estado: hecho. Se establecio el patron de repositorio tipado con `Kysely`
(elegido sobre `Drizzle` por conservar el control del SQL existente y ofrecer
tipado, soporte PostgreSQL/SQLite y migraciones) y se aplico a cuatro dominios
como base reutilizable para el resto. La migracion del resto de dominios queda
como tarea aparte de menor prioridad (ver `Migrar dominios restantes a la capa
SQL estructurada`), sin bloquear el resto de la hoja de ruta.

Objetivo: sustituir gradualmente el acceso SQL disperso por una capa tipada
que mantenga SQLite local y PostgreSQL remoto sin duplicar la logica de negocio.

Patron establecido (usar como referencia para nuevos dominios):

- Esquema Kysely compartido en `lib/kyselyDatabase.ts`: una interfaz de tabla
  por tabla, una interfaz `Database` que las agrupa, y `getQueryDatabase(pool)`
  que cachea una instancia `Kysely` por `Pool` de PostgreSQL (`WeakMap`).
  Columnas nullable sin valor en el insert original usan el helper
  `OptionalOnInsert` (`ColumnType`) para que `Insertable<...>` no las exija.
- Un repositorio por dominio (`lib/roadmapRepository.ts`, `lib/auditRepository.ts`,
  `lib/moduleRepository.ts`, `lib/lessonRepository.ts`): cada funcion recibe el
  `DatabaseClient` generico y decide backend con `db.backend !== 'postgres'`;
  la rama SQLite usa el SQL parametrizado ya existente (sin reescribirlo) y la
  rama PostgreSQL usa `getQueryDatabase((db as PostgresDb).getPool())`, de modo
  que se reutiliza el pool de conexiones en vez de crear uno nuevo por dominio.
- Los handlers de `pages/api` importan el repositorio y dejan de construir SQL
  o decidir el backend con `if (db.backend === 'postgres')`.
- Tests de regresion por repositorio en `test/*Repository.test.ts` cubren la
  ruta SQLite (lectura, escritura parcial, entidad inexistente). La ruta
  PostgreSQL no tiene tests propios todavia porque no existe infraestructura
  de base de test aislada (tarea aparte `test/postgres-integration`).

Hecho cuando (para el alcance migrado):

- Las consultas de los dominios migrados pasan por la capa estructurada.
- SQLite y PostgreSQL producen el mismo contrato observable.
- Existen tests de regresion para la ruta SQLite de cada repositorio.

Avance actual:

- `roadmapRepository`: lectura (`findRoadmapById`) y escritura representativa
  (`updateRoadmapCore`) del detalle de roadmap.
- `auditRepository`: `insertAuditLog` (usado por `writeAuditLog`) y
  `listAuditLogs`.
- `moduleRepository`: listados por roadmap/roadmaps/todos, lectura por id,
  alta, actualizacion parcial y baja.
- `lessonRepository`: listado por modulo, lectura por id (con y sin join a
  `roadmap_id`), alta, actualizacion y baja.
- `userRepository`: listado, lectura por id, alta (con deteccion de email
  duplicado), activar/desactivar, resetear contrasena, marcar acceso a todos
  los roadmaps, contar admins activos, gestion de `user_roadmap_access` y
  borrado de sesiones por usuario.
- Pendiente (movido a tarea aparte): progreso, quizzes, evidencias, admin,
  portfolio, import/export de roadmaps y tests de integracion contra
  PostgreSQL real.

### [x] Migrar dominios restantes a la capa SQL estructurada

Estado: hecho. Los diez dominios pendientes (usuarios, progreso, quizzes,
evidencias, admin dashboard, portfolio e import/export de roadmaps) estan
migrados a `DatabaseClient`/Kysely, cada uno en su propia rama apilada
(`feature/progress-repository-postgres` → `.../quizzes-...` →
`.../evidences-...` → `.../admin-dashboard-...` → `.../portfolio-...` →
`.../roadmap-import-export-...`), con tests SQLite reales + pool `pg`
simulado para cada uno. Queda como tarea aparte, ya listada mas abajo,
anadir tests de integracion contra PostgreSQL real (hoy ninguna rama Postgres
se ha probado contra una base real, solo con pools simulados).

Valor: completa la sustitucion gradual del acceso SQL disperso iniciada en
`Capa de acceso SQL estructurada`, siguiendo el patron ya validado en
`lib/kyselyDatabase.ts` y los repositorios de roadmaps, auditoria, modulos y
lecciones.

Tareas:

- [x] Migrar usuarios (`pages/api/users/*`): dominio mas escrito-intensivo
  (hash de contrasenas, invalidacion de sesiones, comprobaciones de carrera
  sobre el numero de admins); requiere especial cuidado para no bloquear
  cuentas. Se creo `lib/userRepository.ts` siguiendo el patron establecido
  (rama SQLite con SQL parametrizado existente, rama Postgres con Kysely),
  anadiendo `UsersTable`, `SessionsTable` y `UserRoadmapAccessTable` a
  `lib/kyselyDatabase.ts`. Tambien se anadio `findExistingRoadmapIds` a
  `roadmapRepository.ts` (validacion de ids usada por `set_roadmap_access`).
  `pages/api/users/index.ts` y `pages/api/users/[id].ts` ya no construyen SQL
  ni deciden el backend directamente. Se preservo el comportamiento exacto
  (incluida la doble comprobacion redundante de admins activos al desactivar,
  y el error `DuplicateEmailError` para violaciones de unicidad de email en
  ambos backends: `SQLITE_CONSTRAINT` y `23505` de Postgres). Sesiones/login
  (`lib/auth.ts`) quedan fuera de alcance: pertenecen a la migracion de
  autenticacion, no a este dominio de gestion de usuarios. Tests nuevos:
  `test/userRepository.test.ts` (SQLite real) y
  `test/userRepository.postgres.test.ts` (pool `pg` simulado), mas cobertura
  de `findExistingRoadmapIds` en los tests existentes de `roadmapRepository`.
- [x] Migrar progreso (`pages/api/progress/*`, `lib/progress.ts`): consultas mas
  complejas (CTEs, funciones ventana, upserts `ON CONFLICT ... excluded`
  especificos de SQLite); es el dominio de mayor riesgo de traduccion a
  PostgreSQL. Se creo `lib/progressRepository.ts` (reemplaza `lib/progress.ts`)
  siguiendo el patron establecido, con `UserLessonProgressTable`,
  `UserRoadmapProgressTable` y `UserQuizAttemptsTable` anadidas a
  `lib/kyselyDatabase.ts`. El CTE con `ROW_NUMBER() OVER (PARTITION BY ...)` de
  `listUserRoadmapProgress` y los dos upserts `ON CONFLICT ... excluded`
  (`touchRoadmapProgress`, `setLessonProgress`) se tradujeron a mano para
  Postgres via el template `sql` de Kysely en lugar del query builder, dado que
  el acumulador y el `CASE` autorreferencial de `setLessonProgress` no se
  pueden expresar limpiamente con `.onConflict().doUpdateSet()`. Se elimino el
  wrapper `datetime()` en la rama Postgres porque esos timestamps son
  `TIMESTAMPTZ` nativos alli (en SQLite se guardan como TEXT ISO). Tests
  nuevos: `test/progressRepository.test.ts` (SQLite real) y
  `test/progressRepository.postgres.test.ts` (pool `pg` simulado).
  `getRoadmapProgressSnapshot` y `getLessonContext` quedaron como SQL crudo via
  `sql` tag (no builder) por presupuesto de esfuerzo; pendiente de
  homogeneizar si se quiere consistencia total con el query builder.
- [x] Migrar quizzes (intentos): se creo `lib/quizRepository.ts` con
  `saveModuleQuizAttempt`, `getModuleQuizSummary` y `checkAttemptEligibility`
  sobre `DatabaseClient` (antes usaban un `DbHandle` a mano); `lib/quizzes.ts`
  queda solo con las funciones puras de construccion/calificacion de quizzes.
  El `ORDER BY datetime(submitted_at)` se resolvio igual que en progreso: rama
  SQLite conserva `datetime()`, rama Postgres ordena por el timestamptz
  nativo. De paso, `pages/api/quizzes/modules/[id].ts` dejo de hacer
  `SELECT * FROM modules WHERE id = ?` a mano y usa `findModuleById` de
  `moduleRepository`. Se verifico (sin reescribirlas) que las subconsultas de
  estadisticas de quiz ya embebidas en `listUserRoadmapProgress` (progreso)
  ya tenian bien resuelto el mismo problema de `datetime()`; quedan sin
  consolidar con `quizRepository` a proposito por tener granularidad distinta
  (por roadmap vs. por modulo). Tests nuevos: `test/quizRepository.test.ts` y
  `test/quizRepository.postgres.test.ts`.
- [x] Migrar evidencias: se creo `lib/evidenceRepository.ts` con
  `getModuleEvidence`, `saveModuleEvidence` (upsert), `reviewModuleEvidence`,
  `getEvidenceById`, `deleteModuleEvidence` y `listEvidences` (el listado admin
  con filtros dinamicos, antes SQL inline en el handler) sobre
  `DatabaseClient`; `lib/evidences.ts` queda solo con constantes/tipos y
  `validateEvidenceInput`. El upsert `ON CONFLICT(user_id, module_id)` se
  tradujo con el query builder de Kysely (`.onConflict().doUpdateSet()`), sin
  necesidad de SQL crudo porque no hay acumulador autorreferencial como en
  quizzes/progreso. De paso, `pages/api/evidences/modules/[id].ts` sustituyo
  el `SELECT id, roadmap_id FROM modules` a mano por `findModuleById` de
  `moduleRepository`. Se anadio auditoria a la revision admin de evidencias
  (`pages/api/evidences/[id]/review.ts`), accion `evidence.review`, con estado
  anterior y posterior en el detalle — gap detectado durante la migracion,
  cerrado a peticion expresa. Tests nuevos: `test/evidenceRepository.test.ts`
  y `test/evidenceRepository.postgres.test.ts`. Portfolio y admin dashboard
  quedan fuera de alcance (leen `user_module_evidences` pero son tareas
  aparte).
- [x] Migrar admin dashboard: `lib/adminDashboard.ts` paso de un `DbHandle` a
  mano a `DatabaseClient`, separando `getAdminDashboardRowsSqlite` (SQL
  original sin cambios) de `getAdminDashboardRowsPostgres` (las 4 consultas
  agregadas, incluidas las 3 CTEs, traducidas a mano via el template `sql` de
  Kysely, no el query builder, por el mismo motivo que en progreso/quizzes).
  `is_active = 1` se mantuvo igual en ambos backends (la columna es
  `INTEGER`, no booleana, en los dos esquemas — verificado contra el uso ya
  existente en `userRepository.ts`/`auth.ts`, no era un problema real pese a
  la sospecha inicial). `julianday(a) - julianday(b)` se tradujo a
  `FLOOR(EXTRACT(EPOCH FROM (a::timestamptz - b)) / 86400)::INTEGER`, validado
  contra la fixture existente (33 dias) pero **sin verificar en Postgres
  real** casos de borde con fracciones de dia cerca de un limite — pendiente
  de contrastar cuando se aborde el punto de tests de integracion contra
  PostgreSQL real (mas abajo). Tests nuevos:
  `test/admin-dashboard.postgres.test.ts`.
- [x] Migrar portfolio: `getUserPortfolio` paso a `DatabaseClient`. En vez de
  triplicar el join evidencia+modulo+roadmap, se reutilizo
  `listEvidences(db, { userId })` de `evidenceRepository.ts` (sin modificarlo)
  y se reconstruyo en JS el orden original (`roadmap_title`,
  `module_position` o `module_id`, `updated_at` desc), ya que `listEvidences`
  ordena distinto para su propio caso de uso (listado admin). La comprobacion
  de usuario activo (`is_active = 1`, columna `INTEGER` en ambos esquemas, no
  booleana) quedo en un helper privado dentro de `lib/portfolio.ts`, ya que
  `findUserById` de `userRepository` no filtra por `is_active` y no se quiso
  anadir ese comportamiento a un repositorio ya cerrado. Tests nuevos:
  `test/portfolio.postgres.test.ts`; `test/portfolio.test.ts` adaptado a
  `DatabaseClient` real via `openSqliteDb`. Nota de fragilidad detectada (no
  bloqueante): combinar `openDb()` + `chdir` + `vi.doMock` en cierto orden de
  ejecucion de tests provoca `SQLITE_MISUSE: Database is closed` por
  contaminacion entre tests; se evito usando `openSqliteDb()` con ruta
  explicita, pero la causa raiz no se diagnostico — revisar si otros
  dominios migrados comparten el mismo patron fragil.
- [x] Migrar import/export de roadmaps (ultimo dominio de esta tarea):
  `lib/roadmapImport.ts` y `lib/roadmapMetadata.ts` pasaron a `DatabaseClient`.
  Es el unico dominio con transaccion multi-tabla (`BEGIN IMMEDIATE` sobre
  `roadmaps` + `modules` + `roadmap_categories`/`topics`/`roadmap_topics`);
  por decision expresa se uso SQL crudo parametrizado en ambos backends
  dentro de la transaccion en vez de Kysely, porque el query builder no
  participa del `transactionClient` que `PostgresDb` usa internamente para
  `BEGIN`/`COMMIT`/`ROLLBACK` — excepcion deliberada y acotada solo a este
  bloque transaccional, el resto de dominios sigue usando Kysely para
  Postgres. Se descubrio que `PostgresDb.translateSql()` ya traduce solo
  placeholders `?`→`$n`, `BEGIN IMMEDIATE`→`BEGIN` e incluso
  `INSERT OR IGNORE`→`ON CONFLICT DO NOTHING`, asi que casi ningun SQL
  necesito duplicarse. Excepcion: `ORDER BY ... COLLATE NOCASE` se rama
  explicitamente a `lower(...)` para Postgres, porque el stripping generico
  de `translateSql` simplemente borra `COLLATE NOCASE` sin preservar el
  orden case-insensitive. Tests nuevos:
  `test/roadmap-import.postgres.test.ts` (incluye un caso real de rollback a
  mitad de transaccion) y `test/roadmap-export.postgres.test.ts`.
- Anadir tests de integracion contra PostgreSQL real para los dominios ya
  migrados (roadmaps, auditoria, modulos, lecciones) y para los nuevos,
  reutilizando la base de test aislada de `test/postgres-integration`.

Hecho cuando:

- Todos los dominios de `pages/api` acceden a la base de datos a traves de un
  repositorio tipado, sin SQL disperso en los handlers.
- Existen tests de regresion para SQLite y PostgreSQL en cada dominio migrado.

### [x] Validacion de entradas y contratos con Zod

Estado: hecho (2026-10-15). `zod` v4 es dependencia de runtime y las APIs que
leen entrada (cuerpo, query y `[id]`) la validan con esquemas de `lib/validation/`
antes de las consultas de negocio. Los errores usan un contrato unico
`{ error, issues? }` con mensajes en espanol, sin trazas ni detalles internos.
Arquitectura, contrato, orden de validacion, decisiones y seguimiento en
[`VALIDATION.md`](VALIDATION.md).

Tareas:

- [x] Anadir `zod` como dependencia de runtime.
- [x] Crear esquemas compartidos para auth, usuarios, roadmaps, modulos,
  lecciones, progreso, quizzes, evidencias, catalogo e importaciones.
- [x] Devolver errores de validacion consistentes sin filtrar detalles internos.
- Seguimiento (fuera de alcance): mensajes 401/403/405/429 de `lib/http/auth.ts`
  y `lib/http/rateLimit.ts` siguen en ingles (resuelto en la 3.0.0, ver
  "Coherencia de la API"); `validateRoadmapImport` sigue sin
  migrar a Zod (resuelto, ver "Migrar a Zod la validacion del importador de
  roadmaps"). Ver `VALIDATION.md`.

Rama sugerida: `feature/input-validation-zod`.

Hecho cuando:

- Las entradas de las APIs principales se validan antes de tocar la base de datos.
- Los tests cubren payloads validos, invalidos y limites.

### [x] Migrar a Zod la validacion del importador de roadmaps

Estado: hecho (2026-10-16). `validateRoadmapImport` dejo de ser codigo manual:
el documento se valida con `roadmapImportSchema`
(`lib/domains/content/importSchema.ts`: textos y listas con limites, enlaces,
`level`, preguntas de quiz como union discriminada por `type`, reglas entre campos
en `superRefine` y `.transform` hacia `NormalizedRoadmapImport`) y la funcion es
un envoltorio fino con la misma firma. El administrador ve los mismos `path` y
`message` (`modules[0].quiz[1].answer`), fijados por un test de caracterizacion
de 238 entradas grabado con el validador anterior. El contrato OpenAPI pasa a la
3.1.0 (MINOR, aditivo) y describe `roadmap` por completo (`RoadmapImportDocument`).
Detalle, decisiones y diferencias conocidas en [`VALIDATION.md`](VALIDATION.md)
(seccion Importacion) y [`API_CONTRACTS.md`](API_CONTRACTS.md) (3.1.0).

Tareas:

- [x] Test de caracterizacion del validador anterior antes de migrar.
- [x] Esquema Zod del roadmap, de los modulos y de las preguntas de quiz.
- [x] Reglas entre campos y normalizacion con `.transform`.
- [x] Documento completo en el sobre del contrato; `openapi.json` regenerado (3.1.0).
- [x] Documentacion tecnica (`VALIDATION.md`, `API_CONTRACTS.md`).
- Sin documentacion de usuario: no hay cambios visibles en la pantalla de importacion.
- Seguimiento: ninguno propio; las dos diferencias menores (orden de las `issues`
  y `type` de pregunta no permitido) estan documentadas en `VALIDATION.md`.

Hecho cuando:

- [x] Los mensajes y rutas de `issues` coinciden con los del validador anterior.
- [x] Los tests de `413` (mas de 1 MB) y `409` (conflicto) siguen en verde.
- [x] El contrato OpenAPI describe el documento completo.

### [x] Separacion de dominios y persistencia

Estado: hecho (2026-10-15). El codigo de `lib/` se organiza por dominios
(`auth`, `content`, `progress`, `admin`, `audit`) con `service.ts` (casos de uso
y reglas), `ports.ts` (interfaces), `types.ts` y `repositories/` (unica
implementacion de cada puerto, con sus ramas SQLite/Postgres). El driver, el
esquema y el seed viven en `lib/persistence/`; los adaptadores de Next
(cookies, origen, IP, 401/403/429) en `lib/http/`; y `lib/container.ts` conecta
todo. Refactorizacion pura: no cambia ningun estado, cuerpo ni mensaje de la
API. Capas, regla de dependencia, como anadir un caso de uso, estrategia de
tests y trabajo futuro en [`ARCHITECTURE.md`](ARCHITECTURE.md).

Tareas:

- [x] Separar autenticacion, contenido, progreso, administracion y auditoria en
  `lib/domains/*`, y la persistencia en `lib/persistence/`.
- [x] Mover reglas de negocio fuera de los handlers HTTP (progreso de modulo,
  flujo de intentos de quiz, reglas de usuarios, agregacion de metadatos).
- [x] Definir interfaces (puertos) para que las APIs no dependan del driver:
  ningun handler usa `db.*`, `DATABASE_URL` ni `PostgresDb`.
- [x] Servicios de dominio sin dependencia de `next` y tests por dominio con
  repositorios en memoria (`test/domains/`).
- Seguimiento (fuera de alcance): adaptadores por dialecto (opcion B) detras de
  los mismos puertos; unificar los mensajes 401/403/405/429 (resuelto en la
  3.0.0). El helper de
  transacciones comun se implemento despues (ver "Reapertura y correccion" en
  "Gestion de conexiones y transacciones"). Ver `ARCHITECTURE.md`.

Rama sugerida: `refactor/domain-separation`.

Hecho cuando:

- Cada dominio tiene servicios y tipos identificables.
- Los handlers se limitan a autenticar, validar, invocar y responder.
- Los tests de dominio no necesitan levantar Next.js.

### [x] Migraciones formales de PostgreSQL

Estado: hecho. Se eligio el sistema de migraciones propio de `Kysely`
(`Migrator` + `FileMigrationProvider`, importados desde el subpath
`kysely/migration`) en vez de anadir una herramienta nueva: `kysely` ya es
dependencia del proyecto, ya se usa en `lib/adminDashboard.ts` y
`lib/kyselyDatabase.ts`, y su schema builder da migraciones tipadas y
revisables (no SQL crudo).

Se crearon dos piezas:

- `migrations/0001_initial_schema.ts`: traduccion 1:1 (tabla por tabla,
  columna por columna, indices y constraints incluidos) de la constante
  `POSTGRES_SCHEMA` de `lib/postgresDb.ts`, escrita con el schema builder de
  Kysely. Expone `up()`/`down()`; `down()` elimina todo en orden inverso
  seguro para FKs.
- `scripts/migrate.ts`: CLI (`up`/`down`/`status`) que conecta a
  `DATABASE_URL` con la misma configuracion SSL que `PostgresDb` y corre el
  `Migrator` de Kysely. Se niega a ejecutar si `DATABASE_URL` no esta
  definida (nunca cae a SQLite). Expuesto como `npm run migrate:up`,
  `npm run migrate:down`, `npm run migrate:status`.

Dos caminos deliberadamente distintos, no duplicacion accidental:

- `scripts/migrate.ts` (formal, versionado): el camino para despliegues
  reales contra Supabase. Registra cada migracion ejecutada en
  `kysely_migration`/`kysely_migration_lock` y permite rollback controlado.
- `PostgresDb.migrate()` (bootstrap rapido, sin cambios): sigue siendo el
  `CREATE TABLE IF NOT EXISTS` idempotente del que dependen los tests de
  integracion contra Postgres para levantar un esquema efimero rapido. No se
  toco su comportamiento ni se le hizo llamar al nuevo migrador.

Decision de diseno clave: todo `createTable`/`createIndex` de
`0001_initial_schema.ts` usa `.ifNotExists()`. Esto es lo que permite
ejecutar `migrate:up` de forma segura contra el `public` de Supabase, que ya
tiene estas tablas creadas ad-hoc por `PostgresDb.migrate()` — sin esto,
Kysely genera `CREATE TABLE` sin `IF NOT EXISTS` por defecto y la migracion
fallaria contra el esquema compartido. Verificado en vivo: `migrate:status`
(pendiente) -> `migrate:up` (exito, sin duplicar nada) -> `migrate:status`
(ejecutada).

Rollback: `npm run migrate:down` revierte exactamente una migracion (usa
`migrateDown()`, el nombre real de la API de Kysely). Ejecucion segura en
Supabase: correr siempre `npm run migrate:status` antes de `migrate:up` en
produccion; `DATABASE_URL` debe apuntar a la cadena de conexion de Supabase
con SSL (mismo `ssl: { rejectUnauthorized: false }` que usa `PostgresDb`).

Prueba de bootstrap desde cero:
`test/postgres-integration/migrations-bootstrap.postgres-integration.test.ts`
crea un schema Postgres desechable (`CREATE SCHEMA IF NOT EXISTS
migration_bootstrap_test_<marcador>`) contra la misma Supabase compartida,
sin tocar `public`, apunta una conexion dedicada a ese schema (via
`search_path`, fijado por conexion fisica porque el `options` de arranque de
`pg` no es fiable) y corre `migrateToLatest()` dos veces: la primera crea
las 15 tablas esperadas desde una base vacia, la segunda no tiene nada
pendiente (prueba de idempotencia). El schema se elimina siempre en
`afterAll` (`DROP SCHEMA ... CASCADE`). Nota tecnica: el introspector de
Postgres de Kysely no filtra por schema al buscar sus tablas internas
(`kysely_migration*`), asi que el test pasa `migrationTableSchema` al
`Migrator` para evitar que confunda esas tablas con las que ya existen en
`public` de una ejecucion anterior de `migrate:up`.

Tareas:

- [x] Elegir herramienta compatible con la capa SQL seleccionada (Kysely
  `Migrator`).
- [x] Crear migracion inicial reproducible para el esquema actual
  (`migrations/0001_initial_schema.ts`).
- [x] Separar migraciones de datos, seeds y cambios de estructura: no hay
  seeds ni migraciones de datos todavia, solo la migracion estructural
  inicial; el patron (una migracion por archivo, numerada) deja el espacio
  listo para separarlas cuando existan.
- [x] Documentar rollback y ejecucion segura en Supabase (ver arriba).

Rama sugerida: `feature/postgres-migrations`.

Hecho cuando:

- [x] Una base PostgreSQL vacia puede levantarse solo con las migraciones
  (probado con el schema desechable, no solo contra `public`).
- [x] Las migraciones son idempotentes (`.ifNotExists()`) y tienen control
  de version (tabla `kysely_migration` que registra que se ejecuto y
  cuando).
- [x] Existe una prueba de bootstrap desde cero
  (`migrations-bootstrap.postgres-integration.test.ts`).

### [x] Tests de integracion contra PostgreSQL real

Estado: hecho. Cobertura funcional completa (auth, contenido, progreso,
quizzes, importacion, admin dashboard) verificada contra Postgres real, y
ahora tambien contra una instancia de test aislada (ver tarea de aislamiento
mas abajo) — el criterio de "Hecho cuando" que faltaba ya se cumple.
Accesible localmente via `direnv` (`.envrc` carga `DATABASE_URL` desde
`.env.local`); ejecutar con `direnv exec . npm run test:integration:run`
(config dedicada `vitest.integration.config.ts`, ver nota de deadlock mas
abajo). Preferible, sin embargo, usar la base aislada (ver abajo).

Tareas:

- [x] Preparar una base PostgreSQL de test aislada. Se anadio
  `docker-compose.test.yml` (`postgres:16-alpine`, puerto `55432` para no
  chocar con un Postgres local por defecto, usuario/clave/BD de un solo uso
  `postgres`/`postgres`/`app_test`, sin volumen persistente — usa `tmpfs`,
  asi que siempre arranca vacia). Scripts nuevos: `npm run test:db:up`
  (levanta el contenedor y aplica las migraciones formales de
  `scripts/migrate.ts up` contra el, reutilizando el mismo esquema fuente de
  verdad, sin duplicarlo) y `npm run test:db:down` (`down -v`, nunca trata
  esta base como duradera), mas el atajo `npm run test:integration`. Se
  introdujo `TEST_DATABASE_URL` como variable preferente en los 8 ficheros
  `test/postgres-integration/*.postgres-integration.test.ts`
  (`process.env.TEST_DATABASE_URL || process.env.DATABASE_URL`), sin romper
  el fallback existente a `DATABASE_URL`/Supabase real para quien no tenga
  Docker configurado. `scripts/migrate.ts` y `PostgresDb` (`lib/postgresDb.ts`)
  forzaban SSL incondicionalmente (`ssl: { rejectUnauthorized: false }`),
  algo que Supabase requiere pero que el Postgres local de Docker no soporta
  en absoluto — se corrigio detectando `localhost`/`127.0.0.1` en la cadena
  de conexion y desactivando SSL solo en ese caso (mismo fix replicado en los
  dos pools directos de `migrations-bootstrap.postgres-integration.test.ts`).
  Documentado en `test/postgres-integration/README.md` y en
  `README_PROJECT.md`. No se creo `.env.test.example`: los permisos del
  entorno de agente bloquean escribir cualquier fichero `.env*` en la raiz
  del repo; la configuracion (`TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/app_test`)
  quedo documentada en el README en su lugar. Verificado end-to-end: 32/32
  tests pasan contra el contenedor local (mismo recuento que la baseline
  contra Supabase), y 32/32 siguen pasando contra la Supabase real sin
  `TEST_DATABASE_URL` (fallback intacto); `npm run test:db:down` deja el
  contenedor, la red y cualquier volumen completamente eliminados.
- [x] Ejecutar auth, contenido, progreso, quizzes e importacion contra
  PostgreSQL:
  - `test/postgres-integration/auth.postgres-integration.test.ts` — ciclo de
    vida de sesiones (creacion, expiracion, limpieza de sesiones caducadas).
  - `test/postgres-integration/content-repositories.postgres-integration.test.ts`
    — roadmapRepository, moduleRepository, lessonRepository.
  - `test/postgres-integration/progress-repository.postgres-integration.test.ts`
    — upserts `ON CONFLICT` y el CTE con `ROW_NUMBER() OVER (PARTITION BY...)`
    de `listUserRoadmapProgress`, probado con datos reales de 2 roadmaps.
  - `test/postgres-integration/quiz-repository.postgres-integration.test.ts`
    — intentos de quiz, resumen por modulo, elegibilidad (limite intentos,
    cooldown).
  - `test/postgres-integration/roadmap-import.postgres-integration.test.ts`
    — incluye un caso de `ROLLBACK` real a mitad de transaccion forzando una
    violacion de constraint (`modules.title NOT NULL`), confirmando que la
    fila de roadmap ya insertada no sobrevive; el test mockeado anterior solo
    podia probar que se llamaba a `ROLLBACK`, no que limpiaba de verdad.
  - Mas `inactivity_days` en admin dashboard (ver mas abajo).
  27/27 tests pasan contra Postgres real. No aparecieron mas bugs de
  aplicacion en esta tanda (a diferencia del `GROUP BY` de admin dashboard).
- [x] Mantener tests unitarios rapidos sobre SQLite (sin tocar, siguen en
  `test/*.test.ts` con pool `pg` simulado para la forma del SQL).
- [x] Verificar el calculo de `inactivity_days` en admin dashboard
  (`FLOOR(EXTRACT(EPOCH FROM (a::timestamptz - b)) / 86400)::INTEGER`, que
  reemplaza a `julianday()` de SQLite) contra casos de borde con fracciones
  de dia cerca de un limite. Verificado contra Postgres real (Supabase) en
  `test/postgres-integration/inactivity-days.postgres-integration.test.ts`;
  los 7 casos de borde pasan. Esta verificacion destapo un bug real ajeno al
  calculo de dias: la CTE `learner_progress` de
  `getAdminDashboardRowsPostgres` (`lib/adminDashboard.ts`) seleccionaba
  `urp.current_module_id` sin incluirlo en el `GROUP BY`, algo que SQLite
  tolera pero Postgres rechaza (`column "urp.current_module_id" must appear
  in the GROUP BY clause`). Nunca se detecto antes porque los tests previos
  usaban un pool `pg` simulado. Corregido anadiendo
  `urp.current_module_id, urp.last_activity_at` al `GROUP BY` de esa rama (la
  rama SQLite no se toco, no falla ahi).

Notas operativas descubiertas al escribir estos tests:

- Los ficheros bajo `test/postgres-integration/` no pueden correr en
  paralelo: cada fichero llama a `PostgresDb.migrate()`
  (`CREATE TABLE IF NOT EXISTS ...`) contra la misma base, y en paralelo
  produce `error: deadlock detected`. Resuelto con una config dedicada,
  `vitest.integration.config.ts` (`fileParallelism: false`), expuesta como
  `npm run test:integration:run`; ya no hace falta el flag
  `--no-file-parallelism` en la linea de comandos.
- `openDb()` (`lib/db.ts`) cambia de backend globalmente segun exista
  `DATABASE_URL` en el entorno. Con la variable puesta, los tests etiquetados
  "(SQLite backend)" apuntaban tambien a la Postgres real y chocaban entre si
  en paralelo (violaciones de clave duplicada). Resuelto: `vitest.config.ts`
  excluye `test/postgres-integration/**` y fija `DATABASE_URL` y
  `TEST_DATABASE_URL` a cadena vacia en `test.env`, asi que
  `npm run test:unit` siempre usa SQLite aunque `direnv` exporte la variable
  (verificado con una `DATABASE_URL` inalcanzable: 343/343 pasan).

Rama sugerida: `test/postgres-integration`.

Hecho cuando:

- El flujo critico pasa contra PostgreSQL sin depender de la base de produccion.
- Las pruebas limpian sus datos y pueden repetirse localmente o en CI.

### [x] Gestion de conexiones y transacciones

Estado: hecho. Los tres criterios de "Hecho cuando" se cumplen (ver
correccion mas abajo sobre errores controlados) y todas las sub-tareas estan
cerradas.

Tareas:

- [x] Revisar ciclo de vida del pool PostgreSQL en desarrollo, tests y
  serverless. Bug real confirmado y corregido: `openDb()` (`lib/db.ts`)
  creaba una instancia `new PostgresDb(...)` (y por tanto un `pg.Pool`
  nuevo, `max: 5`) en CADA llamada, sin ningun cacheo. Como los 26 handlers
  de `pages/api/**` llaman a `openDb()` por request, cada peticion HTTP
  levantaba su propio pool nuevo y nada en el codigo de la app (solo en
  tests) llamaba nunca a `.close()`. Corregido cacheando la instancia en un
  `Map<string, PostgresDb>` module-level indexado por `DATABASE_URL` (mismo
  patron que el `sqlite3ModulePromise` ya existente unas lineas arriba),
  de forma que el pool se reutiliza durante todo el proceso. Ver
  `test/postgres-integration/connection-pool.postgres-integration.test.ts`,
  que llama a `openDb()` 20+ veces (secuencial y concurrente) y comprueba
  por identidad (`getPool()`) que siempre devuelve el mismo `Pool`, y que
  `totalCount` no crece sin limite.
- [x] Definir limites, timeouts y comportamiento ante desconexion.
  `lib/postgresDb.ts`: se anadieron `idleTimeoutMillis: 30000` y
  `connectionTimeoutMillis: 5000` al `Pool` (antes no habia timeout de
  conexion, es decir con el pool saturado una request podia colgarse
  indefinidamente en vez de fallar rapido), y un listener
  `this.pool.on('error', ...)` que loguea en vez de dejar que un error de
  un cliente idle (ej. Supabase cerrando la conexion) tumbe el proceso
  Node entero — comportamiento que la propia documentacion de
  `node-postgres` marca como obligatorio.
- [x] Garantizar transacciones en importaciones y operaciones multi-tabla.
  Ya cubierto por trabajo previo: `roadmap-import.postgres-integration.test.ts`
  prueba un ROLLBACK real contra Postgres. No se repite aqui.
  (Anotacion 2026-10-15: esta linea era enganosa. Solo cubria la importacion,
  que usaba `BEGIN`/`COMMIT` a mano; no existia un helper reutilizable ni las
  demas operaciones multi-tabla eran atomicas. Ver "Reapertura y correccion"
  al final de este bloque.)
- [x] Evitar conexiones persistentes innecesarias durante tests.
  - Los tests unitarios ya no abren conexiones a Postgres: `vitest.config.ts`
    vacia `DATABASE_URL`/`TEST_DATABASE_URL` y excluye la suite de
    integracion (ver notas operativas de la seccion anterior).
  - La suite de integracion corre fichero a fichero con su propia config
    (`vitest.integration.config.ts`), y cada fichero cierra en `afterAll` los
    pools que abre. El unico que no lo hacia era
    `connection-pool.postgres-integration.test.ts`, que dejaba abierto el
    pool singleton de `openDb()` asumiendo que se compartia con otros
    ficheros; no es asi, porque Vitest aisla los modulos por fichero
    (`isolate: true` por defecto), asi que ese pool solo vivia en ese
    fichero y mantenia conexiones idle hasta que el worker terminaba. Ahora
    lo cierra en `afterAll`.
  - `npm run test:integration` propaga el codigo de salida de los tests
    (antes devolvia el de `test:db:down`, es decir 0 aunque fallasen).

Rama sugerida: `chore/db-transactions`.

Reapertura y correccion (2026-10-15):

- Hueco detectado durante la refactorizacion de separacion de dominios: la
  tarea "Garantizar transacciones en importaciones y operaciones multi-tabla"
  se dio por cerrada, pero no habia un helper de transacciones reutilizable.
  La importacion hacia `BEGIN`/`COMMIT`/`ROLLBACK` a mano sobre un
  `transactionClient` guardado en la instancia `PostgresDb` (compartida por
  proceso, asi que dos peticiones concurrentes podian mezclarse); los
  repositorios con Kysely usan el pool, no ese cliente, y por tanto no
  participaban en ninguna transaccion (un `BEGIN` en una conexion y consultas
  en otras no da atomicidad); y el reemplazo de accesos de un usuario
  (`PATCH /api/users/[id]`) eran tres escrituras seguidas sin transaccion.
- Correccion: `DatabaseClient.transaction(work)` (Postgres: un `PoolClient`
  para toda la transaccion con fachada de pool para Kysely, siempre liberado;
  SQLite: `BEGIN IMMEDIATE` con mutex), puerto `UnitOfWork` en los dominios y
  `lib/container.ts` como unico sitio que lo implementa. Atomicos ahora:
  reemplazo de accesos, desactivar usuario y resetear contrasena (con
  revocacion de sesiones), crear/actualizar roadmap con metadatos, importacion,
  intento de quiz, evidencia y progreso de leccion. Anidar transacciones lanza
  `NestedTransactionError`. Se elimino el manejo de `BEGIN`/`COMMIT` en
  `PostgresDb.exec()`.
- Verificacion: tests de servicio con `UnitOfWork` falso,
  `test/transactions*.test.ts` (SQLite real con `TRIGGER ... RAISE(ABORT)`) y,
  contra Postgres efimero, `transactions.postgres-integration.test.ts` y
  `admin-access.postgres-integration.test.ts` (Kysely y SQL crudo en el mismo
  rollback, cliente liberado, transacciones concurrentes). Ver
  `ARCHITECTURE.md` ("Transacciones").
- Sin cambio visible para el usuario: no hay estados, cuerpos ni mensajes HTTP
  distintos, por lo que no hace falta documentacion de usuario.

Hecho cuando:

- [x] No hay fugas de conexiones bajo carga de tests. Demostrado por el test
  de identidad de pool arriba: 20 llamadas concurrentes a `openDb()`
  reutilizan el mismo `Pool` (`max: 5`), no crean uno nuevo por llamada.
- [x] Las operaciones parciales hacen rollback comprobable
  (`roadmap-import.postgres-integration.test.ts`, no tocado en este cambio).
- [x] Los errores de base de datos llegan como respuestas controladas.
  Correccion sobre la nota anterior (dejada aqui para que quede el rastro):
  se penso que los ~22 handlers de `pages/api/**` sin try/catch propio (p.ej.
  `pages/api/admin/dashboard.ts`, `pages/api/roadmaps/index.ts`) filtraban
  errores de Postgres sin control. Verificado directamente en el codigo
  fuente de Next.js instalado
  (`node_modules/next/dist/server/api-utils/node/api-resolver.js:358-382`):
  en produccion (`dev === false`) CUALQUIER excepcion no capturada en un
  handler de `pages/api` la intercepta el propio framework, hace
  `console.error` en servidor y responde `500 Internal Server Error`
  generico SIN filtrar mensaje ni stack al cliente; el `throw` solo se
  propaga en modo `dev` (comportamiento esperado, es el overlay de
  desarrollo). Esta app no usa Edge runtime en ninguna ruta ni configura
  `propagateError`, asi que no hay excepcion a esto. El criterio SI se
  cumple hoy, sin cambios necesarios; no era un hueco de seguridad.
  Lo que si sigue pendiente, pero como mejora de calidad y no de seguridad:
  la mayoria de rutas devuelven 500 generico para casos de error de dominio
  conocidos (p.ej. clave duplicada) en vez de mapearlos a un codigo mas
  preciso, como ya hace `pages/api/roadmaps/import.ts`
  (`RoadmapImportConflictError` → 409). Se decidio explicitamente no
  abordarlo ahora (ver backlog mas abajo, prioridad baja).

Con la correccion anterior, los tres criterios de "Hecho cuando" se
cumplen.

### [x] Contratos API estables

Estado: hecho (2026-10-15). Las 26 rutas de `pages/api` (mas
`GET /api/openapi.json`) tienen contrato documentado: los esquemas de respuesta
viven en `lib/contracts/` junto a los de entrada de `lib/validation/`, un registro
de rutas (metodo, ruta, acceso, solicitud y respuestas por estado) genera el
documento OpenAPI 3.1 `openapi.json` con `z.toJSONSchema` de Zod (sin dependencias
nuevas) y los tipos de las respuestas se comparten con la UI. Describe la API tal
y como funciona hoy: no cambia ningun estado, cuerpo ni mensaje. Definicion,
generacion, como anadir un endpoint, politica de versionado y deprecacion e
incoherencias conocidas en [`API_CONTRACTS.md`](API_CONTRACTS.md); guia para
consumidores y tabla de endpoints en la seccion `API` de `README.md`.

Tareas:

- [x] Documentar request, response y errores de cada API publica
  (`openapi.json`, `GET /api/openapi.json`; publico porque solo describe rutas).
- [x] Definir versionado de API si un cambio rompe clientes: semver en
  `info.version`, que es incompatible o aditivo, cuando introducir `/api/v2` y
  procedimiento de deprecacion (`API_CONTRACTS.md`). No se movio ninguna ruta.
- [x] Generar tipos compartidos para frontend y backend (`z.infer` desde
  `lib/contracts`, adoptados en catalogo, detalle de roadmap y modulo, progreso,
  quizzes, evidencias, portfolio, usuarios admin, dashboard, auditoria e
  importacion).
- [x] Mantener compatibilidad durante la migracion SQLite/PostgreSQL: el
  contrato reflejo primero las diferencias reales (contadores como texto y
  `has_evidence` booleano en PostgreSQL); la 2.0.0 las elimino normalizando en los
  repositorios (ver el item siguiente).
- Seguimiento (fuera de alcance, ver `API_CONTRACTS.md`): mensajes 401/403/405/429 en ingles y `405` en texto plano;
  `DELETE /api/roadmaps/:id` da `204` aunque no exista; forma distinta de la
  respuesta de `PATCH /api/users/:id` segun la accion (resueltos en la 3.0.0);
  `validateRoadmapImport` migrado a Zod en la 3.1.0; doble `401`+`404` en
  `PUT/DELETE /api/evidences/modules/:id` y `roadmap_access_ids` ausente en
  `POST /api/users` (resueltos en la 3.2.0).

Rama sugerida: `feature/api-contracts`.

Hecho cuando:

- [x] Las APIs criticas tienen contrato documentado y tests de respuesta
  (`test/api-contracts.test.ts` comprueba cada estado de cada handler contra el
  registro; `test/contracts-openapi.test.ts` exige un registro completo y
  `openapi.json` al dia).
- [x] Los cambios incompatibles requieren una decision explicita (`/api/v2`,
  `MAJOR` de `info.version` y deprecacion minima de 90 dias).

### [x] Fuga de respuestas de quizzes y conteos en PostgreSQL

Estado: hecho (2026-10-15). Dos defectos detectados al documentar el contrato:

- **Seguridad**: los repositorios de modulos usaban `SELECT *`, asi que
  `quiz_bank` (con la respuesta correcta de cada pregunta) llegaba a cualquier
  lector por `GET /api/modules`, `GET /api/modules/:id`, `GET /api/roadmaps/:id`
  y las respuestas de `POST`/`PUT` de modulos. Ahora los repositorios devuelven una
  proyeccion publica de columnas explicitas y solo `findQuizSourceById` lee el
  banco, para construir y corregir quizzes. Ademas
  `GET /api/roadmaps/:id/export`, que incluye los quizzes con su respuesta, era
  legible por cualquier lector: ahora es solo para admin (es una copia de seguridad
  que se reimporta).
- **PostgreSQL**: `pg` devuelve `COUNT`/`SUM` como texto, por lo que `module_count`
  no se mostraba en `RoadmapCard` en produccion. Los repositorios normalizan
  contadores a numero y `has_evidence` a booleano en ambos motores
  (`lib/persistence/normalize.ts`); se revirtieron los parches de la UI.

El contrato sube a `2.0.0` (MAJOR) con una clausula nueva de "Correcciones de
seguridad" en la politica de versionado. Detalle y changelog en
[`API_CONTRACTS.md`](API_CONTRACTS.md#200-2026-10-15).

Hecho cuando:

- [x] Ninguna respuesta de la API contiene `quiz_bank` ni `correct_option_index`
  (tests de regresion para anonimo, alumno y admin, en SQLite y contra PostgreSQL
  real).
- [x] El export de roadmaps es solo admin y sigue incluyendo los quizzes.
- [x] Contadores y `has_evidence` tienen un solo tipo en SQLite y PostgreSQL
  (tests unitarios del normalizador y de integracion con PostgreSQL efimero).
- [x] `openapi.json` regenerado y changelog 2.0.0 en `API_CONTRACTS.md`.

### [ ] Observabilidad, backups y recuperacion

Estado: pendiente, pausado deliberadamente (2026-09-28). Hoy en Supabase
plan Free (sin backups automaticos ni PITR incluidos por la plataforma).
Decision del usuario: no construir aqui un script de backup propio para
Supabase Free porque el proyecto se alojara en el futuro en infraestructura
propia (AWS o Azure), y el enfoque de backups/restauracion sera distinto
alli. Retomar este punto cuando se decida esa migracion de hosting, no
antes.

Tareas:

- Registrar errores de servidor, latencias y operaciones administrativas.
- Configurar backups de PostgreSQL y comprobar una restauracion.
- Documentar secretos, rotacion de credenciales y respuesta ante incidente.
- Anadir health check sin exponer datos sensibles.

Rama sugerida: `chore/observability-backups`.

Hecho cuando:

- Existe un procedimiento probado de backup y restauracion.
- Los errores criticos se pueden diagnosticar sin acceder a contrasenas.

### [ ] Versionado completo de roadmaps

Estado: en curso. La fase 1 de metadatos ya esta hecha; quedan snapshots,
migracion de progreso, changelog y diferencias visibles.

Rama sugerida: `feature/roadmap-version-history`.

Hecho cuando:

- Un usuario puede conservar su version o aceptar una actualizacion.
- El progreso no se pierde al publicar una nueva version.
- El detalle muestra cambios y version vigente.

### [ ] PWA con manifest y service worker

Estado: pendiente.

Tareas:

- Crear manifest, iconos y metadatos instalables.
- Definir cache de contenido publico y estrategia de actualizacion.
- Mostrar estado offline sin permitir escrituras ambiguas.
- Probar instalacion en movil y escritorio.

Rama sugerida: `feature/pwa`.

Hecho cuando:

- La aplicacion se puede instalar desde un navegador compatible.
- Las actualizaciones no dejan una version antigua bloqueada.
- El modo offline no compromete progreso, auth ni datos administrativos.

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

#### [x] Filtro por estado de progreso del usuario

Estado: hecho.

Valor: permite al usuario filtrar en el catalogo o en su dashboard entre roadmaps "Sin empezar", "En curso" y "Completados".

Tareas:

- Anadir faceta de estado personal (`not_started`, `in_progress`, `completed`) en la busqueda y catalogo.
- Sincronizar con la URL como el resto de filtros.

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

#### [x] Exportador y Backup JSON de roadmaps

Estado: completado.

Valor: permite a los administradores descargar cualquier roadmap existente en formato JSON estandarizado para backups, migraciones entre entornos o edicion externa.

Tareas:

- Crear endpoint `GET /api/roadmaps/:id/export` que devuelva el JSON completo del roadmap con modulos, lecciones y metadatos.
- Boton de "Exportar JSON" en la vista admin y en el detalle del roadmap.

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

#### [x] Feedback y revision de evidencias por el admin (Mentoria)

Estado: completado.

Valor: transforma el registro de evidencias en un canal de revision interactiva y mentoria entre admins/formadores y alumnos.

Tareas:

- Permitir al admin escribir comentarios de retroalimentacion y asignar estado de revision (`pendiente`, `aprobado`, `requiere_cambios`) a una evidencia.
- Notificacion o indicador visual para el usuario cuando su evidencia reciba comentarios.
- Posibilidad de reentregar evidencia con correcciones.

#### [x] Portfolio publico / exportable del usuario

Estado: completado.

Valor: permite al estudiante generar una pagina o documento Markdown/PDF descargable con todas sus evidencias y proyectos completados para compartir en su CV o perfil profesional.

Tareas:

- Vista o exportacion de "Mi Portfolio de Evidencias".
- Generacion de resumen con links a GitHub, demos y notas de modulos superados.

### [x] Coherencia de la API: errores en español, DELETE idempotente y forma única de usuario

Estado: hecho (2026-10-16)

- Los errores `401`/`403`/`405`/`429`, origen, `login` y `setup` están en español
  de España; el `405` es JSON `{ error }` con `Allow` (`lib/http/methods.ts`).
- `DELETE /api/roadmaps/{id}`: `204` si borra, `200` con `{ message }` si no
  existía (solo se audita cuando se borra).
- `PATCH /api/users/{id}` devuelve siempre el mismo usuario con sus accesos.
- Contrato 3.0.0 (cambio incompatible por el `405`, el `DELETE` y el `PATCH`).
  Detalle en [API_CONTRACTS.md](API_CONTRACTS.md#300-2026-10-16).

### [x] Pendientes de coherencia de la API (evidencias, alta de usuarios y version)

Estado: hecho (2026-10-16)

- `PUT`/`DELETE /api/evidences/modules/{id}` escriben una sola respuesta (`401`) cuando
  no se puede resolver el alcance de lectura, en vez de `401` y luego `404`.
- `POST /api/users` devuelve el mismo usuario que el listado y `PATCH`
  (con `roadmap_access_ids`, sin secretos).
- El formato de `version` y `published_at` tiene una sola fuente
  (`lib/domains/content/version.ts` y `roadmapFields.ts`) compartida por el importador,
  la validación de roadmaps y el seed.
- Contrato 3.2.0 (MINOR). Detalle en [API_CONTRACTS.md](API_CONTRACTS.md#320-2026-10-16).

### [x] Errores 500 en JSON para toda la API

Estado: hecho (2026-10-17)

- Nuevo envoltorio `withApiErrors` (`lib/http/errors.ts`) aplicado a las 27 rutas de
  `pages/api`: una excepción o promesa rechazada responde `500` con
  `{ "error": "Error interno del servidor." }`, registra el error real en servidor
  (método y ruta) y no escribe nada si las cabeceras ya se enviaron.
- `test/api-routes-wrapped.test.ts` falla si una ruta nueva no está envuelta.
- `PUT /api/evidences/{id}/review` usa el mensaje unificado; `POST /api/roadmaps`,
  `POST /api/users` y `POST /api/auth/setup` conservan su `500` de dominio
  (`No se pudo crear ...`).
- Contrato 3.3.0 (MINOR): el `500` se documenta en todas las operaciones. Detalle en
  [API_CONTRACTS.md](API_CONTRACTS.md#330-2026-10-17).

## UI y Branding

### [x] UI Redesign: Header compacto y admin dropdown

Estado: completado.

Valor: mejora la experiencia visual y la densidad de información sin sacrificar usabilidad.

Cambios implementados:

- Header compactado: reducir altura con `py-0` y gap mínimo.
- Logo redimensionado de 40px a 50px manteniendo proporción.
- Admin links agrupados en dropdown (`Admin ▼`) para ahorrar espacio horizontal.
- Usuario simplificado: mostrar solo username (parte antes del @) con link "Log out" en lugar de botón.
- Eliminar subtítulo "Plexus Tech" para mantener limpieza visual.
- Branding actualizado: `CanteraHub` → `Plexus Academy`, `Tu empresa` → `Plexus Tech` (en `.env.local`).

Hecho cuando:

- Header cabe en una sola línea en viewport estándar (>= 768px).
- Admin dropdown funciona con click-outside detection.
- Logo y textos mantienen legibilidad.

Rama: `feature/ui-redesign` (mergeada a `chore/audit-fix-force`).

## Prioridad media

### [x] Quizzes reales por modulo

Estado: hecho (2026-10-21). Las tres fases estan hechas. Los roadmaps iniciales cargan bancos explícitos por módulo,
con opciones, respuesta correcta, tipo y explicación. El importador JSON
permite ampliar o sustituir el banco de cada módulo.

Valor: reutiliza los datos ya presentes en los roadmaps y aporta evaluacion ligera con aprendizaje activo.

#### [x] Fase 1. Tipos de pregunta enriquecidos y feedback explicativo

Estado: hecho. Las preguntas tienen `type` (incluido `code_snippet`) y
`explanation`, que el detalle del modulo muestra tras responder.

Tareas:

- Soportar preguntas de opcion multiple, respuesta unica, verdadero/falso y fragmentos de codigo/comandos.
- Incluir un campo `explicacion` o `feedback` que se muestre tras responder para argumentar por que la opcion elegida es correcta o incorrecta.
- Tests de API y UI para la renderizacion y correccion de respuestas.

#### [x] Fase 2. Banco de preguntas y aleatorizacion

Estado: hecho (2026-10-21). Cada intento recibe una seleccion aleatoria de
hasta 5 preguntas del banco del modulo, con las opciones barajadas, y el
servidor recuerda lo que sirvio para corregir con autoridad.

- Tabla nueva `quiz_attempt_sessions` (migracion `0002_quiz_attempt_sessions`):
  guarda una copia completa de las preguntas servidas (ids, opciones en el orden
  servido, respuesta correcta y explicacion), de modo que editar o reimportar el
  banco no rompe un intento abierto. Caduca a las 24 h (`QUIZ_SESSION_TTL_MS`).
  Son filas efimeras: `scripts/migrate-sqlite-to-postgres.ts` no las copia.
- `GET /api/quizzes/modules/{id}` con sesion devuelve el intento activo (recargar
  no vuelve a sortear) o crea uno nuevo, y anade `attempt_id`. Sin sesion de
  usuario devuelve la vista previa determinista de siempre (`attempt_id: null`).
- `POST` acepta `attempt_id` (opcional) y responde `409` si el intento ya se
  envio, caduco o no es del alumno o del modulo. El intento se cierra con un
  `UPDATE ... WHERE submitted_at IS NULL` dentro de la misma transaccion que
  guarda la nota, asi un doble envio solo guarda un intento. Sin `attempt_id`
  (clientes antiguos) se corrige siempre el quiz determinista anterior, sin
  consultar ni cerrar ningun intento (`attempt_id: null`). El `attempt_id` tambien se guarda en el JSON `answers`
  del intento.
- Los ids de pregunta pasan a ser `bank-<indice en el banco guardado>`
  (antes, el indice tras barajar).
- La UI del modulo responde el quiz del intento, envia `attempt_id`, ofrece
  "Nuevo intento" tras la nota y muestra los intentos restantes o la espera.
- Contrato 3.4.0 (MINOR). El `quiz` embebido en `GET /api/modules/{id}` se
  mantiene como vista previa (quitarlo seria MAJOR).
- Limitaciones conocidas: el numero de preguntas por intento es la constante
  `QUIZ_QUESTIONS_PER_ATTEMPT = 5` (sin columna por modulo todavia); los seeds
  actuales tienen una sola pregunta por modulo, asi que el efecto solo se ve con
  bancos mas grandes (p. ej. importados con el JSON).

Pendientes / mejoras (no hechas):

- Purgar las `quiz_attempt_sessions` caducadas o sin enviar (la tabla crece sin limite).
- Dos `GET` concurrentes pueden abrir dos sesiones activas (no hay guarda unica).
- La elegibilidad se comprueba fuera de la transaccion, asi que envios concurrentes pueden superar `quiz_max_attempts` (ya ocurria antes).
- El quiz publico expone `explanation` antes de responder (ya ocurria antes; quitarlo seria un cambio MAJOR del contrato).
- Ajuste por modulo del numero de preguntas por intento (hoy la constante 5).

Tareas:

- [x] Permitir definir mas preguntas en el JSON/roadmap de las que se presentan en un intento (ej. seleccionar 5 preguntas al azar de un banco de 10).
- [x] Aleatorizar el orden de las opciones de respuesta en cada intento para evitar la memorizacion mecanica.

#### [x] Fase 3. Nota minima exigible y modo evaluativo

Estado: hecho. Cada modulo admite `quiz_pass_percentage`, `quiz_max_attempts`
y `quiz_cooldown_minutes`; la API rechaza intentos fuera de limite.

Tareas:

- Ajustar de forma opcional por modulo una nota minima requerida (ej. 70% o 7/10) para marcar la evaluacion como superada.
- Opcion para limitar el numero de intentos o aplicar un tiempo de espera entre reintentos fallidos.

### [ ] Versionado de roadmaps: detalle funcional

Estado: en curso. La fase 1 ya está implementada; el historial de versiones
y la migración de progreso requieren una estrategia de snapshots pendiente.

Valor: permite evolucionar contenido sin perder el historico de progreso ni romper el aprendizaje de alumnos existentes.

#### [x] Fase 1. Modelo de datos con etiquetado de version

Estado: hecho. Cada roadmap tiene versión semántica y fecha de publicación,
con migración idempotente desde bases legacy y soporte en seeds, APIs e
importación/exportación JSON.

Tareas:

- Anadir campo `version` (ej. `v1.0.0`, `v2.0.0`) a la entidad `roadmap`.
- Registrar la fecha de publicacion de cada version.

#### [ ] Fase 2. Estrategia de migracion de progreso

Estado: pendiente.

Tareas:

- Definir que ocurre con el progreso de un usuario cuando un modulo anade lecciones en una nueva version.
- Permitir al usuario mantener su version en curso o actualizar a la ultima version con un aviso claro de cambios (`changelog`).

#### [ ] Fase 3. Historial y diferencias visibles en UI

Estado: pendiente.

Tareas:

- Selector de version en el detalle del roadmap.
- Indicador visual si el usuario esta cursando una version anterior a la vigente.

### [x] Dashboard admin

Estado: completado.

Valor: da visibilidad del uso real y ayuda a priorizar mejoras.

Alcance inicial:

- Usuarios activos.
- Roadmaps mas usados.
- Modulos mas completados.
- Usuarios atascados o sin actividad reciente.

Hecho cuando:

- El panel muestra datos utiles de un vistazo.
- No depende de consultas fragiles o lentas.

Notas de implementacion:

- El resumen muestra usuarios activos en 30 dias, roadmaps iniciados y
  completados, evidencias y usuarios sin actividad.
- La finalizacion se recalcula contra las lecciones actuales para evitar
  estadisticas obsoletas cuando cambia el contenido.
- Los rankings muestran roadmaps mas usados y modulos mas completados.
- El seguimiento identifica roadmaps incompletos sin actividad durante
  14 dias o mas.

#### [ ] Ficha individual de estudiante y exportacion de metricas

Estado: pendiente (con un avance parcial en la fase demo: autoexportacion del alumno, ver abajo).

Valor: permite a los mentores/admins hacer un seguimiento individualizado de un alumno y exportar reportes de uso para informes de formacion.

Tareas:

- Crear vista de detalle por usuario en el panel admin: roadmaps activos, porcentaje global, evidencias entregadas e historial de quizzes.
- Anadir boton de exportacion de metricas generales y por usuario en CSV/JSON.

Avance (fase demo, contrato 3.5.0): como cada alumno ejecuta su propia instancia
Docker (ver "Preparacion para despliegue"), el mentor no ve sus datos. Se anadio
la autoexportacion del alumno: `GET /api/progress/quiz-attempts/export?format=json|csv`
y botones en `/portfolio` ("Exportar mis resultados de quizzes") con sus
intentos de quiz (roadmap, modulo, nota, fecha) y su email, para enviarlos al
mentor. Este item sigue abierto: la ficha individual y las metricas para
mentores/admins sobre una base compartida no estan hechas.

### [ ] Guia de Google Skills badges

Estado: pendiente.

Valor: aprovecha el contenido ya preparado en el roadmap de IA y da mas profundidad al producto vinculandolo con certificaciones oficiales.

Tareas:

- Crear vista dedicada `/skills-badges` con listado de insignias oficiales de Google Cloud Skills Boost vinculadas a DevOps e IA.
- Mapear cada badge con sus modulos correspondientes dentro del roadmap `IA para DevOps`.
- Permitir a los usuarios marcar badges como completadas o adjuntar el enlace a su perfil publico de Credly / Google Cloud Skills Boost.
- Incluir acceso directo desde la cabecera y desde el detalle del roadmap `IA para DevOps`.

## Ideas a revisar mas adelante

### [ ] Asignacion de roadmaps a usuarios

Estado: idea.

Valor: permitiria uso mas cercano a formacion interna o mentoring donde un tutor asigna itinerarios especificos a cada integrante del equipo.

### [ ] Notificaciones o recordatorios

Estado: idea.

Valor: enviar alertas por email o avisos in-app tras N dias de inactividad para fomentar la continuidad.

### [ ] Certificado y Badge digital de finalizacion

Estado: idea.

Valor: generar un diploma en PDF o insignia SVG verificable con un identificador unico al completar el 100% de un roadmap y sus evaluaciones.

### [ ] Apuntes y notas personales Markdown por leccion

Estado: idea.

Valor: permitir que el alumno guarde un cuaderno de notas privado en Markdown asociado a cada leccion para consulta posterior.

### [ ] Modo Lectura Offline / PWA ligera

Estado: pospuesto. Se implementara dentro de `PWA con manifest y service worker`
cuando la capa de persistencia, contratos y actualizaciones este estabilizada.

Valor: cachear contenidos y lecciones mediante un Service Worker para poder consultar los roadmaps sin conexion a internet.

## Ultimo paso: preparacion para despliegue

### [ ] Preparacion para despliegue

Estado: en curso. La aplicacion ya puede usar PostgreSQL de Supabase y mantiene
SQLite para desarrollo; faltan despliegue reproducible, secretos, backups y
pruebas de recuperacion. El hosting concreto aun no esta decidido (posible
alojamiento interno de la empresa o uno externo gratuito/bajo coste).

Valor: permite publicar la app con bajo coste y mantener mejoras via GitHub.

Auditoria de deployment-readiness (completada): se reviso el codigo para
detectar bloqueantes de publicar en un hosting real. Resultado y arreglos:

- [x] Rate limiting en memoria (bloqueante): `lib/rateLimit.ts` guardaba los
  intentos en un objeto en memoria del proceso, lo que no funciona con multiples
  instancias/funciones serverless (cada una con su propio contador). Ahora usa
  una tabla `rate_limits` en la base de datos compartida (SQLite o Postgres),
  con buckets independientes por `scope` (`login`, `setup`).
- [x] Seeds sobrescribian ediciones de admin en cada arranque (riesgo alto):
  `seedRoadmaps` en `lib/db.ts` se ejecutaba en cada arranque de proceso y
  sobrescribia `description`, `objectives`, etc. de los roadmaps semilla por
  titulo, revirtiendo cualquier edicion manual de un admin. Ahora solo siembra
  cuando la tabla `roadmaps` esta completamente vacia (bootstrap unico).
- [x] `requireSameOrigin` confiaba solo en `x-forwarded-host`/`Host` sin lista
  blanca: se anadio `ALLOWED_ORIGIN` (opcional, coma-separado) para validar el
  origen contra una lista explicita cuando la app esta detras de un proxy/CDN.
- [x] `sqlite3` (binding nativo) se instalaba siempre aunque en produccion con
  `DATABASE_URL` nunca se usa: se movio a `optionalDependencies` y el import se
  hizo perezoso (dentro de `openSqliteDb`) para que un fallo de compilacion o
  una instalacion sin dependencias opcionales no rompa el arranque en Postgres.
- [x] Documentacion de variables de entorno de produccion: `.env.example` y
  `README_PROJECT.md` aclaran que `AUTH_SETUP_TOKEN` es obligatorio en
  produccion para poder crear el primer admin, y documentan `ALLOWED_ORIGIN`.
- [x] Cobertura de tests: el gate de 80% en branches llevaba tiempo roto
  (73%, oculto por un test desactualizado tras el rediseno del header, que ya
  se corrigio). Se anadieron tests para los huecos mas relevantes: rama
  Postgres de `roadmapRepository`, `moduleRepository`, `lessonRepository` y
  `auditRepository` (antes sin ningun test, usando un pool `pg` simulado),
  rutas API sin cobertura (`evidences`, `portfolio`, `audit-logs`,
  `roadmaps/[id]/export`, `roadmaps/metadata`) y paginas admin sin tests
  (`portfolio.tsx`, `admin/evidences.tsx`, `admin/users.tsx`,
  `admin/import-roadmap.tsx`). Cobertura de branches final: 81.96%.
- [x] Al mover `sqlite3` a import perezoso se detecto una condicion de carrera
  intermitente bajo el pool de workers de Vitest (llamadas concurrentes a
  `import('sqlite3')` sin cachear). Se corrigio cacheando la promesa de import
  en una unica variable de modulo; verificado estable en 5 ejecuciones
  repetidas del escenario que fallaba y 3 ejecuciones completas de la suite.

Decision (fase demo): hasta decidir hosting, la app se distribuye como imagen
Docker publicada en GHCR (`ghcr.io/enriquevplexus/cantera-hub`, workflow
`docker-publish.yml` al etiquetar `vX.Y.Z`) que cada persona ejecuta con
`docker compose` contra un PostgreSQL local. Cada instancia es independiente,
asi que el alumno exporta sus resultados de quizzes y los envia al mentor. Se
anadieron `DATABASE_SSL` (SSL explicito para app y `scripts/migrate.ts`) y
`COOKIE_SECURE` (login por http://localhost en produccion). Una sola imagen
sirve para `app` y `migrate`. Guia en `README_PROJECT.md`, seccion "Docker
(distribucion demo)". El hosting definitivo sigue pendiente.

Alcance restante:

- Decidir hosting definitivo y adaptar esta lista a sus particularidades
  (variables de entorno, procesos persistentes vs serverless, etc.).
- Endurecer credenciales y configuracion de produccion.
- Documentar deploy automatizado con GitHub.
- Configurar health checks, backups y recuperacion.

Hecho cuando:

- La app se puede desplegar fuera de local sin perder datos.
- Existe una guia de despliegue reproducible.
- La contraseña admin por defecto deja de ser un riesgo.

## Notas de producto

- Stack objetivo: React + Next.js + TypeScript, API Node/Next.js,
  PostgreSQL, SQLite para desarrollo/tests, PWA y Capacitor como posible
  cliente movil futuro.
- La app esta evolucionando desde un catalogo de roadmaps hacia una
  herramienta de seguimiento formativo.
- Conviene mantener el tono visual sobrio y utilitario actual,
  evitando convertir la interfaz en una landing o en un LMS
  recargado.
- Cada funcionalidad nueva deberia llegar con tests y sin degradar
  la experiencia de lectura de los roadmaps ya existentes.
