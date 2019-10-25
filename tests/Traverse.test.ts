import test from "tape"
import Automerge from "automerge"
import * as Traverse from "../src/Traverse"

test("Test Traverse.ts", function(t) {
  t.test("Traverses objects and arrays", function(t) {
    t.plan(1)
    const root = { foo: "a", bar: ["a", "b", { baz: "a" }] }
    const results = Traverse.iterativeDFS(root, (val: any) => val === "a")
    t.equals(results.length, 3)
  })
  t.test("Selects keys as well as values", function(t) {
    t.plan(1)
    const root = { foo: "a", a: "ok" }
    const results = Traverse.iterativeDFS(root, (val: any) => val === "a")
    t.equals(results.length, 2)
  })
  t.test("Test Automerge.Text isn't traversed", function(t) {
    t.plan(1)
    const doc = Automerge.change(Automerge.init(), function(doc: any) {
      doc.text = new Automerge.Text()
      doc.text.insertAt(0, "t", "e", "s", "t")
    })
    const results = Traverse.iterativeDFS(doc, (val: any) => val === "t")
    t.equals(results.length, 0)
  })
})
