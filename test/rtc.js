import test from "brittle"
import b4a from "b4a"
import fetch from "node-fetch"
import wrtc from "wrtc"
import Bootstrap from "../lib/bootstrap.js"
import RTCSwarm from "../lib/browser.js"

test("Bootstrapping", { timeout: 60 * 1000 }, async (t) => {
  t.plan(2)
  t.teardown(() => Promise.all([server.destroy(), node.destroy()]))

  const server = new Bootstrap({ wrtc })
  await server.ready()

  const node = new RTCSwarm({ bootstraps: [server.bootstrap], wrtc, fetch })
  server.on("connection", (conn, info) => t.alike(info.publicKey, node.publicKey))
  node.on("bootstrap", () => t.pass("Bootstrapped"))
  await node.listen()
})

test("Bootstrapping", { timeout: 120 * 1000, solo: true }, async (t) => {
  t.plan(2)
  t.teardown(() => Promise.all([server.destroy(), node1.destroy(), node2.destroy()]))

  const topic = b4a.fill(b4a.allocUnsafe(32), "A")
  const server = new Bootstrap({ wrtc })
  await server.ready()

  const node1 = new RTCSwarm({ bootstraps: [server.bootstrap], wrtc, fetch })
  const node2 = new RTCSwarm({ bootstraps: [server.bootstrap], wrtc, fetch })
  node1.on("connection", (conn, info) => t.alike(info.publicKey, node2.publicKey))
  node2.on("connection", (conn, info) => t.alike(info.publicKey, node1.publicKey))
  node1.join(topic)
  node2.join(topic)
})
