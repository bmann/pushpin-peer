import { Repo, Crypto, DocUrl, Handle } from "hypermerge"
import * as PushpinUrl from "./PushpinUrl"
import { InviteMonitor } from "./InviteMonitor"
import { getOrCreate } from "./Misc"

const debug = require("debug")("storage-peer")

export interface StoragePeerDoc {
  name: string
  icon: string
  encryptionKey?: Crypto.EncodedPublicEncryptionKey
  encryptionKeySignature?: Crypto.EncodedSignature
  registry: {
    [contactId: string]: Crypto.EncodedSealedBoxCiphertext /* sealed workspace url */
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
    doc.encryptionKeySignature = encryptionKeySignature.signature
  })

  return url
}

export class StoragePeer {
  repo: Repo
  keyPair: Crypto.EncodedEncryptionKeyPair
  registryDocUrl: DocUrl
  shareLink: PushpinUrl.PushpinUrl
  handles: Map<DocUrl, Handle<any>>
  inviteMonitors: Map<DocUrl, InviteMonitor>

  constructor(
    repo: Repo,
    keyPair: Crypto.EncodedEncryptionKeyPair,
    registryDocUrl: DocUrl,
  ) {
    this.repo = repo
    this.registryDocUrl = registryDocUrl
    this.keyPair = keyPair
    this.handles = new Map()
    this.inviteMonitors = new Map()

    this.shareLink = PushpinUrl.fromDocUrl("storage-peer", this.registryDocUrl)
  }

  init() {
    const handle = this.open<StoragePeerDoc>(this.registryDocUrl)
    handle.subscribe(registryDoc => {
      Object.values(registryDoc.registry).forEach(async sealedWorkspaceUrl => {
        const workspaceUrl = await this.repo.crypto.openSealedBox(
          this.keyPair,
          sealedWorkspaceUrl,
        )
        this.register(workspaceUrl as DocUrl)
      })
    })
  }

  register(workspaceUrl: DocUrl) {
    this.open(workspaceUrl)
    getOrCreate(
      this.inviteMonitors,
      workspaceUrl,
      url => new InviteMonitor(this.repo, url),
    )
  }

  open<T>(url: DocUrl): Handle<T> {
    return getOrCreate(this.handles, url, url => this.repo.open<T>(url))
  }

  close() {
    this.handles.forEach(handle => handle.close())
    this.handles.clear()
    this.inviteMonitors.forEach(monitor => monitor.close())
    this.inviteMonitors.clear()
  }
}
