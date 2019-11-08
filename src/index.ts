import { Repo, Crypto } from "hypermerge"
import FileServer from "hypermerge/dist/FileServer"
import * as StoragePeer from "./StoragePeer"
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

  const keyPair = await getOrCreateKeyPair(repo)
  const storagePeerDoc = await getOrCreateStoragePeerDoc(repo, keyPair)
  const storagePeer = new StoragePeer.StoragePeer(repo, keyPair, storagePeerDoc)
  heartbeatContacts(repo, storagePeerDoc)

  console.log(`Storage Peer Url: ${storagePeer.shareLink}`)

  async function getOrCreateKeyPair(repo: Repo) {
    const keyPair = JSON.parse(
      await getOrCreateFromFile(KEY_PAIR_PATH, async () => {
        return JSON.stringify(await repo.crypto.encryptionKeyPair())
      }),
    )
    return keyPair
  }

  async function getOrCreateStoragePeerDoc(
    repo: Repo,
    keyPair: Crypto.EncodedEncryptionKeyPair,
  ) {
    return await getOrCreateFromFile(ROOT_DOC_PATH, () => {
      return StoragePeer.createRootDoc(repo, keyPair.publicKey)
    })
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

  function heartbeatContacts(repo: Repo, storagePeerUrl: DocUrl) {
    const interval = setInterval(() => {
      repo.doc(storagePeerUrl, (root: StoragePeer.StoragePeerDoc) => {
        // Heartbeat on all stored contacts
        Object.keys(root.registry).forEach(contactId => {
          const msg: HeartbeatMessage = {
            contact: contactId,
            device: storagePeerUrl,
            heartbeat: true,
            data: {
              [contactId]: {
                onlineStatus: {},
              },
            },
          }
          repo.message(contactId as DocUrl, msg)
        })

        // Heartbeat on pushpin-peer device.
        const message: HeartbeatMessage = {
          contact: storagePeerUrl,
          device: storagePeerUrl,
          heartbeat: true,
          data: {
            [storagePeerUrl]: {
              onlineStatus: {},
            },
          },
        }
        repo.message(storagePeerUrl, message)
      })
    }, 1000)
  }
}
