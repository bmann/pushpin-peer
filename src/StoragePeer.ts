import { Repo, Handle, Crypto, DocUrl } from "hypermerge/dist"
import * as Traverse from "./Traverse"
import * as HyperUrl from "./HyperUrl"
import * as PushpinUrl from "./PushpinUrl"

const debug = require("debug")("pushpin-peer")

export interface RootDoc {
  name: string
  icon: string
  publicKey: Crypto.EncodedPublicEncryptionKey
  publicKeySignature: Crypto.EncodedSignature
  registry: {
    [contactId: string]: Crypto.EncodedSealedBox /* workspace url */
  }
}

// TODO: Inspect blocks for links rather than traversing the doc.
// We currently re-traverse documents on every update. We could instead
// check the operations in each block for links and swarm them if we've never
// seen them.
export class StoragePeer {
  repo: Repo
  rootDoc: DocUrl
  keyPair: Crypto.EncodedEncryptionKeyPair
  handles: Map<string, Handle<any>>
  files: Set<string>

  constructor(
    repo: Repo,
    rootDoc: DocUrl,
    keyPair: Crypto.EncodedEncryptionKeyPair,
  ) {
    this.repo = repo
    this.rootDoc = rootDoc
    this.keyPair = keyPair
    this.handles = new Map()
    this.files = new Set()

    this.swarmRootDoc(rootDoc)
  }

  get stats() {
    return {
      documents: this.handles.size,
      files: this.files.size,
    }
  }

  swarmRootDoc(url: DocUrl) {
    const handle = this.repo.open<RootDoc>(url)
    handle.subscribe(rootDoc => {
      Object.entries(rootDoc.registry).forEach(
        async ([encryptedContactUrl, encryptedWorkspaceUrl]) => {
          const workspaceUrl = await this.repo.crypto.openSealedBox(
            this.keyPair,
            encryptedWorkspaceUrl as Crypto.EncodedSealedBox,
          )
          this.swarm(workspaceUrl)
        },
      )
    })
  }

  swarm = (url: string) => {
    // Handle pushpin urls
    if (PushpinUrl.isPushpinUrl(url)) {
      debug(`Parsing pushpin url ${url}`)
      const { docId } = PushpinUrl.parts(url)
      this.swarm(HyperUrl.fromDocumentId(docId))
    }
    // Handle hypermerge and hyperfile urls
    else if (!this.handles.has(url) && !this.files.has(url)) {
      // Is there a better way to ensure availability besides opening?
      if (HyperUrl.isDocumentUrl(url)) {
        debug(`Opening document ${url}`)
        const handle = this.repo.open(url)
        this.handles.set(url, handle)
        // The `subscribe` callback may be invoked immediately,
        // so use setImmediate to prevent locking on deep structures.
        setImmediate(() => handle.subscribe(this.onDocumentUpdate(url)))
      } else if (HyperUrl.isHyperfileUrl(url)) {
        // We don't need to subscribe to hyperfile updates, we just need to swarm
        this.files.add(url)
        setImmediate(() =>
          this.repo.files.header(url as any).then(() => {
            debug(`Read file ${url}`)
          }),
        )
      }
    }
  }

  shouldSwarm(val: any) {
    return HyperUrl.isHyperUrl(val) || PushpinUrl.isPushpinUrl(val)
  }

  onDocumentUpdate = (url: string) => {
    return (doc: any) => {
      debug(`Update for ${url}`)
      const urls = Traverse.iterativeDFS<string>(doc, this.shouldSwarm)
      urls.forEach(this.swarm)
    }
  }

  close() {
    this.handles.forEach(handle => handle.close())
    this.handles.clear()
    this.files.clear()
  }
}
