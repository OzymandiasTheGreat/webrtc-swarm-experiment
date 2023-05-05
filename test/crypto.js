import test from "brittle"
import b4a from "b4a"
import { encrypt, decrypt, keyPair } from "../lib/crypto.js"

test("Encrytion", async (t) => {
  t.plan(2)

  const message = b4a.from("Hello, World!")
  const kp1 = keyPair()
  const kp2 = keyPair()

  const cipher = encrypt(message, kp2.publicKey, kp1)
  t.unlike(cipher, message)
  const decipher = decrypt(cipher, kp1.publicKey, kp2)
  t.alike(decipher, message)
})
