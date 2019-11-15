import { DocUrl } from "hypermerge"

export type PushpinUrl = string & { __pushpinUrl: true }

export function toPushpinUrl(type: string, url: DocUrl): PushpinUrl {
  if (!url.match("hypermerge:/")) {
    throw new Error("expecting a hypermerge URL as input")
  }
  if (url.match("pushpinContentType")) {
    throw new Error(
      'so-called ID contains "pushpin". you appear to have passed a URL as an ID',
    )
  }

  const id = url.substring(12)

  if (!type) {
    throw new Error("no type when creating URL")
  }
  return `hypermerge:/${id}?pushpinContentType=${type}` as PushpinUrl
}
