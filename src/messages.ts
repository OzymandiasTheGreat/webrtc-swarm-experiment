import c, { CompactEncoding } from "compact-encoding"
import { Capabilities } from "./constants"

const Fixed24 = c.fixed(24)
const Fixed32Array = c.array(c.fixed32)

export type EncryptedMessage = {
  data: Uint8Array
  nonce: Uint8Array
  signature: Uint8Array
}

export const EncryptedMessage: CompactEncoding<EncryptedMessage> = {
  preencode(state, value) {
    c.buffer.preencode(state, value.data)
    Fixed24.preencode(state, value.nonce)
    c.fixed64.preencode(state, value.signature)
  },
  encode(state, value) {
    c.buffer.encode(state, value.data)
    Fixed24.encode(state, value.nonce)
    c.fixed64.encode(state, value.signature)
  },
  decode(state) {
    const data = c.buffer.decode(state)
    const nonce = Fixed24.decode(state)
    const signature = c.fixed64.decode(state)
    return { data, nonce, signature }
  }
}

type GossipMessage = {
  origin: Uint8Array
  messageID: Uint8Array
  ttl: number
}

const GossipMessage: CompactEncoding<GossipMessage> = {
  preencode(state, value) {
    c.fixed32.preencode(state, value.origin)
    c.fixed32.preencode(state, value.messageID)
    c.uint8.preencode(state, value.ttl)
  },
  encode(state, value) {
    c.fixed32.encode(state, value.origin)
    c.fixed32.encode(state, value.messageID)
    c.uint8.encode(state, value.ttl)
  },
  decode(state) {
    const origin = c.fixed32.decode(state)
    const messageID = c.fixed32.decode(state)
    const ttl = c.uint8.decode(state)
    return { origin, messageID, ttl }
  }
}

export type TopicMessage = GossipMessage & {
  payload: Uint8Array
  signature: Uint8Array
}

export const TopicMessage: CompactEncoding<TopicMessage> = {
  preencode(state, value) {
    GossipMessage.preencode(state, value)
    c.buffer.preencode(state, value.payload)
    c.fixed64.preencode(state, value.signature)
  },
  encode(state, value) {
    GossipMessage.encode(state, value)
    c.buffer.encode(state, value.payload)
    c.fixed64.encode(state, value.signature)
  },
  decode(state) {
    const { origin, messageID, ttl } = GossipMessage.decode(state)
    const payload = c.buffer.decode(state)
    const signature = c.fixed64.decode(state)
    return { origin, messageID, ttl, payload, signature }
  }
}

export type TopicPayload = {
  capabilities: Capabilities
  topics: Uint8Array[]
}

export const TopicPayload: CompactEncoding<TopicPayload> = {
  preencode(state, value) {
    c.uint8.preencode(state, value.capabilities)
    Fixed32Array.preencode(state, value.topics)
  },
  encode(state, value) {
    c.uint8.encode(state, value.capabilities)
    Fixed32Array.encode(state, value.topics)
  },
  decode(state) {
    const capabilities = c.uint8.decode(state)
    const topics = Fixed32Array.decode(state)
    return { capabilities, topics }
  }
}

export type SignalMessage = GossipMessage & {
  target: Uint8Array
  payload: Uint8Array
}

export const SignalMessage: CompactEncoding<SignalMessage> = {
  preencode(state, value) {
    GossipMessage.preencode(state, value)
    c.fixed32.preencode(state, value.target)
    c.buffer.preencode(state, value.payload)
  },
  encode(state, value) {
    GossipMessage.encode(state, value)
    c.fixed32.encode(state, value.target)
    c.buffer.encode(state, value.payload)
  },
  decode(state) {
    const { origin, messageID, ttl } = GossipMessage.decode(state)
    const target = c.fixed32.decode(state)
    const payload = c.buffer.decode(state)
    return { origin, messageID, ttl, target, payload }
  }
}
