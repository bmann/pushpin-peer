import { Repo, Crypto, DocUrl } from "hypermerge"
import * as PushpinUrl from "./PushpinUrl"

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

  constructor(
    repo: Repo,
    keyPair: Crypto.EncodedEncryptionKeyPair,
    registryDocUrl: DocUrl,
  ) {
    this.repo = repo
    this.registryDocUrl = registryDocUrl
    this.keyPair = keyPair

    this.shareLink = PushpinUrl.toPushpinUrl(
      "storage-peer",
      this.registryDocUrl,
    )
  }

  init() {
    const handle = this.repo.open<StoragePeerDoc>(this.registryDocUrl)
    handle.subscribe(registryDoc => {
      Object.values(registryDoc.registry).forEach(async sealedWorkspaceUrl => {
        const workspaceUrl = await this.repo.crypto.openSealedBox(
          this.keyPair,
          sealedWorkspaceUrl,
        )
        this.repo.open(workspaceUrl as DocUrl)
      })
    })
  }
}
