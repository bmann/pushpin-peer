import { isPlainObject } from "lodash"


export const WARNING_STACK_SIZE = 1000
export interface SelectFn<T> {
  (obj: unknown): boolean
}

// TODO: no cycle detection. Not a huge deal atm because this is currently
// used for finding document links within a single document. Cycles within
// a document are unlikely, even though cycles across/between documents is common.
export function iterativeDFS<T>(root: any, select: SelectFn<T>): T[] {
  const stack = [root]
  const results: T[] = []
  while (stack.length) {
    // No cycle detection, so at least leave a trace if something might be going wrong.
    if (stack.length > WARNING_STACK_SIZE) {
      console.warn(
        "Traverse.iterativeDFS large stack size warning.",
        `Stack size: ${stack.length}`,
        root,
      )
      return results
    }
    const obj = stack.pop()
    if (isPlainObject(obj)) {
      Object.entries(obj).forEach((entry: any) => stack.push(entry))
    } else if (obj && obj.forEach) {
      obj.forEach((val: any) => stack.push(val))
    } else if (select(obj)) {
      results.push(obj)
    }
  }
  return results
}