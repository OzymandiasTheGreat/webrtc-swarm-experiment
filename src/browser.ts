import type { KeyPair } from "@hyperswarm/secret-stream"
import Hypercore, { ProtocolStream } from "hypercore"
import type { PeerInfo as UrPeerInfo } from "hyperswarm"
import ReadyResource from "ready-resource"
import safetyCatch from "safety-catch"
import SimplePeer, { Instance, SignalData } from "simple-peer"
import BufferMap from "./buffer-map.js"
import BufferSet from "./buffer-set.js"
import Connection from "./connection.js"
import { ANNOUNCE_INTERVAL, Capabilities, FLUSH_TIMEOUT, JITTER, MAX_PARALLEL, MAX_PEERS } from "./constants"
import { keyPair as genKeyPair } from "./crypto.js"
import Gossip from "./gossip.js"
import PeerDiscovery, { PeerDiscoverySession } from "./peer-discovery.js"
import PeerInfo from "./peer-info.js"
import { randint } from "./util.js"

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

  protected timer: any
  protected peerCache = new BufferMap<WeakRef<PeerInfo>>()
  protected connecting = new BufferMap<Instance>()
  protected _discovery = new BufferMap<PeerDiscovery>()

  constructor(options: RTCSwarmOptions = {}) {
    super()
    const {
      seed,
      keyPair = genKeyPair(seed),
      maxPeers = MAX_PEERS,
      maxRTCPeers = maxPeers,
      maxParallel = MAX_PARALLEL,
      firewall = allowAll,
      protocolFactory = (isInitiator: boolean) => Hypercore.createProtocolStream(isInitiator)
    } = options
    this.keyPair = keyPair
    this.maxPeers = maxPeers
    this.maxRTCPeers = maxRTCPeers
    this.maxParallel = maxParallel
    this.firewall = firewall
    this.protocolFactory = protocolFactory

    this.ready().catch(safetyCatch)
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

  protected async _open(): Promise<void> {
    this._announce()
  }

  protected _announce() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.gossip.announce()
      this._announce()
    }, ANNOUNCE_INTERVAL + randint(0, JITTER))
  }

  protected _shouldConnect(peer: PeerInfo): boolean {}

  protected _shouldAccept(peer: PeerInfo): boolean {}

  protected _onpeerjoin(peer: PeerInfo) {}

  _onsignal(publicKey: Uint8Array, signal: SignalData) {}

  protected async _flush(): Promise<boolean> {
    let connections = 0
    return new Promise((resolve) => {
      const onconnect = () => {
        connections++
        if (connections >= 3) {
          cleanup()
          resolve(true)
        }
      }
      const timeout = setTimeout(() => {
        cleanup()
        if (connections) resolve(true)
        else resolve(false)
      }, FLUSH_TIMEOUT + randint(0, JITTER))
      const cleanup = () => {
        clearTimeout(timeout)
        this.off("connection", onconnect)
      }
      this.on("connection", onconnect)
      this.gossip.announce()
    })
  }

  protected async _flushMaybe(): Promise<boolean> {
    if (this.topics.size) {
      return this._flush()
    }
    if (!this.connections.size) {
      return this._bootstrap()
    }
    return Promise.resolve(false)
  }

  async flush(): Promise<boolean> {
    return this._flushMaybe()
  }

  join(topic: Uint8Array, options?: any): PeerDiscoverySession {
    let discovery = this._discovery.get(topic)
    if (discovery && !discovery.destroyed) return discovery.session(options)
    discovery = new PeerDiscovery(this, topic)
    this._discovery.set(topic, discovery)
    return discovery.session(options)
  }

  async leave(topic: Uint8Array) {
    const discovery = this._discovery.get(topic)
    if (!discovery) return Promise.resolve()
    const promises = discovery._sessions.map((session) => session.destroy())
    return Promise.all(promises).then(() => this._discovery.delete(topic))
  }

  emit(event: "peer", peer: PeerInfo): boolean
  emit(event: "connection", connection: Connection, peer: PeerInfo): boolean
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args)
  }

  on(event: "peer", listener: (peer: PeerInfo) => void): this
  on(event: "connection", listener: (connection: Connection, peer: PeerInfo) => void): this
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }

  once(event: "peer", listener: (peer: PeerInfo) => void): this
  once(event: "connection", listener: (connection: Connection, peer: PeerInfo) => void): this
  once(event: string, listener: (...args: any[]) => void): this {
    return super.once(event, listener)
  }

  off(event: "peer", listener: (peer: PeerInfo) => void): this
  off(event: "connection", listener: (connection: Connection, peer: PeerInfo) => void): this
  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener)
  }
}
