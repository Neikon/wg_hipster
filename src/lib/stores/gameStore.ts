import { writable } from 'svelte/store'

export interface BaseGameState {
  phase: string
  version: number
  gameId: string
}

export const gameStore = writable<BaseGameState>({ phase: 'lobby', version: 0, gameId: 'hipster' })
