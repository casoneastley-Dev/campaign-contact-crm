/* AI layer for the Campaign Contact CRM.
   Talks to the Claude API directly from the browser using the user's own key
   (stored in localStorage on this device only). No backend, no build step.

   Exposes globalThis.CRMAI. Loaded after lib.js and before app.js. */
(() => {
  "use strict";

  const LIB = globalThis.CRMLib;

  const STORE = {
    apiKey: "campaign-crm:ai:key",
    model: "campaign-crm:ai:model",
    webSearch: "campaign-crm:ai:websearch",
    protocol: "campaign-crm:ai:protocol",
    knowledge: "campaign-crm:ai:knowledge",
  };

  const API_URL = "https://api.anthropic.com/v1/messages";
  const API_VERSION = "2023-06-01";

  const MODELS = [
    { id: "claude-opus-4-8",   label: "Claude Opus 4.8 — most capable (recommended)" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — faster, lower cost" },
    { id: "claude-haiku-4-5",  label: "Claude Haiku 4.5 — fastest, cheapest" },
  ];
  const DEFAULT_MODEL = "claude-opus-4-8";

  // Models that take adaptive thinking + the effort parameter. Others (Haiku 4.5)
  // get a plain request so we don't trip a 400.
  const ADVANCED_MODELS = new Set([
    "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6",
  ]);

  // Claude's server-side web search tool (with dynamic result filtering).
  const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search" };

  // The "memory file" / operating manual David asked for. Sent as system context
  // on every AI call. Fully editable in Settings; this is just the default.
  const DEFAULT_PROTOCOL = `You are a seasoned political consultant, campaign strategist, and opposition researcher embedded in Michael's congressional campaign. You advise the candidate and senior staff. Your job is to turn this contact database into actionable political intelligence — not to act as a generic chatbot.

OPERATING PROTOCOL — follow on every response:

1. CURRENCY OF DATA. Politics moves fast and your training data has a cutoff. For anything time-sensitive — current officeholders, recent polls, redistricting, who endorsed whom, news, prices, a person's current role or employer — search the web and rely on what you find, not memory. Cite your sources with dates. If you could not verify something current, say so explicitly rather than guessing.

2. PLAY DEVIL'S ADVOCATE WITH YOURSELF. Before finalizing, argue the opposite of your own conclusion. State the strongest counter-case, the biggest risk, and what would have to be true for your recommendation to be wrong. Then give your net call. Never present a single rosy view.

3. SEPARATE FACT FROM INFERENCE. Label every claim as one of: VERIFIED (with a cited source), INFERRED (reasoning from known data — say what it rests on), or SPECULATIVE (a hunch worth checking). Network/relationship leads ("X could connect you to Y") are INFERRED or SPECULATIVE by default — present them as leads to verify, never as established fact.

4. PUBLIC INFORMATION ONLY. Use only publicly available information. Do not fabricate private details, contact info, or relationships. Flag anything that needs human verification before the campaign acts on it.

5. STAY IN BOUNDS. Keep recommendations legal and ethical: no impersonation, deception, harassment, or illegally obtained data. Be mindful of campaign-finance (FEC), calling/texting (TCPA), and privacy rules — flag when a tactic may implicate them. This protects the campaign.

6. BE USEFUL AND CONCRETE. Lead with the answer. Give specific next steps, who to call, talking points, and the "why." Rank options. Quantify confidence. Skip filler and hedging that doesn't help the candidate decide.

When campaign- or district-specific facts are provided below, treat them as ground truth about this race.`;

  // ---------- Config ----------

  function getConfig() {
    return {
      apiKey: localStorage.getItem(STORE.apiKey) || "",
      model: localStorage.getItem(STORE.model) || DEFAULT_MODEL,
      // Web search defaults ON; only "off" disables it.
      webSearch: localStorage.getItem(STORE.webSearch) !== "off",
      protocol: localStorage.getItem(STORE.protocol) || DEFAULT_PROTOCOL,
      knowledge: localStorage.getItem(STORE.knowledge) || "",
    };
  }

  function saveConfig(cfg) {
    if (cfg.apiKey != null) localStorage.setItem(STORE.apiKey, String(cfg.apiKey).trim());
    if (cfg.model != null) localStorage.setItem(STORE.model, cfg.model);
    if (cfg.webSearch != null) localStorage.setItem(STORE.webSearch, cfg.webSearch ? "on" : "off");
    if (cfg.protocol != null) localStorage.setItem(STORE.protocol, cfg.protocol);
    if (cfg.knowledge != null) localStorage.setItem(STORE.knowledge, cfg.knowledge);
  }

  function isConfigured() {
    return !!getConfig().apiKey;
  }

  /** Assemble the system prompt: operating protocol + campaign knowledge base. */
  function buildSystem(extra) {
    const cfg = getConfig();
    const parts = [cfg.protocol];
    if (cfg.knowledge.trim()) {
      parts.push("CAMPAIGN & DISTRICT KNOWLEDGE BASE (ground truth for this race):\n" + cfg.knowledge.trim());
    }
    if (extra && extra.trim()) parts.push(extra.trim());
    return parts.join("\n\n---\n\n");
  }

  // ---------- API ----------

  function extractText(message) {
    return (message.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
  }

  /** Low-level Messages API call, direct from the browser.
      opts: { system, messages, model, maxTokens, tools, thinking, effort, signal } */
  async function callMessages(opts) {
    const cfg = getConfig();
    const key = cfg.apiKey;
    if (!key) throw new Error("No API key set. Open Settings to add your Anthropic API key.");

    const model = opts.model || cfg.model;
    const body = {
      model,
      max_tokens: opts.maxTokens || 4096,
      messages: opts.messages,
    };
    if (opts.system) body.system = opts.system;
    if (opts.tools && opts.tools.length) body.tools = opts.tools;
    // Adaptive thinking + effort only on models that support them.
    if (opts.thinking !== false && ADVANCED_MODELS.has(model)) {
      body.thinking = { type: "adaptive" };
      body.output_config = { effort: opts.effort || "high" };
    }

    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (err) {
      throw new Error(`Network error reaching Claude: ${err.message}`, { cause: err });
    }

    if (!res.ok) {
      let detail;
      try {
        const j = await res.json();
        detail = (j.error && j.error.message) || JSON.stringify(j);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new Error(`Claude API ${res.status}: ${detail || res.statusText}`);
    }
    return res.json();
  }

  /** Minimal round-trip to validate the key and surface the live model id. */
  async function testConnection() {
    const message = await callMessages({
      messages: [{ role: "user", content: "Reply with the single word: OK" }],
      maxTokens: 16,
      thinking: false,
    });
    return { ok: true, model: message.model, text: extractText(message) };
  }

  // ---------- Intelligence brief ----------

  // Compact, prompt-friendly serialization of the target contact.
  function fmtContact(c) {
    const lines = [`Name: ${LIB.displayName(c)}`];
    if (c.organization) lines.push(`Organization: ${c.organization}`);
    if (c.role) lines.push(`Role/title: ${c.role}`);
    const loc = [c.city, c.state, c.country].filter(Boolean).join(", ");
    if (loc) lines.push(`Location: ${loc}`);
    const channels = [];
    if (c.email) channels.push(`email ${c.email}`);
    if (c.phone) channels.push(`phone ${c.phone}`);
    if (c.website) channels.push(`web ${c.website}`);
    if (c.whatsapp) channels.push(`WhatsApp ${c.whatsapp}`);
    if (c.telegram) channels.push(`Telegram ${c.telegram}`);
    if (channels.length) lines.push(`Contact: ${channels.join("; ")}`);
    if (c.tags.length) lines.push(`Tags: ${c.tags.map(t => LIB.TAG_LABELS[t] || t).join(", ")}`);
    lines.push(`Donation status: ${LIB.statusLabel(LIB.DONATION_STATUSES, c.donationStatus)}; total raised ${LIB.formatMoney(LIB.donationTotal(c))}`);
    lines.push(`Endorsement status: ${LIB.statusLabel(LIB.ENDORSEMENT_STATUSES, c.endorsementStatus)}`);
    lines.push(`Internal priority: ${c.priority}`);
    if (c.notes) lines.push(`Staff notes: ${c.notes}`);
    if (c.interactions.length) {
      const recent = c.interactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
        .map(i => `${i.date} ${LIB.statusLabel(LIB.INTERACTION_TYPES, i.type)}${i.note ? ` — ${i.note}` : ""}`);
      lines.push(`Recent interactions: ${recent.join(" | ")}`);
    }
    return lines.join("\n");
  }

  // One-line-per-contact roster of everyone else, for network-leverage analysis.
  function fmtRoster(target, contacts) {
    return contacts
      .filter(c => c.id !== target.id)
      .map(c => {
        const tags = c.tags.map(t => LIB.TAG_LABELS[t] || t).join(", ");
        return `- ${LIB.displayName(c)}${c.organization ? ` (${c.organization})` : ""}${c.role ? `, ${c.role}` : ""}${tags ? ` [${tags}]` : ""}`;
      })
      .join("\n");
  }

  const BRIEF_INSTRUCTIONS = `Write the brief in Markdown using exactly these "##" sections:

## Snapshot
Who they are right now — current role, employer, affiliations. Verify against the web; flag anything you could not confirm.

## Why they matter to the campaign
Their concrete value: fundraising capacity, endorsement weight, volunteer/organizing pull, media reach, or influence.

## Network & leverage
Who they can plausibly connect Michael to, and which of OUR other contacts overlap with them. Map realistic introduction paths. Label each path INFERRED or SPECULATIVE and state what it rests on.

## How to approach
The ask, the right messenger, timing, talking points, and what to avoid. If they are marked do-not-contact, say so and recommend no outreach.

## Devil's advocate
Argue against prioritizing this person. Biggest risks, what could backfire, and what would change your assessment.

## Recommended next step
One concrete action, and why.

## Sources
The sources you used, with dates — or a clear statement of what you could not verify.

Keep it tight and decision-useful. Apply the VERIFIED / INFERRED / SPECULATIVE labels from your protocol.`;

  // Pull web-search result URLs out of the response for a "sources" list.
  function extractSources(message) {
    const seen = new Set();
    const out = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (typeof node.url === "string" && /^https?:\/\//.test(node.url) && !seen.has(node.url)) {
        seen.add(node.url);
        out.push({ url: node.url, title: typeof node.title === "string" && node.title ? node.title : node.url });
      }
      for (const k of Object.keys(node)) walk(node[k]);
    };
    walk(message.content);
    return out.slice(0, 15);
  }

  /** Generate a strategic brief for one contact, using web search + the whole
      roster as context. Loops on pause_turn so server-side search can finish. */
  async function generateBrief({ contact, contacts, signal }) {
    const cfg = getConfig();
    const tools = cfg.webSearch ? [WEB_SEARCH_TOOL] : undefined;
    const linked = LIB.connectionsOf(contacts, contact).map(c => LIB.displayName(c));

    const userText = [
      "Produce a strategic intelligence brief on the following contact for Michael's congressional campaign.",
      "",
      "=== TARGET CONTACT ===",
      fmtContact(contact),
      linked.length ? `\nKnown connections in our database: ${linked.join(", ")}` : "",
      "",
      "=== OUR OTHER CONTACTS (for network-leverage analysis) ===",
      fmtRoster(contact, contacts) || "(none yet)",
      "",
      BRIEF_INSTRUCTIONS,
    ].filter(Boolean).join("\n");

    let messages = [{ role: "user", content: userText }];
    let message;
    let guard = 0;
    do {
      message = await callMessages({
        system: buildSystem(),
        messages,
        tools,
        maxTokens: 4096,
        effort: "high",
        signal,
      });
      if (message.stop_reason === "pause_turn") {
        messages = messages.concat([{ role: "assistant", content: message.content }]);
      }
    } while (message.stop_reason === "pause_turn" && ++guard < 8);

    return {
      text: extractText(message),
      model: message.model,
      sources: extractSources(message),
      stopReason: message.stop_reason,
    };
  }

  globalThis.CRMAI = {
    MODELS, DEFAULT_MODEL, DEFAULT_PROTOCOL, WEB_SEARCH_TOOL,
    getConfig, saveConfig, isConfigured, buildSystem,
    callMessages, testConnection, extractText, generateBrief,
  };
})();
