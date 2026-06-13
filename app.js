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
  } = globalThis.CRMLib;

  const STORAGE_KEY = "campaign-crm:contacts:v1";
  const LIMIT_KEY = "campaign-crm:contribution-limit";

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

  // ---------- Storage ----------

  function loadContacts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.contacts;
      if (!Array.isArray(list)) return [];
      return list.map(normalizeContact).filter(Boolean);
    } catch (err) {
      console.error("Failed to load contacts:", err);
      return [];
    }
  }

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
          <div>
            <h3 class="contact-name">${escapeHtml(displayName(c))}</h3>
            ${subLine(c) ? `<p class="contact-sub">${escapeHtml(subLine(c))}</p>` : ""}
          </div>
          <div class="card-actions">
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

    if (!addressParts.length && !c.notes && !history.length) return "";

    let body = "";
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

  function openDialog(contact) {
    editingId = contact ? contact.id : null;
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
    if (wasEditing) {
      const idx = contacts.findIndex(c => c.id === editingId);
      if (idx !== -1) {
        contacts[idx] = { ...contacts[idx], ...data, updatedAt: now };
      }
    } else {
      contacts.push({
        id: makeId(), ...data,
        interactions: [], donations: [],
        createdAt: now, updatedAt: now,
      });
    }
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
    saveContacts();
    render();
    toast("Contact deleted");
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
    });

    form.addEventListener("submit", handleSave);
    $("#btn-cancel").addEventListener("click", () => dialog.close());
    $("#btn-dialog-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { editingId = null; });

    logForm.addEventListener("submit", handleLogSave);
    $("#btn-log-cancel").addEventListener("click", () => logDialog.close());
    $("#btn-log-close").addEventListener("click", () => logDialog.close());
    logDialog.addEventListener("close", () => { loggingId = null; });
    $("#log-type-select").addEventListener("change", e => {
      $("#log-amount-label").hidden = e.target.value !== "donation";
    });

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
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(err =>
        console.warn("Service worker registration failed:", err)
      );
    }
  }

  // ---------- Init ----------

  buildFormControls();
  wireEvents();
  render();
  registerServiceWorker();
})();
