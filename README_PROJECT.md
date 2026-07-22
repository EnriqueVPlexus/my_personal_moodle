# Documentación Técnica Del Proyecto

Este repositorio contiene **CanteraHub**, una aplicación Next.js + TypeScript para gestionar roadmaps de aprendizaje, módulos, lecciones, usuarios, roles y auditoría.

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

La base local se crea automáticamente en `data/dev.db`.

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

## Base De Datos

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
