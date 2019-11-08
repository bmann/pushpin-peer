import { Repo, Crypto } from "hypermerge"
import FileServer from "hypermerge/dist/FileServer"
import * as StoragePeer from "./StoragePeer"
import * as PushpinUrl from "./PushpinUrl"
import fs from "fs"
import path from "path"
import { DocUrl } from "hypermerge"
import Hyperswarm from "hyperswarm"

const STORAGE_PATH = process.env.REPO_ROOT || "./.data"
const REPO_PATH = path.join(STORAGE_PATH, "hypermerge")
const ROOT_DOC_PATH = path.join(STORAGE_PATH, "root")
const KEY_PAIR_PATH = path.join(STORAGE_PATH, "keys")

// Program config
const program = require("commander")

program
  .description(
    "A cloud peer for pushpin to keep data warm while your computer is sleeping.",
  )
  .option(
    "-p, --port <number>",
    "Set a custom port for incoming connections.",
    (port: string) => parseInt(port, 10),
  )
  .option(
    "-f, --file-server-port <number>",
    "Serve hyperfiles via http.",
    (port: string) => parseInt(port, 10),
  )
  .parse(process.argv)

init()

async function init() {
  // Repo init
  // TODO: use a real location, not the repo root
  const repo = new Repo({ path: REPO_PATH })
  const swarm = Hyperswarm()

  if (program.port) {
    swarm.listen(program.port)
    console.log("Listening on port:", program.port)
  }

  if (program.fileServerPort) {
    console.log("Serving hyperfiles on port:", program.fileServerPort)
    const fileServer = new FileServer(repo.back.files)
    fileServer.listen({ host: "0.0.0.0", port: program.fileServerPort })
  }

  repo.setSwarm(swarm)
  repo.startFileServer("/tmp/storage-peer.sock")

  //const deviceUrl = getDevice(repo)
  const keyPair = await getKeyPair(repo)
  const rootDataUrl = await getRootDoc(repo, keyPair)

  // PushpinPeer init
  const pushpinPeer = new StoragePeer.StoragePeer(repo, rootDataUrl, keyPair)
  //pushpinPeer.swarm(rootDataUrl)
  heartbeatAll(repo, rootDataUrl)

  const pushpinUrl = PushpinUrl.createDocumentLink("storage-peer", rootDataUrl)

  async function getKeyPair(repo: Repo) {
    const keyPair = JSON.parse(
      await getOrCreateFromFile(KEY_PAIR_PATH, async () => {
        return JSON.stringify(await repo.crypto.encryptionKeyPair())
      }),
    )
    return keyPair
  }

  // Create necessary root documents
  async function getRootDoc(
    repo: Repo,
    keyPair: Crypto.EncodedEncryptionKeyPair,
  ) {
    const url = await getOrCreateFromFile(ROOT_DOC_PATH, () => {
      const url = repo.create({
        name: "Storage Peer",
        icon: "cloud",
        storedUrls: {},
      })
      return url
    })

    const signature = await repo.crypto.sign(url, keyPair.publicKey)
    repo.change<StoragePeer.RootDoc>(url, async doc => {
      if (!doc.publicKey || !doc.publicKeySignature) {
        doc.publicKeySignature = signature
        doc.publicKey = keyPair.publicKey
      }
    })
    return url
  }

  async function getOrCreateFromFile(file: string, create: Function) {
    try {
      const content = fs.readFileSync(file, { encoding: "utf-8" })
      return content
    } catch {
      const content = await create()
      fs.writeFileSync(file, content)
      return content
    }
  }

  interface HeartbeatMessage {
    contact: string
    device: string
    heartbeat?: boolean
    departing?: boolean
    data?: any
  }

  function heartbeatAll(repo: Repo, rootUrl: DocUrl) {
    const interval = setInterval(() => {
      repo.doc(rootUrl, (root: StoragePeer.RootDoc) => {
        // Heartbeat on all stored contacts
        Object.keys(root.storedUrls).forEach(contactId => {
          const msg = {
            contact: contactId,
            device: rootUrl,
            hearbeat: true,
            data: {
              [contactId]: {
                onlineStatus: {},
              },
            },
          }
          repo.message(contactId as DocUrl, msg)
        })

        // Heartbeat on pushpin-peer device.
        const message = {
          contact: rootUrl,
          device: rootUrl,
          heartbeat: true,
          data: {
            [rootUrl]: {
              onlineStatus: {},
            },
          },
        }
        repo.message(rootUrl, message)
      })
    }, 1000)
  }
}
