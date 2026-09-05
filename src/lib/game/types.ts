export interface GamePeer {
  id: string
  name?: string
  joinTime?: number
}

export interface GameState {
  phase: string
  version: number
  gameId: string
}

export interface GameContext {
  isHost: boolean
  peerId: string
}

export interface GameModule<S extends GameState = GameState, A = { t: string }> {
  id: string
  nombre: string
  createInitialState(peers: GamePeer[]): S
  reducer(state: S, action: A, ctx: GameContext): S
  Component?: any
}
