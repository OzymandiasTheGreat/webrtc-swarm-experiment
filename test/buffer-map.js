import test from "brittle"
import b4a from "b4a"
import { BufferMap } from "../lib/buffer-map.js"

test("Set", async (t) => {
  t.plan(2)

  const map = new BufferMap()
  let res = map.set(b4a.from("A"), 1)
  t.ok(res)
  res = map.set(b4a.from("A"), 2)
  t.absent(res)
})

test("Get", async (t) => {
  t.plan(3)

  const map = new BufferMap()
  map.set(b4a.from("A"), 1)
  let res = map.get(b4a.from("A"))
  t.is(res, 1)
  map.set(b4a.from("A"), 2)
  res = map.get(b4a.from("A"))
  t.is(res, 2)
  res = map.get(b4a.from("B"))
  t.ok(res == null)
})

test("Has", async (t) => {
  t.plan(2)

  const map = new BufferMap()
  map.set(b4a.from("A"), 1)
  t.ok(map.has(b4a.from("A")))
  t.absent(map.has(b4a.from("B")))
})

test("Delete", async (t) => {
  t.plan(4)

  const map = new BufferMap()
  map.set(b4a.from("A"), 1)
  t.is(map.get(b4a.from("A")), 1)
  let res = map.delete(b4a.from("A"))
  t.ok(res)
  t.ok(map.get(b4a.from("A")) == null)
  res = map.delete(b4a.from("B"))
  t.absent(res)
})

test("Clear", async (t) => {
  t.plan(4)

  const map = new BufferMap()
  t.is(map.size, 0)
  map.set(b4a.from("A"), 1)
  map.set(b4a.from("B"), 2)
  t.is(map.size, 2)
  t.is(map.clear(), 2)
  t.is(map.size, 0)
})

test("Iteration", async (t) => {
  t.plan(22)

  const input = [
    [b4a.from("A"), 1],
    [b4a.from("B"), 2],
    [b4a.from("C"), 3]
  ]
  const map = new BufferMap()
  for (const [k, v] of input) {
    map.set(k, v)
  }

  let i = 0
  for (const [k, v] of map) {
    t.alike(k, input[i][0])
    t.is(v, input[i][1])
    i++
  }
  t.is(i, map.size)

  let j = 0
  for (const [k, v] of map.entries()) {
    t.alike(k, input[j][0])
    t.is(v, input[j][1])
    j++
  }
  t.is(j, map.size)

  let l = 0
  for (const k of map.keys()) {
    t.alike(k, input[l][0])
    l++
  }
  t.is(l, map.size)

  let m = 0
  for (const v of map.values()) {
    t.is(v, input[m][1])
    m++
  }
  t.is(m, map.size)
})
