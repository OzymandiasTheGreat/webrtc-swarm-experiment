import test from "brittle"
import b4a from "b4a"
import BufferSet from "../lib/buffer-set.js"

test("Add/Has", async (t) => {
  t.plan(5)

  const set = new BufferSet()
  let res = set.add(b4a.from("A"))
  t.ok(res)
  res = set.add(b4a.from("B"))
  t.ok(res)
  res = set.add(b4a.from("A"))
  t.absent(res)
  res = set.has(b4a.from("B"))
  t.ok(res)
  res = set.has(b4a.from("C"))
  t.absent(res)
})

test("Delete", async (t) => {
  t.plan(4)

  const set = new BufferSet()
  set.add(b4a.from("A"))
  let res = set.has(b4a.from("A"))
  t.ok(res)
  res = set.delete(b4a.from("A"))
  t.ok(res)
  res = set.has(b4a.from("A"))
  t.absent(res)
  res = set.delete(b4a.from("C"))
  t.absent(res)
})

test("Clear", async (t) => {
  t.plan(9)

  const set = new BufferSet()
  t.ok(set.add(b4a.from("A")))
  t.ok(set.add(b4a.from("B")))
  t.ok(set.add(b4a.from("C")))
  t.is(set.size, 3)
  t.is(set.clear(), 3)
  t.is(set.size, 0)
  t.absent(set.has(b4a.from("A")))
  t.absent(set.has(b4a.from("B")))
  t.absent(set.has(b4a.from("C")))
})

test("Iteration", async (t) => {
  t.plan(22)

  const input = [b4a.from("A"), b4a.from("B"), b4a.from("C")]
  const set = new BufferSet()
  for (const i of input) {
    set.add(i)
  }

  let i = 0
  for (const v of set) {
    t.alike(v, input[i])
    i++
  }
  t.is(i, set.size)

  let e = 0
  for (const [k, v] of set.entries()) {
    t.alike(k, v)
    t.alike(k, input[e])
    t.alike(v, input[e])
    e++
  }
  t.is(e, set.size)

  let k = 0
  for (const v of set.keys()) {
    t.alike(v, input[k])
    k++
  }
  t.is(k, set.size)

  let j = 0
  for (const v of set.values()) {
    t.alike(v, input[j])
    j++
  }
  t.is(j, set.size)
})
