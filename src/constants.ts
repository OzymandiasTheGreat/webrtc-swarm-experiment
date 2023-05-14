export const PROTOCOL = "RTC_BRIDGED_SWARM"

export enum Capabilities {
  DHT = 1,
  RTC = 2,
  FULL = DHT | RTC
}

export enum ConnectionType {
  RTC,
  DHT,
  DHT_Legacy
}

export const ANNOUNCE_INTERVAL = 15 * 60 * 1000
export const CONNECTION_TIMEOUT = 30 * 1000
export const FLUSH_TIMEOUT = 30 * 1000
export const GOSSIP_CACHE_SIZE = 255
export const JITTER = 2 * 60 * 1000
export const MAX_ATTEMPTS = 5
export const MAX_PARALLEL = 5
export const MAX_PEERS = 64
export const RETRY_TIMEOUT = 5 * 60 * 1000
export const TTL = 255
