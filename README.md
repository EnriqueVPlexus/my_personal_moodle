# CanteraHub

CanteraHub es una aplicación web para gestionar una cantera interna de aprendizaje técnico. Permite publicar roadmaps formativos, organizar módulos, enlazar recursos oficiales, definir prácticas con evidencia entregable y gobernar el acceso mediante roles.

La app incluye de serie el **Roadmap AWS gratuito para cantera junior DevOps** y el **Roadmap desde 0 a DevOps Junior**, además de una base SQLite local que se migra y se alimenta automáticamente al arrancar.

## Funcionalidad

- Home pública con acceso al catálogo de itinerarios.
- Listado y detalle de roadmaps.
- Roadmaps con objetivos, metodología, pesos de evaluación y módulos ordenados.
- Módulos con objetivo, duración, contenidos, importancia, recursos oficiales, vídeos, actividad práctica, evidencia y evaluación.
- Página individual de módulo con lecciones y estado de completado.
- Modo lectura para usuarios normales.
- Panel admin para crear roadmaps, módulos, lecciones y usuarios.
- Control admin para permitir que un usuario vea todos los roadmaps o solo una selección.
- Activación, desactivación y reseteo de contraseña de usuarios.
- Auditoría de acciones sensibles.
- Importación manual de roadmaps JSON con validación y vista previa.
- Setup guiado para crear el primer admin.

## Stack

- Next.js 15 con Pages Router.
- React 18 y TypeScript.
- Tailwind CSS.
- SQLite local con `sqlite` y `sqlite3`.
- API Routes de Next.js.
- Vitest, Testing Library y cobertura V8.
- ESLint con configuración de Next.js.

## Requisitos

- Node.js compatible con Next.js 15.
- npm.

## Arranque Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

La aplicación se abre normalmente en `http://localhost:3000`. Si el puerto está ocupado, Next.js usará otro disponible.

La base de datos local se crea en `data/dev.db`. Al abrir la app por primera vez se ejecutan migraciones, se siembran los roadmaps incluidos y, si existen `ADMIN_EMAIL` y `ADMIN_PASSWORD`, se crea o actualiza una cuenta admin inicial.

## Setup Inicial

Hay dos formas de crear el primer admin:

1. Interfaz web: abre `/setup` y completa el formulario. En producción define `AUTH_SETUP_TOKEN`.
2. Variables de entorno: define `ADMIN_EMAIL` y `ADMIN_PASSWORD` antes de arrancar.

Una vez existe al menos un usuario, `/setup` queda bloqueado para nuevas altas iniciales.

## Variables De Entorno

Consulta `.env.example` para los valores esperados:

```bash
ADMIN_EMAIL=
ADMIN_PASSWORD=
AUTH_SETUP_TOKEN=
AUTH_PASSWORD_PEPPER=
REQUIRE_AUTH_FOR_READS=false
NEXT_PUBLIC_PRODUCT_NAME=CanteraHub
NEXT_PUBLIC_COMPANY_NAME=Plexus Tech
NEXT_PUBLIC_COMPANY_LOGO=/brand/company-logo.png
```

Notas:

- Puedes dejar `ADMIN_EMAIL` y `ADMIN_PASSWORD` vacíos y crear el primer admin desde `/setup`.
- `ADMIN_PASSWORD` debe tener al menos 12 caracteres.
- `AUTH_SETUP_TOKEN` es especialmente importante en producción.
- `AUTH_PASSWORD_PEPPER` endurece los hashes, pero si se cambia después de crear usuarios las contraseñas existentes dejarán de validar.
- `REQUIRE_AUTH_FOR_READS=true` exige login también para consultas de roadmaps, módulos y lecciones.
- Los permisos por roadmap se aplican a usuarios autenticados. Para que visitantes sin sesión no vean todo el catálogo, usa `REQUIRE_AUTH_FOR_READS=true`.
- `NEXT_PUBLIC_COMPANY_LOGO` debe apuntar a un asset público, por ejemplo `/brand/company-logo.png`.

## Rutas Web

- `/`: home.
- `/roadmaps`: listado de roadmaps.
- `/roadmaps/[id]`: detalle de roadmap con timeline de módulos.
- `/modules/[id]`: detalle de módulo y lecciones.
- `/login`: login.
- `/setup`: creación del primer admin.
- `/admin/users`: gestión de usuarios.
- `/admin/users`: gestión de usuarios y acceso por roadmap.
- `/admin/audit`: auditoría admin.
- `/admin/import-roadmap`: importación y actualización controlada de roadmaps JSON.

## API

Lecturas públicas por defecto:

- `GET /api/roadmaps`
- `GET /api/roadmaps?q=&category=&topic=&level=&duration=&sort=` (busqueda, filtros combinables y ordenacion)
- `GET /api/roadmaps/:id`
- `GET /api/roadmaps/metadata` (categorias, temas, niveles y rango de duracion disponibles)
- `GET /api/modules`
- `GET /api/modules?roadmap_id=1`
- `GET /api/modules/:id`
- `GET /api/lessons?module_id=1`
- `GET /api/lessons/:id`

Operaciones admin:

- `POST /api/roadmaps`
- `POST /api/roadmaps/import` (`preview` o `publish`, solo admin)
- `PUT /api/roadmaps/:id`
- `DELETE /api/roadmaps/:id`
- `POST /api/modules`
- `PUT /api/modules/:id`
- `DELETE /api/modules/:id`
- `POST /api/lessons`
- `PUT /api/lessons/:id`
- `DELETE /api/lessons/:id`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `GET /api/audit-logs`

`PATCH /api/users/:id` acepta `action: "set_roadmap_access"` para cambiar entre acceso a todos los roadmaps y una lista concreta de `roadmap_ids`.

Autenticación:

- `GET /api/auth/setup-status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Las guías rápidas con `curl` para módulos y lecciones están en `test/modules_api.md` y `test/lessons_api.md`.

El importador acepta un objeto con `title`, `modules` y, opcionalmente, `description`, `duration`,
`category`, `topics`, `objectives`, `methodology` y `evaluation_weights`. Cada módulo requiere `title`
y puede incluir `position`, `level`, duración, contenidos, recursos, actividad, evidencia y evaluación.
Al actualizar se conservan los módulos no incluidos y el progreso ya registrado.

## Seguridad

- Contraseñas hasheadas con `scrypt`, sal aleatoria y pepper opcional.
- Sesiones persistidas como hash de token en SQLite.
- Cookie de sesión `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- Protección de origen para métodos mutantes.
- Invalidación de sesiones al desactivar usuarios o resetear contraseñas.
- Restricción por usuario para listar roadmaps, abrir detalles, consultar módulos y consultar lecciones.
- Las APIs validan permisos en servidor; la UI solo oculta controles como mejora de experiencia.
- Auditoría para creación, actualización y borrado de contenido, usuarios y setup inicial.

## Scripts

```bash
npm run dev           # servidor de desarrollo
npm run build         # build de producción
npm run start         # arranca el build
npm run lint          # ESLint
npm run test:unit     # Vitest
npm run test:coverage # Vitest con cobertura
npm test              # lint + validación de seeds + cobertura
```

La cobertura exige un mínimo global del 80% en statements, branches, functions y lines. Actualmente se incluyen `components`, `lib` y `pages`, incluidas las API routes.

## Estructura

```text
components/        Componentes React compartidos.
lib/               Base de datos, auth, auditoría, branding y helpers.
pages/             Pages Router, pantallas y API routes.
public/brand/      Logo por defecto.
styles/            Tailwind y estilos globales.
test/              Tests, helpers y guías curl.
data/dev.db        SQLite local generado en desarrollo.
```

## Auditoría De Dependencias

El repo incluye `scripts/audit-fix-force.sh` para probar `npm audit fix --force` en una rama temporal (`chore/audit-fix-force`). Úsalo solo con el árbol limpio, revisa `package-lock.json` y ejecuta la suite antes de integrar cambios.

También hay `overrides` en `package.json` para forzar versiones recientes de subdependencias problemáticas. Si una actualización rompe compatibilidad, revisa esos overrides antes de asumir que el fallo está en la aplicación.
