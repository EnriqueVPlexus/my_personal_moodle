# Workflow de ramas, commits y PRs

Guia simple para trabajar este proyecto con una apariencia mas
profesional y un flujo que siga siendo comodo.

## Objetivo

- Mantener ramas pequenas y faciles de revisar.
- Relacionar cada cambio con una entrega funcional real.
- Poder avanzar por fases del backlog sin mezclar demasiadas cosas.

## Regla principal

Trabajamos con una rama por entregable funcional pequeno.

Eso significa:

- No abrir una rama gigante para todo un bloque del backlog.
- No abrir ramas diminutas para cambios sin valor visible o sin cierre
  tecnico claro.
- Cada rama debe dejar algo mergeable, testeado y entendible.

## Convencion de ramas

Formato recomendado:

```text
tipo/tema-entregable
```

Tipos recomendados:

- `feature/` para funcionalidad nueva.
- `fix/` para correcciones.
- `chore/` para mantenimiento tecnico.
- `docs/` para documentacion.
- `test/` para cambios centrados en pruebas.

Ejemplos:

- `feature/user-progress-data-model`
- `feature/user-progress-write-api`
- `feature/user-progress-dashboard`
- `feature/roadmap-json-importer`
- `fix/login-timeout-handling`
- `docs/backlog-workflow`

## Como partir el trabajo del backlog

La referencia no debe ser el bloque grande, sino la siguiente fase
implementable.

Ejemplo para `Progreso por usuario`:

- `feature/user-progress-data-model`
- `feature/user-progress-write-api`
- `feature/user-progress-dashboard`
- `feature/user-progress-roadmap-ui`
- `feature/user-progress-study-time`
- `feature/user-progress-quizzes`
- `feature/user-progress-learning-stats`

## Tamano recomendado de rama

Buena rama:

- toca una parte clara del sistema
- tiene un objetivo concreto
- se puede probar de forma razonable
- se puede explicar en pocas lineas

Mala rama:

- mezcla modelo de datos, dashboard, quizzes y metricas a la vez
- dura demasiados dias sin merge
- genera una PR dificil de revisar

Regla practica:

- si la rama necesita muchos dias y toca muchas capas, seguramente es
  demasiado grande
- si la rama no deja nada verificable al cerrarse, seguramente es
  demasiado pequena

## Commits

Formato recomendado:

```text
tipo: descripcion corta en imperativo
```

Ejemplos:

- `feat: add per-user lesson progress table`
- `feat: show active roadmaps on login dashboard`
- `fix: persist last activity for roadmap progress`
- `test: cover user progress api flows`
- `docs: add branch and PR workflow guide`

Buenas practicas:

- Un commit debe contar una idea principal.
- Evita commits tipo `cambios`, `wip` o `cosas varias`.
- Si un cambio necesita varios commits, que sigan una historia clara.

## Pull requests

Cada PR deberia responder a estas preguntas:

- Que problema resuelve.
- Que cambia exactamente.
- Como se ha probado.
- Que queda fuera.

Plantilla sugerida:

```text
## Objetivo
Breve descripcion del problema que resuelve esta PR.

## Cambios
- cambio 1
- cambio 2
- cambio 3

## Verificacion
- npm test
- npm run build

## Pendiente o fuera de alcance
- punto 1
- punto 2
```

## Relacion con el backlog

Cuando una rama nace de una fase concreta, dejalo reflejado en la PR o
en el commit principal.

Ejemplos:

- `backlog: Progreso por usuario > Fase 1. Modelo de datos`
- `backlog: Progreso por usuario > Fase 3. Resumen visible al iniciar sesion`

No hace falta meter todo el backlog en una sola PR.

## Flujo recomendado

1. Actualizar `main`.
2. Crear una rama desde `main`.
3. Implementar una fase pequena y completa.
4. Ejecutar pruebas relevantes.
5. Abrir PR o mergear cuando el cambio sea entendible y estable.
6. Volver a `main` y repetir con la siguiente fase.

## Recomendacion para este proyecto

Para dar sensacion de proyecto serio sin complicarnos la vida:

- usar ramas por fase implementable
- mantener PRs pequenas
- enlazar cada rama con una fase del backlog
- exigir siempre tests o verificacion minima antes de mergear

## Primera serie recomendada

Si empezamos por progreso de usuario, el orden sugerido es:

1. `feature/user-progress-data-model`
2. `feature/user-progress-write-api`
3. `feature/user-progress-dashboard`
4. `feature/user-progress-roadmap-ui`

Con ese orden ya tendriamos una primera version profesional y visible
del sistema de progreso sin esperar a tener tiempo de estudio o quizzes
terminados.
