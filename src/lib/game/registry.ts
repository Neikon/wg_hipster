import * as triviaEngine from './trivia/engine'
import TriviaComp from './trivia/Trivia.svelte'
import * as hipsterEngine from './hipster/engine'
import HipsterComp from './hipster/Hipster.svelte'
import type { GameModule } from './types'

export const DEFAULT_GAME_ID = 'trivia'

export const registry: Record<string, GameModule<any, any> & { Component: any }> = {
  trivia: {
    id: 'trivia',
    nombre: 'Trivia',
    createInitialState: triviaEngine.createInitialState,
    reducer: triviaEngine.reducer,
    Component: TriviaComp
  },
  hipster: {
    id: 'hipster',
    nombre: 'Hipster',
    createInitialState: hipsterEngine.createInitialState,
    reducer: hipsterEngine.reducer,
    Component: HipsterComp
  }
}

export function getGameModule(id: string) {
  return registry[id] ?? null
}
