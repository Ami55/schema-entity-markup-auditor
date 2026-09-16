const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const strip = (html = "") =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const pick = (html, re) => strip(html.match(re)?.[1] || "");
const uniq = (a) => [...new Set(a.filter(Boolean))];
const absolute = (v, b) => {
  try {
    return new URL(v, b).href;
  } catch {
    return v;
  }
};
async function get(url, ms = 15000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: c.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
    if (!r.ok) throw new Error(`The page returned HTTP ${r.status}.`);
    return r;
  } finally {
    clearTimeout(t);
  }
}
async function fetchPage(target) {
  try {
    const response = await get(target, 18000);
    return {
      content: await response.text(),
      finalUrl: response.url || target,
      format: "html",
      source: "Direct HTML",
    };
  } catch (error) {
    if (!/HTTP (401|403|429)/.test(error?.message || "")) throw error;
    const readerUrl = `https://r.jina.ai/${target}`;
    const response = await get(readerUrl, 25000);
    return {
      content: await response.text(),
      finalUrl: target,
      format: "markdown",
      source: "Reader fallback",
    };
  }
}
function cleanName(v = "") {
  return v
    .replace(/\s+[|–—:].*$/, "")
    .replace(/^(explore|discover|visit|meet)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
function candidates(html, title, h1) {
  const names = [];
  if (h1) names.push(cleanName(h1));
  else if (title) names.push(cleanName(title));
  const heading = [...html.matchAll(/<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/gi)]
    .map((m) => cleanName(strip(m[1])))
    .filter((x) => x.length > 2 && x.length < 65);
  const linked = [
    ...html.matchAll(/<a[^>]+href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/gi),
  ]
    .map((m) => cleanName(strip(m[1])))
    .filter((x) => /^[A-Z][\p{L}\p{N}'’&., -]{2,55}$/u.test(x));
  const stop =
    /^(home|about|contact|book now|learn more|read more|view all|tours|destinations|sign in|log in|menu|search|next|previous|privacy|terms|faq)$/i;
  const counts = new Map();
  for (const n of [...heading, ...linked])
    if (!stop.test(n) && n.split(" ").length <= 7)
      counts.set(n, (counts.get(n) || 0) + 1);
  names.push(
    ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]),
  );
  return uniq(names).slice(0, 7);
}
function markdownCandidates(md, title, h1) {
  const names = [];
  if (h1) names.push(cleanName(h1));
  else if (title) names.push(cleanName(title));
  const headings = [...md.matchAll(/^#{2,3}\s+(.+)$/gm)]
    .map((m) => cleanName(m[1]))
    .filter((x) => x.length > 2 && x.length < 65);
  const links = [...md.matchAll(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g)]
    .map((m) => cleanName(m[1]))
    .filter((x) => /^[A-Z][\p{L}\p{N}'’&., -]{2,55}$/u.test(x));
  const plain = md
    .split("\n")
    .map((x) => cleanName(x.replace(/^[-*•]\s*/, "")))
    .filter(
      (x) =>
        /^[A-Z][\p{L}\p{N}'’&., -]{2,55}$/u.test(x) && x.split(" ").length <= 7,
    );
  const stop =
    /^(home|about|contact|book now|learn more|read more|view all|tours|destinations|sign in|log in|menu|search|next|previous|privacy|terms|faq)$/i;
  const counts = new Map();
  for (const n of [...headings, ...links, ...plain])
    if (!stop.test(n) && n.split(" ").length <= 7)
      counts.set(n, (counts.get(n) || 0) + 1);
  names.push(
    ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]),
  );
  return uniq(names).slice(0, 7);
}
function typeFrom(description = "", name = "") {
  const d = `${description} ${name}`.toLowerCase();
  if (/person|actor|author|guide|politician|born/.test(d)) return "Person";
  if (/city|capital|municipality|town|village/.test(d)) return "City";
  if (/country|region|province|island|place/.test(d)) return "Place";
  if (/museum|monument|landmark|cathedral|temple|palace|attraction/.test(d))
    return "TouristAttraction";
  if (/company|organisation|organization|business|agency/.test(d))
    return "Organization";
  return "Thing";
}
async function searchIdentity(name) {
  try {
    const q = new URLSearchParams({
      action: "wbsearchentities",
      search: name,
      language: "en",
      uselang: "en",
      limit: "1",
      format: "json",
      origin: "*",
    });
    const data = await (
      await get(`https://www.wikidata.org/w/api.php?${q}`, 10000)
    ).json();
    const hit = data?.search?.[0];
    if (!hit) return null;
    const entity = await (
      await get(
        `https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`,
        10000,
      )
    ).json();
    const title = entity?.entities?.[hit.id]?.sitelinks?.enwiki?.title;
    return {
      label: hit.label || name,
      description: hit.description || "",
      wikidata: `https://www.wikidata.org/wiki/${hit.id}`,
      wikipedia: title
        ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
        : undefined,
    };
  } catch {
    return null;
  }
}
function existingIdentity(content) {
  const links = [
    ...content.matchAll(
      /(https?:\/\/(?:en\.)?wikipedia\.org\/wiki\/[^\s)"'#?]+|https?:\/\/www\.wikidata\.org\/wiki\/Q\d+)/gi,
    ),
  ].map((m) => m[1]);
  return uniq(links);
}
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    const { url, projectName = "Entity Schema", pageContent = "" } =
      req.body || {};
    if (!url) return res.status(400).json({ error: "A URL is required." });
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const supplied = String(pageContent || "").trim();
    const page = supplied
      ? {
          content: supplied,
          finalUrl: target,
          format: /<html|<body|<h1|<title/i.test(supplied)
            ? "html"
            : "markdown",
          source: "Pasted page content",
        }
      : await fetchPage(target);
    const content = page.content;
    const finalUrl = page.finalUrl;
    const domain = new URL(finalUrl).origin;
    const title =
      page.format === "html"
        ? pick(content, /<title[^>]*>([\s\S]*?)<\/title>/i)
        : cleanName(content.match(/^Title:\s*(.+)$/im)?.[1] || "");
    const h1 =
      page.format === "html"
        ? pick(content, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
        : cleanName(content.match(/^#\s+(.+)$/m)?.[1] || title);
    const description =
      page.format === "html"
        ? pick(
            content,
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i,
          ) ||
          pick(
            content,
            /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
          )
        : content
            .split(/\n\s*\n/)
            .map((x) => x.replace(/^#+\s*/, "").trim())
            .find((x) => x.length > 80 && x.length < 400) || "";
    const canonical =
      page.format === "html"
        ? absolute(
            content.match(
              /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)/i,
            )?.[1] || finalUrl,
            finalUrl,
          )
        : finalUrl;
    const names =
      page.format === "html"
        ? candidates(content, title, h1)
        : markdownCandidates(content, title, h1);
    const resolved = [];
    for (let i = 0; i < names.length; i += 4)
      resolved.push(
        ...(await Promise.all(names.slice(i, i + 4).map(searchIdentity))),
      );
    const embedded = existingIdentity(content);
    const entities = names.map((name, i) => {
      const match = resolved[i];
      const exactEmbedded =
        match &&
        embedded.some(
          (x) =>
            x.includes(match.wikidata.split("/").pop()) ||
            (match.wikipedia &&
              decodeURIComponent(x)
                .replace(/_/g, " ")
                .toLowerCase()
                .includes(match.label.toLowerCase())),
        );
      return {
        id: String(i + 1),
        name: match?.label || name,
        type: typeFrom(match?.description, name),
        role: i === 0 ? "Primary subject" : "Secondary mention",
        evidence:
          i === 0
            ? h1
              ? `Visible H1: ${h1}`
              : `Page title: ${title}`
            : `Visible heading or repeated internal-link text: ${name}`,
        salience: i === 0 ? "High" : i < 3 ? "Medium" : "Low",
        property: i === 0 ? "about" : "mentions",
        candidateWikipedia: match?.wikipedia,
        candidateWikidata: match?.wikidata,
        identityStatus: exactEmbedded
          ? "Exact verified match"
          : match
            ? "Strong probable match"
            : "No reliable identity",
        approved: !!exactEmbedded,
      };
    });
    const pageId = `${canonical.replace(/#.*$/, "")}#webpage`;
    const entityNodes = entities.map((e) => {
      const node = {
        "@type": e.type,
        "@id": `${canonical}#entity-${e.id}`,
        name: e.name,
      };
      const sameAs = [e.candidateWikipedia, e.candidateWikidata].filter(
        Boolean,
      );
      if (e.approved && sameAs.length) node.sameAs = sameAs;
      return node;
    });
    const primary = entities[0];
    const secondary = entities.slice(1);
    const pageNode = {
      "@type": "WebPage",
      "@id": pageId,
      url: canonical,
      name: title || h1,
      isPartOf: { "@id": `${domain}/#website` },
    };
    if (primary)
      pageNode.about = { "@id": `${canonical}#entity-${primary.id}` };
    if (secondary.length)
      pageNode.mentions = secondary.map((e) => ({
        "@id": `${canonical}#entity-${e.id}`,
      }));
    const recommendation = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${domain}/#website`,
          url: domain,
          name: "[VERIFIED SITE NAME REQUIRED]",
        },
        pageNode,
        ...entityNodes,
      ],
    };
    const approved = entities.filter((e) => e.approved).length;
    const found = entities.filter((e) => e.candidateWikidata).length;
    const fallbackIssue =
      page.source !== "Direct HTML"
        ? [
            {
              id: "reader_fallback",
              severity: "Informational",
              category: "Content access",
              title:
                page.source === "Pasted page content"
                  ? "Pasted page content used"
                  : "Direct page access was blocked",
              evidence:
                page.source === "Pasted page content"
                  ? "The entity graph was generated from user-supplied visible page text or HTML."
                  : "The site returned an access-control response, so readable page content was retrieved through the fallback reader.",
              recommendation:
                "Entity extraction is available, but use Single URL Audit with direct access to inspect the page’s raw JSON-LD.",
              scope: "URL",
            },
          ]
        : [];
    const issues = [
      ...fallbackIssue,
      ...entities
        .filter((e) => e.candidateWikidata && !e.approved)
        .map((e, i) => ({
          id: `identity_${i}`,
          severity: "Medium",
          category: "Identity reconciliation",
          title: `Confirm the identity for ${e.name}`,
          evidence: `Wikidata candidate: ${e.candidateWikidata}`,
          recommendation:
            "Review the candidate and approve only if it represents the exact visible entity.",
          scope: "URL",
        })),
      ...(!entities.length
        ? [
            {
              id: "no_entity",
              severity: "High",
              category: "Entity extraction",
              title: "No primary entity found",
              evidence: "No usable H1 or title entity was extracted.",
              recommendation:
                "Add a descriptive page heading and identify the primary subject manually.",
              scope: "Content prerequisite",
            },
          ]
        : []),
    ];
    const audit = {
      id: `entity_${Date.now()}`,
      projectName,
      url: canonical,
      domain,
      mode: "Entity Schema Generator",
      auditedAt: new Date().toISOString(),
      isDemo: false,
      page: {
        title,
        h1,
        description,
        canonical,
        pageType: "Entity-focused WebPage",
        confidence: entities.length
          ? page.source === "Direct HTML"
            ? 82
            : 74
          : 40,
        evidence: [
          `${page.source} used for content extraction.`,
          primary
            ? `${primary.name} is the strongest visible subject signal.`
            : "No strong primary subject signal.",
          `${secondary.length} meaningful secondary mention(s) extracted.`,
          `${found} external identity candidate(s) found.`,
        ],
        alternate: "Manual entity review",
      },
      schemaItems: [],
      requirements: [
        {
          schemaType: "WebPage",
          level: "Required for site model",
          ecosystem: "Entity relationship",
          properties: ["@id", "url", "name", "isPartOf", "about", "mentions"],
          missing: [],
          reason:
            "Connects the canonical page to its primary and secondary entities.",
        },
        {
          schemaType: "sameAs",
          level: "Recommended",
          ecosystem: "Entity relationship",
          properties: ["Exact Wikipedia or Wikidata identity"],
          missing: entities.filter((e) => !e.approved).map((e) => e.name),
          reason:
            "Use only after exact identity approval; search similarity alone is insufficient.",
        },
      ],
      issues,
      entities,
      recommendation,
      validation: [
        {
          name: "Page content accessible",
          state: "Pass",
          details: `${page.source} completed successfully.`,
        },
        {
          name: "Primary entity identified",
          state: primary ? "Pass" : "Fail",
          details: primary
            ? `${primary.name} is connected through WebPage.about.`
            : "Manual input required.",
        },
        {
          name: "Entity identities verified",
          state:
            approved === entities.length && entities.length
              ? "Pass"
              : "Needs review",
          details: `${approved} of ${entities.length} identities approved.`,
        },
        {
          name: "about relationship present",
          state: primary ? "Pass" : "Fail",
          details: "The primary subject is linked from the WebPage node.",
        },
        {
          name: "mentions relationships present",
          state: secondary.length ? "Pass" : "Not applicable",
          details: `${secondary.length} secondary entities linked.`,
        },
        {
          name: "Visible-content consistency passed",
          state: "Needs review",
          details:
            "Confirm every entity is meaningfully represented in visible page content.",
        },
        {
          name: "Production ready",
          state: entities.some((e) => e.candidateWikidata && !e.approved)
            ? "Fail"
            : "Needs review",
          details: "Approve exact identity candidates, then complete final QA.",
        },
      ],
      executiveSummary: [
        page.source === "Direct HTML"
          ? "The live HTML page was retrieved directly."
          : `The entity graph was generated from ${page.source.toLowerCase()}.`,
        primary
          ? `The page is primarily about ${primary.name}.`
          : "A primary about entity could not be established.",
        `${secondary.length} meaningful entities are proposed through WebPage.mentions.`,
        `${found} Wikipedia/Wikidata identity candidate(s) were found; ${approved} are already supported by links on the page.`,
        `Unapproved candidates are intentionally excluded from sameAs until human confirmation.`,
      ],
      implementation: issues.map((i) => ({
        priority: i.severity,
        action: i.recommendation,
        owner: "SEO / Content",
        effort: "Low",
        acceptance: `${i.title} is resolved with an exact identity decision.`,
      })),
    };
    return res.status(200).json(audit);
  } catch (error) {
    const blocked = /HTTP (401|403|429)|timed out|fetch failed/i.test(
      error?.message || "",
    );
    return res.status(500).json({
      error:
        error?.name === "AbortError" || blocked
          ? "This site blocks automated page access. Copy the page’s visible content, paste it into the Page content fallback field, and run the Entity Schema Generator again."
          : error?.message || "Entity generation failed.",
    });
  }
}
