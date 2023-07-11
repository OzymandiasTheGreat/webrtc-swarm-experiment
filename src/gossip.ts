import b4a from "b4a"
import c from "compact-encoding"
import createDebug from "debug"
import LRU from "lru"
import type Swarm from "./browser.js"
import { GOSSIP_CACHE_SIZE, TTL } from "./constants.js"
import { decryptSignal, encryptSignal, increment, messageID, sign, verify } from "./crypto.js"
import { SignalMessage, SignalPayload, TopicMessage, TopicPayload } from "./messages.js"

const debug = createDebug("SWARM:GOSSIP")

export default class Gossip {
  swarm: Swarm
  protected cache = new LRU<boolean>(GOSSIP_CACHE_SIZE)
  protected messageID = messageID()

  constructor(swarm: Swarm) {
    this.swarm = swarm
  }

  protected checkSelf(message: { origin: Uint8Array }): boolean {
    return b4a.equals(message.origin, this.swarm.publicKey)
  }

  protected checkCache(message: { origin: Uint8Array; messageID: Uint8Array }): boolean {
    const cacheID = b4a.concat([message.origin, message.messageID])
    const exists = !!this.cache.get(cacheID)
    if (!exists) this.cache.set(cacheID, true)
    return exists
  }

  protected checkTTL(message: { ttl: number }): boolean {
    return message.ttl <= 0
  }

  protected forward(type: any, message: any, source: Uint8Array) {
    message = { ...message, ttl: message.ttl - 1 }
    for (const [publicKey, connection] of this.swarm.connections) {
      if (!b4a.equals(publicKey, message.origin) && !b4a.equals(publicKey, source)) {
        connection.send(type, message)
      }
    }
  }

  onannounce(message: TopicMessage, source: Uint8Array) {
    if (this.checkSelf(message)) return
    if (this.checkCache(message)) return
    if (!verify(message.payload, message.signature, message.origin)) return

    const { capabilities, topics } = c.decode(TopicPayload, message.payload)
    this.swarm._upsertPeer(message.origin, capabilities, topics)

    if (this.checkTTL(message)) return
    this.forward("announce", message, source)
  }

  announce() {
    const payload = c.encode(TopicPayload, {
      capabilities: this.swarm.capabilities,
      topics: [...this.swarm._discovery.keys()]
    })
    const signature = sign(payload, this.swarm.keyPair.secretKey)
    const message: TopicMessage = {
      origin: this.swarm.publicKey,
      messageID: increment(this.messageID),
      ttl: TTL,
      payload,
      signature
    }
    for (const connection of this.swarm.connections.values()) {
      connection.send("announce", message)
    }
  }

  onsignal(message: SignalMessage, source: Uint8Array) {
    if (this.checkSelf(message)) return
    if (this.checkCache(message)) return

    if (b4a.equals(message.target, this.swarm.publicKey)) {
      try {
        const { capabilities, topics, initiator, signal } = decryptSignal(message.payload, message.origin, this.swarm.keyPair)
        this.swarm.onsignal(message.origin, capabilities, topics, !initiator, signal)
      } catch (err) {
        return debug("Signal error from %s %o", b4a.toString(message.origin, "hex"), err)
      }
    }

    if (this.checkTTL(message)) return
    this.forward("signal", message, source)
  }

  signal(target: Uint8Array, data: SignalPayload) {
    debug("Sending signal to %s %s", b4a.toString(target, "hex"), data.signal.type)
    const payload = encryptSignal(data, target, this.swarm.keyPair)
    const message: SignalMessage = {
      origin: this.swarm.publicKey,
      messageID: increment(this.messageID),
      ttl: TTL,
      target,
      payload
    }
    for (const connection of this.swarm.connections.values()) {
      connection.send("signal", message)
    }
  }
}
