import { readFile, writeFile } from "fs/promises"

// 🌰 AgentShield AI Analysis — Uses GitHub Models for threat intelligence
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const MODEL_ENDPOINT = "https://models.inference.ai.azure.com/chat/completions"
const MODEL = "gpt-4o-mini"

if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_TOKEN required for GitHub Models")
  process.exit(1)
}

async function callModel(messages) {
  const res = await fetch(MODEL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.3 }),
  })
  if (!res.ok) throw new Error(`Model API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

async function main() {
  console.log("🌰 AgentShield: Running AI threat analysis...")

  const events = JSON.parse(await readFile("data/events.json", "utf-8"))
  const recentEvents = events.slice(0, 30) // analyze top 30

  const categoryCounts = {}
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const e of recentEvents) {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1
    severityCounts[e.severity] = (severityCounts[e.severity] || 0) + 1
  }

  const eventSummaries = recentEvents.map((e, i) =>
    `${i + 1}. [${e.severity.toUpperCase()}] [${e.category}] ${e.eventSummary?.slice(0, 200)}`
  ).join("\n")

  // 🌰 Pass 1: Generate intelligence brief
  const briefPrompt = `You are an AI infrastructure security analyst for AgentShield 🌰. Analyze these cybersecurity events affecting AI systems, cloud infrastructure, crypto platforms, and software supply chains.

Events this week:
${eventSummaries}

Category breakdown: ${JSON.stringify(categoryCounts)}
Severity breakdown: ${JSON.stringify(severityCounts)}

Generate a JSON response with:
{
  "threatLevel": "LOW|ELEVATED|HIGH|CRITICAL",
  "executiveSummary": "2-3 sentence overview focused on AI infrastructure implications",
  "keyFindings": ["finding1", "finding2", "finding3"],
  "aiInfraImpact": "How these threats specifically affect AI agents, LLM APIs, ML pipelines, and autonomous systems",
  "trendAnalysis": "What patterns emerge across these events",
  "recommendations": ["rec1", "rec2", "rec3"],
  "topThreats": [{"title": "...", "severity": "...", "category": "...", "impact": "..."}]
}

Focus on implications for AI agent infrastructure. Be specific, not generic. Include 🌰 in your analysis.`

  const briefRaw = await callModel([{ role: "user", content: briefPrompt }])
  let brief
  try {
    const jsonMatch = briefRaw.match(/\{[\s\S]*\}/)
    brief = JSON.parse(jsonMatch[0])
  } catch {
    brief = {
      threatLevel: "ELEVATED",
      executiveSummary: briefRaw.slice(0, 500),
      keyFindings: [],
      aiInfraImpact: "",
      trendAnalysis: "",
      recommendations: [],
      topThreats: [],
    }
  }

  // 🌰 Save enriched data
  const output = {
    generatedAt: new Date().toISOString(),
    brief,
    stats: { total: events.length, recentCount: recentEvents.length, categoryCounts, severityCounts },
    events,
  }

  await writeFile("data/events.json", JSON.stringify(output, null, 2))
  console.log(`🌰 AI analysis complete. Threat level: ${brief.threatLevel}`)
}

main()
