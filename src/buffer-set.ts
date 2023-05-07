import b4a from "b4a"

export default class BufferSet {
  protected s: Set<string>

  constructor(other?: BufferSet) {
    this.s = other ? new Set([...other.s]) : new Set()
  }

  get size(): number {
    return this.s.size
  }

  add(value: Uint8Array): boolean {
    const string = b4a.toString(value, "hex")
    const exists = this.s.has(string)
    this.s.add(string)
    return !exists
  }

  clear(): number {
    const size = this.s.size
    this.s.clear()
    return size
  }

  delete(value: Uint8Array): boolean {
    return this.s.delete(b4a.toString(value, "hex"))
  }

  has(value: Uint8Array): boolean {
    return this.s.has(b4a.toString(value, "hex"))
  }

  *[Symbol.iterator](): IterableIterator<Uint8Array> {
    for (const string of this.s) {
      yield b4a.from(string, "hex")
    }
  }

  *entries(): IterableIterator<[Uint8Array, Uint8Array]> {
    for (const string of this.s) {
      const value = b4a.from(string, "hex")
      yield [value, value]
    }
  }

  keys(): IterableIterator<Uint8Array> {
    return this[Symbol.iterator]()
  }

  values(): IterableIterator<Uint8Array> {
    return this[Symbol.iterator]()
  }
}
