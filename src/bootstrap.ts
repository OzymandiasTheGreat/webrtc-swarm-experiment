import b4a from "b4a"
import { createServer, IncomingMessage, Server, ServerResponse } from "http"
import SimplePeer, { SignalData } from "simple-peer"
import nodewrtc from "wrtc"
import RTCSwarm, { RTCSwarmOptions } from "./browser"
import { Capabilities, CONNECTION_TIMEOUT, ConnectionType, MAX_PARALLEL } from "./constants"
import { Defer } from "./util"
import Connection from "./connection"
import PeerInfo from "./peer-info"

type RTCConnectionRequest = { publicKey: string; signal: SignalData }

async function parseRequest(req: IncomingMessage): Promise<RTCConnectionRequest> {
  if (req.method !== "POST") throw new Error("Unsupported request method")
  if (req.headers["content-type"] !== "application/json") throw new Error("Unsupported request type")
  const defer = new Defer<RTCConnectionRequest>()
  let body = ""
  req.on("data", (chunk) => (body += chunk))
  req.on("error", (err) => defer.reject(err))
  req.on("end", () => {
    let json!: RTCConnectionRequest
    try {
      json = JSON.parse(body)
    } catch (err: any) {
      defer.reject(err)
    }
    if (!json.publicKey || !json.signal) return defer.reject(new Error("Invalid request"))
    defer.resolve(json)
  })
  return defer.promise
}

export interface BootstrapOptions extends RTCSwarmOptions {
  host?: string
  port?: number
}

export default class Bootstrap extends RTCSwarm {
  host: string
  port: number
  server!: Server

  constructor(options: BootstrapOptions = {}) {
    super(options)
    const { host = "127.0.0.1", port = 6013, wrtc = nodewrtc } = options
    this.host = host
    this.port = port
    this.wrtc = wrtc
    this.ready()
  }

  get capabilities(): Capabilities {
    return Capabilities.FULL
  }

  get address() {
    return this.server?.address()
  }

  protected async _open(): Promise<void> {
    const listening = new Defer<void>()
    this.server = createServer(async (req, res) => {
      const request = await parseRequest(req).catch((err) => err.message)
      if (!request || typeof request === "string") {
        res.writeHead(500)
        res.end(request ?? "Unknown Error")
        return
      }
      const publicKey = b4a.from(request.publicKey, "hex")
      const signal = request.signal
      if (this._shouldAccept(publicKey)) this.onrequest(publicKey, signal, res)
      else {
        res.writeHead(503)
        res.end("No more slots")
      }
    })
    this.server.once("error", (err) => listening.reject(err))
    this.server.listen(this.port, this.host, () => listening.resolve())
    return listening.promise
  }

  protected async _close(): Promise<void> {
    await super._close()
    const closing = new Defer<void>()
    this.server?.close((err) => {
      if (err) return closing.reject(err)
      closing.resolve()
    })
    await closing.promise
  }

  protected async onrequest(publicKey: Uint8Array, signal: SignalData, res: ServerResponse) {
    let timeout: any
    let socket = this.connecting.get(publicKey)

    const onerror = () => {
      clearTimeout(timeout)
      this.connecting.delete(publicKey)
      socket?.destroy()
    }
    const onsignal = (data: SignalData) => {
      res.setHeader("Content-Type", "application/json")
      res.writeHead(200)
      res.end(JSON.stringify(data))
    }
    const onconnect = () => {
      clearTimeout(timeout)
      const connection = new Connection(publicKey, false, ConnectionType.RTC, socket!, this)
      this.connecting.delete(publicKey)
      this.connections.set(publicKey, connection)
      this.emit("connection", connection, this._upsertPeer(publicKey, Capabilities.RTC, []))
    }

    if (!socket) {
      socket = new SimplePeer({ trickle: false, wrtc: this.wrtc as any })
      socket.on("connect", onconnect)
      this.connecting.set(publicKey, socket)
    }

    socket.once("error", onerror)
    socket.once("signal", onsignal)
    socket.signal(signal)

    timeout = setTimeout(onerror, CONNECTION_TIMEOUT)
  }

  protected _shouldConnect(peer: PeerInfo): boolean {
    return false
  }

  protected _shouldAccept(publicKey: Uint8Array): boolean {
    const firewall = this.firewall(publicKey)
    const count = [...this.connections.values()].reduce((a, i) => a + (i.type === ConnectionType.RTC ? 1 : 0), 0)
    const connected = this.connections.has(publicKey)
    return !firewall && count < this.maxRTCPeers && !connected
  }
}
