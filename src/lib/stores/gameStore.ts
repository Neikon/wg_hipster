import { writable } from 'svelte/store'

export interface BaseGameState {
  phase: string
  version: number
  gameId: string
}

export const gameStore = writable<BaseGameState>({ phase: 'lobby', version: 0, gameId: 'trivia' })

export function applyStateSync(newState: any) {
  // solo aplicar si version mayor (evita split-brain)
  gameStore.update(cur => {
    if (newState.version !== undefined && cur.version !== undefined) {
      if (newState.version <= cur.version) return cur
    }
    return newState
  })
}
