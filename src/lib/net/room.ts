import type { Peer } from './types'

export function electNewHost(joinOrder: string[], connected: Set<string>): string | null {
  for (const id of joinOrder) {
    if (connected.has(id)) return id
  }
  return null
}

export function isRoomFull(peerCount: number, limit = 20): boolean {
  return peerCount >= limit
}

export function createPeersMap(peers: Peer[]): Map<string, Peer> {
  return new Map(peers.map(p => [p.id, p]))
}
