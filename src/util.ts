export function randint(min: number, max: number): number {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min) + min)
}

export class Defer<T> {
  protected resolved = false

  promise: Promise<T>
  resolve!: (value: T) => void
  reject!: (error: Error) => void

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = (value) => {
        if (!this.resolved) {
          this.resolved = true
          resolve(value)
        }
      }
      this.reject = (err) => {
        if (!this.resolved) {
          this.resolved = true
          reject(err)
        }
      }
    })
  }
}
