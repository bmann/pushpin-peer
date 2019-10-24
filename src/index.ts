import { Repo } from "hypermerge/dist/Repo"
import * as StoragePeer from "./StoragePeer"
import * as PushpinUrl from "./PushpinUrl"
import fs from "fs"
import path from "path"
import { DocUrl } from "hypermerge"
import Hyperswarm from "hyperswarm"

const STORAGE_PATH = process.env.REPO_ROOT || "./.data"
const REPO_PATH = path.join(STORAGE_PATH, "hypermerge")
const ROOT_DOC_PATH = path.join(STORAGE_PATH, "root")

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
  .parse(process.argv)

// Repo init
// TODO: use a real location, not the repo root
const repo = new Repo({ path: REPO_PATH })
const swarm = Hyperswarm()

if (program.port) {
  swarm.listen(program.port)
  console.log("Listening on port:", program.port)
}

repo.setSwarm(swarm)
repo.startFileServer("/tmp/storage-peer.sock")

// TODO: we already define this in Pushpin, strange to define it twice.
interface RootDoc {
  name: string
  icon: string
  storedUrls: {
    [contactId: string]: string
  }
}

//const deviceUrl = getDevice(repo)
const rootDataUrl = getRootDoc(repo)

// PushpinPeer init
const pushpinPeer = new StoragePeer.StoragePeer(repo)
pushpinPeer.swarm(rootDataUrl)
heartbeatAll(repo, rootDataUrl)

const pushpinUrl = PushpinUrl.createDocumentLink("storage-peer", rootDataUrl)

console.log(`Storage Peer Url: ${pushpinUrl}`)

// Create necessary root documents
function getRootDoc(repo: Repo) {
  return getOrCreateFromFile(ROOT_DOC_PATH, () => {
    const url = repo.create({
      name: "Storage Peer",
      icon: "cloud",
      storedUrls: {},
    })
    return url
  })
}

function getOrCreateFromFile(file: string, create: Function) {
  try {
    const content = fs.readFileSync(file, { encoding: "utf-8" })
    return content
  } catch {
    const content = create()
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
    repo.doc(rootUrl, (root: RootDoc) => {
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
