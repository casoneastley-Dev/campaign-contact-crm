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
    selfCritique: "campaign-crm:ai:selfcritique",
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

  // Default campaign/district knowledge base — FL-22, current as of June 2026.
  // Editable in Settings; VERIFY items are for the AI to resolve via web search.
  const DEFAULT_KNOWLEDGE = `DISTRICT: Florida's 22nd Congressional District (FL-22) — REDRAWN in the 2026 mid-decade redistricting; new lines effective for the 2026 elections.

REDISTRICTING (2026): DeSantis proposed the new congressional map ~Apr 27, 2026; the Legislature passed it Apr 29, 2026; signed into law May 4, 2026. Statewide it is engineered for ~24R-4D across 28 seats and explicitly targeted 4 Democratic-held seats including FL-22. Challenged under the 2010 Fair Districts Amendment; on May 26, 2026 a judge ruled the map stays in effect for the 2026 elections pending litigation.

PARTISAN LEAN (KEY FACT): The redraw flipped FL-22 from Democratic-leaning to REPUBLICAN-leaning — roughly R+10 by 2024 presidential results. Treat the new FL-22 as a GOP-favored, effectively open seat for 2026. WARNING: some references (e.g. Ballotpedia's FL-22 page) still show the OLD district's D+4 Cook PVI and old boundaries — do not use pre-redraw figures for the current race.

SEAT STATUS: Lois Frankel (D), the prior FL-22 incumbent, has said she will run in the NEW FL-23, not the redrawn FL-22.

GEOGRAPHY (VERIFY against the enacted map — sources conflict): Old (2023-27) FL-22 was the Atlantic coastline from northern Broward to northern Palm Beach (West Palm Beach, Palm Beach Gardens, Boca Raton, Deerfield Beach, Coconut Creek, much of Fort Lauderdale). The new (2026) FL-22 is redrawn more Republican; one report describes it stretching from Broward toward the outskirts of Naples. Confirm exact counties/cities via web search before relying on geography.

CANDIDATES (VERIFY — listings stale as of June 2026): Older listings show a Democratic primary of Frankel, Ian Blake, and Victoria Doyle, which conflicts with Frankel moving to FL-23. The Republican field for the now-GOP-leaning seat is not yet confirmed. Check the Florida Division of Elections (dos.elections.myflorida.com) for the authoritative candidate list.

KEY DATES: Primary Aug 18, 2026; General Nov 3, 2026.

REGION CONTEXT (South Florida baseline — confirm which apply to the new lines): property-insurance costs, housing affordability, climate/flooding/sea-level rise, large Jewish/Israel-engaged constituency, seniors/Medicare, immigration.`;

  // ---------- Config ----------

  function getConfig() {
    return {
      apiKey: localStorage.getItem(STORE.apiKey) || "",
      model: localStorage.getItem(STORE.model) || DEFAULT_MODEL,
      // Web search defaults ON; only "off" disables it.
      webSearch: localStorage.getItem(STORE.webSearch) !== "off",
      protocol: localStorage.getItem(STORE.protocol) || DEFAULT_PROTOCOL,
      knowledge: localStorage.getItem(STORE.knowledge) || DEFAULT_KNOWLEDGE,
      // Self-critique pass on briefs defaults ON; only "off" disables it.
      selfCritique: localStorage.getItem(STORE.selfCritique) !== "off",
    };
  }

  function saveConfig(cfg) {
    if (cfg.apiKey != null) localStorage.setItem(STORE.apiKey, String(cfg.apiKey).trim());
    if (cfg.model != null) localStorage.setItem(STORE.model, cfg.model);
    if (cfg.webSearch != null) localStorage.setItem(STORE.webSearch, cfg.webSearch ? "on" : "off");
    if (cfg.selfCritique != null) localStorage.setItem(STORE.selfCritique, cfg.selfCritique ? "on" : "off");
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
    const socials = [];
    if (c.twitter) socials.push(`X/Twitter ${c.twitter}`);
    if (c.instagram) socials.push(`Instagram ${c.instagram}`);
    if (c.facebook) socials.push(`Facebook ${c.facebook}`);
    if (c.linkedin) socials.push(`LinkedIn ${c.linkedin}`);
    if (c.tiktok) socials.push(`TikTok ${c.tiktok}`);
    if (socials.length) lines.push(`Social media (public profiles — analyze reach, audience, and content angles): ${socials.join("; ")}`);
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

    const system = buildSystem();

    // One model turn; loops on pause_turn so server-side web search can finish.
    const runTurn = async (messages) => {
      let msgs = messages;
      let message;
      let guard = 0;
      do {
        message = await callMessages({
          system, messages: msgs, tools, maxTokens: 4096, effort: "high", signal,
        });
        if (message.stop_reason === "pause_turn") {
          msgs = msgs.concat([{ role: "assistant", content: message.content }]);
        }
      } while (message.stop_reason === "pause_turn" && ++guard < 8);
      return message;
    };

    const messages = [{ role: "user", content: userText }];
    let message = await runTurn(messages);
    let sources = extractSources(message);
    const draft = extractText(message);

    // Self-critique pass ("second-guess and fact-check itself before the output"):
    // the model reviews its own draft against the protocol, re-verifies weak
    // claims (searching again if needed), and emits the corrected final brief.
    if (cfg.selfCritique && draft) {
      const critiqued = await runTurn(messages.concat([
        { role: "assistant", content: draft },
        { role: "user", content:
          "Before this goes to the candidate, review your own draft against your operating protocol: " +
          "(1) confirm every claim labeled VERIFIED actually rests on a cited source — search again if unsure; " +
          "(2) downgrade anything overstated to INFERRED or SPECULATIVE; " +
          "(3) check for stale or outdated facts given today's date; " +
          "(4) strengthen the devil's-advocate section if it is soft; " +
          "(5) fix any errors. " +
          "Then output ONLY the corrected final brief in the same Markdown format — no meta-commentary about the review." },
      ]));
      const finalText = extractText(critiqued);
      if (finalText) {
        message = critiqued;
        // Merge sources from both passes, deduped by URL.
        const seen = new Set(sources.map(s => s.url));
        for (const s of extractSources(critiqued)) {
          if (!seen.has(s.url)) { seen.add(s.url); sources.push(s); }
        }
        sources = sources.slice(0, 15);
      }
    }

    return {
      text: extractText(message),
      model: message.model,
      sources,
      stopReason: message.stop_reason,
    };
  }

  // ---------- Strategy console (chat) ----------

  // Full roster with connections, for whole-network reasoning. One line each.
  function fmtRosterFull(contacts) {
    return contacts.map(c => {
      const bits = [LIB.displayName(c)];
      if (c.organization) bits.push(`org: ${c.organization}`);
      if (c.role) bits.push(`role: ${c.role}`);
      const loc = [c.city, c.state].filter(Boolean).join(", ");
      if (loc) bits.push(`loc: ${loc}`);
      const tags = c.tags.map(t => LIB.TAG_LABELS[t] || t).join(", ");
      if (tags) bits.push(`tags: ${tags}`);
      if (c.donationStatus !== "none") {
        bits.push(`donor: ${LIB.statusLabel(LIB.DONATION_STATUSES, c.donationStatus)} (${LIB.formatMoney(LIB.donationTotal(c))})`);
      }
      if (c.endorsementStatus !== "none") bits.push(`endorsement: ${LIB.statusLabel(LIB.ENDORSEMENT_STATUSES, c.endorsementStatus)}`);
      const linked = LIB.connectionsOf(contacts, c).map(x => LIB.displayName(x));
      if (linked.length) bits.push(`connections: ${linked.join("; ")}`);
      if (c.notes) bits.push(`notes: ${c.notes}`);
      return `- ${bits.join(" | ")}`;
    }).join("\n");
  }

  const STRATEGY_INSTRUCTIONS = `You are the strategy console for Michael's congressional campaign. The full contact database is provided below. Answer staff questions about how to leverage these relationships: event planning and guest pairing, fundraising, endorsements, introductions and network paths to specific people, coalition-building, and content/marketing ideas.

How to answer:
- Reason over the contacts in the database and name specific people from it when relevant.
- For "who could connect me to X" questions, map realistic introduction paths through the database and label each step VERIFIED / INFERRED / SPECULATIVE.
- Use web search for anything current, or about people/organizations not in the database.
- Be concrete and decision-useful: give names, the specific ask, the sequence of steps, and the reasoning. Apply your devil's-advocate and fact-checking protocol before answering.`;

  function buildStrategySystem(contacts) {
    const roster = fmtRosterFull(contacts) || "(no contacts in the database yet)";
    return buildSystem(`${STRATEGY_INSTRUCTIONS}\n\n=== CONTACT DATABASE ===\n${roster}`);
  }

  /** Multi-turn strategy chat. `messages` is the running [{role,content}] history
      (text turns). Loops on pause_turn so server-side web search can finish. */
  async function chatStrategy({ messages, contacts, signal }) {
    const cfg = getConfig();
    const tools = cfg.webSearch ? [WEB_SEARCH_TOOL] : undefined;
    const system = buildStrategySystem(contacts);

    let msgs = messages.slice();
    let message;
    let guard = 0;
    do {
      message = await callMessages({
        system, messages: msgs, tools, maxTokens: 4096, effort: "high", signal,
      });
      if (message.stop_reason === "pause_turn") {
        msgs = msgs.concat([{ role: "assistant", content: message.content }]);
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
    MODELS, DEFAULT_MODEL, DEFAULT_PROTOCOL, DEFAULT_KNOWLEDGE, WEB_SEARCH_TOOL,
    getConfig, saveConfig, isConfigured, buildSystem,
    callMessages, testConnection, extractText, generateBrief, chatStrategy,
  };
})();
