import * as hipsterEngine from './hipster/engine'
import { hipsterReplication } from './hipster/replication'
import HipsterComp from './hipster/Hipster.svelte'
import type { GameModule } from './types'

export const DEFAULT_GAME_ID = 'hipster'

export const registry: Record<string, GameModule<any, any> & { Component: any }> = {
  hipster: {
    id: 'hipster',
    nombre: 'Hipster',
    createInitialState: hipsterEngine.createInitialState,
    reducer: hipsterEngine.reducer,
    replication: hipsterReplication,
    Component: HipsterComp
  }
}

export function getGameModule(id: string) {
  return Object.hasOwn(registry, id) ? registry[id] : null
}
