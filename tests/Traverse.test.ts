import test from "tape"
import Automerge from "automerge"
import * as Traverse from "../src/Traverse"

test("Test Traverse.ts", function(t) {
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
