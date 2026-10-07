# Documentación Técnica Del Proyecto

Este repositorio contiene **Plexus Academy**, una aplicación Next.js + TypeScript para gestionar roadmaps de aprendizaje, módulos, lecciones, usuarios, roles y auditoría.

## Estado Del Producto

La aplicación ya no es un scaffold: incluye una experiencia funcional con roadmap AWS precargado, autenticación, setup inicial, panel admin, auditoría y pruebas automatizadas con cobertura.

## Puesta En Marcha

1. Instala dependencias:

```bash
npm install
```

1. Crea configuración local:

```bash
cp .env.example .env.local
```

1. Arranca el servidor:

```bash
npm run dev
```

1. Abre `http://localhost:3000`.

Sin `DATABASE_URL`, la base local se crea automáticamente en `data/dev.db`.
Si `DATABASE_URL` está definida, la aplicación usa PostgreSQL, por ejemplo
el proyecto de Supabase configurado en `.env.local`.

La capa SQL estructurada usa Kysely para las nuevas consultas tipadas.
**Todos los dominios ya están migrados** por repositorios tipados
(`lib/*Repository.ts`), manteniendo SQLite local y PostgreSQL remoto:
roadmaps, módulos, lecciones, auditoría, usuarios, progreso
(`lib/progressRepository.ts`, incluyendo el CTE con función ventana de
`listUserRoadmapProgress` y los upsert `ON CONFLICT` de progreso de
roadmap/lección), quizzes (`lib/quizRepository.ts`, intentos y estadísticas
por módulo), evidencias (`lib/evidenceRepository.ts`, incluyendo auditoría de
la revisión admin), el panel admin (`lib/adminDashboard.ts`, con las 3 CTEs
de sus consultas agregadas traducidas a Postgres; el cálculo de días de
inactividad ya está verificado contra una PostgreSQL real —
`test/postgres-integration/inactivity-days.postgres-integration.test.ts` —,
lo que además destapó y corrigió un `GROUP BY` incompleto en la CTE
`learner_progress` que SQLite toleraba pero Postgres no),
portfolio (`lib/portfolio.ts`, reutilizando `evidenceRepository.listEvidences`
en vez de duplicar el join) e import/export de roadmaps
(`lib/roadmapImport.ts`/`lib/roadmapMetadata.ts`, único dominio con
transacción multi-tabla — usa SQL crudo parametrizado en ambos backends
dentro de la transacción en vez de Kysely, ya que el query builder no
participa del cliente de conexión que Postgres usa para `BEGIN`/`COMMIT`).
Tests de integración contra PostgreSQL real: cubiertos auth, contenido
(roadmaps/módulos/lecciones), progreso (incluyendo el CTE con función
ventana), quizzes, importación (incluyendo un `ROLLBACK` real forzado a
mitad de transacción) y el cálculo de `inactivity_days` del panel admin, en
`test/postgres-integration/*.postgres-integration.test.ts` (se saltan salvo
que exista `TEST_DATABASE_URL` o `DATABASE_URL`). Tienen su propia config,
`vitest.integration.config.ts`, que los ejecuta fichero a fichero
(`fileParallelism: false`, por conflictos de `migrate()` concurrente);
`npm run test:unit` los excluye y además vacía `DATABASE_URL`, así que los
tests unitarios siempre usan SQLite aunque `direnv` cargue la variable. Corren
contra una base PostgreSQL local aislada vía Docker
(`docker-compose.test.yml`, `postgres:16-alpine`, sin volumen persistente):

```bash
npm run test:db:up      # levanta el contenedor en localhost:55432 y aplica
                         # las migraciones formales (scripts/migrate.ts up)
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/app_test \
  npm run test:integration:run
npm run test:db:down    # detiene el contenedor y descarta sus datos (-v)
```

o el atajo `npm run test:integration` (levanta, ejecuta y desmonta, y
devuelve el código de salida de los tests). Configura `TEST_DATABASE_URL` igual
que `DATABASE_URL` (vía `direnv`, ver `.envrc`) para no repetirlo en cada
comando. Si `TEST_DATABASE_URL` no está definida, los tests caen a
`DATABASE_URL` (la Supabase real compartida) — útil para quien aún no tiene
Docker configurado, pero no aislado. Detalle completo en
`test/postgres-integration/README.md` y en `backlog.md`.

`openDb()` (`lib/db.ts`) cachea la instancia `PostgresDb`/`Pool` por
proceso (antes creaba un pool nuevo en cada llamada); `PostgresDb` define
timeouts de conexión/idle y un listener de error en el pool — ver
`test/postgres-integration/connection-pool.postgres-integration.test.ts` y
`backlog.md` ("Gestion de conexiones y transacciones") para el detalle y lo
que queda pendiente (manejo de errores no uniforme en todas las rutas de
`pages/api/**`).

## Dominio Funcional

- **Roadmaps**: rutas formativas con descripción, objetivos, metodología y pesos de evaluación.
- **Módulos**: unidades ordenadas dentro de un roadmap, con duración, objetivo, contenidos y recursos.
- **Lecciones**: tareas simples asociadas a módulos, marcables como completadas por admin.
- **Progreso personal**: seguimiento por usuario de roadmaps iniciados, lecciones completadas y tiempo de estudio acumulado.
- **Usuarios**: cuentas con rol `admin` o `user`.
- **Auditoría**: registro de acciones sensibles como altas, cambios y borrados.

## Roles Y Acceso

- `user`: puede consultar roadmaps, módulos y lecciones.
- `admin`: puede crear contenido, gestionar usuarios, activar/desactivar cuentas, resetear contraseñas y consultar auditoría.
- Si `REQUIRE_AUTH_FOR_READS=true`, las lecturas también requieren sesión.

## Setup Y Administración

- `/setup` crea el primer admin si no existe ningún usuario.
- En producción, configura `AUTH_SETUP_TOKEN` y úsalo en el formulario de setup.
- También se puede crear un admin inicial con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
- `/admin/users` gestiona usuarios y contraseñas.
- `/admin/audit` muestra los últimos 200 eventos sensibles.

### Resetear Contraseña De Admin

Si pierdes acceso al usuario admin (ej. SQLite en desarrollo):

1. **En SQLite local** (`data/dev.db`):
   - Genera el hash con `npx tsx` y `hashPassword()` de `lib/password.ts`.
   - Ejecuta SQL directamente:
     ```bash
     sqlite3 ./data/dev.db "UPDATE users SET password_hash = '<HASH>', updated_at = datetime('now') WHERE role = 'admin';"
     ```

2. **En PostgreSQL/Supabase**:
   - Abre el SQL Editor de Supabase.
   - Ejecuta el mismo UPDATE en la tabla `users`.
   - Asegúrate de que `AUTH_PASSWORD_PEPPER` en `.env.local` sea el mismo que en producción.

La contraseña debe tener al menos 12 caracteres; el validador en `lib/password.ts` lo comprueba.

## Estructura Principal

```text
pages/
  index.tsx                 Home.
  roadmaps/                 Listado y detalle de roadmaps.
  my-roadmaps.tsx           Resumen personal de progreso.
  modules/[id].tsx          Detalle de módulo y lecciones.
  login.tsx                 Login.
  setup.tsx                 Setup inicial.
  admin/                    Usuarios y auditoría.
  api/                      API Routes.

components/                 Layout, cabecera, formularios, cards y contenido de módulos.
lib/
  db.ts                     Migraciones SQLite y seed AWS.
  auth.ts                   Sesiones, roles y protección de origen.
  password.ts               Hash y validación de contraseñas.
  audit.ts                  Escritura de eventos.
  roadmapPresentation.ts    Helpers de presentación para JSON/texto.
  branding.ts               Branding configurable por entorno.

test/                       Suite Vitest, helpers y guías curl.
styles/                     Tailwind y estilos globales.
public/brand/               Assets de marca por defecto.
scripts/                    Utilidades de mantenimiento.
```

## UI y Branding

- Header compacto con logo 50px, sin padding vertical.
- Nombres de la app: `NEXT_PUBLIC_PRODUCT_NAME` (ej. "Plexus Academy") y `NEXT_PUBLIC_COMPANY_NAME` (ej. "Plexus Tech") en `.env.local`.
- Admin links agrupados en dropdown con componente `AdminDropdown` que cierra al hacer click fuera.
- Usuario simplificado: muestra solo username (antes del @) con link "Log out".
- Brand assets en `public/brand/`: logo PNG/SVG, favicon.

## Base De Datos

`lib/db.ts` crea y migra estas tablas. El backend se selecciona así:

- Desarrollo y tests: SQLite local cuando `DATABASE_URL` no existe.
- Supabase/producción: PostgreSQL cuando `DATABASE_URL` existe.

No se deben configurar ambos backends para compartir datos automáticamente:
SQLite es una base local independiente y PostgreSQL es la fuente central del
entorno remoto.

Variables mínimas para PostgreSQL:

```env
DATABASE_URL=postgresql://postgres:CONTRASENA@db.PROJECT_REF.supabase.co:5432/postgres
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PROJECT_REF=PROJECT_REF
```

La contraseña de la base de datos y cualquier clave privada deben permanecer
en `.env.local` o en los secretos del proveedor de despliegue.

Para copiar datos de una SQLite existente a PostgreSQL, usa primero la
simulación:

```bash
npm run migrate:postgres
```

El comando no modifica PostgreSQL y omite las sesiones activas. Revisa los
recuentos antes de aplicar la copia con:

```bash
npm run migrate:postgres -- --apply
```

No ejecutes `--apply` sobre un proyecto Supabase que ya tenga contenido sin
comparar antes los IDs y recuentos de ambas bases.

### Migraciones formales de PostgreSQL

Para levantar o actualizar el esquema de PostgreSQL de forma versionada
(en vez del bootstrap ad-hoc de `PostgresDb.migrate()`, pensado solo para
tests), usa el migrador basado en `Kysely` (`migrations/*.ts` +
`scripts/migrate.ts`):

```bash
npm run migrate:status   # qué migraciones están ejecutadas / pendientes
npm run migrate:up       # aplica las migraciones pendientes
npm run migrate:down     # revierte exactamente la última migración
```

Requiere `DATABASE_URL` (nunca cae a SQLite). En producción, ejecuta siempre
`migrate:status` antes de `migrate:up`. Detalle de diseño, el porqué de
`.ifNotExists()` y la prueba de bootstrap desde cero en
`backlog.md` ("Migraciones formales de PostgreSQL").

`lib/db.ts` crea y migra estas tablas:

- `roadmaps`
- `modules`
- `lessons`
- `users`
- `sessions`
- `audit_logs`
- `user_lesson_progress`
- `user_roadmap_progress`
- `user_quiz_attempts`
- `roadmap_categories`
- `topics`
- `roadmap_topics`

También inserta o actualiza los roadmaps iniciales desde `lib/roadmapSeeds/`.

Los administradores pueden limitar cada cuenta de usuario a una selección de
roadmaps mediante `user_roadmap_access`; las cuentas admin conservan acceso total.

## Calidad Y Tests

La semantica, los rangos y la decision de rendimiento del catalogo se documentan
en `SEARCH_FILTERS.md`.

Comando principal:

```bash
npm test
```

Este comando ejecuta:

1. `npm run lint`
2. `node test/aws-roadmap-seed.test.mjs`
3. `npm run test:coverage`

La cobertura global mínima configurada es 80% para statements, branches, functions y lines. El scope de cobertura incluye `components`, `lib` y `pages`, incluyendo API routes y pantallas.

Comandos útiles:

```bash
npm run test:unit
npm run test:coverage
npm run build
```

## Endpoints Relevantes

Consulta y contenido:

- `GET /api/roadmaps`
- `GET /api/roadmaps?q=&category=&topic=&level=&duration=&sort=`
- `GET /api/roadmaps/:id`
- `GET /api/roadmaps/metadata`
- `POST /api/roadmaps`
- `PUT /api/roadmaps/:id`
- `DELETE /api/roadmaps/:id`
- `GET /api/modules`
- `GET /api/modules?roadmap_id=1`
- `GET /api/modules/:id`
- `POST /api/modules`
- `PUT /api/modules/:id`
- `DELETE /api/modules/:id`
- `GET /api/lessons?module_id=1`
- `GET /api/lessons/:id`
- `POST /api/lessons`
- `PUT /api/lessons/:id`
- `DELETE /api/lessons/:id`
- `PUT /api/progress/lessons/:id`
- `GET /api/progress/roadmaps`

Auth, usuarios y auditoría:

- `GET /api/auth/setup-status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `GET /api/audit-logs`

Las escrituras requieren sesión admin y pasan por comprobación de origen.

## Seguridad Operativa

- No compartas `AUTH_PASSWORD_PEPPER`; trátalo como secreto.
- No cambies `AUTH_PASSWORD_PEPPER` en una instalación con usuarios activos salvo que fuerces reseteo de contraseñas.
- Usa contraseñas de al menos 12 caracteres.
- En producción define `AUTH_SETUP_TOKEN`.
- Revisa `data/dev.db` antes de mover datos entre entornos.

## Auditoría De Dependencias

`scripts/audit-fix-force.sh` crea una rama temporal, ejecuta `npm audit fix --force`, reinstala dependencias y prueba `npm run build`.

`--force` puede introducir majors incompatibles. Úsalo solo en una copia limpia y revisa los cambios antes de hacer merge.

```bash
chmod +x scripts/audit-fix-force.sh
./scripts/audit-fix-force.sh
```
