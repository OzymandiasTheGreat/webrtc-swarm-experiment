import type { KeyPair } from "@hyperswarm/secret-stream"
import b4a from "b4a"
import createDebug from "debug"
import Hypercore, { ProtocolStream } from "hypercore"
import type { PeerInfo as UrPeerInfo } from "hyperswarm"
import type nodeFetchType from "node-fetch"
import ReadyResource from "ready-resource"
import SimplePeer, { Instance, SignalData } from "simple-peer"
import type wrtcType from "wrtc"
import BufferMap from "./buffer-map.js"
import BufferSet from "./buffer-set.js"
import Connection from "./connection.js"
import {
  ANNOUNCE_INTERVAL,
  CONNECTION_TIMEOUT,
  Capabilities,
  ConnectionType,
  FLUSH_TIMEOUT,
  JITTER,
  MAX_ATTEMPTS,
  MAX_PARALLEL,
  MAX_PEERS,
  RETRY_TIMEOUT
} from "./constants.js"
import { keyPair as genKeyPair } from "./crypto.js"
import Gossip from "./gossip.js"
import PeerDiscovery, { PeerDiscoverySession } from "./peer-discovery.js"
import PeerInfo from "./peer-info.js"
import { Defer, randint } from "./util.js"

const debug = createDebug("SWARM:RTC")

function allowAll() {
  return false
}

const defaultFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit | undefined) => {
  if (typeof fetch === "undefined") {
    throw new Error("fetch must be set for bootstrapping")
  }
  return fetch(input, init)
}

type fetchType = typeof fetch | typeof nodeFetchType

export interface Bootstrap {
  publicKey: Uint8Array
  host: string
  port: number
  ssl?: boolean
}

export interface RTCSwarmOptions {
  seed?: Uint8Array
  keyPair?: KeyPair
  maxPeers?: number
  maxRTCPeers?: number
  maxParallel?: number
  firewall?: (publicKey: Uint8Array) => boolean
  bootstraps?: Bootstrap[]
  protocolFactory?: (isInitiator: boolean) => ProtocolStream
  wrtc?: typeof wrtcType
  fetch?: fetchType
}

export default class RTCSwarm extends ReadyResource {
  keyPair: KeyPair
  maxPeers: number
  maxRTCPeers: number
  maxParallel: number
  firewall: (publicKey: Uint8Array) => boolean
  protocolFactory: (isInitiator: boolean) => ProtocolStream
  bootstraps: Bootstrap[]

  connections = new BufferMap<Connection>()
  connecting = new BufferMap<Instance>()
  peers = new BufferMap<PeerInfo>()
  banned = new BufferSet()
  gossip = new Gossip(this)
  _discovery = new BufferMap<PeerDiscovery>()

  protected wrtc?: typeof wrtcType
  protected fetch: fetchType
  protected timer: any
  protected peerCache = new BufferMap<WeakRef<PeerInfo>>()

  constructor(options: RTCSwarmOptions = {}) {
    super()
    const {
      seed,
      keyPair = genKeyPair(seed),
      maxPeers = MAX_PEERS,
      maxRTCPeers = maxPeers,
      maxParallel = MAX_PARALLEL,
      firewall = allowAll,
      protocolFactory = (isInitiator: boolean) => Hypercore.createProtocolStream(isInitiator),
      bootstraps = [],
      wrtc,
      fetch = defaultFetch
    } = options
    this.keyPair = keyPair
    this.maxPeers = maxPeers
    this.maxRTCPeers = maxRTCPeers
    this.maxParallel = maxParallel
    this.firewall = firewall
    this.protocolFactory = protocolFactory
    this.bootstraps = bootstraps
    this.wrtc = wrtc
    this.fetch = fetch
  }

  get publicKey(): Uint8Array {
    return this.keyPair.publicKey
  }

  get capabilities(): Capabilities {
    return Capabilities.RTC
  }

  get destroyed(): boolean {
    return this.closed
  }

  _upsertPeer(publicKey: Uint8Array, capabilities: Capabilities, topics: Uint8Array[], info?: UrPeerInfo): PeerInfo {
    let peer = this.peers.get(publicKey) ?? this.peerCache.get(publicKey)?.deref()
    if (!peer) {
      debug("New peer %s topics %d", b4a.toString(publicKey, "hex"), topics.length)
      peer = new PeerInfo(publicKey, capabilities, this)
      // Only eagerly connect to some peers, the rest will eagerly connect to us
      if (![this.publicKey, peer.publicKey].sort(b4a.compare).indexOf(this.publicKey)) {
        peer.on("topic", () => this.connect(peer!))
      }
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

  protected _promotePeer(peer: PeerInfo): boolean {
    if (!this.peers.set(peer.publicKey, peer, false)) return false
    if (this.peers.get(peer.publicKey) !== peer) return false
    return true
  }

  protected async _open(): Promise<void> {
    await this._bootstrapMaybe()
    this._announce()
  }

  protected async _close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    for (const socket of this.connecting.values()) {
      socket.destroy()
    }
    for (const connection of this.connections.values()) {
      if (connection.type === ConnectionType.RTC) {
        connection.destroy()
      }
    }
    for (const discovery of this._discovery.values()) {
      await discovery.destroy()
    }
    this.peers.clear()
  }

  protected async _bootstrap(bootstrap: Bootstrap): Promise<boolean> {
    if (this.connecting.has(bootstrap.publicKey)) return false
    if (this.connections.has(bootstrap.publicKey)) return true
    const defer = new Defer<boolean>()
    let socket: Instance
    let timeout: any

    const onreject = (err: Error) => {
      debug("Bootstrap error %O", err)
      clearTimeout(timeout)
      socket.destroy()
      this.connecting.delete(bootstrap.publicKey)
      defer.resolve(false)
    }
    const onsignal = async (signal: SignalData) => {
      const address = `${bootstrap.ssl ? "https" : "http"}://${bootstrap.host}:${bootstrap.port}`
      const publicKey = b4a.toString(this.publicKey, "hex")
      const headers = { "Content-Type": "application/json" }
      const body = JSON.stringify({ publicKey, signal })
      const response = await this.fetch(address, {
        method: "POST",
        headers,
        body
      })
        .then(async (r) => {
          if (r.ok) return r.json()
          throw new Error(await r.text())
        })
        .catch(onreject)
      if (response) {
        socket.signal(response)
      }
    }
    const onconnect = () => {
      debug("Connected bootstrap %d", this.bootstraps.indexOf(bootstrap))
      clearTimeout(timeout)
      const connection = new Connection(bootstrap.publicKey, true, ConnectionType.RTC, socket, this)
      connection.on("close", () => this._bootstrapMaybe())
      connection.on("open", () => {
        this.connections.set(bootstrap.publicKey, connection)
        this.connecting.delete(bootstrap.publicKey)
        defer.resolve(true)
      })
    }

    socket = new SimplePeer({ initiator: true, trickle: false, wrtc: this.wrtc as any })
    socket.on("signal", onsignal)
    socket.once("error", onreject)
    socket.on("connect", onconnect)
    this.connecting.set(bootstrap.publicKey, socket)

    timeout = setTimeout(onreject, CONNECTION_TIMEOUT)

    return defer.promise.then((success) => {
      if (success) this.emit("bootstrap")
      return success
    })
  }

  protected _bootstrapMaybe() {
    const bootstrapped = this.bootstraps.some(({ publicKey }) =>
      [...this.connections.values()].some((c) => b4a.equals(c.remotePublicKey, publicKey))
    )
    if (
      !bootstrapped &&
      this.connections.size < 3 &&
      ![...this.connections.keys()].some((c) => !!this.bootstraps.find((b) => b4a.equals(c, b.publicKey)))
    ) {
      debug("Bootstrapping...")
      if (!this.bootstraps.length) return Promise.reject()
      const promises: Promise<boolean>[] = []
      for (const bootstrap of this.bootstraps) {
        promises.push(this._bootstrap(bootstrap))
      }
      let timeout: any
      const retry = () => {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() => {
          clearTimeout(timeout)
          this._bootstrapMaybe()
        }, RETRY_TIMEOUT + randint(0, JITTER))
      }
      return Promise.all(promises)
        .then((res) => {
          const success = res.some((s) => s)
          if (!success) retry()
          return success
        })
        .catch(() => {
          retry()
          return false
        })
    }
    return Promise.resolve(true)
  }

  protected _announce() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.gossip.announce()
      this._announce()
    }, ANNOUNCE_INTERVAL + randint(0, JITTER))
  }

  protected _shouldConnect(peer?: PeerInfo): boolean {
    if (!peer) return false
    const firewall = this.firewall(peer.publicKey)
    const hasRTC = !!(peer.capabilities & Capabilities.RTC)
    const count = [...this.connections.values()].reduce((a, i) => a + (i.type === ConnectionType.RTC ? 1 : 0), 0)
    const connecting = this.connecting.has(peer.publicKey)
    const connected = this.connections.has(peer.publicKey)
    const overlap = peer._hasOverlappingTopics
    const connect = !firewall && hasRTC && count < this.maxRTCPeers && !connecting && !connected && overlap
    return connect
  }

  protected connect(peer: PeerInfo) {
    if (!this._shouldConnect(peer) || !this._promotePeer(peer)) return
    peer.client = true

    let parallel: any
    if (this.connecting.size >= MAX_PARALLEL) {
      parallel = setTimeout(() => {
        clearTimeout(parallel!)
        this.connect(peer)
      }, CONNECTION_TIMEOUT)
      return
    }

    let socket: Instance
    let timeout: any

    const onsignal = (signal: SignalData) =>
      this.gossip.signal(peer.publicKey, {
        capabilities: this.capabilities,
        topics: [...this._discovery.keys()],
        initiator: true,
        signal
      })
    const onconnect = () => {
      clearTimeout(timeout)
      const connection = new Connection(peer.publicKey, true, ConnectionType.RTC, socket, this)
      peer._attempts = 0
      connection.on("close", () => {
        this.connections.delete(peer.publicKey)
        this.peers.delete(peer.publicKey)
        this._bootstrapMaybe()
      })
      connection.on("open", () => {
        this.connecting.delete(peer.publicKey)
        this.connections.set(peer.publicKey, connection)
        this.emit("connection", connection, peer)
      })
    }
    const retry = (err?: Error) => {
      peer._attempts++
      timeout = setTimeout(() => {
        clearTimeout(timeout)
        this.connecting.delete(peer.publicKey)
        socket.destroy()
        if (!this.connections.has(peer.publicKey) && peer.attempts < MAX_ATTEMPTS) {
          this.connect(peer)
        }
      }, CONNECTION_TIMEOUT + randint(0, JITTER))
    }

    socket = new SimplePeer({ initiator: true, trickle: false, wrtc: this.wrtc as any })
    socket.on("signal", onsignal)
    socket.once("error", retry)
    socket.on("connect", onconnect)
    if (!this.connecting.set(peer.publicKey, socket, false)) {
      this.connecting.delete(peer.publicKey)
      socket.destroy()
    }

    retry()
  }

  protected accept(peer: PeerInfo, signal: SignalData) {
    if (!this._shouldConnect(peer) || !this._promotePeer(peer)) return
    if (this.connecting.size >= MAX_PARALLEL) return
    debug("Accepting peer %s", b4a.toString(peer.publicKey, "hex"))
    peer.client = false
    let socket: Instance
    let timeout: any

    const onsignal = (signal: SignalData) =>
      this.gossip.signal(peer.publicKey, {
        capabilities: this.capabilities,
        topics: [...this._discovery.keys()],
        initiator: false,
        signal
      })
    const onconnect = () => {
      clearTimeout(timeout)
      const connection = new Connection(peer.publicKey, false, ConnectionType.RTC, socket, this)
      peer._attempts = 0
      connection.on("close", () => {
        this.connections.delete(peer.publicKey)
        this.peers.delete(peer.publicKey)
        this._bootstrapMaybe()
      })
      connection.on("open", () => {
        this.connecting.delete(peer.publicKey)
        this.connections.set(peer.publicKey, connection)
        this.emit("connection", connection, peer)
      })
    }
    const onerror = (err?: Error) => {
      peer._attempts++
      clearTimeout(timeout)
      this.connecting.delete(peer.publicKey)
      socket.destroy()
    }

    socket = new SimplePeer({ trickle: false, wrtc: this.wrtc as any })
    socket.on("signal", onsignal)
    socket.on("error", onerror)
    if (this.connecting.set(peer.publicKey, socket, false)) {
      timeout = setTimeout(onerror, CONNECTION_TIMEOUT + randint(0, JITTER))
      socket.on("connect", onconnect)
      socket.signal(signal)
    } else {
      debug("Already connecting to %s", b4a.toString(peer.publicKey, "hex"))
      socket.destroy()
    }
  }

  onsignal(publicKey: Uint8Array, capabilities: Capabilities, topics: Uint8Array[], isInitiator: boolean, signal: SignalData) {
    const socket = this.connecting.get(publicKey)
    debug("Signal from %s socket %o initiator %o", b4a.toString(publicKey, "hex"), !!socket, isInitiator)
    if (socket) return socket.signal(signal)
    if (!isInitiator) return this.accept(this._upsertPeer(publicKey, capabilities, topics), signal)
    throw new Error("Unhandled signal")
  }

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
    if (this._discovery.size) {
      return this._flush()
    }
    if (this.connections.size < 3) {
      return this._bootstrapMaybe()
    }
    return Promise.resolve(false)
  }

  status(topic: Uint8Array): PeerDiscovery | undefined {
    return this._discovery.get(topic)
  }

  listen() {
    return this.ready()
  }

  async flush(): Promise<boolean> {
    return this._flushMaybe()
  }

  async clear(): Promise<PromiseSettledResult<void>[]> {
    const cleared = await Promise.allSettled([...this._discovery.values()].map((d) => d.destroy()))
    this._discovery.clear()
    return cleared
  }

  destroy() {
    return this.close()
  }

  topics() {
    return this._discovery.values()
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
  emit(event: "bootstrap"): boolean
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args)
  }

  on(event: "peer", listener: (peer: PeerInfo) => void): this
  on(event: "connection", listener: (connection: Connection, peer: PeerInfo) => void): this
  on(event: "bootstrap", listener: () => void): this
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }

  once(event: "peer", listener: (peer: PeerInfo) => void): this
  once(event: "connection", listener: (connection: Connection, peer: PeerInfo) => void): this
  once(event: "bootstrap", listener: () => void): this
  once(event: string, listener: (...args: any[]) => void): this {
    return super.once(event, listener)
  }

  off(event: "peer", listener: (peer: PeerInfo) => void): this
  off(event: "connection", listener: (connection: Connection, peer: PeerInfo) => void): this
  off(event: "bootstrap", listener: () => void): this
  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener)
  }
}
