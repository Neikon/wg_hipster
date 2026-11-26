# wg_hipster — Juego de fiesta P2P

Juego de fiesta multijugador en navegador. **Sin servidor ni base de datos**, 100% estático en GitHub Pages (1–20 jugadores, turnos).

- **Stack:** Svelte + Vite + TypeScript + Trystero (WebRTC P2P via trackers públicos)
- **Flujo:** Crear sala → compartir enlace `#/sala/<id>` → lobby → juego
- **Juego:** hipster musical (adivina la canción; el host carga charts de iTunes y las reparte por P2P)
- **Host migration:** Si el anfitrión se va, el siguiente jugador toma el control sin perder estado

## Uso rápido

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ listo para GH Pages
npm run test     # vitest
```

## Cómo funciona sin servidor

Usa [Trystero](https://github.com/dmotz/trystero) (strategy `torrent`) que se conecta a trackers públicos gratuitos (`wss://tracker.openwebtorrent.com` etc.) como señalización temporal. **No creas cuenta ni hosteas nada** — tu código solo está en `dist/`. El `salaId` se usa como `appId` (`wg_hipster_v1_<salaId>`) para que peers se encuentren.

Los trackers públicos se usan por defecto. Si tienes un proyecto Supabase propio, puedes seleccionarlo en **Señalización** con su URL HTTPS y una clave publicable o `anon`. El enlace y el QR llevan la estrategia, la configuración pública y la identidad del anfitrión de esa sala. Tras un cambio de anfitrión o de estrategia, comparte el enlace actualizado. Cada dispositivo puede configurar su propio relay TURN para redes móviles restrictivas.

## Pruebas

```bash
npm run check
npm run test
npm run build
npx playwright install --with-deps chromium  # solo la primera vez
npm run test:e2e
E2E_PUBLIC=2 npm run test:e2e -- tests/e2e/multijugador.spec.ts
E2E_NET=supabase E2E_SUPA_URL=… E2E_SUPA_KEY=… npm run test:e2e -- tests/e2e/multijugador.spec.ts
```

La suite incluye una partida entre dos navegadores y pruebas de lobby de hasta 20 jugadores con un tracker local. Pages ejecuta las comprobaciones de tipos, las pruebas unitarias y las pruebas de navegador de humo y de dos jugadores antes de publicar.

## Deploy a GitHub Pages

- El workflow `.github/workflows/pages.yml` hace build y deploy automático al pushear a `main`.
- Configura `Settings → Pages → Source: GitHub Actions`.
- `vite.config.ts` usa `VITE_BASE=/wg_hipster/`.

## Estructura

```
src/lib/net/      # P2P (Trystero adapter, helpers)
src/lib/stores/   # roomStore, gameStore
src/lib/game/     # contrato + registry + hipster
src/routes/       # Landing, Room, Game
src/components/   # PlayerList, ShareLink, NameInput
```

## Límites

- 20 jugadores max (mesh P2P)
- Host autoritativo, mensajes JSON pequeños
- Sin persistencia (recargar pierde sala)

Licencia MIT.
