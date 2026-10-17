# Validación De Entradas Y Contratos Con Zod

Documento técnico de la iniciativa `Validacion de entradas y contratos con Zod`
(rama `feature/input-validation-zod`). Describe la capa de validación de las API
Routes, el contrato de error y cómo añadir un esquema a una ruta nueva.

> El contrato completo de la API (respuestas, errores por estado, OpenAPI y
> versionado) está en `API_CONTRACTS.md`. Este documento cubre la **entrada**.

## Objetivo

Todas las rutas de `pages/api/**` que leen entrada (cuerpo, `req.query` o parámetros
`[id]`) la validan con `zod` **antes de ejecutar la lógica de negocio y las consultas de
negocio**, y responden a los errores con un formato único y en español.

## Arquitectura

Todo vive en `lib/validation/`. Hay un archivo por dominio y un módulo
común; los handlers importan directamente el archivo que necesitan.

| Archivo | Responsabilidad |
| --- | --- |
| `http.ts` | Contrato de error: `parseOrRespond`, `sendValidationError`, `sendValidationIssues`, formato de rutas (`modules[0].title`). Registra el locale español de Zod como red de seguridad. |
| `primitives.ts` | Primitivas compartidas: `text`, `optionalText`, `positiveInt`, `optionalPositiveInt`, `strictBoolean`, `bodyObject`, `queryObject`, `emailField`, `newPasswordField`. |
| `duration.ts` | Resolución del rango de duración en semanas (create/update) reutilizando `normalizeDurationRange` y `parseDurationWeeks`. |
| `auth.ts` | Login y setup inicial. |
| `users.ts` | Alta de usuarios y `PATCH` (unión discriminada por `action`). |
| `roadmaps.ts` | Alta/edición de roadmaps e `id` de ruta. |
| `modules.ts` | Alta/edición de módulos y filtro `roadmap_id`. |
| `lessons.ts` | Alta/edición de lecciones y filtro `module_id`. |
| `progress.ts` | Progreso de lecciones (`completed`, `time_spent_seconds`). |
| `quizzes.ts` | Forma del intento de quiz (`answers`). |
| `evidences.ts` | Evidencias del usuario, revisión admin y filtros del listado. |
| `catalog.ts` | Query del catálogo de roadmaps (`q`, filtros, `sort`). |
| `import.ts` | Sobre de la importación (`action`, `strategy`, `roadmap`) y su variante de contrato, que describe el documento completo. |
| `index.ts` | Reexporta todo (los handlers importan del archivo concreto). |

Los tipos de entrada se infieren de los esquemas con `z.infer` y se usan en
los handlers (por ejemplo `body.durationWeeks`, `body.topics`).

### Reutilización de normalizadores

Los esquemas **no duplican** reglas existentes; las invocan:

- `lib/domains/auth/password.ts`: `normalizeEmail` y `validatePassword` (`emailField`, `newPasswordField`).
- `lib/domains/content/metadata.ts`: `normalizeModuleLevel`, `normalizeDurationRange`,
  `parseDurationWeeks`, `normalizeTopics`.
- `lib/domains/content/version.ts`: `normalizeRoadmapVersion`, `normalizePublishedAt` y
  `ROADMAP_VERSION_PATTERN`, la única definición del formato `v1.0.0`.
- `lib/domains/content/roadmapFields.ts`: `roadmapVersionField(message)` y
  `publishedAtField(message)`, primitivas Zod construidas sobre esos normalizadores y
  usadas por el importador (cada llamador pone su mensaje). `lib/validation/roadmaps.ts` y
  el seed usan directamente los normalizadores, de modo que formato, valores por defecto
  y fecha ISO tienen una sola fuente.
- `lib/domains/progress/evidences.ts`: `validateEvidenceInput` (ahora devuelve mensajes en español y
  el campo afectado).
- `lib/domains/content/importSchema.ts`: esquema Zod del documento del roadmap importado, que
  reutiliza `normalizeModuleLevel`, `normalizeDurationRange`, `parseDurationWeeks` y
  `normalizeTopics`; `validateRoadmapImport` (`import.ts`) es un envoltorio fino (ver
  [Importación](#importación)).
- `lib/domains/content/search.ts`: `parseRoadmapSearchQuery` decide si `q` es demasiado larga.

Cuando un esquema aplica un normalizador mediante `.transform`, el handler recibe
el valor ya normalizado (p. ej. `email` en minúsculas, `topics` sin duplicados).

## Orden de validación en un handler

La validación ocurre siempre **antes de las consultas de negocio**. `openDb()`, la
autenticación y el rate limit se ejecutan antes y no cuentan como tales. El
orden real depende del tipo de ruta:

- **Rutas admin** (`users/[id]`, `evidences` índice, `evidences/[id]/review`, y las
  escrituras con `requireAdmin`/`requireUser`): método (`405`) → autenticación
  (`401`/`403`, sin cambios) → id/query → cuerpo → lógica de negocio. Así un usuario
  sin permisos no puede sondear los esquemas.
- **Rutas públicas o con alcance de lectura** (`roadmaps` GET, `modules`, `lessons`,
  `roadmaps/[id]`, `roadmaps/[id]/export`, `evidences/modules/[id]`,
  `quizzes/modules/[id]`, `progress/lessons/[id]`): método (`405`) → id/query
  (`400`, no requiere sesión) → autenticación/alcance (`getRoadmapReadScope`,
  `requireUser`) → cuerpo → lógica de negocio.
- **`POST /api/auth/login` y `POST /api/auth/setup`**: rate limit,
  comprobación de `setupToken` y de origen → cuerpo (`400`) → lógica.

Un cuerpo ausente nunca lanza una excepción: se responde `400` con
`El cuerpo de la petición debe ser un objeto JSON.`

## Contrato de error

Respuesta `400` de validación:

```json
{
  "error": "El campo «título» no puede superar 200 caracteres.",
  "issues": [
    { "path": "title", "message": "El campo «título» no puede superar 200 caracteres." }
  ]
}
```

- `error` (siempre presente, `string`): **mensaje del primer problema**, en español.
  Se eligió así (y no un resumen genérico) porque el frontend muestra `data.error`
  directamente al usuario, por ejemplo en `pages/admin/users.tsx`. Si no hubiera
  problemas, `error` es `Datos de entrada no válidos.`
- `issues` (opcional): lista de `{ path, message }` con todos los problemas
  (máximo 20). `path` usa la notación `campo`, `lista[0].campo`; es `''` cuando el
  problema afecta al cuerpo completo.
- Nunca se incluyen trazas, SQL ni mensajes de excepciones. Los errores `500`
  devuelven un texto genérico en español (p. ej. `evidences/[id]/review.ts` ya no
  devuelve `error.message`; el detalle se registra en el servidor).
- Los mensajes de usuario de `400`/`404`/`409` de las rutas tocadas están en español.
  Código, identificadores y comentarios siguen en inglés.

Claves adicionales que se conservan: `code` en el `409` de la importación y
`eligibility` en el `429` de los quizzes.

### Importación

`POST /api/roadmaps/import` devuelve `issues` con la forma `{ path, message }`, compatible
con el contrato **sin cambios** en `pages/admin/import-roadmap.tsx`. El sobre
(`action`, `strategy`) se valida con Zod en `lib/validation/import.ts`; el documento del
roadmap se valida con `roadmapImportSchema` (`lib/domains/content/importSchema.ts`) a
través de `validateRoadmapImport(input): { valid, issues, roadmap }`, que solo convierte
los errores de Zod en `{ path, message }` (`modules[0].quiz[1].answer`; la raíz es `$` y
una etiqueta vacía de `evaluation_weights` es `?`). Ambos responden por
`sendValidationIssues`. El `error` de ese caso se mantiene como
`El roadmap contiene errores.` para no cambiar el texto de la interfaz. Se conserva
además el `413` si el JSON supera 1 MB.

**El sobre deja `roadmap` como `unknown` en tiempo de ejecución**: si no, un documento
con errores fallaría como error del sobre y no como lista de `issues`. Para el contrato
existe `roadmapImportBodyContractSchema`, con el documento completo (modelo
`RoadmapImportDocument` en `openapi.json`).

Estructura del esquema:

- Raíz: textos obligatorios/opcionales con longitud máxima, listas de textos (máximo de
  elementos, elementos no vacíos), `evaluation_weights` (etiqueta → texto), `version`,
  `published_at` y `modules` (1 a 100).
- Enlaces (`official_resources`, `support_videos`): texto o `{ label, url? }`, con `url`
  `http`/`https`.
- Módulos: `level` (`beginner`, `intermediate`, `advanced`, `capstone`, sin distinguir
  mayúsculas y con los alias `beginner-intermediate` e `intermediate-advanced`) y `quiz`.
- Preguntas: unión discriminada por `type` (`multiple_choice`, que es el valor por
  defecto, `true_false` y `code_snippet`), de 2 a 6 opciones no vacías, `answer` igual
  (sin distinguir mayúsculas) a una opción, `true_false` con exactamente 2 opciones,
  `feedback` como alias de `explanation` y máximo 100 preguntas por módulo.
- Reglas entre campos (`superRefine`): posiciones repetidas, negativas o no enteras,
  rango de semanas con mínimo ≤ máximo (`duration_weeks_min`/`_max`, `duration_weeks` o el
  texto de `duration`), formato `v1.0.0` y fecha ISO.
- `.transform` produce el `NormalizedRoadmapImport` (textos recortados, `topics` sin
  duplicados, versión y fecha por defecto, posición por defecto igual al índice, duración
  total como suma de los módulos si falta la del roadmap).

Decisiones de compatibilidad (el refactor no cambia el comportamiento):

- Zod omite las reglas entre campos y las transformaciones cuando un campo ya falló por
  tipo. Para que el administrador vea **todos** los problemas de una vez, esas reglas se
  declaran con `when` (se ejecutan salvo que el valor no sea un objeto) y los límites de
  tamaño de las listas son comprobaciones propias (el `.max()` de Zod no revisa los
  elementos de una lista demasiado larga). Las opciones de una pregunta solo se validan
  una a una si su número es correcto, igual que antes.
- `test/roadmap-import-characterization.test.ts` fija la salida del validador anterior
  (`test/fixtures/roadmapImportCases.ts` y `roadmapImportExpected.json`, grabada antes de
  migrar) para 238 entradas: mismos `path` y `message` y mismo roadmap normalizado.
- Diferencias conocidas: (1) el **orden** de las `issues` puede variar cuando hay varios
  errores en campos distintos (Zod recorre los campos en orden y las reglas entre campos y
  los límites de tamaño van después de los elementos; el conjunto es el mismo y el test los
  compara ordenados); (2) si una pregunta tiene un `type` no permitido, solo se informa del
  `type` de esa pregunta (la unión discriminada no puede elegir variante); antes se
  informaba además de `question`, `answer`, `explanation` y `options` de la misma pregunta.
  Al corregir el `type` aparecen los demás.

## Cómo añadir un esquema a una ruta nueva

1. Crea o amplía el archivo del dominio en `lib/validation/` con un esquema
   por entrada. Usa las primitivas, con etiquetas en español:

   ```ts
   import { z } from 'zod'
   import { bodyObject, positiveInt, queryObject, text } from './primitives'

   export const idQuerySchema = queryObject({ id: positiveInt('id') })
   export const createThingBodySchema = bodyObject({ title: text('título', 200) })
   export type CreateThingBody = z.infer<typeof createThingBodySchema>
   ```

2. En el handler, valida antes de las consultas de negocio y retorna si falla:

   ```ts
   const params = parseOrRespond(idQuerySchema, req.query, res)
   if (!params) return
   const admin = await requireAdmin(req, res, db)
   if (!admin) return
   const body = parseOrRespond(createThingBodySchema, req.body, res)
   if (!body) return
   ```

3. Si ya existe un normalizador de dominio, llámalo desde `.transform`/`.superRefine`
   (no lo reimplementes). Para errores personalizados dentro de un `transform`, usa
   `ctx.issues.push({ code: 'custom', message, input, path })` y devuelve `z.NEVER`.
4. Escribe mensajes en español (`El campo «x» ...`). Zod v4 trata `z.unknown()` como
   obligatorio en objetos: añade `.optional()` si la clave puede faltar.
5. Añade tests de esquema en `test/validation-schemas.test.ts` y un caso en
   `test/api-validation.test.ts` (debe devolver `400` sin ejecutar consultas de negocio).

## Decisiones

1. `zod` v4 como dependencia de runtime (`npm install zod`).
2. Mensajes de validación en español de España; el resto del código en inglés.
3. Contrato `{ error: string, issues?: Array<{ path, message }> }`, compatible con
   el frontend actual porque `error` sigue siendo un texto legible.
4. Los mensajes de `401`/`403`/`405`/`429`, `lib/http/auth.ts`, el rate limit y los de
   `login`/`setup` también están en español de España desde la 3.0.0 del contrato
   (`405` en JSON `{ error }` mediante `lib/http/methods.ts`).
5. Los identificadores se parsean con una única regla: entero positivo (acepta
   número o cadena numérica; con parámetros repetidos gana el primero). Se eliminan
   los `getId` locales y el uso de `Number(...)`, y se pasa el `id` numérico a
   `scopeAllowsRoadmap` y a los repositorios.
6. Se conservan comportamientos existentes (con tests): un `role` desconocido en el
   alta de usuarios cae a `user`; un `status` desconocido en `GET /api/evidences` se
   ignora; las semanas de duración aceptan cadenas vacías de los formularios;
   `GET /api/modules?roadmap_id=` vacío equivale a no filtrar y
   `GET /api/lessons?module_id=` vacío sigue siendo `400`.
7. El alta de usuarios y el setup inicial exigen un correo con formato válido
   (`z.email`; por ejemplo `admin@localhost` se rechaza). El login sigue siendo
   permisivo con el formato (solo no vacío y máximo 254 caracteres).

### Entradas más estrictas que antes

- `roadmap_ids` se valida aunque `can_view_all_roadmaps` sea `true`
  (`null` o un valor que no sea lista → `400`).
- `PUT /api/lessons/:id` exige `title` (texto) y `completed` booleano si se envía.
- Límites de longitud nuevos (título 200, descripción 5000, 20 temas, nombre 120,
  comentario de revisión 2000, email de login 254).

### Defectos corregidos

- `lessons/[id]`, `lessons/index`, `modules/[id]` y `roadmaps/[id]` ya no lanzan
  si falta el cuerpo; `lessons` valida `title` y `completed`.
- `roadmaps/[id]` ya no pasa el `id` como cadena a `scopeAllowsRoadmap`.
- `users/[id]`: `is_active` y `can_view_all_roadmaps` deben ser booleanos reales
  (antes `Boolean(undefined)` desactivaba al usuario) y el `id` debe ser positivo.
- `evidences/[id]/review` no filtra `error.message` en el `500`.

## Rutas sin entrada que validar

`GET /api/admin/dashboard`, `GET /api/audit-logs`, `GET /api/auth/me`,
`POST /api/auth/logout`, `GET /api/auth/setup-status`, `GET /api/portfolio`,
`GET /api/portfolio/export`, `GET /api/progress/roadmaps` y `GET /api/roadmaps/metadata`
no leen cuerpo ni query, por lo que no tienen esquema.

## Fuera de alcance y seguimiento

- Decidir si `role` y `status` desconocidos deben pasar a `400` (hoy se toleran).
- ~~Esquemas de respuesta y documentación OpenAPI~~: hecho en `lib/contracts` (ver
  `API_CONTRACTS.md`). Los esquemas de este directorio son la fuente de las
  solicitudes del documento OpenAPI; llevan `.meta(...)` en los campos que Zod no
  puede describir (solo documentación, no cambia qué se acepta).
- Validar las reglas por pregunta de los quizzes con esquemas generados desde el
  quiz guardado (hoy siguen en el handler porque dependen de datos de la base).

## Tests

- `test/validation-schemas.test.ts`: esquemas y helpers (válidos, inválidos, límites,
  cuerpo ausente, ids negativos o decimales).
- `test/api-validation.test.ts`: cada ruta con entrada inválida devuelve `400` con el
  contrato y no ejecuta consultas de negocio; `405`/`403` no cambian.
- Los tests existentes de las rutas se actualizaron a los mensajes en español.
- `test/roadmap-import-characterization.test.ts` y `test/roadmap-import-contract.test.ts`: salida
  del importador (238 entradas, grabadas con el validador anterior) y descripción del
  documento completo en OpenAPI.
- `test/api-consistency.test.ts`: mensajes `401`/`403`/`405` en español, `405` JSON con
  `Allow`, `DELETE` de roadmap idempotente y `PATCH` de usuarios con una sola forma.
