import type { KeyPair } from "@hyperswarm/secret-stream"
import b4a from "b4a"
import c from "compact-encoding"
import type { SignalData } from "simple-peer"
import sodium from "sodium-universal"
import { AuthenticationFailed } from "./errors.js"
import { EncryptedMessage } from "./messages.js"

export function keyPair(seed?: Uint8Array): KeyPair {
  const publicKey = b4a.allocUnsafe(sodium.crypto_sign_PUBLICKEYBYTES)
  const secretKey = b4a.allocUnsafe(sodium.crypto_sign_SECRETKEYBYTES)
  if (seed) {
    sodium.crypto_sign_seed_keypair(publicKey as Buffer, secretKey as Buffer, seed as Buffer)
  } else {
    sodium.crypto_sign_keypair(publicKey as Buffer, secretKey as Buffer)
  }
  return { publicKey, secretKey }
}

function toCurvePK(publicKey: Uint8Array): Uint8Array {
  const curveKey = b4a.allocUnsafe(sodium.crypto_box_PUBLICKEYBYTES)
  sodium.crypto_sign_ed25519_pk_to_curve25519(curveKey as Buffer, publicKey as Buffer)
  return curveKey
}

function toCurveSK(secretKey: Uint8Array): Uint8Array {
  const curveKey = b4a.allocUnsafe(sodium.crypto_box_SECRETKEYBYTES)
  sodium.crypto_sign_ed25519_sk_to_curve25519(curveKey as Buffer, secretKey as Buffer)
  return curveKey
}

function sharedSecret(publicKey: Uint8Array, keyPair: KeyPair): Uint8Array {
  const secret = b4a.allocUnsafe(sodium.crypto_scalarmult_BYTES)
  const remotePublicKey = toCurvePK(publicKey)
  const localPublicKey = toCurvePK(keyPair.publicKey)
  const localSecretKey = toCurveSK(keyPair.secretKey)
  sodium.crypto_scalarmult(secret as Buffer, localSecretKey as Buffer, remotePublicKey as Buffer)
  const batch = [remotePublicKey, localPublicKey].sort(b4a.compare)
  batch.push(secret)
  const hash = b4a.allocUnsafe(sodium.crypto_stream_KEYBYTES)
  sodium.crypto_generichash_batch(hash as Buffer, batch as Buffer[])
  return hash
}

export function sign(data: Uint8Array, secretKey: Uint8Array): Uint8Array {
  const signature = b4a.allocUnsafe(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature as Buffer, data as Buffer, secretKey as Buffer)
  return signature
}

export function verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  return sodium.crypto_sign_verify_detached(signature as Buffer, data as Buffer, publicKey as Buffer)
}

export function encrypt(data: Uint8Array, publicKey: Uint8Array, keyPair: KeyPair): Uint8Array {
  const secret = sharedSecret(publicKey, keyPair)
  const signature = sign(data, keyPair.secretKey)
  const nonce = b4a.allocUnsafe(sodium.crypto_stream_NONCEBYTES)
  sodium.randombytes_buf(nonce as Buffer)
  const cipher = b4a.allocUnsafe(data.byteLength)
  sodium.crypto_stream_xor(cipher as Buffer, data as Buffer, nonce as Buffer, secret as Buffer)
  return c.encode(EncryptedMessage, { data: cipher, nonce, signature })
}

export function decrypt(message: Uint8Array, publicKey: Uint8Array, keyPair: KeyPair): Uint8Array {
  const secret = sharedSecret(publicKey, keyPair)
  const { data, nonce, signature } = c.decode(EncryptedMessage, message)
  const out = b4a.allocUnsafe(data.byteLength)
  sodium.crypto_stream_xor(out as Buffer, data as Buffer, nonce as Buffer, secret as Buffer)
  if (!verify(out, signature, publicKey)) {
    throw new AuthenticationFailed()
  }
  return out
}

export function encryptSignal(signal: SignalData, publicKey: Uint8Array, keyPair: KeyPair): Uint8Array {
  const data = c.encode(c.json, signal as any)
  return encrypt(data, publicKey, keyPair)
}

export function decryptSignal(data: Uint8Array, publicKey: Uint8Array, keyPair: KeyPair): SignalData {
  const signal = decrypt(data, publicKey, keyPair)
  return c.decode(c.json, signal) as SignalData
}
