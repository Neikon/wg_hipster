# Crear un juego nuevo

Un juego de `wg_template` es un estado serializable, un reducer puro y un componente
Svelte. La sala, el lobby y la red P2P no necesitan conocer sus reglas.

El ejemplo de referencia es [`src/lib/game/trivia/`](../src/lib/game/trivia/):
configuración de partida, temporizador y varias fases. Cópialo y simplifica.

## 1. Crea estado, acciones y reducer

Crea `src/lib/game/mi-juego/types.ts`:

```ts
export interface MiJuegoState {
  phase: 'lobby' | 'jugando'
  valores: Record<string, number>
  version: number
  gameId: 'mi-juego'
}

export type MiJuegoAction =
  | { t: 'startGame'; juegoId?: 'mi-juego' }
  | { t: 'elegir'; valor: number }
  | { t: 'restart' }
  | { t: 'playerJoined'; peerId: string }
```

En `engine.ts` exporta las dos funciones del contrato:

```ts
export function createInitialState(peers: { id: string }[]): MiJuegoState {
  return {
    phase: 'lobby',
    valores: {},
    version: 0,
    gameId: 'mi-juego'
  }
}

export function reducer(state: MiJuegoState, action: MiJuegoAction, ctx: {
  isHost: boolean
  peerId: string
}): MiJuegoState {
  if (action.t === 'startGame') {
    if (!ctx.isHost || state.phase !== 'lobby') return state
    return { ...state, phase: 'jugando', version: state.version + 1 }
  }
  if (action.t === 'elegir') {
    return {
      ...state,
      valores: { ...state.valores, [ctx.peerId]: action.valor },
      version: state.version + 1
    }
  }
  return state
}
```

Reglas del reducer:

- Debe ser puro: no modifica `state`, no usa stores, DOM, red, fechas ni valores
  aleatorios. Devuelve el mismo objeto cuando ignora una acción.
- Cada transición aceptada devuelve un objeto nuevo con `version + 1`. Al reiniciar,
  la versión también debe seguir creciendo; no puede volver a cero.
- `ctx.peerId` identifica al autor. Comprueba `ctx.isHost` para acciones reservadas al
  anfitrión, como empezar, avanzar o reiniciar.
- El estado y las acciones deben poder serializarse como JSON.
- `playerJoined` es opcional. Úsalo si el estado debe incorporar a quien entra tarde.

Solo el host ejecuta el reducer y difunde el nuevo estado. Los invitados envían
acciones; nunca escribas lógica P2P dentro del juego.

## 2. Crea la vista y registra el módulo

Crea `MiJuego.svelte`. Lee `gameStore` y `roomStore`, y envía intenciones mediante la
prop `onAction`:

```svelte
<script lang="ts">
  import { gameStore } from '../../stores/gameStore'
  import { roomStore } from '../../stores/roomStore'
  export let onAction: (action: any) => void
</script>

{#if $gameStore.phase === 'lobby'}
  {#if $roomStore.isHost}
    <button on:click={() => onAction({ t: 'startGame', juegoId: 'mi-juego' })}>
      Empezar
    </button>
  {/if}
{:else}
  <button on:click={() => onAction({ t: 'elegir', valor: 1 })}>Elegir</button>
{/if}
```

Sustituye la entrada de la demo en `src/lib/game/registry.ts` por la tuya (`id`,
nombre, las dos funciones y el componente); borra `src/lib/game/trivia/` o
consérvala fuera del registry como referencia. No cambies `Room.svelte`,
`Game.svelte` ni `src/lib/net/`:

```ts
miJuego: {
  id: 'mi-juego',
  nombre: 'Mi juego',
  createInitialState: miJuegoEngine.createInitialState,
  reducer: miJuegoEngine.reducer,
  Component: MiJuego
}
```

El `id` debe coincidir en el registry, `gameId` y `juegoId`.

## 3. Prueba el engine y la integración

Crea `tests/unit/mi-juego.test.ts` y prueba las transiciones sin montar Svelte. Como
mínimo cubre: estado inicial, permisos del host, una acción válida, una acción
inválida o duplicada y el incremento de versión.

Ejecuta:

```bash
npm run check
npm run test
npm run build
npx playwright install --with-deps chromium # solo la primera vez
npm run test:e2e
```

Para abrirlo directamente como anfitrión durante el desarrollo:

```text
http://localhost:5173/wg_template/#/sala/prueba?host=1&name=Ana
```

La plantilla trae un solo juego registrado: al abrir la sala verás el tuyo.
Los ids de sala reales tienen seis caracteres; `prueba` es válido para este ejemplo.
Comprueba también dos pestañas con el enlace que muestra el lobby. La prueba automatizada
P2P real se exige con `E2E_P2P=1 npm run test:e2e`; necesita salida a los trackers
públicos de Trystero.
