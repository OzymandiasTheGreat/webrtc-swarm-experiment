import { EventEmitter } from "events"
import type { PeerInfo as UrPeerInfo } from "hyperswarm"
import type Swarm from "./browser.js"
import BufferSet from "./buffer-set.js"
import { Capabilities } from "./constants.js"

export default class PeerInfo extends EventEmitter {
  protected swarm: Swarm
  protected peerInfo?: UrPeerInfo
  protected _topics = new BufferSet()
  _attempts = 0
  _explicit = false

  publicKey: Uint8Array
  capabilities: Capabilities
  client: boolean | null = null

  constructor(publicKey: Uint8Array, capabilities: Capabilities, swarm: Swarm) {
    super()
    this.swarm = swarm
    this.publicKey = publicKey
    this.capabilities = capabilities
  }

  get topics(): Uint8Array[] {
    return [...this._topics]
  }

  get attempts(): number {
    return this.peerInfo?.attempts ?? this._attempts
  }

  get explicit(): boolean {
    return this.peerInfo?.explicit ?? this._explicit
  }

  get server(): boolean | null {
    return this.client == null ? this.client : !this.client
  }

  get banned(): boolean {
    return !!this.peerInfo?.banned && this.swarm.banned.has(this.publicKey)
  }

  get prioritized(): boolean {
    return !!this.peerInfo?.prioritized
  }

  ban() {
    this.swarm.banned.add(this.publicKey)
    this.peerInfo?.ban()
  }

  protected _join(topic: Uint8Array) {
    if (this._topics.add(topic)) this.emit("topic", topic)
  }

  protected _leave(topic: Uint8Array) {
    this._topics.delete(topic)
  }

  _setDHTInfo(info?: UrPeerInfo) {
    this.peerInfo = info
  }

  _updateTopics(topics: Uint8Array[]) {
    for (const topic of this._topics) {
      if (!topics.includes(topic)) {
        this._leave(topic)
      }
    }
    for (const topic of topics) {
      this._join(topic)
    }
  }

  get _hasOverlappingTopics(): boolean {
    for (const topic of this._topics) {
      if (this.swarm.topics.has(topic)) {
        return true
      }
    }
    return false
  }
}
