import { Repo, Handle, Crypto, DocUrl } from "hypermerge/dist"
import * as Traverse from "./Traverse"
import * as HyperUrl from "./HyperUrl"
import * as PushpinUrl from "./PushpinUrl"

const debug = require("debug")("pushpin-peer")

export interface StoragePeerDoc {
  name: string
  icon: string
  encryptionKey?: Crypto.EncodedPublicEncryptionKey
  encryptionKeySignature?: Crypto.EncodedSignature
  registry: {
    [contactId: string]: Crypto.EncodedSealedBox /* sealed workspace url */
  }
}

export async function createRootDoc(
  repo: Repo,
  encryptionKey: Crypto.EncodedPublicEncryptionKey,
) {
  // NOTE: We need the url to generate the encryption key signature. This means
  // there will be a valid state of the document where the key and its signature are
  // not present in the document.
  const url = repo.create<StoragePeerDoc>({
    name: "Storage Peer",
    icon: "cloud",
    registry: {},
  })

  const encryptionKeySignature = await repo.crypto.sign(url, encryptionKey)
  repo.change<StoragePeerDoc>(url, async doc => {
    doc.encryptionKey = encryptionKey
    doc.encryptionKeySignature = encryptionKeySignature
  })

  return url
}

export class StoragePeer {
  repo: Repo
  keyPair: Crypto.EncodedEncryptionKeyPair
  rootDocUrl: DocUrl
  shareLink: PushpinUrl.PushpinUrl
  private handles: Map<string, Handle<any>>
  private files: Set<string>

  constructor(
    repo: Repo,
    keyPair: Crypto.EncodedEncryptionKeyPair,
    rootDocUrl: DocUrl,
  ) {
    this.repo = repo
    this.rootDocUrl = rootDocUrl
    this.keyPair = keyPair
    this.handles = new Map()
    this.files = new Set()

    this.shareLink = PushpinUrl.createDocumentLink(
      "storage-peer",
      this.rootDocUrl,
    )

    this.swarmRoot(rootDocUrl)
  }

  get stats() {
    return {
      documents: this.handles.size,
      files: this.files.size,
    }
  }

  swarmRoot(url: DocUrl) {
    const handle = this.repo.open<StoragePeerDoc>(url)
    handle.subscribe(rootDoc => {
      Object.values(rootDoc.registry).forEach(async sealedWorkspaceUrl => {
        const workspaceUrl = await this.repo.crypto.openSealedBox(
          this.keyPair,
          sealedWorkspaceUrl,
        )
        this.onUrl(workspaceUrl)
      })
    })
  }

  onUrl = (url: string) => {
    // Handle pushpin urls
    if (PushpinUrl.isPushpinUrl(url)) {
      debug(`Parsing pushpin url ${url}`)
      const { docId } = PushpinUrl.parts(url)
      this.onUrl(HyperUrl.fromDocumentId(docId))
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

  onDocumentUpdate = (url: string) => {
    return (doc: any) => {
      debug(`Update for ${url}`)
      const urls = Traverse.iterativeDFS<string>(doc, this.shouldSwarm)
      urls.forEach(this.onUrl)
    }
  }

  shouldSwarm(val: any) {
    return HyperUrl.isHyperUrl(val) || PushpinUrl.isPushpinUrl(val)
  }

  close() {
    this.handles.forEach(handle => handle.close())
    this.handles.clear()
    this.files.clear()
  }
}
