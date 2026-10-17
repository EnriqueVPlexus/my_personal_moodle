# CanteraHub

CanteraHub es una aplicación web para gestionar una cantera interna de aprendizaje técnico. Permite publicar roadmaps formativos, organizar módulos, enlazar recursos oficiales, definir prácticas con evidencia entregable y gobernar el acceso mediante roles.

La app incluye de serie el **Roadmap AWS gratuito para cantera junior DevOps** y el **Roadmap desde 0 a DevOps Junior**, además de PostgreSQL local en Docker para desarrollo. SQLite sigue disponible como alternativa.

## Funcionalidad

- Home pública con acceso al catálogo de itinerarios.
- Listado y detalle de roadmaps.
- Roadmaps con objetivos, metodología, pesos de evaluación y módulos ordenados.
- Módulos con objetivo, duración, contenidos, importancia, recursos oficiales, vídeos, actividad práctica, evidencia y evaluación.
- Página individual de módulo con lecciones y estado de completado.
- Modo lectura para usuarios normales.
- Panel admin para crear roadmaps, módulos, lecciones y usuarios.
- Dashboard admin con actividad, adopción, finalización y usuarios sin actividad reciente.
- Evidencias de portfolio por usuario y módulo, con consulta para administración.
- Control admin para permitir que un usuario vea todos los roadmaps o solo una selección.
- Activación, desactivación y reseteo de contraseña de usuarios.
- Auditoría de acciones sensibles.
- Importación manual de roadmaps JSON con validación y vista previa.
- Setup guiado para crear el primer admin.

## Stack

- Next.js 15 con Pages Router.
- React 18 y TypeScript.
- Tailwind CSS.
- PostgreSQL local en Docker y SQLite como alternativa.
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
npm run db:dev:up
npm run dev
```

La aplicación se abre normalmente en `http://localhost:3000`. Si el puerto está ocupado, Next.js usará otro disponible.

Por defecto, `.env.example` configura PostgreSQL local en Docker. `npm run db:dev:up` levanta el contenedor persistente y aplica las migraciones; al abrir la app por primera vez se siembran los roadmaps incluidos y, si existen `ADMIN_EMAIL` y `ADMIN_PASSWORD`, se crea o actualiza una cuenta admin inicial. Para usar SQLite, deja `DATABASE_URL` vacía en `.env.local`; los datos se guardan en `data/dev.db`.

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
- `/admin`: dashboard de actividad formativa.
- `/admin/users`: gestión de usuarios y acceso por roadmap.
- `/admin/evidences`: consulta de evidencias entregadas por los usuarios.
- `/admin/audit`: auditoría admin.
- `/admin/import-roadmap`: importación y actualización controlada de roadmaps JSON.

## API

La API HTTP tiene un contrato versionado y generado desde el código, con el
detalle de cada ruta (parámetros, cuerpo, respuestas y errores).

### Dónde está el contrato

- `openapi.json` en la raíz del repositorio: documento OpenAPI 3.1 (se regenera
  con `npm run contracts:generate`; un test falla si está desactualizado).
- `GET /api/openapi.json`: el mismo documento, servido por la aplicación. Es
  público y de solo lectura: describe rutas y esquemas, no contiene datos.
- Cómo verlo: pega el contenido de `openapi.json` en cualquier visor OpenAPI,
  por ejemplo [Swagger Editor](https://editor.swagger.io), o impórtalo en Postman
  o Insomnia.
- Reglas de versionado y cómo evoluciona: `API_CONTRACTS.md`. La versión del
  contrato es `info.version` (semver) y hoy es **3.3.0**.
- Novedades de la 3.3.0: un fallo inesperado del servidor responde siempre `500` con
  JSON `{ "error": "Error interno del servidor." }` (antes, el `500` por defecto de
  Next, que no era JSON). El detalle solo se registra en el servidor.
- Novedades de la 3.2.0: `POST /api/users` devuelve el mismo usuario que el listado y
  `PATCH` (con `roadmap_access_ids`, vacío al crearlo); `PUT`/`DELETE`
  `/api/evidences/modules/{id}` sin sesión responden solo `401`.
- Novedades de la 3.0.0: todos los errores están en español (el texto es para
  personas, decide por el estado HTTP); `405` es JSON `{ "error": "Método no permitido." }`
  con `Allow`; `DELETE /api/roadmaps/{id}` responde `204` si borra y `200` con
  `{ "message": ... }` si el roadmap no existía; `PATCH /api/users/{id}` devuelve
  siempre la misma forma de usuario (con `roadmap_access_ids`).
- Novedades de la 2.0.0 (detalle en el historial de `API_CONTRACTS.md`):
  `quiz_bank` ya no se expone en ninguna respuesta (las preguntas públicas están
  en `GET /api/quizzes/modules/{id}` y en el campo `quiz` del detalle de módulo,
  sin la respuesta correcta); `GET /api/roadmaps/{id}/export` es solo para
  administradores; los contadores (`module_count`, `roadmap_count`,
  `unclassified_roadmaps`) son siempre números y `has_evidence` es siempre
  booleano, con SQLite y con PostgreSQL.

### Cómo llamar a la API

- **Autenticación**: sesión por cookie `moodle_session` (`HttpOnly`,
  `SameSite=Lax`). Se obtiene con `POST /api/auth/login`; no hay tokens de API.
- **Mismo origen**: las peticiones que modifican datos (`POST`, `PUT`, `PATCH`,
  `DELETE`) comprueban la cabecera `Origin`. Si la envías, debe coincidir con el
  servidor (o con `ALLOWED_ORIGIN`); si no, responden `403`. Un cliente fuera del
  navegador puede omitir `Origin`.
- **Cuerpos**: JSON (`Content-Type: application/json`). Los identificadores de
  ruta son enteros positivos.
- **Niveles de acceso**: `Pública`, `Lectura` (pública salvo que el servidor use
  `REQUIRE_AUTH_FOR_READS=true`; los usuarios con acceso restringido solo ven sus
  roadmaps), `Sesión` (cualquier usuario activo) y `Admin`.
- **Errores**: casi todos son JSON `{ "error": "<mensaje>" }`. Los de validación
  (`400`) añaden `issues: [{ "path": "title", "message": "..." }]`. Otros códigos
  llevan campos extra: `409` de importación (`code`) y `429` de cuestionarios
  (`eligibility`). `405` es JSON `{ "error": "Método no permitido." }` con la cabecera
  `Allow`. Un fallo inesperado (`500`) también es JSON
  `{ "error": "Error interno del servidor." }`. El texto de `error` es para personas; no lo uses para decidir la lógica
  del cliente. Más detalle en `API_CONTRACTS.md` y `VALIDATION.md`.
- **Tipos**: los tipos TypeScript de las respuestas se importan de
  `lib/contracts` (`import type { ... } from '../lib/contracts'`).

### Endpoints

Resumen generado desde el registro de rutas (`lib/contracts/registry.ts`); un test
comprueba que esta tabla incluye todas las rutas. El detalle completo está en
`openapi.json`.

#### Autenticación

| Método y ruta | Acceso | Qué hace |
| --- | --- | --- |
| `GET /api/auth/setup-status` | Pública | Estado de la configuración inicial |
| `POST /api/auth/setup` | Pública | Crear el primer administrador |
| `POST /api/auth/login` | Pública | Iniciar sesión |
| `POST /api/auth/logout` | Pública | Cerrar sesión |
| `GET /api/auth/me` | Pública | Usuario de la sesión actual |

#### Catálogo

| Método y ruta | Acceso | Qué hace |
| --- | --- | --- |
| `GET /api/roadmaps` | Lectura | Buscar roadmaps del catálogo |
| `POST /api/roadmaps` | Admin | Crear un roadmap |
| `GET /api/roadmaps/metadata` | Lectura | Metadatos y contadores de los filtros del catálogo |
| `POST /api/roadmaps/import` | Admin | Previsualizar o publicar la importación de un roadmap |
| `GET /api/roadmaps/{id}` | Lectura | Detalle de un roadmap con sus módulos y progreso |
| `PUT /api/roadmaps/{id}` | Admin | Actualizar un roadmap |
| `DELETE /api/roadmaps/{id}` | Admin | Eliminar un roadmap |
| `GET /api/roadmaps/{id}/export` | Admin | Exportar un roadmap como JSON (copia de seguridad, incluye los cuestionarios con su respuesta) |
| `GET /api/modules` | Lectura | Listar módulos |
| `POST /api/modules` | Admin | Crear un módulo |
| `GET /api/modules/{id}` | Lectura | Detalle de un módulo con lecciones, progreso y cuestionario |
| `PUT /api/modules/{id}` | Admin | Actualizar un módulo |
| `DELETE /api/modules/{id}` | Admin | Eliminar un módulo |
| `GET /api/lessons` | Lectura | Listar las lecciones de un módulo |
| `POST /api/lessons` | Admin | Crear una lección |
| `GET /api/lessons/{id}` | Lectura | Obtener una lección |
| `PUT /api/lessons/{id}` | Admin | Actualizar una lección |
| `DELETE /api/lessons/{id}` | Admin | Eliminar una lección |

#### Progreso

| Método y ruta | Acceso | Qué hace |
| --- | --- | --- |
| `GET /api/progress/roadmaps` | Sesión | Progreso del alumno en sus roadmaps |
| `PUT /api/progress/lessons/{id}` | Sesión | Marcar una lección como completada o pendiente |
| `GET /api/quizzes/modules/{id}` | Lectura | Cuestionario público de un módulo |
| `POST /api/quizzes/modules/{id}` | Sesión | Enviar un intento de cuestionario |

#### Evidencias

| Método y ruta | Acceso | Qué hace |
| --- | --- | --- |
| `GET /api/evidences/modules/{id}` | Sesión | Evidencia del alumno para un módulo |
| `PUT /api/evidences/modules/{id}` | Sesión | Guardar (crear o reemplazar) la evidencia de un módulo |
| `DELETE /api/evidences/modules/{id}` | Sesión | Eliminar la evidencia del alumno en un módulo |
| `GET /api/evidences` | Admin | Listar evidencias de todos los alumnos (revisión) |
| `PUT /api/evidences/{id}/review` | Admin | Revisar una evidencia |
| `GET /api/portfolio` | Sesión | Portfolio de evidencias del alumno |
| `GET /api/portfolio/export` | Sesión | Exportar el portfolio como Markdown |

#### Administración

| Método y ruta | Acceso | Qué hace |
| --- | --- | --- |
| `GET /api/admin/dashboard` | Admin | Panel de métricas de administración |
| `GET /api/audit-logs` | Admin | Últimos registros de auditoría |
| `GET /api/users` | Admin | Listar usuarios |
| `POST /api/users` | Admin | Crear un usuario |
| `PATCH /api/users/{id}` | Admin | Activar/desactivar, cambiar contraseña o acceso a roadmaps de un usuario |

#### Contrato

| Método y ruta | Acceso | Qué hace |
| --- | --- | --- |
| `GET /api/openapi.json` | Pública | Documento OpenAPI 3.1 de esta API |

`PATCH /api/users/{id}` elige la operación con `action` (`set_active`,
`reset_password` o `set_roadmap_access`) y siempre devuelve el mismo usuario, con
`can_view_all_roadmaps` y `roadmap_access_ids`; `POST /api/users` (`201`) devuelve esa
misma forma. `DELETE /api/roadmaps/{id}` es
idempotente: `204` si lo borra y `200` con `{ "message" }` si no existía. El importador acepta un objeto con
`title`, `modules` y, opcionalmente, `description`, `duration`, `category`,
`topics`, `objectives`, `methodology` y `evaluation_weights`; al actualizar se
conservan los módulos no incluidos y el progreso ya registrado. Guías rápidas con
`curl` para módulos y lecciones en `test/modules_api.md` y `test/lessons_api.md`.

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
npm run contracts:generate  # regenera openapi.json desde lib/contracts
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
