import type { KeyPair } from "@hyperswarm/secret-stream"
import Hypercore, { ProtocolStream } from "hypercore"
import type { PeerInfo as UrPeerInfo } from "hyperswarm"
import ReadyResource from "ready-resource"
import SimplePeer, { SignalData } from "simple-peer"
import BufferMap from "./buffer-map.js"
import BufferSet from "./buffer-set.js"
import Connection from "./connection.js"
import { Capabilities, MAX_PARALLEL, MAX_PEERS } from "./constants"
import { keyPair as genKeyPair } from "./crypto.js"
import Gossip from "./gossip.js"
import PeerInfo from "./peer-info.js"

function allowAll() {
  return false
}

export interface RTCSwarmOptions {
  seed?: Uint8Array
  keyPair?: KeyPair
  maxPeers?: number
  maxRTCPeers?: number
  maxParallel?: number
  firewall?: (publicKey: Uint8Array) => boolean
  protocolFactory?: (isInitiator: boolean) => ProtocolStream
}

export default class RTCSwarm extends ReadyResource {
  keyPair: KeyPair
  maxPeers: number
  maxRTCPeers: number
  maxParallel: number
  firewall: (publicKey: Uint8Array) => boolean
  protocolFactory: (isInitiator: boolean) => ProtocolStream

  connections = new BufferMap<Connection>()
  peers = new BufferMap<PeerInfo>()
  banned = new BufferSet()
  topics = new BufferSet()
  gossip = new Gossip(this)

  protected peerCache = new BufferMap<WeakRef<PeerInfo>>()

  constructor(options: RTCSwarmOptions = {}) {
    super()
    const {
      seed,
      keyPair = genKeyPair(seed),
      maxPeers = MAX_PEERS,
      maxRTCPeers = Math.floor(maxPeers / 2),
      maxParallel = MAX_PARALLEL,
      firewall = allowAll,
      protocolFactory = Hypercore.createProtocolStream
    } = options
    this.keyPair = keyPair
    this.maxPeers = maxPeers
    this.maxRTCPeers = maxRTCPeers
    this.maxParallel = maxParallel
    this.firewall = firewall
    this.protocolFactory = protocolFactory
  }

  get publicKey(): Uint8Array {
    return this.keyPair.publicKey
  }

  get capabilities(): Capabilities {
    return Capabilities.RTC
  }

  _upsertPeer(publicKey: Uint8Array, capabilities: Capabilities, topics: Uint8Array[], info?: UrPeerInfo): PeerInfo {
    let peer = this.peerCache.get(publicKey)?.deref()
    if (!peer) {
      peer = new PeerInfo(publicKey, capabilities, this)
      this.peerCache.set(publicKey, new WeakRef(peer))
      this.emit("peer", peer)
    }
    peer._setDHTInfo(info)
    peer._updateTopics(topics)
    return peer
  }

  _selectPeer(publicKey: Uint8Array): PeerInfo | null {
    return this.peerCache.get(publicKey)?.deref() ?? null
  }

  protected _shouldConnect(peer: PeerInfo): boolean {}

  protected _shouldAccept(peer: PeerInfo): boolean {}

  protected _onpeerjoin(peer: PeerInfo) {}

  _onsignal(publicKey: Uint8Array, signal: SignalData) {}
}
