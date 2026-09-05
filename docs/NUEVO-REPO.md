# Crear un repo de juego desde la plantilla

Cada juego vive en **su propio repositorio** derivado de `wg_template` (botón
**Use this template** en GitHub). La plantilla trae la infraestructura P2P +
lobby + una demo (trivia) que sustituirás por tu juego. No se añaden juegos a
este repo: se deriva y se reemplaza.

## 1. Deriva el repo

- En GitHub, sobre `wg_template`: **Use this template** → crea tu repo
  (p. ej. `mi-juego-fiesta`). Marca este repo como template una sola vez en
  `Settings → General → Template repository` (o `gh api repos/Neikon/wg_template -X PATCH -f is_template=true`).
- Clónalo y ábrelo en el devcontainer (`npm ci` corre solo).

## 2. Renombra (obligatorio)

| Qué | Dónde |
| --- | ----- |
| Nombre del paquete | `package.json` → `name` |
| Ruta base web | `vite.config.ts` → `base` (`/mi-juego-fiesta/`) |
| Base del deploy | `.github/workflows/pages.yml` → `VITE_BASE` |
| Fallback 404 | `public/404.html` → `base` |
| URL base de tests | `playwright.config.ts` → `baseURL` |
| **Canal P2P (`appId`)** | `src/lib/net/trysteroAdapter.ts` |
| Título y cabecera | `index.html` y `src/routes/Landing.svelte` (`🎉 Fiesta P2P`) |
| Nombre del contenedor | `.devcontainer/devcontainer.json` |

El `appId` es **imprescindible**: si dos juegos comparten appId y colisiona un
id de sala, sus peers se mezclarían en la misma red.

Habilita Pages en el repo derivado: `Settings → Pages → Source: GitHub Actions`.
El workflow despliega solo al pushear a `main`.

## 3. Sustituye la demo por tu juego

- Borra `src/lib/game/trivia/` (o consérvala fuera del registry como referencia).
- Sigue `docs/NUEVO-JUEGO.md`: crea `src/lib/game/<id>/` (tipos + engine +
  vista) y deja **una sola entrada** en `src/lib/game/registry.ts` con tu juego
  como `DEFAULT_GAME_ID`.
- Adapta los tests a tu juego: `tests/unit/registry.test.ts` y los e2e
  (nombres de botones, fases, textos esperados).

## 4. Verifica

```bash
npm run check
npm run test
npm run build
npm run test:e2e
E2E_P2P=1 npm run test:e2e  # exige la prueba real de dos navegadores (con red)
```

Más prueba manual en dos pestañas con el enlace del lobby. Al pushear a `main`,
Pages se despliega solo.
