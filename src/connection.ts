import type NoiseSecretStream from "@hyperswarm/secret-stream"
import c from "compact-encoding"
import type Protomux from "protomux"
import type { ProtomuxMessage } from "protomux"
import type { Instance } from "simple-peer"
import { Duplex } from "streamx"
import type Swarm from "./browser.js"
import { ConnectionType, PROTOCOL } from "./constants.js"
import { SignalMessage, TopicMessage } from "./messages.js"

export default class Connection extends Duplex {
  swarm: Swarm
  type: ConnectionType
  priority = 0
  publicKey: Uint8Array
  remotePublicKey: Uint8Array
  noiseStream: NoiseSecretStream<Protomux>

  protected messages!: {
    announce: ProtomuxMessage<TopicMessage>
    signal: ProtomuxMessage<SignalMessage>
    data: ProtomuxMessage<Uint8Array>
  }
  protected socket: Instance | NoiseSecretStream<null>
  protected muxer: Protomux

  constructor(publicKey: Uint8Array, client: boolean, type: ConnectionType, socket: Instance | NoiseSecretStream<null>, swarm: Swarm) {
    super({ eagerOpen: true })
    this.swarm = swarm
    this.type = type
    this.publicKey = this.swarm.publicKey
    this.socket = socket
    this.remotePublicKey = publicKey

    const replicator = this.swarm.protocolFactory(client)
    this.noiseStream = replicator.noiseStream
    this.muxer = this.noiseStream.userData

    this.socket.on("error", (err) => this.destroy(err))
    this.socket.on("close", () => this.end())
    this.socket.pipe(replicator).pipe(this.socket)
  }

  protected _open(callback: () => void): void {
    const channel = this.muxer.createChannel({
      protocol: PROTOCOL
    })

    const data = channel.addMessage({
      encoding: c.raw,
      onmessage: (data) => {
        this.push(data)
      }
    })

    const announce = channel.addMessage({
      encoding: TopicMessage,
      onmessage: (message) => {
        this.swarm.gossip.onannounce(message, this.remotePublicKey)
      }
    })

    const signal = channel.addMessage({
      encoding: SignalMessage,
      onmessage: (message) => {
        this.swarm.gossip.onsignal(message, this.remotePublicKey)
      }
    })

    this.messages = { data, announce, signal }
    channel.open()
    callback()
  }

  protected _read(callback: () => void): void {
    callback()
  }

  protected _write(data: any, callback: () => void): void {
    if (!this.destroyed && !this.closed) this.messages.data.send(data)
    callback()
  }

  protected _destroy(callback: (err?: Error | undefined) => void): void {
    this.socket.destroy()
    callback()
  }

  send(message: "announce", data: TopicMessage): void
  send(message: "signal", data: SignalMessage): void
  send(message: "announce" | "signal", data: any): void {
    this.messages[message].send(data)
  }
}
