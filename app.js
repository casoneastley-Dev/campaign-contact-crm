/* Campaign Contact CRM — UI layer (vanilla JS, no build step).
   Pure domain logic lives in lib.js (globalThis.CRMLib).
   Data lives in localStorage on this device only. */
(() => {
  "use strict";

  const {
    SCHEMA_VERSION, TAGS, TAG_LABELS, DONATION_STATUSES, ENDORSEMENT_STATUSES,
    PRIORITIES, INTERACTION_TYPES, DEFAULT_CONTRIBUTION_LIMIT,
    STRING_FIELDS, displayName, subLine, statusLabel, escapeHtml,
    telHref, waHref, tgHref, webHref, makeId, normalizeContact,
    donationTotal, formatMoney, lastInteractionDate, followUpStatus,
    findDuplicates, campaignStats, contactsToCsv,
    connectionsOf, suggestedConnections,
  } = globalThis.CRMLib;

  const AI = globalThis.CRMAI;

  const STORAGE_KEY = "campaign-crm:contacts:v1";
  const LIMIT_KEY = "campaign-crm:contribution-limit";

  // ---------- Storage ----------

  const SAMPLE_CONTACTS = [
    { id:"sample-001", firstName:"Maria", lastName:"Lopez", organization:"Lopez Family Dental", role:"Owner", email:"maria.lopez@example.com", phone:"+1 555 010 2030", website:"lopezfamilydental.example.com", whatsapp:"+1 555 010 2030", telegram:"", street:"412 Birch Ave", city:"Riverside", state:"CA", postalCode:"92501", country:"USA", notes:"Max-out donor last cycle. Prefers email. Hosts an annual backyard fundraiser in September.", tags:["donor","business-networking"], donationStatus:"recurring", endorsementStatus:"none", priority:"high", followUpDate:"2026-06-25", interactions:[{id:"i-001a",type:"call",date:"2026-05-28",note:"Confirmed September fundraiser date; wants the candidate for 2 hours."},{id:"i-001b",type:"meeting",date:"2026-03-14",note:"Coffee at her office. Interested in small-business tax platform."}], donations:[{id:"d-001a",amount:1000,date:"2026-02-01",note:"Initial contribution"},{id:"d-001b",amount:1000,date:"2026-04-01",note:""},{id:"d-001c",amount:1500,date:"2026-06-01",note:"Maxed out for the primary"}], connections:["sample-004"], createdAt:"2026-01-12T18:30:00.000Z", updatedAt:"2026-06-01T16:05:00.000Z" },
    { id:"sample-002", firstName:"Devon", lastName:"Carter", organization:"Campaign HQ", role:"Campaign manager", email:"devon@example.org", phone:"555-010-4111", website:"", whatsapp:"+1 555 010 4111", telegram:"@devoncarter", street:"88 Main St, Suite 2", city:"Riverside", state:"CA", postalCode:"92501", country:"USA", notes:"Full-time staff. Primary point of contact for scheduling and press requests.", tags:["staff"], donationStatus:"none", endorsementStatus:"none", priority:"normal", followUpDate:"", interactions:[], donations:[], connections:["sample-001","sample-003","sample-007","sample-008"], createdAt:"2026-01-05T09:00:00.000Z", updatedAt:"2026-06-01T11:20:00.000Z" },
    { id:"sample-003", firstName:"Gloria", lastName:"Nakamura", organization:"County Democratic Committee", role:"County chair", email:"gnakamura@example.org", phone:"555-010-7788", website:"countydems.example.org", whatsapp:"", telegram:"", street:"", city:"Riverside", state:"CA", postalCode:"", country:"USA", notes:"Key gatekeeper for the county party endorsement process. Monthly committee meetings, first Tuesday.", tags:["political-networking","potential-endorsement"], donationStatus:"none", endorsementStatus:"asked", priority:"high", followUpDate:"2026-06-05", interactions:[{id:"i-003a",type:"meeting",date:"2026-05-05",note:"Presented at the committee meeting. She wants follow-up before the June endorsement vote."},{id:"i-003b",type:"email",date:"2026-04-12",note:"Sent endorsement questionnaire."}], donations:[], createdAt:"2026-02-02T20:15:00.000Z", updatedAt:"2026-05-14T19:45:00.000Z" },
    { id:"sample-004", firstName:"Priya", lastName:"Raman", organization:"Riverside Chamber of Commerce", role:"President", email:"praman@example.com", phone:"555-010-3344", website:"riversidechamber.example.com", whatsapp:"", telegram:"", street:"200 Commerce Plaza", city:"Riverside", state:"CA", postalCode:"92502", country:"USA", notes:"Invited candidate to speak at the quarterly business breakfast. Wants to hear small-business platform first.", tags:["business-networking"], donationStatus:"asked", endorsementStatus:"potential", priority:"high", followUpDate:"2026-06-11", interactions:[{id:"i-004a",type:"call",date:"2026-05-30",note:"Discussed breakfast agenda. Decide on speaking slot by June 11."}], donations:[], createdAt:"2026-02-20T17:00:00.000Z", updatedAt:"2026-05-30T15:30:00.000Z" },
    { id:"sample-005", firstName:"Ray", lastName:"Whitfield", organization:"Ironworkers Local 229", role:"President", email:"rwhitfield@example.org", phone:"555-010-9090", website:"local229.example.org", whatsapp:"", telegram:"", street:"75 Foundry Rd", city:"Riverside", state:"CA", postalCode:"92503", country:"USA", notes:"Endorsed in April. Local can provide volunteers for the GOTV weekend and a quote for mailers.", tags:["endorser","political-networking"], donationStatus:"donated", endorsementStatus:"endorsed", priority:"normal", followUpDate:"2026-08-01", interactions:[{id:"i-005a",type:"event",date:"2026-04-18",note:"Endorsement announcement at the union hall. Great turnout."},{id:"i-005b",type:"call",date:"2026-03-22",note:"Walked through the labor platform ahead of the executive board vote."}], donations:[{id:"d-005a",amount:1000,date:"2026-04-20",note:"PAC contribution after endorsement"}], connections:["sample-003"], createdAt:"2026-03-01T14:00:00.000Z", updatedAt:"2026-04-20T13:10:00.000Z" },
    { id:"sample-006", firstName:"Hannah", lastName:"Beck", organization:"Riverside Teachers Association", role:"Political director", email:"hbeck@example.org", phone:"555-010-6262", website:"", whatsapp:"", telegram:"@hannahbeck", street:"", city:"Riverside", state:"CA", postalCode:"", country:"USA", notes:"Endorsement questionnaire submitted 5/20. Interview scheduled for late June. Education plan is the deciding issue.", tags:["potential-endorsement","political-networking"], donationStatus:"none", endorsementStatus:"asked", priority:"normal", followUpDate:"2026-06-24", interactions:[{id:"i-006a",type:"email",date:"2026-05-20",note:"Submitted questionnaire. Interview tentatively June 24."}], donations:[], createdAt:"2026-03-15T16:45:00.000Z", updatedAt:"2026-05-20T18:00:00.000Z" },
    { id:"sample-007", firstName:"Marcus", lastName:"Okafor", organization:"", role:"Canvassing team lead", email:"marcus.okafor@example.com", phone:"555-010-8123", website:"", whatsapp:"+1 555 010 8123", telegram:"", street:"19 Elm Ct", city:"Riverside", state:"CA", postalCode:"92504", country:"USA", notes:"Star volunteer — led 14 canvass shifts. Available weekends. Also donates monthly at a small-dollar level.", tags:["volunteer","donor"], donationStatus:"recurring", endorsementStatus:"none", priority:"normal", followUpDate:"", interactions:[{id:"i-007a",type:"event",date:"2026-06-07",note:"Led Saturday canvass — 212 doors knocked."},{id:"i-007b",type:"text",date:"2026-05-31",note:"Confirmed weekend availability through June."}], donations:[{id:"d-007a",amount:25,date:"2026-04-15",note:"Monthly"},{id:"d-007b",amount:25,date:"2026-05-15",note:"Monthly"},{id:"d-007c",amount:25,date:"2026-06-05",note:"Monthly"}], createdAt:"2026-02-08T19:30:00.000Z", updatedAt:"2026-06-07T21:00:00.000Z" },
    { id:"sample-008", firstName:"Elena", lastName:"Vasquez", organization:"Riverside Tribune", role:"Political reporter", email:"evasquez@example.com", phone:"555-010-5577", website:"tribune.example.com", whatsapp:"", telegram:"@evasquez_trib", street:"", city:"Riverside", state:"CA", postalCode:"", country:"USA", notes:"Covers the city council race. Fair coverage so far. Deadline is 4pm for next-day print. Route press releases through Devon.", tags:["media"], donationStatus:"none", endorsementStatus:"none", priority:"normal", followUpDate:"", interactions:[{id:"i-008a",type:"call",date:"2026-05-30",note:"Background interview on housing policy piece running next week."}], donations:[], createdAt:"2026-01-28T22:10:00.000Z", updatedAt:"2026-05-30T20:25:00.000Z" },
    { id:"sample-009", firstName:"Jordan", lastName:"Pike", organization:"Pike Digital Strategies", role:"Principal consultant", email:"jordan@example.com", phone:"555-010-2244", website:"pikedigital.example.com", whatsapp:"", telegram:"", street:"501 Startup Way, Floor 3", city:"Los Angeles", state:"CA", postalCode:"90014", country:"USA", notes:"Retained for digital ads and email program through election day. Invoices monthly, net-15.", tags:["consultant","vendor"], donationStatus:"none", endorsementStatus:"none", priority:"low", followUpDate:"", interactions:[{id:"i-009a",type:"meeting",date:"2026-06-02",note:"Monthly review: email list +1,800; ads CTR holding at 1.4%."}], donations:[], createdAt:"2026-02-14T15:00:00.000Z", updatedAt:"2026-06-02T10:40:00.000Z" },
    { id:"sample-010", firstName:"", lastName:"", organization:"Sunrise Print & Sign Co.", role:"Yard signs and literature vendor", email:"orders@example.com", phone:"555-010-1199", website:"sunriseprint.example.com", whatsapp:"", telegram:"", street:"940 Industrial Pkwy", city:"Riverside", state:"CA", postalCode:"92505", country:"USA", notes:"Union print shop (union bug available). 10-day turnaround on yard signs; ask for the campaign rate.", tags:["vendor"], donationStatus:"none", endorsementStatus:"none", priority:"low", followUpDate:"", interactions:[], donations:[], createdAt:"2026-03-22T17:20:00.000Z", updatedAt:"2026-03-22T17:20:00.000Z" },
    { id:"sample-011", firstName:"Walt", lastName:"Brennan", organization:"", role:"Retired council member", email:"wbrennan@example.com", phone:"555-010-4040", website:"", whatsapp:"", telegram:"", street:"7 Lakeview Dr", city:"Riverside", state:"CA", postalCode:"92506", country:"USA", notes:"Asked to be removed from all outreach lists after the March mailer. Keep record for compliance; do not call, email, or text.", tags:["do-not-contact","political-networking"], donationStatus:"declined", endorsementStatus:"declined", priority:"low", followUpDate:"", interactions:[{id:"i-011a",type:"other",date:"2026-03-29",note:"Opt-out request received and processed. No further contact."}], donations:[], createdAt:"2026-01-19T16:00:00.000Z", updatedAt:"2026-03-29T14:50:00.000Z" },
  ];

  function loadContacts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seeded = SAMPLE_CONTACTS.map(normalizeContact).filter(Boolean);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, contacts: seeded }));
        return seeded;
      }
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.contacts;
      if (!Array.isArray(list)) return [];
      return list.map(normalizeContact).filter(Boolean);
    } catch (err) {
      console.error("Failed to load contacts:", err);
      return [];
    }
  }

  // ---------- State ----------

  let contacts = loadContacts();
  let query = "";
  let activeTag = "";          // "" = all
  let donationFilter = "";
  let endorsementFilter = "";
  let followUpFilter = "";
  let sortBy = "name";
  let editingId = null;        // null = adding
  let loggingId = null;        // contact id the log dialog targets
  let editingConnections = []; // connection ids staged while the dialog is open

  function saveContacts() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: SCHEMA_VERSION, contacts })
      );
      return true;
    } catch (err) {
      console.error("Failed to save contacts:", err);
      toast("Could not save — storage may be full.");
      return false;
    }
  }

  function contributionLimit() {
    const v = Number(localStorage.getItem(LIMIT_KEY));
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_CONTRIBUTION_LIMIT;
  }

  // ---------- Helpers ----------

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /** Local YYYY-MM-DD (toISOString would shift the date in non-UTC timezones). */
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** "Jun 5" from a YYYY-MM-DD or ISO datetime string. */
  function shortDate(s) {
    const d = new Date(s.length === 10 ? s + "T00:00" : s);
    return Number.isNaN(d.getTime())
      ? s
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // ---------- Filtering & sorting ----------

  function visibleContacts() {
    const q = query.trim().toLowerCase();
    const today = todayStr();
    const list = contacts.filter(c => {
      if (activeTag && !c.tags.includes(activeTag)) return false;
      if (donationFilter && c.donationStatus !== donationFilter) return false;
      if (endorsementFilter && c.endorsementStatus !== endorsementFilter) return false;
      if (followUpFilter) {
        const fu = followUpStatus(c, today);
        if (followUpFilter === "due" && fu !== "overdue" && fu !== "today") return false;
        if (followUpFilter === "none" && fu !== null) return false;
        if (["overdue", "today", "scheduled"].includes(followUpFilter) && fu !== followUpFilter) return false;
      }
      if (!q) return true;
      const haystack = [
        c.firstName, c.lastName, c.organization, c.role,
        c.email, c.phone, c.website, c.whatsapp, c.telegram,
        c.street, c.city, c.state, c.postalCode, c.country, c.notes,
        ...c.tags.map(t => TAG_LABELS[t] || t),
        ...c.interactions.map(i => i.note),
        ...c.donations.map(d => d.note),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });

    const byName = (a, b) =>
      displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" });
    const priorityRank = { high: 0, normal: 1, low: 2 };

    if (sortBy === "name") list.sort(byName);
    else if (sortBy === "updated") list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || byName(a, b));
    else if (sortBy === "created") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b));
    else if (sortBy === "priority") list.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || byName(a, b));
    else if (sortBy === "raised") list.sort((a, b) => donationTotal(b) - donationTotal(a) || byName(a, b));
    else if (sortBy === "followup") {
      // Dated contacts first (soonest first), undated last.
      list.sort((a, b) => {
        if (a.followUpDate && b.followUpDate) return a.followUpDate.localeCompare(b.followUpDate) || byName(a, b);
        if (a.followUpDate) return -1;
        if (b.followUpDate) return 1;
        return byName(a, b);
      });
    }
    return list;
  }

  // ---------- Rendering ----------

  const $ = (sel) => document.querySelector(sel);
  const listEl = $("#contact-list");
  const emptyEl = $("#empty-state");

  const ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>';
  const ICON_DELETE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>';
  const ICON_LOG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z"/></svg>';
  const ICON_BRIEF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Zm6 9 .95 2.3 2.3.95-2.3.95L18 18.5l-.95-2.3-2.3-.95 2.3-.95L18 12ZM6 14l.8 1.95L8.75 16.7l-1.95.8L6 19.45l-.8-1.95L3.25 16.7l1.95-.75L6 14Z"/></svg>';

  function render() {
    const visible = visibleContacts();
    const filtersActive = !!(query.trim() || activeTag || donationFilter || endorsementFilter || followUpFilter);

    // Counts
    $("#footer-count").textContent =
      `${contacts.length} contact${contacts.length === 1 ? "" : "s"} · stored on this device`;
    $("#result-count").textContent = filtersActive
      ? `Showing ${visible.length} of ${contacts.length}`
      : "";

    // Empty states
    if (contacts.length === 0) {
      showEmpty("No contacts yet", "Add your first campaign contact to get started.", "Add contact");
    } else if (visible.length === 0) {
      showEmpty("No matches", "No contacts match your search or filters.", "Clear filters");
    } else {
      emptyEl.hidden = true;
    }

    listEl.replaceChildren(...visible.map(renderCard));
    renderTagChips();
    renderDashboard();
  }

  function renderDashboard() {
    const dash = $("#dashboard");
    if (contacts.length === 0) { dash.replaceChildren(); return; }
    const s = campaignStats(contacts, todayStr());
    const stat = (value, label) =>
      `<div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`;
    dash.innerHTML =
      stat(s.total, "Contacts") +
      stat(escapeHtml(formatMoney(s.raised)), "Raised") +
      stat(s.donors, "Donors") +
      stat(s.endorsed, "Endorsed") +
      stat(s.volunteers, "Volunteers") +
      `<button type="button" id="stat-followups" class="stat${s.dueFollowUps ? " stat-alert" : ""}"
         aria-pressed="${followUpFilter === "due"}" title="Show contacts due for follow-up">
         <span class="stat-value">${s.dueFollowUps}</span>
         <span class="stat-label">Follow-ups due</span>
       </button>`;
  }

  function showEmpty(title, text, action) {
    $("#empty-title").textContent = title;
    $("#empty-text").textContent = text;
    $("#btn-empty-action").textContent = action;
    emptyEl.hidden = false;
  }

  // Up to two initials for the monogram avatar.
  function initials(c) {
    const parts = displayName(c).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "•";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Deterministic hue (0–359) from a string, so each contact keeps a stable color.
  function hueFor(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  function renderCard(c) {
    const li = document.createElement("li");
    const dnc = c.tags.includes("do-not-contact");
    li.className = "contact-card" + (dnc ? " dnc" : "");
    li.dataset.id = c.id;

    const tags = c.tags
      .map(t => `<span class="tag${t === "do-not-contact" ? " tag-dnc" : ""}">${escapeHtml(TAG_LABELS[t] || t)}</span>`)
      .join("");
    const donation = c.donationStatus !== "none"
      ? `<span class="badge badge-donation">💵 ${escapeHtml(statusLabel(DONATION_STATUSES, c.donationStatus))}</span>` : "";
    const endorsement = c.endorsementStatus !== "none"
      ? `<span class="badge badge-endorsement">📣 ${escapeHtml(statusLabel(ENDORSEMENT_STATUSES, c.endorsementStatus))}</span>` : "";

    const channels = renderChannels(c, dnc);
    const meta = renderMeta(c);
    const details = renderDetails(c);

    li.innerHTML = `
      ${dnc ? '<div class="dnc-banner">⚠ DO NOT CONTACT</div>' : ""}
      <div class="card-main">
        <div class="card-top">
          <div class="card-id">
            <div class="avatar" style="--avatar-h: ${hueFor(displayName(c) || c.id)}" aria-hidden="true">${escapeHtml(initials(c))}</div>
            <div class="card-headings">
              <h3 class="contact-name">${escapeHtml(displayName(c))}</h3>
              ${subLine(c) ? `<p class="contact-sub">${escapeHtml(subLine(c))}</p>` : ""}
            </div>
          </div>
          <div class="card-actions">
            <button class="icon-btn ai${c.aiBrief ? " has-brief" : ""}" data-action="brief" aria-label="AI brief for ${escapeHtml(displayName(c))}" title="${c.aiBrief ? "View AI brief" : "Generate AI brief"}">${ICON_BRIEF}</button>
            <button class="icon-btn" data-action="log" aria-label="Log activity for ${escapeHtml(displayName(c))}" title="Log activity">${ICON_LOG}</button>
            <button class="icon-btn" data-action="edit" aria-label="Edit ${escapeHtml(displayName(c))}" title="Edit">${ICON_EDIT}</button>
            <button class="icon-btn danger" data-action="delete" aria-label="Delete ${escapeHtml(displayName(c))}" title="Delete">${ICON_DELETE}</button>
          </div>
        </div>
        ${tags || donation || endorsement ? `<div class="card-tags">${tags}${donation}${endorsement}</div>` : ""}
        ${meta ? `<div class="card-meta">${meta}</div>` : ""}
        ${channels ? `<div class="card-channels">${channels}</div>` : ""}
      </div>
      ${details}`;
    return li;
  }

  function renderMeta(c) {
    const today = todayStr();
    const fu = followUpStatus(c, today);
    const raised = donationTotal(c);
    const last = lastInteractionDate(c);
    const parts = [];

    if (c.priority === "high") parts.push('<span class="badge badge-priority">★ High priority</span>');
    if (fu === "overdue") parts.push(`<span class="badge badge-overdue">⏰ Overdue · was due ${escapeHtml(shortDate(c.followUpDate))}</span>`);
    else if (fu === "today") parts.push('<span class="badge badge-today">⏰ Follow up today</span>');
    else if (fu === "scheduled") parts.push(`<span class="badge badge-scheduled">📅 Follow up ${escapeHtml(shortDate(c.followUpDate))}</span>`);
    if (raised > 0) {
      const limit = contributionLimit();
      const warn = raised >= limit ? " · ⚠ at limit" : "";
      parts.push(`<span class="badge badge-donation">${escapeHtml(formatMoney(raised))} raised${warn}</span>`);
    }
    if (last) parts.push(`<span class="meta-text">Last contact ${escapeHtml(shortDate(last))}</span>`);
    return parts.join("");
  }

  function renderChannels(c, dnc) {
    const items = [];
    const add = (icon, text, href) => {
      const safeText = escapeHtml(text);
      if (href && !dnc) {
        const external = href.startsWith("http");
        items.push(
          `<a class="channel-link" href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${icon} <span>${safeText}</span></a>`
        );
      } else {
        // Do-not-contact (or unlinkable value): show as inert text.
        items.push(`<span class="channel-link channel-text">${icon} <span>${safeText}</span></span>`);
      }
    };
    if (c.email) add("✉️", c.email, dnc ? null : `mailto:${c.email}`);
    if (c.phone) add("📞", c.phone, telHref(c.phone));
    if (c.website) add("🌐", c.website, webHref(c.website));
    if (c.whatsapp) add("💬", `WhatsApp: ${c.whatsapp}`, waHref(c.whatsapp));
    if (c.telegram) add("✈️", `Telegram: ${c.telegram}`, tgHref(c.telegram));
    return items.join("");
  }

  function renderDetails(c) {
    const addressParts = [
      c.street,
      [c.city, c.state, c.postalCode].filter(Boolean).join(", "),
      c.country,
    ].filter(Boolean);

    const history = [
      ...c.interactions.map(i => ({
        date: i.date,
        label: statusLabel(INTERACTION_TYPES, i.type),
        note: i.note,
        isDonation: false,
      })),
      ...c.donations.map(d => ({
        date: d.date,
        label: `Donation ${formatMoney(d.amount)}`,
        note: d.note,
        isDonation: true,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    const linked = connectionsOf(contacts, c);
    const suggestions = suggestedConnections(contacts, c, 3);

    if (!addressParts.length && !c.notes && !history.length && !linked.length && !suggestions.length && !c.aiBrief) return "";

    let body = "";
    if (c.aiBrief) {
      body += `<p class="label">Intelligence brief</p>` +
        `<button type="button" class="btn-brief-open" data-action="brief">` +
        `${ICON_BRIEF}<span>View brief · ${escapeHtml(shortDate(c.aiBrief.generatedAt))}</span></button>`;
    }
    if (history.length) {
      body += `<p class="label">Activity (${history.length})</p><ul class="history-list">` +
        history.map(h => `
          <li>
            <span class="history-date">${escapeHtml(shortDate(h.date))}</span>
            <span class="history-label${h.isDonation ? " is-donation" : ""}">${escapeHtml(h.label)}</span>
            ${h.note ? `<span class="history-note">${escapeHtml(h.note)}</span>` : ""}
          </li>`).join("") +
        "</ul>";
    }
    if (addressParts.length) {
      body += `<p class="label">Address</p><p>${escapeHtml(addressParts.join("\n"))}</p>`;
    }
    if (c.notes) {
      body += `<p class="label">Notes</p><p>${escapeHtml(c.notes)}</p>`;
    }
    if (linked.length) {
      body += `<p class="label">Connected to (${linked.length})</p><div class="connection-list">` +
        linked.map(o => `<span class="connection-chip is-static">${escapeHtml(displayName(o))}</span>`).join("") +
        "</div>";
    }
    if (suggestions.length) {
      body += `<p class="label">Suggested connections</p><div class="suggestion-list">` +
        suggestions.map(s => {
          const why = s.reasons.map(r => escapeHtml(r.label)).join(", ");
          return `<div class="suggestion">
            <span class="suggestion-name">${escapeHtml(displayName(s.contact))}</span>
            <span class="suggestion-why">shares ${why}</span>
            <button type="button" class="btn-link-add" data-action="link" data-target="${escapeHtml(s.contact.id)}">+ Link</button>
          </div>`;
        }).join("") +
        "</div>";
    }

    const summary = history.length ? `Details · ${history.length} activit${history.length === 1 ? "y" : "ies"}` : "Details";
    return `
      <details class="card-details">
        <summary>${summary}</summary>
        <div class="details-body">${body}</div>
      </details>`;
  }

  function renderTagChips() {
    const wrap = $("#tag-chips");
    const counts = {};
    for (const c of contacts) for (const t of c.tags) counts[t] = (counts[t] || 0) + 1;

    const chips = [{ id: "", label: "All" }, ...TAGS.filter(t => counts[t.id])];
    wrap.replaceChildren(...chips.map(t => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.tag = t.id;
      btn.setAttribute("aria-pressed", String(activeTag === t.id));
      btn.textContent = t.id ? `${t.label} (${counts[t.id]})` : "All";
      return btn;
    }));
  }

  // ---------- Contact dialog (add / edit) ----------

  const dialog = $("#contact-dialog");
  const form = $("#contact-form");

  function buildFormControls() {
    $("#tag-checkboxes").innerHTML = TAGS.map(t => `
      <label><input type="checkbox" name="tags" value="${t.id}"> ${escapeHtml(t.label)}</label>
    `).join("");

    const opts = (list) => list.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("");
    $("#donation-select").innerHTML = opts(DONATION_STATUSES);
    $("#endorsement-select").innerHTML = opts(ENDORSEMENT_STATUSES);
    $("#priority-select").innerHTML = opts(PRIORITIES);
    $("#priority-select").value = "normal";
    $("#log-type-select").innerHTML =
      opts(INTERACTION_TYPES) + '<option value="donation">Donation 💵</option>';

    // Filter selects share the same status lists.
    $("#filter-donation").insertAdjacentHTML("beforeend",
      DONATION_STATUSES.filter(s => s.id !== "none").map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join(""));
    $("#filter-endorsement").insertAdjacentHTML("beforeend",
      ENDORSEMENT_STATUSES.filter(s => s.id !== "none").map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join(""));
  }

  // Render the staged connection chips + repopulate the "add" dropdown with
  // every other contact not already linked.
  function renderConnectionEditor() {
    const byId = new Map(contacts.map(c => [c.id, c]));
    const chipsWrap = $("#connection-chips");
    chipsWrap.innerHTML = editingConnections.map(id => {
      const c = byId.get(id);
      if (!c) return "";
      return `<span class="connection-chip">${escapeHtml(displayName(c))}` +
        `<button type="button" class="connection-remove" data-remove="${escapeHtml(id)}" aria-label="Remove ${escapeHtml(displayName(c))}">×</button></span>`;
    }).join("") || '<span class="field-hint">No connections yet.</span>';

    const linked = new Set(editingConnections);
    const options = contacts
      .filter(c => c.id !== editingId && !linked.has(c.id))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)))
      .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(displayName(c))}${c.organization ? " — " + escapeHtml(c.organization) : ""}</option>`)
      .join("");
    $("#connection-add").innerHTML = '<option value="">Select a contact…</option>' + options;
  }

  /** Make the connection graph symmetric: contact `id` should be linked to
      exactly `ids`, and each of those should list `id` back (and only those). */
  function syncConnections(id, ids) {
    const target = new Set(ids);
    for (const c of contacts) {
      if (c.id === id) { c.connections = [...target]; continue; }
      const has = (c.connections || []).includes(id);
      if (target.has(c.id) && !has) {
        c.connections = [...(c.connections || []), id];
      } else if (!target.has(c.id) && has) {
        c.connections = c.connections.filter(x => x !== id);
      }
    }
  }

  function openDialog(contact) {
    editingId = contact ? contact.id : null;
    editingConnections = contact ? connectionsOf(contacts, contact).map(c => c.id) : [];
    $("#dialog-title").textContent = contact ? "Edit contact" : "Add contact";
    $("#btn-save").textContent = contact ? "Save changes" : "Save contact";
    hideFormError();
    form.reset();
    form.elements.priority.value = "normal";

    if (contact) {
      for (const f of STRING_FIELDS) {
        if (form.elements[f]) form.elements[f].value = contact[f];
      }
      form.elements.donationStatus.value = contact.donationStatus;
      form.elements.endorsementStatus.value = contact.endorsementStatus;
      form.elements.priority.value = contact.priority;
      form.elements.followUpDate.value = contact.followUpDate;
      for (const cb of form.querySelectorAll('input[name="tags"]')) {
        cb.checked = contact.tags.includes(cb.value);
      }
    }
    renderConnectionEditor();
    dialog.showModal();
    form.elements.firstName.focus();
  }

  function showFormError(msg) {
    const el = $("#form-error");
    el.textContent = msg;
    el.hidden = false;
  }

  function hideFormError() {
    $("#form-error").hidden = true;
  }

  function readForm() {
    const data = {};
    for (const f of STRING_FIELDS) {
      data[f] = form.elements[f] ? form.elements[f].value.trim() : "";
    }
    data.tags = [...form.querySelectorAll('input[name="tags"]:checked')].map(cb => cb.value);
    data.donationStatus = form.elements.donationStatus.value;
    data.endorsementStatus = form.elements.endorsementStatus.value;
    data.priority = form.elements.priority.value;
    data.followUpDate = form.elements.followUpDate.value;
    return data;
  }

  function validate(data) {
    if (!data.firstName && !data.lastName && !data.organization) {
      return "Enter at least a name or an organization.";
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return "That email address doesn't look valid.";
    }
    return null;
  }

  function handleSave(event) {
    event.preventDefault();
    const data = readForm();
    const error = validate(data);
    if (error) { showFormError(error); return; }

    // Duplicate guard: same email or phone as an existing contact.
    const dupes = findDuplicates(contacts, data, editingId);
    if (dupes.length) {
      const names = dupes.slice(0, 3).map(displayName).join(", ");
      if (!confirm(`Possible duplicate: ${names} already has this email or phone.\n\nSave anyway?`)) {
        return;
      }
    }

    const now = new Date().toISOString();
    const wasEditing = !!editingId;
    const id = wasEditing ? editingId : makeId();
    if (wasEditing) {
      const idx = contacts.findIndex(c => c.id === editingId);
      if (idx !== -1) {
        contacts[idx] = { ...contacts[idx], ...data, updatedAt: now };
      }
    } else {
      contacts.push({
        id, ...data,
        interactions: [], donations: [], connections: [],
        createdAt: now, updatedAt: now,
      });
    }
    // Write the staged links symmetrically across both contacts.
    syncConnections(id, editingConnections);
    if (saveContacts()) {
      dialog.close(); // 'close' handler resets editingId
      render();
      toast(wasEditing ? "Contact updated" : "Contact added");
    }
  }

  // ---------- Log activity dialog ----------

  const logDialog = $("#log-dialog");
  const logForm = $("#log-form");

  function openLogDialog(contact) {
    loggingId = contact.id;
    $("#log-title").textContent = `Log activity — ${displayName(contact)}`;
    $("#log-error").hidden = true;
    logForm.reset();
    logForm.elements.date.value = todayStr();
    $("#log-amount-label").hidden = true;
    logDialog.showModal();
    logForm.elements.type.focus();
  }

  function handleLogSave(event) {
    event.preventDefault();
    const c = contacts.find(x => x.id === loggingId);
    if (!c) { logDialog.close(); return; }

    const type = logForm.elements.type.value;
    const date = logForm.elements.date.value;
    const note = logForm.elements.note.value.trim();
    const nextFollowUp = logForm.elements.nextFollowUp.value;

    const fail = (msg) => {
      const el = $("#log-error");
      el.textContent = msg;
      el.hidden = false;
    };
    if (!date) { fail("Pick a date for this activity."); return; }

    if (type === "donation") {
      const amount = Number(logForm.elements.amount.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        fail("Enter a donation amount greater than zero.");
        return;
      }
      c.donations.push({ id: makeId(), amount: Math.round(amount * 100) / 100, date, note });
      // A recorded donation upgrades a pending status automatically.
      if (["none", "asked", "pledged"].includes(c.donationStatus)) {
        c.donationStatus = "donated";
      }
      const total = donationTotal(c);
      const limit = contributionLimit();
      toast(total >= limit
        ? `Donation saved — ⚠ ${displayName(c)} is at the ${formatMoney(limit)} limit`
        : `Donation of ${formatMoney(amount)} saved`);
    } else {
      c.interactions.push({ id: makeId(), type, date, note });
      toast("Activity logged");
    }

    if (nextFollowUp) c.followUpDate = nextFollowUp;
    else if (c.followUpDate && c.followUpDate <= date) c.followUpDate = ""; // this activity satisfied the follow-up

    c.updatedAt = new Date().toISOString();
    saveContacts();
    logDialog.close();
    render();
  }

  // ---------- Delete ----------

  function handleDelete(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete ${displayName(c)}? This cannot be undone.`)) return;
    contacts = contacts.filter(x => x.id !== id);
    // Drop the deleted id from everyone else's connection lists.
    for (const other of contacts) {
      if (other.connections && other.connections.includes(id)) {
        other.connections = other.connections.filter(x => x !== id);
      }
    }
    saveContacts();
    render();
    toast("Contact deleted");
  }

  // ---------- AI settings ----------

  const settingsDialog = $("#settings-dialog");
  const settingsForm = $("#settings-form");

  // Dot on the gear when no API key is set yet.
  function updateAiStatus() {
    $("#btn-settings").classList.toggle("needs-setup", !AI.isConfigured());
  }

  function openSettings() {
    const cfg = AI.getConfig();
    $("#ai-model").innerHTML = AI.MODELS
      .map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join("");
    settingsForm.elements.apiKey.value = cfg.apiKey;
    settingsForm.elements.model.value = cfg.model;
    settingsForm.elements.webSearch.checked = cfg.webSearch;
    settingsForm.elements.protocol.value = cfg.protocol;
    settingsForm.elements.knowledge.value = cfg.knowledge;
    $("#ai-test-result").textContent = "";
    $("#ai-test-result").className = "ai-test-result";
    settingsDialog.showModal();
  }

  function saveSettings(event) {
    event.preventDefault();
    AI.saveConfig({
      apiKey: settingsForm.elements.apiKey.value,
      model: settingsForm.elements.model.value,
      webSearch: settingsForm.elements.webSearch.checked,
      protocol: settingsForm.elements.protocol.value,
      knowledge: settingsForm.elements.knowledge.value,
    });
    settingsDialog.close();
    updateAiStatus();
    toast("AI settings saved");
  }

  async function testAiConnection() {
    const btn = $("#btn-ai-test");
    const out = $("#ai-test-result");
    // Use the key currently typed in the field, saving it first so the call sees it.
    AI.saveConfig({ apiKey: settingsForm.elements.apiKey.value });
    if (!settingsForm.elements.apiKey.value.trim()) {
      out.textContent = "Enter an API key first.";
      out.className = "ai-test-result is-error";
      return;
    }
    btn.disabled = true;
    out.textContent = "Testing…";
    out.className = "ai-test-result";
    try {
      AI.saveConfig({ model: settingsForm.elements.model.value });
      const r = await AI.testConnection();
      out.textContent = `✓ Connected — ${r.model}`;
      out.className = "ai-test-result is-ok";
    } catch (err) {
      out.textContent = `✗ ${err.message}`;
      out.className = "ai-test-result is-error";
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Intelligence brief ----------

  const briefDialog = $("#brief-dialog");
  let briefContactId = null;
  let briefAbort = null;

  function fmtDateTime(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  }

  /** Minimal, XSS-safe Markdown → HTML. Escapes everything first, then adds a
      controlled set of tags (headings, bold/italic, lists, links). */
  function renderMarkdown(md) {
    const inline = (s) => s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    const lines = escapeHtml(md).split(/\r?\n/);
    let html = "";
    let list = null;
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { closeList(); continue; }
      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        closeList();
        html += m[1].length <= 2 ? `<h4>${inline(m[2])}</h4>` : `<h5>${inline(m[2])}</h5>`;
      } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
        if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
        html += `<li>${inline(m[1])}</li>`;
      } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
        if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
        html += `<li>${inline(m[1])}</li>`;
      } else {
        closeList();
        html += `<p>${inline(line)}</p>`;
      }
    }
    closeList();
    return html;
  }

  function openBrief(contact) {
    if (!AI || !AI.isConfigured()) {
      toast("Add your Anthropic API key in Settings first");
      openSettings();
      return;
    }
    briefContactId = contact.id;
    $("#brief-title").textContent = `Intelligence brief — ${displayName(contact)}`;
    briefDialog.showModal();
    if (contact.aiBrief) renderBriefResult(contact.aiBrief);
    else startBrief(contact);
  }

  function renderBriefResult(brief, sources) {
    $("#btn-brief-regen").hidden = false;
    const meta = `Generated ${escapeHtml(fmtDateTime(brief.generatedAt))}${brief.model ? " · " + escapeHtml(brief.model) : ""}`;
    let html = `<div class="brief-meta">${meta}</div><div class="brief-prose">${renderMarkdown(brief.text)}</div>`;
    if (sources && sources.length) {
      html += `<div class="brief-sources"><p class="label">Web sources consulted</p><ul>` +
        sources.map(s => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></li>`).join("") +
        `</ul></div>`;
    }
    $("#brief-content").innerHTML = html;
    $("#brief-body").scrollTop = 0;
  }

  function showBriefError(msg) {
    $("#btn-brief-regen").hidden = false;
    $("#brief-content").innerHTML =
      `<div class="brief-error"><p>⚠ Couldn't generate the brief.</p><p class="brief-error-detail">${escapeHtml(msg)}</p></div>`;
  }

  async function startBrief(contact) {
    $("#btn-brief-regen").hidden = true;
    briefAbort = new AbortController();
    $("#brief-content").innerHTML =
      `<div class="brief-loading">
        <div class="spinner" aria-hidden="true"></div>
        <p class="brief-loading-title">Researching ${escapeHtml(displayName(contact))}…</p>
        <p class="brief-loading-sub">Searching the web and analyzing the network. This usually takes 20–60 seconds.</p>
        <button type="button" class="btn btn-ghost" id="btn-brief-cancel">Cancel</button>
      </div>`;
    $("#btn-brief-cancel").addEventListener("click", () => { if (briefAbort) briefAbort.abort(); });

    try {
      const result = await AI.generateBrief({ contact, contacts, signal: briefAbort.signal });
      if (briefContactId !== contact.id) return; // dialog was closed or switched
      if (!result.text) { showBriefError("The model returned an empty response. Try again."); return; }
      const idx = contacts.findIndex(x => x.id === contact.id);
      if (idx !== -1) {
        contacts[idx].aiBrief = { text: result.text, model: result.model, generatedAt: new Date().toISOString() };
        contacts[idx].updatedAt = new Date().toISOString();
        saveContacts();
        render();
        renderBriefResult(contacts[idx].aiBrief, result.sources);
      }
      toast("Brief generated");
    } catch (err) {
      if (err.name === "AbortError") { briefDialog.close(); return; }
      showBriefError(err.message);
    } finally {
      briefAbort = null;
    }
  }

  // ---------- Strategy console ----------

  const strategyDialog = $("#strategy-dialog");
  let strategyHistory = [];   // [{ role, content, sources? }]
  let strategyAbort = null;
  let strategyBusy = false;

  const STRATEGY_STARTERS = [
    "Who in my contacts could help me host a fundraiser, and how?",
    "Map the best path from my contacts toward a high-profile endorsement.",
    "Which of my contacts would get along at an event, and who should I seat together?",
    "Which contacts could help make viral content, and what would it be?",
  ];

  function renderMsgSources(sources) {
    return `<div class="msg-sources">Sources: ` +
      sources.map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a>`).join(" · ") +
      `</div>`;
  }

  function renderStrategy() {
    const wrap = $("#strategy-messages");
    $("#btn-strategy-clear").hidden = strategyHistory.length === 0;

    if (!strategyHistory.length && !strategyBusy) {
      wrap.innerHTML =
        `<div class="strategy-empty">
          <p class="strategy-empty-title">Ask anything about your network</p>
          <p class="strategy-empty-sub">It reasons over all your contacts and connections, and searches the web for anything current.</p>
          <div class="strategy-starters">` +
          STRATEGY_STARTERS.map(s => `<button type="button" class="strategy-starter" data-starter="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("") +
        `</div></div>`;
      return;
    }

    let html = "";
    for (const m of strategyHistory) {
      if (m.role === "user") {
        html += `<div class="msg msg-user">${escapeHtml(m.content)}</div>`;
      } else {
        html += `<div class="msg msg-ai"><div class="brief-prose">${renderMarkdown(m.content)}</div>` +
          (m.sources && m.sources.length ? renderMsgSources(m.sources) : "") + `</div>`;
      }
    }
    if (strategyBusy) {
      html += `<div class="msg msg-ai"><div class="typing" aria-label="Thinking"><span></span><span></span><span></span></div></div>`;
    }
    wrap.innerHTML = html;
    wrap.scrollTop = wrap.scrollHeight;
  }

  function openStrategy() {
    if (!AI || !AI.isConfigured()) {
      toast("Add your Anthropic API key in Settings first");
      openSettings();
      return;
    }
    renderStrategy();
    strategyDialog.showModal();
    $("#strategy-text").focus();
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  async function sendStrategy(text) {
    const q = (text || "").trim();
    if (!q || strategyBusy) return;

    strategyHistory.push({ role: "user", content: q });
    strategyBusy = true;
    renderStrategy();
    $("#strategy-text").value = "";
    autoGrow($("#strategy-text"));

    strategyAbort = new AbortController();
    try {
      const apiMessages = strategyHistory.map(m => ({ role: m.role, content: m.content }));
      const result = await AI.chatStrategy({ messages: apiMessages, contacts, signal: strategyAbort.signal });
      strategyBusy = false;
      strategyHistory.push(result.text
        ? { role: "assistant", content: result.text, sources: result.sources }
        : { role: "assistant", content: "_(No response — try again.)_" });
      renderStrategy();
    } catch (err) {
      strategyBusy = false;
      if (err.name === "AbortError") { renderStrategy(); return; }
      strategyHistory.push({ role: "assistant", content: `⚠ ${err.message}` });
      renderStrategy();
    } finally {
      strategyAbort = null;
    }
  }

  // ---------- Export / import ----------

  function timestamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  }

  function download(filename, mime, text) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    // Leading BOM so Excel opens the file as UTF-8.
    download(
      `campaign-contacts-${timestamp()}.csv`,
      "text/csv;charset=utf-8",
      "﻿" + contactsToCsv(contacts)
    );
    toast(`Exported ${contacts.length} contacts to CSV`);
  }

  function exportJson() {
    const payload = {
      app: "campaign-contact-crm",
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      contacts,
    };
    download(`campaign-contacts-${timestamp()}.json`, "application/json", JSON.stringify(payload, null, 2));
    toast(`Exported ${contacts.length} contacts to JSON`);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let incoming;
      try {
        const parsed = JSON.parse(reader.result);
        incoming = (Array.isArray(parsed) ? parsed : parsed.contacts || [])
          .map(normalizeContact)
          .filter(Boolean);
      } catch {
        toast("Import failed: not a valid JSON file");
        return;
      }
      if (!incoming.length) {
        toast("Import failed: no valid contacts found");
        return;
      }
      if (!confirm(
        `Import ${incoming.length} contact(s)?\n\nContacts with matching IDs will be updated; new ones will be added.`
      )) return;

      const byId = new Map(contacts.map(c => [c.id, c]));
      let updated = 0, added = 0;
      for (const c of incoming) {
        if (byId.has(c.id)) { updated++; } else { added++; }
        byId.set(c.id, c);
      }
      contacts = [...byId.values()];
      saveContacts();
      render();
      toast(`Imported: ${added} added, ${updated} updated`);
    };
    reader.onerror = () => toast("Import failed: could not read file");
    reader.readAsText(file);
  }

  // ---------- Toast ----------

  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------- Events ----------

  function wireEvents() {
    $("#btn-add").addEventListener("click", () => openDialog(null));

    $("#btn-empty-action").addEventListener("click", () => {
      if (contacts.length === 0) {
        openDialog(null);
      } else {
        // "Clear filters"
        query = ""; activeTag = ""; donationFilter = ""; endorsementFilter = ""; followUpFilter = "";
        $("#search").value = "";
        $("#filter-donation").value = "";
        $("#filter-endorsement").value = "";
        $("#filter-followup").value = "";
        render();
      }
    });

    $("#search").addEventListener("input", debounce(e => {
      query = e.target.value;
      render();
    }, 150));

    $("#filter-donation").addEventListener("change", e => { donationFilter = e.target.value; render(); });
    $("#filter-endorsement").addEventListener("change", e => { endorsementFilter = e.target.value; render(); });
    $("#filter-followup").addEventListener("change", e => { followUpFilter = e.target.value; render(); });
    $("#sort").addEventListener("change", e => { sortBy = e.target.value; render(); });

    // Dashboard "Follow-ups due" stat toggles the due filter.
    $("#dashboard").addEventListener("click", e => {
      if (!e.target.closest("#stat-followups")) return;
      followUpFilter = followUpFilter === "due" ? "" : "due";
      $("#filter-followup").value = followUpFilter;
      render();
    });

    $("#tag-chips").addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      activeTag = chip.dataset.tag === activeTag ? "" : chip.dataset.tag;
      render();
    });

    listEl.addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = btn.closest(".contact-card").dataset.id;
      const c = contacts.find(x => x.id === id);
      if (!c) return;
      if (btn.dataset.action === "edit") openDialog(c);
      else if (btn.dataset.action === "log") openLogDialog(c);
      else if (btn.dataset.action === "delete") handleDelete(id);
      else if (btn.dataset.action === "brief") openBrief(c);
      else if (btn.dataset.action === "link") {
        const targetId = btn.dataset.target;
        const target = contacts.find(x => x.id === targetId);
        if (!target) return;
        const ids = connectionsOf(contacts, c).map(x => x.id);
        if (!ids.includes(targetId)) ids.push(targetId);
        syncConnections(id, ids);
        c.updatedAt = new Date().toISOString();
        saveContacts();
        render();
        toast(`Linked ${displayName(c)} ↔ ${displayName(target)}`);
      }
    });

    form.addEventListener("submit", handleSave);
    $("#btn-cancel").addEventListener("click", () => dialog.close());
    $("#btn-dialog-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { editingId = null; editingConnections = []; });

    // Connections editor: dropdown adds a chip; the chip's × removes it.
    $("#connection-add").addEventListener("change", e => {
      const id = e.target.value;
      if (id && !editingConnections.includes(id)) {
        editingConnections.push(id);
        renderConnectionEditor();
      }
      e.target.value = "";
    });
    $("#connection-chips").addEventListener("click", e => {
      const btn = e.target.closest("[data-remove]");
      if (!btn) return;
      editingConnections = editingConnections.filter(x => x !== btn.dataset.remove);
      renderConnectionEditor();
    });

    logForm.addEventListener("submit", handleLogSave);
    $("#btn-log-cancel").addEventListener("click", () => logDialog.close());
    $("#btn-log-close").addEventListener("click", () => logDialog.close());
    logDialog.addEventListener("close", () => { loggingId = null; });
    $("#log-type-select").addEventListener("change", e => {
      $("#log-amount-label").hidden = e.target.value !== "donation";
    });

    // AI settings
    $("#btn-settings").addEventListener("click", openSettings);
    settingsForm.addEventListener("submit", saveSettings);
    $("#btn-settings-cancel").addEventListener("click", () => settingsDialog.close());
    $("#btn-settings-close").addEventListener("click", () => settingsDialog.close());
    $("#btn-ai-test").addEventListener("click", testAiConnection);
    $("#btn-ai-reset-protocol").addEventListener("click", () => {
      settingsForm.elements.protocol.value = AI.DEFAULT_PROTOCOL;
    });
    updateAiStatus();

    // Intelligence brief dialog
    $("#btn-brief-done").addEventListener("click", () => briefDialog.close());
    $("#btn-brief-close").addEventListener("click", () => briefDialog.close());
    $("#btn-brief-regen").addEventListener("click", () => {
      const c = contacts.find(x => x.id === briefContactId);
      if (c) startBrief(c);
    });
    briefDialog.addEventListener("close", () => {
      if (briefAbort) briefAbort.abort();
      briefContactId = null;
    });

    // Strategy console
    $("#btn-strategy").addEventListener("click", openStrategy);
    $("#btn-strategy-close").addEventListener("click", () => strategyDialog.close());
    $("#btn-strategy-clear").addEventListener("click", () => { strategyHistory = []; renderStrategy(); });
    $("#strategy-form").addEventListener("submit", e => {
      e.preventDefault();
      sendStrategy($("#strategy-text").value);
    });
    $("#strategy-text").addEventListener("input", e => autoGrow(e.target));
    $("#strategy-text").addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendStrategy($("#strategy-text").value);
      }
    });
    $("#strategy-messages").addEventListener("click", e => {
      const starter = e.target.closest("[data-starter]");
      if (starter) sendStrategy(starter.dataset.starter);
    });
    strategyDialog.addEventListener("close", () => { if (strategyAbort) strategyAbort.abort(); });

    $("#btn-export-csv").addEventListener("click", exportCsv);
    $("#btn-export-json").addEventListener("click", exportJson);
    $("#btn-import").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", e => {
      const file = e.target.files[0];
      if (file) importJson(file);
      e.target.value = ""; // allow re-importing the same file
    });

    // Keep multiple open tabs in sync.
    window.addEventListener("storage", e => {
      if (e.key === STORAGE_KEY) {
        contacts = loadContacts();
        render();
      }
    });
  }

  // ---------- PWA ----------

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

    // When a newly-deployed worker takes control, reload once so the page is
    // never left running a stale JS/CSS bundle.
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("sw.js")
      .then(reg => { reg.update(); })
      .catch(err => console.warn("Service worker registration failed:", err));
  }

  // ---------- Init ----------

  buildFormControls();
  wireEvents();
  render();
  registerServiceWorker();
})();
