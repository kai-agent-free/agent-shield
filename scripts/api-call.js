import { writeFile, readFile, mkdir } from "fs/promises"

const API_URL = "https://cpw-tracker.p.rapidapi.com/"
const API_KEY = process.env.RAPIDAPI_KEY

if (!API_KEY) {
  console.error("Error: RAPIDAPI_KEY environment variable is required")
  process.exit(1)
}

// 🌰 AgentShield: Multi-vector threat queries for AI infrastructure security
const QUERY_VECTORS = [
  { entities: "AI companies", topic: "cyberattack" },
  { entities: "AI companies", topic: "data breach" },
  { entities: "cryptocurrency exchanges", topic: "cyberattack" },
  { entities: "cloud service providers", topic: "cyberattack" },
  { entities: "software supply chain", topic: "cyberattack" },
]

function getDateRange() {
  const now = new Date()
  const endTime = now
  const startTime = new Date(now)
  startTime.setDate(startTime.getDate() - 7)
  return { startTime: startTime.toISOString(), endTime: endTime.toISOString() }
}

async function fetchVector(entities, topic, startTime, endTime) {
  console.log(`  🌰 Fetching: ${entities} × ${topic}`)
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": "cpw-tracker.p.rapidapi.com",
      "x-rapidapi-key": API_KEY,
    },
    body: JSON.stringify({ entities, topic, startTime, endTime }),
  })
  if (!response.ok) throw new Error(`API ${response.status} for ${entities}/${topic}`)
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

// 🌰 Categorize threats by AI infrastructure domain
function categorize(event) {
  const text = (event.eventSummary || "").toLowerCase()
  if (/model|training|poison|adversarial|llm|gpt|ai\s*agent|prompt\s*inject/.test(text)) return "model"
  if (/supply\s*chain|dependency|npm|pypi|package|backdoor|trojan/.test(text)) return "supply-chain"
  if (/crypto|bitcoin|ethereum|defi|wallet|exchange|blockchain/.test(text)) return "crypto"
  return "infra"
}

// 🌰 Score severity based on keywords
function scoreSeverity(event) {
  const text = (event.eventSummary || "").toLowerCase()
  let score = 30
  if (/critical|emergency|zero.day|actively\s*exploit/.test(text)) score += 40
  if (/breach|stolen|leak|exfiltrat/.test(text)) score += 25
  if (/ransomware|malware|backdoor/.test(text)) score += 20
  if (/\$\d+\s*(million|billion|m\b|b\b)/i.test(text)) score += 15
  if (/patch|update|fix|mitigat/.test(text)) score -= 10
  return Math.max(0, Math.min(100, score))
}

function severityLabel(score) {
  if (score >= 80) return "critical"
  if (score >= 60) return "high"
  if (score >= 40) return "medium"
  return "low"
}

async function main() {
  const { startTime, endTime } = getDateRange()
  console.log(`🌰 AgentShield: Fetching threats ${startTime} → ${endTime}`)

  const allEvents = []
  const seen = new Set()

  for (const v of QUERY_VECTORS) {
    try {
      const events = await fetchVector(v.entities, v.topic, startTime, endTime)
      for (const e of events) {
        const key = (e.eventSummary || "").slice(0, 100)
        if (!seen.has(key)) {
          seen.add(key)
          const severity = scoreSeverity(e)
          allEvents.push({
            ...e,
            category: categorize(e),
            severityScore: severity,
            severity: severityLabel(severity),
            queryVector: `${v.entities}/${v.topic}`,
          })
        }
      }
    } catch (err) {
      console.error(`  ⚠️ Failed: ${v.entities}/${v.topic}: ${err.message}`)
    }
  }

  allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  // 🌰 Load existing archive and merge
  let archive = []
  try {
    archive = JSON.parse(await readFile("data/events.json", "utf-8"))
    if (!Array.isArray(archive)) archive = []
  } catch { archive = [] }

  const archiveSeen = new Set(archive.map(e => (e.eventSummary || "").slice(0, 100)))
  for (const e of allEvents) {
    const key = (e.eventSummary || "").slice(0, 100)
    if (!archiveSeen.has(key)) archive.push(e)
  }
  archive.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  archive = archive.slice(0, 500) // rolling window

  await mkdir("data", { recursive: true })
  await writeFile("data/events.json", JSON.stringify(archive, null, 2))
  console.log(`🌰 Saved ${archive.length} events (${allEvents.length} new this week)`)
}

main()
