import { isString } from "lodash"
import { DocUrl } from "hypermerge"

// TODO: All of this logic should be in hypermerge
const documentRegex = /^hypermerge:\/(\w+)$/
const hyperfileRegex = /^hyperfile:\/(?:\/\/)?(\w+)$/

export const isHyperUrl = (val: any) => {
  return isString(val) && (isDocumentUrl(val) || isHyperfileUrl(val))
}

export function isDocumentUrl(val: string): val is DocUrl {
  return documentRegex.test(val)
}

export const isHyperfileUrl = (val: string) => {
  return hyperfileRegex.test(val)
}

// Assumes valid hyper url, hypermerge: or hyperfile:.
export const toId = (val: string) => {
  const regex = isDocumentUrl(val) ? documentRegex : hyperfileRegex
  const [, id]: Array<string | undefined> = val.match(regex) || []
  return id
}

export const fromDocumentId = (id: string) => {
  return `hypermerge:/${id}`
}

export const fromFileId = (id: string) => {
  return `hyperfile:/${id}`
}
