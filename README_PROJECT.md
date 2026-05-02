# my_personal_moodle

Scaffold inicial de una aplicación Next.js + TypeScript para gestionar una cantera (roadmaps, módulos, lecciones y progreso).

Rápido inicio:

1. Instala dependencias:

```bash
npm install
```

2. Ejecuta en desarrollo:

```bash
npm run dev
```

Estructura creada:
- `pages/`, `components/`, `lib/db.ts` (SQLite), `styles/` (Tailwind)
- `test/lint.test.sh` — prueba placeholder para calidad de código

Siguientes pasos sugeridos: añadir CRUD para roadmaps, módulos y lecciones; autenticar usuarios; añadir APIs y pruebas.

Nota sobre auditoría de dependencias:

- He incluido un script para realizar una corrección agresiva de auditoría en una rama de prueba: `scripts/audit-fix-force.sh`.
- Este script crea la rama `chore/audit-fix-force`, ejecuta `npm audit fix --force`, reinstala dependencias y prueba `npm run build`.
- ADVERTENCIA: `--force` puede actualizar a versiones mayores y romper la app; ejecuta el script sólo en una copia limpia y revisa los cambios antes de mergear.

Ejecutar el script localmente:

```bash
chmod +x scripts/audit-fix-force.sh
./scripts/audit-fix-force.sh
```

Si algo falla, revierte la rama:

```bash
git checkout main
git branch -D chore/audit-fix-force
```

He añadido además un bloque `overrides` en `package.json` para forzar versiones más recientes de varias sub-dependencias conocidas como problemáticas (por ejemplo `minimatch`, `postcss`, `serialize-javascript`, etc.). Esto ayuda a que `npm install` y `npm audit fix --force` resuelvan versiones más modernas en el árbol de dependencias.

Nota: `overrides` es una herramienta potente pero puede ocultar incompatibilidades; tras ejecutar el script revisa cuidadosamente `package-lock.json` y prueba `npm run build`.

