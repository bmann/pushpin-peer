import { Repo, DocUrl, Handle } from "hypermerge"
import { Crypto } from "hypermerge"
import { getOrCreate } from "./Misc"
import * as PushpinUrl from "./PushpinUrl"

interface ContactDoc {
  name: string
  color: string
  devices?: DocUrl[]
  invites: { [url: string]: Crypto.Box[] }
  encryptionKey?: Crypto.SignedMessage<Crypto.EncodedPublicEncryptionKey>
}

interface Workspace {
  selfId: DocUrl
  contactIds: DocUrl[]
  secretKey: Crypto.SignedMessage<Crypto.EncodedSecretEncryptionKey>
}

/**
 * An InviteMonitor watches a workspace's known contacts for invites,
 * decryptes those invites, and opens them to be crawled.
 *
 * Every registered workspace gets its own InviteMonitor to ensure we catch *all*
 * invitations for that workspace. This is contrast with pooled contact scanning,
 * in which we could miss invitations from existing contacts for newly registered
 * workspaces (until that contact is updated, triggering another `handle.subscribe`).
 */
export class InviteMonitor {
  repo: Repo
  workspaceUrl: DocUrl
  selfUrl!: DocUrl
  secretKey?: Crypto.EncodedSecretEncryptionKey
  publicKeys: Map<DocUrl, Crypto.EncodedPublicEncryptionKey>
  handles: Map<DocUrl, Handle<any>>

  constructor(repo: Repo, workspaceUrl: DocUrl) {
    this.repo = repo
    this.workspaceUrl = workspaceUrl
    this.publicKeys = new Map()
    this.handles = new Map()

    const handle = this.open<Workspace>(workspaceUrl)
    handle.subscribe(async workspace => {
      // oof
      let secretKey = this.secretKey
      if (!secretKey) {
        secretKey =
          workspace.secretKey &&
          (await this.repo.crypto.verifiedMessage(
            workspaceUrl,
            workspace.secretKey,
          ))
        this.secretKey = secretKey
      }
      if (!this.secretKey) return

      this.selfUrl = workspace.selfId // hmm...
      workspace.contactIds.forEach(contactId => {
        this.monitorContact(contactId)
      })
    })
  }

  monitorContact(contactUrl: DocUrl) {
    if (this.handles.has(contactUrl)) return

    const handle = this.open<ContactDoc>(contactUrl)
    handle.subscribe(async contact => {
      if (!contact.invites) return

      const publicKey = await this.getPublicKey(contactUrl, contact)
      if (!publicKey) return

      const boxes = contact.invites[this.selfUrl] || []
      boxes.forEach(async box => {
        const inviteUrl = await this.repo.crypto.openBox(
          publicKey,
          this.secretKey!,
          box,
        )
        this.open(PushpinUrl.toDocUrl(inviteUrl as PushpinUrl.PushpinUrl))
      })
    })
  }

  async getPublicKey(
    contactUrl: DocUrl,
    contact: ContactDoc,
  ): Promise<Crypto.EncodedPublicEncryptionKey | undefined> {
    // Avoid the crypto if we already have a public key for this contact
    if (this.publicKeys.has(contactUrl)) return this.publicKeys.get(contactUrl)!

    const publicKey =
      contact.encryptionKey &&
      (await this.repo.crypto.verifiedMessage(
        contactUrl,
        contact.encryptionKey,
      ))
    publicKey && this.publicKeys.set(contactUrl, publicKey)
    return publicKey
  }

  open<T>(url: DocUrl): Handle<T> {
    return getOrCreate(this.handles, url, url => this.repo.open<T>(url))
  }

  close() {
    this.handles.forEach(handle => handle.close())
    this.handles.clear()
  }
}
