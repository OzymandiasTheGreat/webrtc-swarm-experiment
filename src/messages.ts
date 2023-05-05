import c, { CompactEncoding } from "compact-encoding"

const Fixed24 = c.fixed(24)

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
