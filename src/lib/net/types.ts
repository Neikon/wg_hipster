export type PeerId = string
export interface Peer {
  id: PeerId
  name: string
  joinTime: number
}
export interface StartGameAction {
  t: 'startGame'
  juegoId: string
  config?: Record<string, unknown>
}
export type Msg =
  | { t: 'hello'; peerId: string; name: string; joinTime: number }
  | { t: 'requestState'; from: string }
  | { t: 'stateSync'; juegoId: string; fullState: any; version: number; hostId: string; peers: Peer[]; joinOrder: string[] }
  | { t: 'action'; juegoId: string; action: StartGameAction | { t: string; [key: string]: unknown }; from: string }
  | { t: 'rename'; peerId: string; newName: string }
  | { t: 'roomFull'; salaId: string }
  | { t: 'hostChanged'; newHostId: string }
