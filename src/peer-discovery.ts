import RTCSwarm from "./browser"

export default class PeerDiscovery {
  _sessions: PeerDiscoverySession[] = []
  swarm: RTCSwarm
  topic: Uint8Array
  isClient = false
  isServer = false
  destroyed = false

  constructor(swarm: RTCSwarm, topic: Uint8Array) {
    this.swarm = swarm
    this.topic = topic
  }

  session({ server = true, client = true } = {}): PeerDiscoverySession {
    if (this.destroyed) throw new Error("PeerDiscovery is destroyed")
    const session = new PeerDiscoverySession(this)
    session.refresh({ server, client })
    this._sessions.push(session)
    return session
  }

  async refresh() {
    if (this.destroyed) throw new Error("PeerDiscovery is destroyed")
    this.swarm.gossip.announce()
  }

  async flushed(): Promise<boolean> {
    return this.swarm.flush()
  }

  async destroy() {
    if (this.destroyed) return
    if (!this._sessions.length) this.swarm.gossip.announce()
  }
}

export class PeerDiscoverySession {
  discovery: PeerDiscovery
  isClient = false
  isServer = false
  destroyed = false

  constructor(discovery: PeerDiscovery) {
    this.discovery = discovery
  }

  get swarm() {
    return this.discovery.swarm
  }

  get topic() {
    return this.discovery.topic
  }

  async refresh({ client = this.isClient, server = this.isServer } = {}) {
    if (this.destroyed) throw new Error("PeerDiscovery is destroyed")
    return this.discovery.refresh()
  }

  async flushed() {
    return this.discovery.flushed()
  }

  async destroy() {
    if (this.destroyed) return
    this.destroyed = true

    const index = this.discovery._sessions.indexOf(this)
    const head = this.discovery._sessions.pop()

    if (head !== this) this.discovery._sessions[index] = head as any

    return this.discovery.destroy()
  }
}
