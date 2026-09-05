import { writable, derived } from 'svelte/store'
import type { Peer } from '../net/types'

export interface RoomState {
  salaId: string
  selfId: string
  selfName: string
  hostId: string
  peers: Peer[]
  joinOrder: string[]
  isHost: boolean
  version: number
  connected: boolean
}

function genId() { return Math.random().toString(36).slice(2, 9) }

export const roomStore = writable<RoomState>({
  salaId: '',
  selfId: '',
  selfName: '',
  hostId: '',
  peers: [],
  joinOrder: [],
  isHost: false,
  version: 0,
  connected: false
})

export function initRoom(salaId: string, selfName: string, isHost: boolean) {
  const selfId = genId()
  const peer: Peer = { id: selfId, name: selfName, joinTime: Date.now() }
  roomStore.set({
    salaId,
    selfId,
    selfName,
    hostId: isHost ? selfId : '',
    peers: isHost ? [peer] : [],
    joinOrder: isHost ? [selfId] : [],
    isHost,
    version: 0,
    connected: true
  })
  return selfId
}

export const isHostStore = derived(roomStore, $r => $r.isHost)
export const peersStore = derived(roomStore, $r => $r.peers)
