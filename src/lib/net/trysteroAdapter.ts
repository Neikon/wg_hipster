import { joinRoom as trysteroJoin } from 'trystero/torrent'
import { buildJoinConfig } from './transport'

export interface TrysteroRoom {
  send: (msg: any) => void
  get: (cb: (msg:any, peerId:string)=>void) => void
  onPeerJoin: (cb:(id:string)=>void)=>void
  onPeerLeave: (cb:(id:string)=>void)=>void
  leave: ()=>void
}

export function joinTrystero(salaId: string): TrysteroRoom {
  const config = buildJoinConfig('wg_hipster_v1_' + salaId) as any
  // Trystero torrent strategy usa salaId como roomId
  const room: any = (trysteroJoin as any)(config, salaId)
  const [send, get] = room.makeAction('msg')
  return {
    send,
    get,
    onPeerJoin: room.onPeerJoin.bind(room),
    onPeerLeave: room.onPeerLeave.bind(room),
    leave: room.leave ? room.leave.bind(room) : () => {}
  }
}
