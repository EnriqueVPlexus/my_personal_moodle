# Arquitectura

Este documento explica cómo está organizado el código de la aplicación, qué
reglas de dependencia se respetan y cómo añadir un caso de uso nuevo sin romper
la estructura. Se adoptó una arquitectura **«screaming» + hexagonal
pragmática**: el árbol de `lib/` grita los dominios del producto y cada dominio
depende de interfaces (puertos), no del driver de base de datos ni de Next.js.

Es una refactorización pura: no cambió ninguna respuesta de la API (estados,
cuerpos ni mensajes) ni el comportamiento de usuario.

## Capas y regla de dependencia

```text
pages/api (handler)  ->  service  ->  port  <-  repository  ->  persistence
     HTTP               negocio    interfaz    implementación    driver/SQL
```

| Capa | Dónde vive | Qué hace | Puede importar |
| --- | --- | --- | --- |
| Handler | `pages/api/**` | Comprueba el método, valida (`lib/validation`), autentica/autoriza, llama a **un** servicio y responde. | `lib/container`, `lib/http/*`, `lib/validation/*`, `lib/persistence` (solo `openDb`), tipos y funciones puras de `lib/domains/*`. |
| Adaptador HTTP | `lib/http/` | Traduce `NextApiRequest`/`NextApiResponse` a datos planos y al revés (cookies, origen, IP, 401/403/429). Es la **única** capa de dominio/infraestructura que importa `next` (además de `lib/validation/http.ts`, que escribe la respuesta de error de validación). | `lib/domains/*`, `lib/persistence`. |
| Contrato | `lib/contracts/` | Describe el borde HTTP: esquemas de **respuesta**, registro de rutas y generador OpenAPI. Reutiliza los esquemas de `lib/validation` para las solicitudes. No ejecuta nada en tiempo de petición (solo `GET /api/openapi.json` lo serializa). Ver `API_CONTRACTS.md`. | `zod`, `lib/validation/*` y constantes puras de `lib/domains/*`. **Nadie de `lib/domains`, `lib/http` ni `lib/persistence` lo importa**; handlers, UI (solo `import type`) y tests sí. |
| Servicio | `lib/domains/<d>/service.ts` | Casos de uso y reglas de negocio. Recibe sus puertos por parámetro. | Sus propios `ports`/`types`, y funciones/tipos **puros** de otros dominios. Nunca `next`, SQL ni `lib/persistence`. |
| Puerto | `lib/domains/<d>/ports.ts` | Interfaces TypeScript de lo que el servicio necesita (repositorios, lectores de otros dominios). | Solo `types`. |
| Repositorio | `lib/domains/<d>/repositories/` | **Única implementación** de cada puerto. Contiene el SQL (ramas SQLite/Postgres incluidas). | `lib/persistence`, `types`/`ports` de su dominio. |
| Persistencia | `lib/persistence/` | `DatabaseClient`, `openDb()`, `PostgresDb`, esquema Kysely, esquema SQLite y bootstrap (seed). | Solo librerías externas (y, en `bootstrap/`, repositorios y utilidades puras para sembrar datos). |
| Composición | `lib/container.ts` | Único sitio que sabe qué repositorio implementa qué puerto y cómo se conectan los dominios entre sí. | Todo lo anterior. |

Reglas que se pueden comprobar con `rg` (y que se verifican en la entrega):

```bash
rg -n "db\.(all|get|run|exec)|DATABASE_URL|as PostgresDb" pages/api   # vacío
rg -n "from 'next'" lib/domains                                       # vacío
rg -n "contracts" lib/domains lib/http lib/persistence                # vacío
```

## Mapa de dominios

```text
lib/
  container.ts              Composición: createServices(db) -> { auth, audit, content, progress, admin }.
  contracts/                Contrato de la API: respuestas Zod, registro de rutas, generador OpenAPI (ver API_CONTRACTS.md).
  http/                     Adaptadores HTTP (único código de lib que conoce Next).
    auth.ts                 Cookie de sesión, origen, requireAdmin/requireUser/requireReadAccess, getRoadmapReadScope.
    audit.ts                writeAuditLog: construye { ip, userAgent } desde la petición.
    rateLimit.ts            rateLimit/clearRateLimit: clave por IP y respuesta 429.
    headers.ts              getHeaderValue.
  persistence/              Driver y arranque.
    database.ts             Interfaz DatabaseClient (backend, get, all, run, exec, transaction, close).
    transaction.ts          Errores y utilidades del helper de transacciones (anidamiento, mutex, rollback).
    openDb.ts               openDb()/openSqliteDb(): selecciona SQLite o Postgres y arranca.
    postgresDb.ts           PostgresDb (pool cacheado, traducción SQLite -> Postgres) y PostgresTransaction.
    kyselyDatabase.ts       Esquema Kysely compartido.
    sqliteSchema.ts         Migración idempotente de SQLite.
    bootstrap/              Seed de roadmaps y admin inicial (+ seeds/*.json y banco de quizzes).
  domains/
    auth/                   Sesiones, login, setup, contraseñas, rate limit, alcance de lectura.
    content/                Roadmaps, módulos, lecciones, catálogo/búsqueda/metadatos, import/export, definición de quizzes.
    progress/               Progreso, intentos de quiz, evidencias, portfolio, vistas del alumno.
    admin/                  Administración de usuarios y panel de control.
    audit/                  Escritura y lectura del registro de auditoría.
    shared/                 `unitOfWork.ts`: puerto `UnitOfWork` para casos de uso atómicos.
  validation/               Esquemas Zod y contrato de error (ver VALIDATION.md).
  branding.ts               Branding configurable por entorno.
```

Cada dominio sigue la misma forma (`index.ts` solo reexporta lo público):

```text
lib/domains/<dominio>/
  types.ts          Tipos de dominio (sin dependencias de infraestructura).
  ports.ts          Interfaces que el servicio necesita.
  service.ts        makeXService(ports): casos de uso y reglas.
  repositories/     Implementación de los puertos con SQL.
  index.ts          API pública del dominio.
```

### Qué vive en cada dominio

- **auth**: `service.ts` (sesiones, `authorize`, `resolveReadScope`, `login`,
  `createFirstAdmin`, rate limit), `policy.ts` (reglas puras: roles,
  `scopeAllowsRoadmap`, token de setup), `password.ts` (hash scrypt, política de
  contraseña). Puertos: `SessionRepository`, `AccountRepository`,
  `RateLimitRepository`.
- **content**: `service.ts` (búsqueda y metadatos del catálogo, CRUD de roadmaps,
  módulos y lecciones, importación/exportación), `metadata.ts`, `filters.ts`,
  `search.ts`, `version.ts`, `presentation.ts`, `quizzes.ts` (definición y
  corrección de quizzes) y `import.ts` (validación del JSON de importación) son
  funciones puras. Repositorios: roadmaps, módulos, lecciones, metadatos,
  catálogo (consultas de lectura) e importación.
- **progress**: `service.ts` (progreso de lecciones y roadmaps, detalle de
  roadmap y de módulo para el alumno, flujo del intento de quiz, evidencias,
  portfolio), `moduleProgress.ts` (cálculo del progreso de un módulo) y
  `rules.ts` (estado del roadmap, porcentajes) son puros. Repositorios:
  progreso, intentos de quiz, evidencias, portfolio y vistas del alumno.
- **admin**: `service.ts` con las reglas de usuarios (no puedes desactivarte a ti
  mismo, no se desactiva al último admin activo, los admin tienen siempre acceso
  total, los accesos deben apuntar a roadmaps existentes). Repositorios:
  usuarios y dashboard.
- **audit**: `service.ts` (`record(evento, contexto)` y `list`). `AuditContext`
  es `{ ip, userAgent }`; no sabe qué es una petición HTTP.

### Dependencias entre dominios

Los servicios pueden importar **funciones y tipos puros** de otro dominio
(p. ej. `scopeAllowsRoadmap` de auth, `buildModuleQuiz` de content), pero nunca
sus repositorios. Cuando un caso de uso necesita **datos** de otro dominio, el
servicio declara un puerto propio y el contenedor lo conecta:

- `content` declara `LearnerProgressReader` (lista de progreso del alumno) y el
  contenedor lo implementa con el repositorio de `progress`.
- `progress` declara `ContentReader` (buscar roadmap, módulo y temas) y el
  contenedor lo implementa con los repositorios de `content`.
- `admin` declara `RoadmapExistenceReader` y se implementa con `content`.

Así no hay ciclos de importación entre servicios.

## Composición

`lib/container.ts` expone `createServices(db)`. Los handlers hacen:

```ts
const db = await openDb()
const { content } = createServices(db)
```

No hay framework de inyección de dependencias: cada fábrica es una función y los
servicios son cierres baratos que se crean por petición. Los servicios de auth y
audit también se pueden crear solos con `createAuthService(db)` y
`createAuditService(db)` (no tienen dependencias cruzadas).

`openDb()` sigue siendo el único sitio que decide el backend (SQLite sin
`DATABASE_URL`, PostgreSQL con ella). Los handlers ya no leen `DATABASE_URL` ni
saben qué driver hay debajo.

## Cómo añadir un caso de uso o endpoint

1. **Esquema de entrada**: crea o amplía `lib/validation/<dominio>.ts` (ver
   `VALIDATION.md`).
2. **Tipos**: si aparece un concepto nuevo, añádelo a `lib/domains/<d>/types.ts`.
3. **Puerto**: añade la operación a la interfaz de `ports.ts` que corresponda
   (o crea una interfaz nueva). Piensa en lo que necesita el servicio, no en
   cómo se consulta.
4. **Repositorio**: implementa la operación en
   `lib/domains/<d>/repositories/<x>Repository.ts` (SQL parametrizado; ramas
   SQLite/Postgres si hace falta) y exponla en la fábrica `createXRepository(db)`.
5. **Servicio**: añade el método a `service.ts`. Devuelve **resultados tipados**
   (`null`, `{ status: 'not_found' }`, uniones discriminadas) en lugar de tocar
   `res`. Pon aquí cualquier regla de negocio.
6. **Contenedor**: si el puerto es nuevo, conéctalo en `lib/container.ts`.
7. **Handler**: método → validar con `parseOrRespond` → autenticar con
   `requireAdmin`/`requireUser`/`getRoadmapReadScope` → llamar al servicio →
   mapear el resultado a estado y cuerpo → `writeAuditLog` si es una acción
   sensible.
8. **Contrato**: añade el esquema de respuesta y la entrada del registro
   (`lib/contracts`), un caso en `test/api-contracts.test.ts`, sube
   `API_CONTRACT_VERSION` si procede y ejecuta `npm run contracts:generate`
   (pasos detallados en `API_CONTRACTS.md`).
9. **Tests**: un test de servicio con repositorios en memoria (sin Next ni BD) y,
   si hay SQL nuevo, un test de repositorio.

Si necesitas contexto de la petición dentro del dominio (IP, user agent, usuario),
pásalo como **datos planos**; construirlos es trabajo del adaptador de `lib/http/`.

## Transacciones

Un caso de uso que escribe en varias tablas (o en varios repositorios) debe ser
atómico: o se guarda todo o no se guarda nada.

**Primitiva de persistencia.** `DatabaseClient.transaction(work)` ejecuta
`work(tx)` y confirma (`COMMIT`) al terminar; si `work` lanza, hace `ROLLBACK` y
relanza **el error original** (un `ROLLBACK` que falle se registra con
`console.error`, nunca lo tapa).

- **PostgreSQL**: toma **un** `PoolClient` del pool para toda la transacción y
  lo libera siempre (lo descarta si el propio `ROLLBACK` falló). `tx` es un
  `PostgresTransaction`: `get/all/run/exec` van por ese cliente y su
  `getPool()` devuelve una fachada de pool que siempre entrega ese mismo
  cliente. Por eso `getQueryDatabase(pool(db))` en los repositorios con Kysely
  se une a la transacción sin cambiar una línea: un repositorio no sabe si
  recibe `db` o `tx`.
- **SQLite**: `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` sobre la conexión del
  cliente (cada llamada a `openDb()` abre la suya). El mutex solo serializa
  `transaction()` sobre ese cliente; entre conexiones distintas manda el lock de
  SQLite, y `PRAGMA busy_timeout = 5000` hace que una escritura concurrente
  espere en vez de fallar con `SQLITE_BUSY`. No se activa WAL.
- `exec('BEGIN' | 'COMMIT' | 'ROLLBACK')` en Postgres lanza un error: ya no
  existe estado de transacción compartido en `PostgresDb` (con la instancia
  cacheada era una condición de carrera entre peticiones).
- En Postgres cualquier sentencia fallida aborta toda la transacción: el cuerpo de un `UnitOfWork` no debe capturar un error de BD y continuar (p. ej. clave duplicada); relánzalo o comprueba antes de escribir.
- El cliente `tx` deja de ser válido al terminar (`TransactionClosedError`).

**Puerto en el dominio.** `lib/domains/shared/unitOfWork.ts` define
`UnitOfWork<Repositorios>` con `run(work)`. Cada servicio declara qué
repositorios necesita dentro de la transacción (p. ej. admin:
`UnitOfWork<{ users: UserAdminRepository }>`) y los recibe ya ligados a ella.
`lib/container.ts` lo implementa con
`db.transaction(tx => work({ users: createUserAdminRepository(tx) }))`, así que
los dominios siguen sin importar `lib/persistence` ni `next`.

**Casos de uso atómicos actuales**

| Dominio | Caso de uso | Escrituras agrupadas |
| --- | --- | --- |
| admin | Reemplazar accesos a roadmaps | flag `can_view_all_roadmaps` + borrar + insertar accesos |
| admin | Desactivar usuario / resetear contraseña | actualizar usuario + revocar sesiones |
| content | Crear / actualizar roadmap | fila del roadmap + categoría y temas |
| content | Importar roadmap (`persistRoadmapImport`) | roadmap + metadatos + módulos |
| progress | Intento de quiz, evidencia de módulo, progreso de lección | registro + `touchRoadmapProgress` / progreso del roadmap |

Se dejaron fuera a propósito: `createFirstAdmin` (un solo `INSERT`; abrir sesión
después es independiente y un fallo solo obliga a iniciar sesión), `startSession`
(limpiar caducadas e insertar son independientes), `registerAttempt` del rate
limit (una escritura), borrados de roadmap/módulo/lección (una sentencia, el
resto va por `ON DELETE CASCADE`) y las revisiones de evidencia (una escritura).

**Cómo usarlo en un caso de uso nuevo**

1. Declara en `service.ts` un `unitOfWork: UnitOfWork<{ ... }>` en los puertos
   con los repositorios que necesitas dentro de la transacción.
2. En el servicio: `await unitOfWork.run(async ({ users }) => { ... })`. Haz
   dentro solo lo que debe ser atómico (lecturas que deciden y escrituras);
   devuelve datos y lee el resultado final **fuera**, con los repositorios
   normales.
3. En `lib/container.ts`: `unitOfWork: { run: work => db.transaction(tx => work({ ...repositorios construidos con tx })) }`.
4. Si lo necesitas dentro de un repositorio (como la importación), usa
   `db.transaction(tx => ...)` directamente en él.
5. Tests: servicio con un `unitOfWork` falso que cuente ejecuciones y simule el
   rollback; SQLite real con un `TRIGGER ... RAISE(ABORT)` para forzar el fallo
   a mitad; y, si hay Kysely, Postgres de integración (Docker efímero).

**Anidamiento.** Las transacciones son planas: llamar a `transaction()` sobre un
`tx` (o abrir un `UnitOfWork` dentro de otro) lanza `NestedTransactionError`. Se
descartaron los savepoints y «unirse a la externa» porque un error interno
capturado por quien llama acabaría confirmando trabajo parcial. Compón casos de
uso pasando el mismo `tx`/repositorios hacia abajo. No uses el `db` externo para
sentencias que deban ir dentro: en Postgres irían a otra conexión.

## Estrategia de tests

| Capa | Dónde | Cómo |
| --- | --- | --- |
| Servicios | `test/domains/*.test.ts` | Repositorios falsos en memoria. Sin Next, sin base de datos. Cubren reglas de negocio y flujos (p. ej. cálculo de progreso de módulo, agregación de metadatos del catálogo, reglas de administración de usuarios, flujo del intento de quiz: 429, 422 y rango de respuestas). |
| Repositorios | `test/*Repository*.test.ts`, `test/*.postgres.test.ts` | SQLite real en un directorio temporal; y variantes con `pg` simulado para el SQL de Postgres. |
| Handlers | `test/api-*.test.ts` y similares | `vi.doMock` de `lib/persistence`, `lib/http/auth` y `lib/http/audit`; comprueban estados, cuerpos y orden de llamadas. |
| Contratos | `test/contracts-openapi.test.ts`, `test/api-contracts.test.ts` | Cobertura del registro frente a `pages/api`, `openapi.json` al día y cada handler (servicios simulados; auth, origen y límite reales) contra el esquema de cada estado. Ver `API_CONTRACTS.md`. |
| Adaptadores HTTP | `test/lib.test.ts`, `test/rateLimit.test.ts` | Peticiones simuladas contra `lib/http/*`. |
| Integración | `test/postgres-integration/` | PostgreSQL real efímero (`npm run test:integration`). Incluye las transacciones: Kysely y SQL crudo en el mismo `ROLLBACK`, cliente liberado y transacciones concurrentes. |

## Decisiones y matices

- **Auditoría en el handler**: el handler llama a `writeAuditLog` (adaptador HTTP)
  tras el caso de uso. El servicio devuelve los datos necesarios y, en
  administración de usuarios, un `audit: { action, details }`. Así los servicios
  no necesitan conocer a quién ni desde dónde se actúa.
- **Lectura del alcance diferida**: en `PUT`/`DELETE /api/evidences/modules/[id]`
  el servicio recibe un `loadScope()` para conservar el orden exacto de
  consultas que tenía el endpoint (módulo primero, alcance después).
- **Importación**: la consulta del roadmap existente solo se hace en la vista
  previa; antes también se ejecutaba (sin usarse) al importar.
- **Último admin activo**: la comprobación estaba duplicada de forma idéntica en
  `users/[id]`; ahora es una única regla del servicio de administración.
- **Bootstrap**: `lib/persistence/bootstrap/` es código de arranque y usa el
  repositorio de metadatos y utilidades puras de `content` para sembrar.
- **Importaciones puras entre capas**: además del bootstrap, hay tres
  importaciones de funciones o constantes puras (sin SQL ni puertos) que cruzan
  la regla de dependencias de la tabla anterior:
  - `lib/persistence/sqliteSchema.ts` importa `domains/content/version` y
    `domains/content/metadata`.
  - `lib/domains/progress/repositories/quizRepository.ts` importa
    `domains/content/quizzes`.
  - `lib/domains/admin/repositories/dashboardRepository.ts` importa
    `domains/progress/constants`.
  Ninguna se salta un puerto. Si crecen, conviene moverlas a un módulo
  compartido.
- **Sesión antes del módulo en `GET /api/quizzes/modules/[id]`**: el handler
  lee el usuario de la sesión antes de buscar el módulo. La respuesta es la
  misma; el único efecto nuevo es que una petición a un módulo inexistente
  también actualiza `last_seen_at` de la sesión.
- **Lecturas de catálogo (`catalogRepository`) y vistas del alumno
  (`learnerViewRepository`)**: son modelos de lectura que devuelven filas tal
  cual para no cambiar el JSON de la API.
- **Transacciones**: ver la sección [Transacciones](#transacciones) más abajo.
  Hasta la corrección del 2026-10-15 no existía un helper reutilizable (la
  importación usaba `BEGIN`/`COMMIT` a mano y los repositorios con Kysely no
  participaban en ninguna transacción).

## Fuera de alcance y trabajo futuro

- **Adaptadores por dialecto (opción B)**: separar cada repositorio en
  `sqlite/` y `postgres/` detrás del mismo puerto. Hoy cada repositorio conserva
  sus ramas `if (db.backend !== 'postgres')`.
- **Mensajes `401`/`403`/`405`/`429` en inglés** (`authentication required`,
  `admin role required`, `Method Not Allowed`, `too many attempts…`,
  `setup token required`, errores de origen): se mantienen tal cual.
- **`PUT`/`DELETE /api/evidences/modules/[id]`**: si `getRoadmapReadScope` falla,
  escribe un `401` y después un `404` sobre la misma respuesta (comportamiento
  heredado, conservado a propósito en esta refactorización).
- **`DELETE /api/roadmaps/[id]`** responde `204` aunque el roadmap no exista.
- **`entityId: null` en auditoría** se guardaría como el texto `"null"`
  (`String(null)`); hoy ningún llamador lo pasa.
- Migrar `validateRoadmapImport` a Zod (ver `VALIDATION.md`). Los esquemas de
  respuesta ya existen en `lib/contracts`; las incoherencias de la API que
  documentan (idioma de errores, `204` al borrar roadmaps, etc.) están en
  `API_CONTRACTS.md`.
