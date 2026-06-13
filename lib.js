/* Pure, DOM-free domain logic for the Campaign Contact CRM.
   Loaded in the browser before app.js (exposes globalThis.CRMLib)
   and require()-able from Node for unit tests. */
(() => {
  "use strict";

  const SCHEMA_VERSION = 4;

  const TAGS = [
    { id: "donor",                 label: "Donor" },
    { id: "staff",                 label: "Staff member" },
    { id: "political-networking",  label: "Political networking" },
    { id: "business-networking",   label: "Business networking" },
    { id: "endorser",              label: "Endorser" },
    { id: "potential-endorsement", label: "Potential endorsement" },
    { id: "volunteer",             label: "Volunteer" },
    { id: "media",                 label: "Media" },
    { id: "consultant",            label: "Consultant" },
    { id: "vendor",                label: "Vendor" },
    { id: "do-not-contact",        label: "Do not contact" },
  ];
  const TAG_LABELS = Object.fromEntries(TAGS.map(t => [t.id, t.label]));

  const DONATION_STATUSES = [
    { id: "none",      label: "None" },
    { id: "asked",     label: "Asked" },
    { id: "pledged",   label: "Pledged" },
    { id: "donated",   label: "Donated" },
    { id: "recurring", label: "Recurring donor" },
    { id: "declined",  label: "Declined" },
  ];

  const ENDORSEMENT_STATUSES = [
    { id: "none",      label: "None" },
    { id: "potential", label: "Potential" },
    { id: "asked",     label: "Asked" },
    { id: "endorsed",  label: "Endorsed" },
    { id: "declined",  label: "Declined" },
  ];

  const PRIORITIES = [
    { id: "high",   label: "High" },
    { id: "normal", label: "Normal" },
    { id: "low",    label: "Low" },
  ];

  const INTERACTION_TYPES = [
    { id: "call",    label: "Call" },
    { id: "text",    label: "Text" },
    { id: "email",   label: "Email" },
    { id: "meeting", label: "Meeting" },
    { id: "event",   label: "Event" },
    { id: "other",   label: "Other" },
  ];

  // FEC individual per-election contribution limit for the 2025–26 cycle.
  // Verify against fec.gov each cycle; this powers the "at limit" warning only.
  const DEFAULT_CONTRIBUTION_LIMIT = 3500;

  const STRING_FIELDS = [
    "firstName", "lastName", "organization", "role",
    "email", "phone", "website", "whatsapp", "telegram",
    "street", "city", "state", "postalCode", "country", "notes",
  ];

  // ---------- Identity ----------

  function displayName(c) {
    const person = [c.firstName, c.lastName].filter(Boolean).join(" ");
    return person || c.organization || "";
  }

  function subLine(c) {
    const person = [c.firstName, c.lastName].filter(Boolean).join(" ");
    // If the org is the headline, show role only; otherwise "Role, Org".
    if (!person) return c.role;
    return [c.role, c.organization].filter(Boolean).join(", ");
  }

  function statusLabel(list, id) {
    const s = list.find(x => x.id === id);
    return s ? s.label : id;
  }

  // ---------- Sanitizing & links ----------

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function telHref(phone) {
    const cleaned = phone.replace(/[^\d+]/g, "");
    return cleaned ? `tel:${cleaned}` : null;
  }

  function waHref(number) {
    const digits = number.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  }

  function tgHref(handle) {
    const name = handle.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "");
    return /^[A-Za-z0-9_]{3,}$/.test(name) ? `https://t.me/${name}` : null;
  }

  function webHref(url) {
    const u = url.trim();
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (/^[\w-]+(\.[\w-]+)+/.test(u)) return `https://${u}`;
    return null;
  }

  // ---------- Normalization ----------

  function isIsoDate(v) {
    return typeof v === "string" && !Number.isNaN(Date.parse(v));
  }

  function makeId() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeInteraction(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!isIsoDate(raw.date)) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
      type: INTERACTION_TYPES.some(t => t.id === raw.type) ? raw.type : "other",
      date: raw.date,
      note: typeof raw.note === "string" ? raw.note.trim() : "",
    };
  }

  function normalizeDonation(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!isIsoDate(raw.date)) return null;
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
      amount: Math.round(amount * 100) / 100,
      date: raw.date,
      note: typeof raw.note === "string" ? raw.note.trim() : "",
    };
  }

  /** Coerce any imported/stored object into a well-formed contact, or null.
      Handles schema v1 records (no priority/followUpDate/interactions/donations). */
  function normalizeContact(raw) {
    if (!raw || typeof raw !== "object") return null;
    const c = { id: typeof raw.id === "string" && raw.id ? raw.id : makeId() };
    for (const f of STRING_FIELDS) {
      c[f] = typeof raw[f] === "string" ? raw[f].trim() : "";
    }
    c.tags = Array.isArray(raw.tags)
      ? raw.tags.filter(t => TAG_LABELS[t])
      : [];
    c.donationStatus = DONATION_STATUSES.some(s => s.id === raw.donationStatus)
      ? raw.donationStatus : "none";
    c.endorsementStatus = ENDORSEMENT_STATUSES.some(s => s.id === raw.endorsementStatus)
      ? raw.endorsementStatus : "none";
    c.priority = PRIORITIES.some(p => p.id === raw.priority) ? raw.priority : "normal";
    c.followUpDate = typeof raw.followUpDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.followUpDate)
      ? raw.followUpDate : "";
    c.interactions = Array.isArray(raw.interactions)
      ? raw.interactions.map(normalizeInteraction).filter(Boolean) : [];
    c.donations = Array.isArray(raw.donations)
      ? raw.donations.map(normalizeDonation).filter(Boolean) : [];
    // Contact-to-contact links (1st-degree connections). Stored as ids; the
    // referenced contact may not exist yet, so dangling ids are pruned at read
    // time by connectionsOf rather than here. Self-links are dropped.
    c.connections = Array.isArray(raw.connections)
      ? [...new Set(raw.connections.filter(id => typeof id === "string" && id && id !== c.id))]
      : [];
    // AI-generated strategic brief (saved so it persists and exports). Null until generated.
    c.aiBrief = (raw.aiBrief && typeof raw.aiBrief === "object" && typeof raw.aiBrief.text === "string" && raw.aiBrief.text)
      ? {
          text: raw.aiBrief.text,
          model: typeof raw.aiBrief.model === "string" ? raw.aiBrief.model : "",
          generatedAt: isIsoDate(raw.aiBrief.generatedAt) ? raw.aiBrief.generatedAt : new Date().toISOString(),
        }
      : null;
    c.createdAt = isIsoDate(raw.createdAt) ? raw.createdAt : new Date().toISOString();
    c.updatedAt = isIsoDate(raw.updatedAt) ? raw.updatedAt : c.createdAt;
    if (!displayName(c)) return null; // must have some identity
    return c;
  }

  // ---------- Fundraising & follow-ups ----------

  function donationTotal(c) {
    return c.donations.reduce((sum, d) => sum + d.amount, 0);
  }

  function formatMoney(n) {
    return "$" + n.toLocaleString("en-US", {
      minimumFractionDigits: n % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  /** Most recent interaction date (ISO string) or null. */
  function lastInteractionDate(c) {
    let last = "";
    for (const i of c.interactions) if (i.date > last) last = i.date;
    return last || null;
  }

  /** "overdue" | "today" | "scheduled" | null, comparing YYYY-MM-DD strings. */
  function followUpStatus(c, today) {
    if (!c.followUpDate) return null;
    if (c.followUpDate < today) return "overdue";
    if (c.followUpDate === today) return "today";
    return "scheduled";
  }

  /** Contacts whose email or phone matches the candidate's (excluding itself). */
  function findDuplicates(contacts, candidate, excludeId) {
    const email = (candidate.email || "").trim().toLowerCase();
    const phone = (candidate.phone || "").replace(/\D/g, "");
    return contacts.filter(c => {
      if (c.id === excludeId) return false;
      const emailMatch = email && c.email.trim().toLowerCase() === email;
      const phoneMatch = phone.length >= 7 && c.phone.replace(/\D/g, "") === phone;
      return emailMatch || phoneMatch;
    });
  }

  /** Headline numbers for the dashboard. `today` is a YYYY-MM-DD string. */
  function campaignStats(contacts, today) {
    let raised = 0, donors = 0, endorsed = 0, volunteers = 0, dueFollowUps = 0;
    for (const c of contacts) {
      const total = donationTotal(c);
      raised += total;
      if (total > 0 || c.donationStatus === "donated" || c.donationStatus === "recurring") donors++;
      if (c.endorsementStatus === "endorsed") endorsed++;
      if (c.tags.includes("volunteer")) volunteers++;
      const fu = followUpStatus(c, today);
      if (fu === "overdue" || fu === "today") dueFollowUps++;
    }
    return { total: contacts.length, raised, donors, endorsed, volunteers, dueFollowUps };
  }

  // ---------- Relationships (free, no AI) ----------

  function connectionIds(contact) {
    return Array.isArray(contact.connections) ? contact.connections : [];
  }

  /** Resolve a contact's 1st-degree links as contact objects. Treats links as
      bidirectional: includes anyone this contact lists, or who lists this
      contact. Dangling ids (deleted contacts) are dropped. */
  function connectionsOf(contacts, contact) {
    const byId = new Map(contacts.map(c => [c.id, c]));
    const ids = new Set(connectionIds(contact).filter(id => byId.has(id)));
    for (const other of contacts) {
      if (other.id !== contact.id && connectionIds(other).includes(contact.id)) {
        ids.add(other.id);
      }
    }
    ids.delete(contact.id);
    return [...ids].map(id => byId.get(id)).filter(Boolean);
  }

  /** Why two contacts plausibly know each other: shared org / tag / city.
      Returns [{type, label}], strongest signal (organization) first. */
  function sharedAffiliations(a, b) {
    const reasons = [];
    const orgA = a.organization.trim().toLowerCase();
    if (orgA && b.organization.trim().toLowerCase() === orgA) {
      reasons.push({ type: "organization", label: a.organization.trim() });
    }
    for (const t of a.tags) {
      if (b.tags.includes(t)) reasons.push({ type: "tag", label: TAG_LABELS[t] || t });
    }
    const cityA = a.city.trim().toLowerCase();
    if (cityA && b.city.trim().toLowerCase() === cityA) {
      reasons.push({ type: "city", label: a.city.trim() });
    }
    return reasons;
  }

  const AFFINITY_WEIGHTS = { organization: 3, tag: 2, city: 1 };

  /** Contacts not already linked to `contact` that share an affiliation,
      ranked by signal strength. Returns [{contact, reasons, score}]. */
  function suggestedConnections(contacts, contact, limit = 5) {
    const linked = new Set(connectionsOf(contacts, contact).map(c => c.id));
    const out = [];
    for (const other of contacts) {
      if (other.id === contact.id || linked.has(other.id)) continue;
      if (other.tags.includes("do-not-contact")) continue;
      const reasons = sharedAffiliations(contact, other);
      if (!reasons.length) continue;
      const score = reasons.reduce((s, r) => s + (AFFINITY_WEIGHTS[r.type] || 1), 0);
      out.push({ contact: other, reasons, score });
    }
    out.sort((a, b) => b.score - a.score || displayName(a.contact).localeCompare(displayName(b.contact)));
    return out.slice(0, limit);
  }

  /** Shortest introduction chain between two contacts over the link graph,
      as an array of contacts [from, ...intermediaries, to], or null if there's
      no path. This is the "who's my best path to X" finder. */
  function bestPath(contacts, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return null;
    const byId = new Map(contacts.map(c => [c.id, c]));
    if (!byId.has(fromId) || !byId.has(toId)) return null;

    const adj = new Map();
    const link = (a, b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); };
    for (const c of contacts) {
      for (const id of connectionIds(c)) {
        if (byId.has(id)) { link(c.id, id); link(id, c.id); }
      }
    }

    const prev = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === toId) break;
      for (const nb of (adj.get(cur) || [])) {
        if (!prev.has(nb)) { prev.set(nb, cur); queue.push(nb); }
      }
    }
    if (!prev.has(toId)) return null;
    const path = [];
    for (let at = toId; at !== null; at = prev.get(at)) path.unshift(byId.get(at));
    return path;
  }

  // ---------- CSV ----------

  /** Quote a CSV cell; prefix formula-leading chars to block spreadsheet injection. */
  function csvCell(value) {
    let s = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
    return s;
  }

  const CSV_COLUMNS = [
    "id", "firstName", "lastName", "organization", "role",
    "email", "phone", "website", "whatsapp", "telegram",
    "street", "city", "state", "postalCode", "country",
    "tags", "donationStatus", "endorsementStatus", "priority", "followUpDate",
    "totalDonated", "donationCount", "lastInteraction", "interactionCount",
    "connectionCount", "briefGeneratedAt", "notes", "createdAt", "updatedAt",
  ];

  function csvValue(c, col) {
    switch (col) {
      case "tags": return c.tags.join("; ");
      case "totalDonated": return donationTotal(c) ? donationTotal(c).toFixed(2) : "";
      case "donationCount": return c.donations.length || "";
      case "lastInteraction": return lastInteractionDate(c) || "";
      case "interactionCount": return c.interactions.length || "";
      case "connectionCount": return (Array.isArray(c.connections) ? c.connections.length : 0) || "";
      case "briefGeneratedAt": return c.aiBrief ? c.aiBrief.generatedAt : "";
      default: return c[col];
    }
  }

  /** Render contacts as a CSV string (CRLF rows, header first, no BOM). */
  function contactsToCsv(contacts) {
    const rows = [CSV_COLUMNS.join(",")];
    for (const c of contacts) {
      rows.push(CSV_COLUMNS.map(col => csvCell(csvValue(c, col))).join(","));
    }
    return rows.join("\r\n");
  }

  const CRMLib = {
    SCHEMA_VERSION, TAGS, TAG_LABELS, DONATION_STATUSES, ENDORSEMENT_STATUSES,
    PRIORITIES, INTERACTION_TYPES, DEFAULT_CONTRIBUTION_LIMIT,
    STRING_FIELDS, CSV_COLUMNS,
    displayName, subLine, statusLabel,
    escapeHtml, telHref, waHref, tgHref, webHref,
    isIsoDate, makeId, normalizeContact, normalizeInteraction, normalizeDonation,
    donationTotal, formatMoney, lastInteractionDate, followUpStatus,
    findDuplicates, campaignStats,
    connectionsOf, sharedAffiliations, suggestedConnections, bestPath,
    csvCell, contactsToCsv,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = CRMLib;
  } else {
    globalThis.CRMLib = CRMLib;
  }
})();
