"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  TAGS, DONATION_STATUSES, ENDORSEMENT_STATUSES, CSV_COLUMNS,
  DEFAULT_CONTRIBUTION_LIMIT,
  displayName, subLine, statusLabel, escapeHtml,
  telHref, waHref, tgHref, webHref, socialHref,
  normalizeContact, csvCell, contactsToCsv,
  donationTotal, formatMoney, lastInteractionDate, followUpStatus,
  findDuplicates, campaignStats,
  connectionsOf, sharedAffiliations, suggestedConnections, bestPath,
} = require("../lib.js");

function makeContact(overrides = {}) {
  return normalizeContact({
    id: "test-1",
    firstName: "Maria",
    lastName: "Lopez",
    organization: "Riverside Alliance",
    role: "Chair",
    email: "maria@example.org",
    tags: ["donor"],
    donationStatus: "donated",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  });
}

describe("escapeHtml", () => {
  test("escapes all HTML-significant characters", () => {
    assert.equal(
      escapeHtml(`<img src="x" onerror='alert(1)'> & more`),
      "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt; &amp; more"
    );
  });

  test("stringifies non-strings", () => {
    assert.equal(escapeHtml(42), "42");
  });
});

describe("csvCell", () => {
  test("passes plain values through", () => {
    assert.equal(csvCell("hello"), "hello");
  });

  test("quotes commas, quotes, and newlines", () => {
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  });

  test("neutralizes spreadsheet formula injection", () => {
    assert.equal(csvCell("=CMD()"), "'=CMD()");
    assert.equal(csvCell("+1234"), "'+1234");
    assert.equal(csvCell("-2+3"), "'-2+3");
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  });

  test("handles null and undefined", () => {
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
  });
});

describe("contactsToCsv", () => {
  test("emits header plus one CRLF row per contact", () => {
    const csv = contactsToCsv([makeContact()]);
    const rows = csv.split("\r\n");
    assert.equal(rows.length, 2);
    assert.equal(rows[0], CSV_COLUMNS.join(","));
  });

  test("joins tags with semicolons and keeps column order", () => {
    const csv = contactsToCsv([makeContact({ tags: ["donor", "volunteer"] })]);
    const row = csv.split("\r\n")[1].split(",");
    assert.equal(row[CSV_COLUMNS.indexOf("tags")], "donor; volunteer");
    assert.equal(row[CSV_COLUMNS.indexOf("firstName")], "Maria");
  });

  test("escapes hostile values in rows", () => {
    const csv = contactsToCsv([makeContact({ firstName: "=HYPERLINK(...)" })]);
    assert.ok(csv.includes("'=HYPERLINK(...)"));
  });
});

describe("normalizeContact", () => {
  test("rejects non-objects and identity-less records", () => {
    assert.equal(normalizeContact(null), null);
    assert.equal(normalizeContact("string"), null);
    assert.equal(normalizeContact({}), null);
    assert.equal(normalizeContact({ email: "a@b.co" }), null); // email alone is not an identity
  });

  test("accepts org-only contacts", () => {
    const c = normalizeContact({ organization: "Acme PAC" });
    assert.ok(c);
    assert.equal(displayName(c), "Acme PAC");
  });

  test("trims strings and blanks non-string fields", () => {
    const c = normalizeContact({ firstName: "  Sam  ", lastName: 42, notes: { evil: true } });
    assert.equal(c.firstName, "Sam");
    assert.equal(c.lastName, "");
    assert.equal(c.notes, "");
  });

  test("filters unknown tags and invalid statuses", () => {
    const c = normalizeContact({
      firstName: "Sam",
      tags: ["donor", "totally-made-up", 123],
      donationStatus: "mega-donor",
      endorsementStatus: "potential",
    });
    assert.deepEqual(c.tags, ["donor"]);
    assert.equal(c.donationStatus, "none");
    assert.equal(c.endorsementStatus, "potential");
  });

  test("generates an id when missing and keeps a provided one", () => {
    assert.equal(normalizeContact({ firstName: "A", id: "keep-me" }).id, "keep-me");
    assert.ok(normalizeContact({ firstName: "A" }).id.length > 0);
  });

  test("repairs invalid timestamps", () => {
    const c = normalizeContact({ firstName: "A", createdAt: "not-a-date", updatedAt: 99 });
    assert.ok(!Number.isNaN(Date.parse(c.createdAt)));
    assert.equal(c.updatedAt, c.createdAt);
  });
});

describe("channel hrefs", () => {
  test("telHref strips formatting but keeps +", () => {
    assert.equal(telHref("+1 (555) 010-2030"), "tel:+15550102030");
    assert.equal(telHref("ext."), null);
  });

  test("waHref keeps digits only", () => {
    assert.equal(waHref("+1 555-010-2030"), "https://wa.me/15550102030");
    assert.equal(waHref("no digits"), null);
  });

  test("tgHref accepts @handles and t.me URLs, rejects junk", () => {
    assert.equal(tgHref("@maria_lopez"), "https://t.me/maria_lopez");
    assert.equal(tgHref("https://t.me/maria_lopez"), "https://t.me/maria_lopez");
    assert.equal(tgHref("not a handle!"), null);
  });

  test("webHref adds https:// when missing, rejects non-URLs", () => {
    assert.equal(webHref("example.org"), "https://example.org");
    assert.equal(webHref("http://example.org"), "http://example.org");
    assert.equal(webHref("javascript:alert(1)"), null);
    assert.equal(webHref(""), null);
  });

  test("socialHref builds profile URLs from handles and passes URLs through", () => {
    assert.equal(socialHref("twitter", "@maria_lopez"), "https://x.com/maria_lopez");
    assert.equal(socialHref("instagram", "maria.lopez"), "https://instagram.com/maria.lopez");
    assert.equal(socialHref("tiktok", "@maria"), "https://tiktok.com/@maria");
    assert.equal(socialHref("linkedin", "https://linkedin.com/in/maria-lopez"), "https://linkedin.com/in/maria-lopez");
    assert.equal(socialHref("twitter", "not a handle!"), null);
    assert.equal(socialHref("myspace", "maria"), null); // unknown platform
    assert.equal(socialHref("twitter", ""), null);
  });

  test("social fields normalize as strings and survive round-trip", () => {
    const c = normalizeContact({ firstName: "A", twitter: " @handle ", instagram: 42 });
    assert.equal(c.twitter, "@handle");
    assert.equal(c.instagram, "");
    assert.ok(CSV_COLUMNS.includes("twitter") && CSV_COLUMNS.includes("tiktok"));
  });
});

describe("identity helpers", () => {
  test("displayName prefers person name, falls back to org", () => {
    assert.equal(displayName(makeContact()), "Maria Lopez");
    assert.equal(displayName(makeContact({ firstName: "", lastName: "" })), "Riverside Alliance");
  });

  test("subLine shows role+org for people, role only for orgs", () => {
    assert.equal(subLine(makeContact()), "Chair, Riverside Alliance");
    assert.equal(subLine(makeContact({ firstName: "", lastName: "" })), "Chair");
  });

  test("statusLabel resolves ids from both status lists", () => {
    assert.equal(statusLabel(DONATION_STATUSES, "recurring"), "Recurring donor");
    assert.equal(statusLabel(ENDORSEMENT_STATUSES, "endorsed"), "Endorsed");
    assert.equal(statusLabel(DONATION_STATUSES, "mystery"), "mystery");
  });
});

describe("schema v2 fields", () => {
  test("defaults priority, followUpDate, interactions, donations for v1 records", () => {
    const c = normalizeContact({ firstName: "Old", lastName: "Record" });
    assert.equal(c.priority, "normal");
    assert.equal(c.followUpDate, "");
    assert.deepEqual(c.interactions, []);
    assert.deepEqual(c.donations, []);
  });

  test("rejects invalid priority and malformed follow-up dates", () => {
    const c = normalizeContact({ firstName: "A", priority: "urgent!!!", followUpDate: "June 5th" });
    assert.equal(c.priority, "normal");
    assert.equal(c.followUpDate, "");
  });

  test("aiBrief defaults to null and normalizes a valid brief", () => {
    assert.equal(normalizeContact({ firstName: "A" }).aiBrief, null);
    assert.equal(normalizeContact({ firstName: "A", aiBrief: { text: "" } }).aiBrief, null);
    const c = normalizeContact({ firstName: "A", aiBrief: { text: "Brief.", model: "claude-opus-4-8", generatedAt: "2026-06-13T00:00:00.000Z" } });
    assert.equal(c.aiBrief.text, "Brief.");
    assert.equal(c.aiBrief.model, "claude-opus-4-8");
    assert.equal(c.aiBrief.generatedAt, "2026-06-13T00:00:00.000Z");
  });

  test("drops invalid interactions and donations, keeps valid ones", () => {
    const c = normalizeContact({
      firstName: "A",
      interactions: [
        { type: "call", date: "2026-06-01", note: " spoke briefly " },
        { type: "call" },                       // no date
        "garbage",
      ],
      donations: [
        { amount: "250.456", date: "2026-05-01" }, // string amount, rounded
        { amount: -50, date: "2026-05-01" },       // negative
        { amount: 100 },                            // no date
      ],
    });
    assert.equal(c.interactions.length, 1);
    assert.equal(c.interactions[0].note, "spoke briefly");
    assert.equal(c.donations.length, 1);
    assert.equal(c.donations[0].amount, 250.46);
  });

  test("unknown interaction types fall back to other", () => {
    const c = normalizeContact({
      firstName: "A",
      interactions: [{ type: "carrier-pigeon", date: "2026-06-01" }],
    });
    assert.equal(c.interactions[0].type, "other");
  });
});

describe("fundraising helpers", () => {
  test("donationTotal sums entries", () => {
    const c = makeContact({ donations: [
      { amount: 500, date: "2026-03-01" },
      { amount: 250.5, date: "2026-04-01" },
    ]});
    assert.equal(donationTotal(c), 750.5);
  });

  test("formatMoney renders whole and fractional dollars", () => {
    assert.equal(formatMoney(3500), "$3,500");
    assert.equal(formatMoney(250.5), "$250.50");
    assert.equal(formatMoney(0), "$0");
  });

  test("contribution limit constant matches the 2025-26 FEC limit", () => {
    assert.equal(DEFAULT_CONTRIBUTION_LIMIT, 3500);
  });
});

describe("follow-ups", () => {
  const today = "2026-06-11";

  test("followUpStatus classifies dates against today", () => {
    assert.equal(followUpStatus(makeContact({ followUpDate: "2026-06-05" }), today), "overdue");
    assert.equal(followUpStatus(makeContact({ followUpDate: "2026-06-11" }), today), "today");
    assert.equal(followUpStatus(makeContact({ followUpDate: "2026-06-20" }), today), "scheduled");
    assert.equal(followUpStatus(makeContact(), today), null);
  });

  test("lastInteractionDate returns the most recent entry", () => {
    const c = makeContact({ interactions: [
      { type: "call", date: "2026-05-01" },
      { type: "meeting", date: "2026-06-07" },
      { type: "email", date: "2026-04-15" },
    ]});
    assert.equal(lastInteractionDate(c), "2026-06-07");
    assert.equal(lastInteractionDate(makeContact()), null);
  });
});

describe("findDuplicates", () => {
  const existing = [
    makeContact({ id: "a", email: "Maria@Example.org", phone: "(555) 010-2030" }),
    makeContact({ id: "b", firstName: "Other", email: "other@example.com", phone: "555-999-0000" }),
  ];

  test("matches email case-insensitively", () => {
    const dupes = findDuplicates(existing, { email: "maria@example.org", phone: "" });
    assert.deepEqual(dupes.map(d => d.id), ["a"]);
  });

  test("matches phone regardless of formatting", () => {
    const dupes = findDuplicates(existing, { email: "", phone: "+1 5550102030" });
    assert.equal(dupes.length, 0); // +1 prefix makes digits differ — not a match
    const dupes2 = findDuplicates(existing, { email: "", phone: "555.010.2030" });
    assert.deepEqual(dupes2.map(d => d.id), ["a"]);
  });

  test("excludes the contact being edited and ignores short numbers", () => {
    assert.equal(findDuplicates(existing, { email: "maria@example.org" }, "a").length, 0);
    assert.equal(findDuplicates(existing, { email: "", phone: "555" }).length, 0);
  });
});

describe("campaignStats", () => {
  test("aggregates the dashboard numbers", () => {
    const today = "2026-06-11";
    const list = [
      makeContact({ id: "1", donationStatus: "none", donations: [{ amount: 1000, date: "2026-05-01" }], followUpDate: "2026-06-05" }),
      makeContact({ id: "2", firstName: "Vol", tags: ["volunteer"], donationStatus: "recurring", followUpDate: "2026-06-11" }),
      makeContact({ id: "3", firstName: "End", donationStatus: "none", endorsementStatus: "endorsed", followUpDate: "2026-07-01" }),
      makeContact({ id: "4", firstName: "Plain", donationStatus: "none" }),
    ];
    const s = campaignStats(list, today);
    assert.equal(s.total, 4);
    assert.equal(s.raised, 1000);
    assert.equal(s.donors, 2);        // donation entries + recurring status
    assert.equal(s.endorsed, 1);
    assert.equal(s.volunteers, 1);
    assert.equal(s.dueFollowUps, 2);  // overdue + due today, not the scheduled one
  });
});

describe("schema constants", () => {
  test("README's eleven campaign attributes are all present", () => {
    assert.equal(TAGS.length, 11);
    assert.ok(TAGS.some(t => t.id === "do-not-contact"));
  });
});

describe("relationships", () => {
  // a links b; d links b; c shares org+tag with a but is unlinked; c is isolated.
  function net() {
    return [
      makeContact({ id: "a", firstName: "A", organization: "Acme", city: "Riverside", tags: ["donor"], connections: ["b"] }),
      makeContact({ id: "b", firstName: "B", organization: "Beta", city: "Riverside", tags: ["volunteer"], connections: [] }),
      makeContact({ id: "c", firstName: "C", organization: "Acme", city: "LA", tags: ["donor"], connections: [] }),
      makeContact({ id: "d", firstName: "D", organization: "Delta", city: "NYC", tags: [], connections: ["b"] }),
    ];
  }

  test("normalizeContact stores connections and drops self-links and dupes", () => {
    const c = normalizeContact({ id: "x", firstName: "X", connections: ["x", "y", "y", 7, ""] });
    assert.deepEqual(c.connections, ["y"]);
    assert.deepEqual(normalizeContact({ firstName: "Z" }).connections, []); // v1/v2 default
  });

  test("connectionsOf resolves links bidirectionally", () => {
    const list = net();
    const b = list.find(c => c.id === "b");
    // a lists b and d lists b, even though b lists neither
    assert.deepEqual(connectionsOf(list, b).map(c => c.id).sort(), ["a", "d"]);
    assert.deepEqual(connectionsOf(list, list.find(c => c.id === "a")).map(c => c.id), ["b"]);
  });

  test("connectionsOf drops dangling ids from deleted contacts", () => {
    const list = [makeContact({ id: "a", firstName: "A", connections: ["ghost"] })];
    assert.deepEqual(connectionsOf(list, list[0]), []);
  });

  test("sharedAffiliations reports org and tag overlaps, org first", () => {
    const list = net();
    const reasons = sharedAffiliations(list.find(c => c.id === "a"), list.find(c => c.id === "c"));
    assert.deepEqual(reasons.map(r => r.type), ["organization", "tag"]);
    assert.equal(reasons[0].label, "Acme");
  });

  test("suggestedConnections ranks by signal and skips already-linked", () => {
    const list = net();
    const suggestions = suggestedConnections(list, list.find(c => c.id === "a"));
    assert.equal(suggestions[0].contact.id, "c");           // shares org+tag
    assert.ok(suggestions.every(s => s.contact.id !== "b")); // b already linked
  });

  test("suggestedConnections excludes do-not-contact", () => {
    const list = [
      makeContact({ id: "a", firstName: "A", organization: "Acme" }),
      makeContact({ id: "x", firstName: "X", organization: "Acme", tags: ["do-not-contact"] }),
    ];
    assert.equal(suggestedConnections(list, list[0]).length, 0);
  });

  test("bestPath finds the shortest introduction chain", () => {
    assert.deepEqual(bestPath(net(), "a", "d").map(c => c.id), ["a", "b", "d"]);
  });

  test("bestPath returns null when there is no chain", () => {
    assert.equal(bestPath(net(), "a", "c"), null); // c is isolated
    assert.equal(bestPath(net(), "a", "a"), null); // same contact
  });
});
