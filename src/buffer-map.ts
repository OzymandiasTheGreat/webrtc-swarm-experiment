import b4a from "b4a"

export class BufferMap<V> {
  private m: Map<string, V>

  constructor(other?: BufferMap<V>) {
    this.m = other ? new Map([...other.m]) : new Map()
  }

  get size(): number {
    return this.m.size
  }

  get(key: string | Uint8Array): V | undefined {
    if (b4a.isBuffer(key)) key = b4a.toString(key, "hex")
    return this.m.get(key)
  }

  set(key: string | Uint8Array, value: V): boolean {
    if (b4a.isBuffer(key)) key = b4a.toString(key, "hex")
    const added = !this.m.has(key)
    this.m.set(key, value)
    return added
  }

  delete(key: string | Uint8Array): boolean {
    if (b4a.isBuffer(key)) key = b4a.toString(key, "hex")
    return this.m.delete(key)
  }

  has(key: string | Uint8Array): boolean {
    if (b4a.isBuffer(key)) key = b4a.toString(key, "hex")
    return this.m.has(key)
  }

  clear(): number {
    const size = this.size
    this.m.clear()
    return size
  }

  *[Symbol.iterator](): IterableIterator<[Uint8Array, V]> {
    for (const [key, value] of this.m) {
      yield [b4a.from(key, "hex"), value]
    }
  }

  *entries(): IterableIterator<[Uint8Array, V]> {
    for (const [key, value] of this.m.entries()) {
      yield [b4a.from(key, "hex"), value]
    }
  }

  *keys(): IterableIterator<Uint8Array> {
    for (const key of this.m.keys()) {
      yield b4a.from(key, "hex")
    }
  }

  values(): IterableIterator<V> {
    return this.m.values()
  }
}
