# my_personal_moodle

Aplicación web para gestionar una cantera de aprendizaje DevOps mediante roadmaps formativos, módulos, recursos, prácticas y evidencias entregables.

## Funcionalidad Principal

- Visualización de roadmaps formativos estructurados por módulos.
- Roadmap precargado: **Roadmap AWS gratuito para cantera junior DevOps**.
- Detalle de cada módulo con objetivo, contenidos, importancia, recursos oficiales, vídeos de apoyo, actividad práctica, evidencia entregable y evaluación.
- Enlaces clicables a recursos y vídeos externos.
- Vista tipo timeline/accordion para navegar módulos en orden.
- Gestión de lecciones asociadas a módulos.
- Modo lectura para usuarios normales.
- Panel admin para crear nuevos roadmaps, módulos y lecciones.

## Autenticación Y Roles

- Login con sesiones mediante cookie `HttpOnly`.
- Roles disponibles: `admin` y `user`.
- Solo `admin` puede crear o modificar contenido.
- Solo `admin` puede crear usuarios.
- Panel de usuarios en `/admin/users`.
- Desactivación/reactivación de usuarios.
- Reseteo de contraseñas.
- Logs de auditoría de acciones sensibles en `/admin/audit`.
- Opción para exigir login también en lectura con `REQUIRE_AUTH_FOR_READS=true`.

## Seguridad

- Contraseñas almacenadas con hash `scrypt` y sal aleatoria.
- Pepper opcional mediante `AUTH_PASSWORD_PEPPER`.
- Tokens de sesión almacenados en base de datos como hash.
- Cookies de sesión `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- Invalidación de sesiones al desactivar usuarios o resetear contraseñas.
- Protección de endpoints mutantes en servidor, no solo ocultando controles en UI.

## Tecnologías

- Next.js 15 con Pages Router.
- React 18.
- TypeScript.
- Tailwind CSS.
- SQLite como base de datos local.
- Paquetes `sqlite` y `sqlite3` para acceso a datos.
- API Routes de Next.js para backend.
- Node `crypto` para hashing y generación segura de tokens.

## Rutas Destacadas

- `/` — Home.
- `/roadmaps` — Listado de roadmaps.
- `/roadmaps/[id]` — Detalle completo de un roadmap.
- `/modules/[id]` — Detalle de módulo y lecciones.
- `/login` — Acceso de usuarios.
- `/setup` — Creación del primer admin.
- `/admin/users` — Gestión de usuarios.
- `/admin/audit` — Auditoría de acciones admin.

## Arranque Local

```bash
npm install
npm run dev
```

La app se abrirá normalmente en `http://localhost:3000`. Si el puerto está ocupado, Next.js usará otro disponible.

## Variables De Entorno

Puedes usar `.env.example` como referencia:

```bash
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-long-password
AUTH_SETUP_TOKEN=change-this-setup-token
AUTH_PASSWORD_PEPPER=change-this-random-pepper
REQUIRE_AUTH_FOR_READS=false
```

Notas:

- En local puedes crear el primer admin desde `/setup`.
- En producción conviene definir `AUTH_SETUP_TOKEN`.
- Si el contenido debe ser privado, cambia `REQUIRE_AUTH_FOR_READS=true`.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Estado Actual

La app ya incluye un roadmap completo de AWS para perfiles junior DevOps, autenticación con roles, gestión de usuarios admin, protección de APIs y auditoría básica.
