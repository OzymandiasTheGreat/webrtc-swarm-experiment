export enum Capabilities {
  DHT = 1,
  RTC = 2,
  FULL = DHT | RTC
}

export const GOSSIP_CACHE_SIZE = 255
export const MAX_PARALLEL = 5
export const MAX_PEERS = 64
export const TTL = 255
