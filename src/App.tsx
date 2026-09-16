import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Code2,
  Database,
  ExternalLink,
  FileCheck2,
  FileJson,
  GitBranch,
  Info,
  Network,
  Play,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Table2,
  X,
  XCircle,
} from "lucide-react";
import { Audit, ValidationState } from "./types";
import { demoAudit } from "./demo";

const tabs = [
  ["overview", "Overview"],
  ["classification", "Page Classification"],
  ["existing", "Existing Schema"],
  ["requirements", "Schema Requirements"],
  ["issues", "Missing & Invalid Markup"],
  ["schemaMap", "Schema Map"],
  ["entities", "Entity Map"],
  ["identity", "Identity Reconciliation"],
  ["jsonld", "JSON-LD Recommendation"],
  ["validation", "Validation"],
  ["matrix", "Page-Type Matrix"],
  ["plan", "Implementation Plan"],
  ["reports", "Reports & Exports"],
  ["saved", "Saved Audits"],
] as const;
type Tab = (typeof tabs)[number][0];
const stateClass = (s: ValidationState) =>
  s === "Pass"
    ? "pass"
    : s === "Fail"
      ? "fail"
      : s === "Needs review"
        ? "review"
        : "neutral";
const pretty = (v: unknown) => JSON.stringify(v, null, 2);

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Disclaimer() {
  return (
    <div className="disclaimer">
      <ShieldCheck />
      <span>
        Structured data can help search engines understand page content and may
        make eligible pages available for supported search features. Correct
        markup does not guarantee rankings, rich results, Knowledge Panel
        inclusion or AI citations. Entity recommendations must represent visible
        page content and exact verified identities.
      </span>
    </div>
  );
}
function updateEntityApproval(a: Audit, id: string): Audit {
  const entities = a.entities.map((x) =>
    x.id === id ? { ...x, approved: !x.approved } : x,
  );
  const graph = Array.isArray(a.recommendation?.["@graph"])
    ? [...(a.recommendation["@graph"] as Record<string, unknown>[])]
    : [];
  const nextGraph = graph.map((node) => {
    const entity = entities.find(
      (e) => node["@id"] === `${a.page.canonical}#entity-${e.id}`,
    );
    if (!entity) return node;
    const candidates = [
      entity.candidateWikipedia,
      entity.candidateWikidata,
    ].filter(Boolean);
    const clean = { ...node };
    delete clean.sameAs;
    if (entity.approved && candidates.length) clean.sameAs = candidates;
    return clean;
  });
  return {
    ...a,
    entities,
    recommendation: { ...a.recommendation, "@graph": nextGraph },
    validation: a.validation.map((v) =>
      v.name === "Entity identities verified"
        ? {
            ...v,
            state: (entities.every(
              (e) => e.approved || e.identityStatus === "No reliable identity",
            )
              ? "Pass"
              : "Needs review") as ValidationState,
            details: `${entities.filter((e) => e.approved).length} of ${entities.length} entity identities approved.`,
          }
        : v,
    ),
  };
}

export default function App() {
  const [active, setActive] = useState<Tab>("overview");
  const [audit, setAudit] = useState<Audit>(demoAudit);
  const [url, setUrl] = useState("");
  const [project, setProject] = useState("");
  const [mode, setMode] = useState("Single URL Audit");
  const [pageContent, setPageContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [guide, setGuide] = useState(false);
  const [saved, setSaved] = useState<Audit[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("schema-audits") || "[]");
    } catch {
      return [];
    }
  });
  const stats = useMemo(() => {
    const site = audit.siteAudit;
    const pageTypes = site?.pageTypes || [];
    return {
      urls: site?.discoveredUrls || 1,
      audited: site?.sampledUrls || 1,
      pageTypes: pageTypes.length || 1,
      withSchema: site
        ? pageTypes.filter((p) => p.existingSchemas.length).length
        : audit.schemaItems.length
          ? 1
          : 0,
      withoutSchema: site
        ? pageTypes.filter((p) => !p.existingSchemas.length).length
        : audit.schemaItems.length
          ? 0
          : 1,
      valid: audit.schemaItems.filter((s) => s.parseStatus === "Valid").length,
      invalid: audit.schemaItems.filter((s) => s.parseStatus === "Invalid")
        .length,
      missing: site
        ? pageTypes.filter((p) => p.status !== "Covered").length
        : audit.requirements.reduce((n, r) => n + r.missing.length, 0),
      entities: audit.entities.length,
      verified: audit.entities.filter(
        (e) => e.identityStatus === "Exact verified match",
      ).length,
      high: audit.issues.filter((i) =>
        ["Critical", "High"].includes(i.severity),
      ).length,
    };
  }, [audit]);
  async function run() {
    setError("");
    if (mode === "Sitewide Schema Audit") {
      setError(
        "Start with Page-Type Audit. It safely samples each sitemap family; a full URL-by-URL crawl is intentionally reserved for a later advanced mode.",
      );
      return;
    }
    if (!url.trim()) {
      setError(
        mode === "Page-Type Audit"
          ? "Enter a website or sitemap URL."
          : "Enter a live URL to audit.",
      );
      return;
    }
    setLoading(true);
    try {
      const endpoint =
        mode === "Page-Type Audit"
          ? "/api/page-type-audit"
          : mode === "Entity Schema Generator"
            ? "/api/entity-schema"
            : "/api/audit";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          projectName: project || "Schema Audit",
          pageContent:
            mode === "Entity Schema Generator" ? pageContent : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audit failed");
      setAudit(data);
      setActive(
        mode === "Page-Type Audit"
          ? "matrix"
          : mode === "Entity Schema Generator"
            ? "entities"
            : "overview",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  function save() {
    const next = [audit, ...saved.filter((s) => s.id !== audit.id)].slice(
      0,
      30,
    );
    setSaved(next);
    localStorage.setItem("schema-audits", JSON.stringify(next));
  }
  function exportFile(value: unknown, name: string, type = "application/json") {
    const blob = new Blob([typeof value === "string" ? value : pretty(value)], {
      type,
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function copy() {
    await navigator.clipboard.writeText(pretty(audit.recommendation));
  }
  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="logo">
            <GitBranch />
          </div>
          <div>
            <h1>Schema &amp; Entity Markup Auditor</h1>
            <p>
              Evidence-based structured data, entity identity and JSON-LD
              implementation
            </p>
          </div>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => setGuide(true)}>
            <BookOpen />
            How It Works
          </button>
          <button className="ghost" onClick={save}>
            <Save />
            Save Audit
          </button>
          <button className="primary" onClick={run} disabled={loading}>
            {loading ? <RefreshCw className="spin" /> : <Play />}Run Schema
            Audit
          </button>
        </div>
      </header>
      <Disclaimer />
      <section className="workspace">
        <aside className="left-rail">
          <div className="setup">
            <div className="section-title">
              <Search />
              Audit setup
            </div>
            <label>
              Project name
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="Schema implementation audit"
              />
            </label>
            <label>
              Analysis mode
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option>Single URL Audit</option>
                <option>Page-Type Audit</option>
                <option>Entity Schema Generator</option>
                <option>Sitewide Schema Audit</option>
              </select>
            </label>
            <label>
              {mode === "Page-Type Audit"
                ? "Website or sitemap URL"
                : "Target URL"}
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  mode === "Page-Type Audit"
                    ? "https://www.example.com/sitemap.xml"
                    : "https://www.example.com/page"
                }
              />
            </label>
            <div className="mode-note">
              <Info />
              {mode === "Page-Type Audit"
                ? "Discovers sitemap families, groups URLs by template, then audits representative samples from each page type."
                : mode === "Entity Schema Generator"
                  ? "Finds what the page is about, meaningful mentions and identity candidates, then builds an approval-safe entity graph."
                  : mode === "Sitewide Schema Audit"
                    ? "Full-crawl mode is intentionally gated until page-type coverage is approved."
                    : "Audits the visible content, entities and structured data on one live page."}
            </div>
            {mode === "Entity Schema Generator" && (
              <label className="content-fallback">
                Page content <span>optional fallback</span>
                <textarea
                  value={pageContent}
                  onChange={(e) => setPageContent(e.target.value)}
                  placeholder="If the site returns HTTP 403, paste the page's visible text or HTML here, then run again."
                />
                <small>
                  Use this only when direct access is blocked. The report will
                  label pasted content as its source.
                </small>
              </label>
            )}
            <div className="toggles">
              {[
                "Include entity analysis",
                "Find Wikidata identity",
                "Find Wikipedia identity",
                "Generate JSON-LD recommendation",
                "Validate Google requirements",
                "Validate Schema.org vocabulary",
              ].map((x) => (
                <label key={x}>
                  <input type="checkbox" defaultChecked />
                  {x}
                </label>
              ))}
            </div>
            {error && (
              <div className="error">
                <AlertTriangle />
                {error}
              </div>
            )}
            <button className="primary full" onClick={run} disabled={loading}>
              {loading ? <RefreshCw className="spin" /> : <Play />}
              {loading
                ? mode === "Page-Type Audit"
                  ? "Reading sitemap…"
                  : mode === "Entity Schema Generator"
                    ? "Resolving entities…"
                    : "Auditing page…"
                : mode === "Entity Schema Generator"
                  ? "Generate Entity Schema"
                  : "Run Schema Audit"}
            </button>
            <button
              className="demo"
              onClick={() => {
                setAudit(demoAudit);
                setActive("overview");
              }}
            >
              Load labelled demo data
            </button>
          </div>
          <nav className="report-nav" aria-label="Audit report sections">
            <div className="nav-title">
              <span>Audit report</span>
              <Badge tone={audit.isDemo ? "review" : "pass"}>
                {audit.isDemo ? "Demo" : "Live"}
              </Badge>
            </div>
            {tabs.map(([id, label], index) => (
              <React.Fragment key={id}>
                {index === 9 && (
                  <div className="nav-group">Planning &amp; export</div>
                )}
                <button
                  className={active === id ? "active" : ""}
                  onClick={() => setActive(id)}
                >
                  <span className="nav-marker">{index + 1}</span>
                  <span>{label}</span>
                  {id === "issues" && audit.issues.length > 0 && (
                    <b>{audit.issues.length}</b>
                  )}
                  {active === id && <ChevronRight />}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </aside>
        <main>
          <div className="audit-head">
            <div>
              <div className="eyebrow">
                {audit.isDemo ? "DEMO DATA — NOT A LIVE AUDIT" : audit.mode}
              </div>
              <h2>{audit.projectName}</h2>
              <a href={audit.url} target="_blank">
                {audit.url}
                <ExternalLink />
              </a>
            </div>
            <div>
              <Badge tone={audit.isDemo ? "review" : "pass"}>
                {audit.isDemo ? "Representative demo" : "Live extraction"}
              </Badge>
              <div className="date">
                Audited {new Date(audit.auditedAt).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="panel">
            {active === "overview" && <Overview audit={audit} stats={stats} />}{" "}
            {active === "classification" && <Classification audit={audit} />}{" "}
            {active === "existing" && <Existing audit={audit} />}{" "}
            {active === "requirements" && <Requirements audit={audit} />}{" "}
            {active === "issues" && <Issues audit={audit} />}{" "}
            {active === "schemaMap" && <SchemaMap audit={audit} />}{" "}
            {active === "entities" && (
              <Entities audit={audit} setAudit={setAudit} />
            )}{" "}
            {active === "identity" && <Identity audit={audit} />}{" "}
            {active === "jsonld" && <JsonLd audit={audit} copy={copy} />}{" "}
            {active === "validation" && <Validation audit={audit} />}{" "}
            {active === "matrix" && <Matrix audit={audit} />}{" "}
            {active === "plan" && <Plan audit={audit} />}{" "}
            {active === "reports" && (
              <Reports audit={audit} exportFile={exportFile} copy={copy} />
            )}{" "}
            {active === "saved" && (
              <Saved
                saved={saved}
                open={(a) => {
                  setAudit(a);
                  setActive("overview");
                }}
                remove={(id) => {
                  const n = saved.filter((a) => a.id !== id);
                  setSaved(n);
                  localStorage.setItem("schema-audits", JSON.stringify(n));
                }}
              />
            )}
          </div>
        </main>
      </section>
      <footer>
        <div>
          <strong>Schema &amp; Entity Markup Auditor</strong>
          <p>
            Structured-data evidence, entity reconciliation and implementation
            QA.
          </p>
        </div>
        <span>
          © 2026 Schema &amp; Entity Markup Auditor. Developed by{" "}
          <b>Ami - SEO Girl</b>. All rights reserved.
        </span>
      </footer>
      {guide && <Guide close={() => setGuide(false)} />}
    </div>
  );
}

function Overview({ audit, stats }: { audit: Audit; stats: any }) {
  const cards = [
    ["URLs audited", stats.audited],
    ["Page types", stats.pageTypes],
    ["Pages with schema", stats.withSchema],
    ["Valid schema items", stats.valid],
    ["Invalid schema items", stats.invalid],
    ["Missing properties", stats.missing],
    ["Entities identified", stats.entities],
    ["Verified identities", stats.verified],
    ["High-priority fixes", stats.high],
  ];
  return (
    <>
      <div className="kpis">
        {cards.map(([a, b]) => (
          <div className="kpi" key={a}>
            <span>{a}</span>
            <strong>{b}</strong>
          </div>
        ))}
      </div>
      <div className="two">
        <section className="card">
          <h3>Executive summary</h3>
          {audit.executiveSummary.map((x, i) => (
            <p className="summary" key={x}>
              <span>{i + 1}</span>
              {x}
            </p>
          ))}
        </section>
        <section className="card">
          <h3>Audit status</h3>
          {audit.validation.map((v) => (
            <div className="status-row" key={v.name}>
              <span>{v.name}</span>
              <Badge tone={stateClass(v.state)}>{v.state}</Badge>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
function Classification({ audit }: { audit: Audit }) {
  if (audit.siteAudit)
    return (
      <>
        <div className="map-intro">
          <div>
            <span>SITEMAP CLASSIFICATION</span>
            <h3>{audit.siteAudit.pageTypes.length} page families discovered</h3>
            <p>
              Classification uses URL patterns and representative page samples.
              Review the samples before implementing template-level schema.
            </p>
          </div>
          <Badge tone="pass">
            {audit.siteAudit.discoveredUrls} URLs mapped
          </Badge>
        </div>
        <div className="classification-grid">
          {audit.siteAudit.pageTypes.map((p) => (
            <section className="card" key={p.id}>
              <div className="row">
                <h3>{p.name}</h3>
                <Badge
                  tone={
                    p.status === "Covered"
                      ? "pass"
                      : p.status === "Missing"
                        ? "fail"
                        : "review"
                  }
                >
                  {p.status}
                </Badge>
              </div>
              <div className="family-count">
                {p.urlCount}
                <small>URLs</small>
              </div>
              <p>
                <b>Patterns:</b> {p.patterns.join(", ")}
              </p>
              <p>
                <b>Samples:</b>
              </p>
              {p.sampleUrls.map((u) => (
                <a className="sample-url" href={u} target="_blank" key={u}>
                  {u}
                  <ExternalLink />
                </a>
              ))}
            </section>
          ))}
        </div>
      </>
    );
  return (
    <div className="two">
      <section className="card">
        <h3>Classification decision</h3>
        <div className="big-type">{audit.page.pageType}</div>
        <div className="confidence">
          <span style={{ width: `${audit.page.confidence}%` }} />
        </div>
        <p>
          {audit.page.confidence}% confidence · Alternative:{" "}
          {audit.page.alternate}
        </p>
        <button className="small">
          Human approval required before final schema
        </button>
      </section>
      <section className="card">
        <h3>Supporting evidence</h3>
        {audit.page.evidence.map((x) => (
          <p className="bullet" key={x}>
            <CheckCircle2 />
            {x}
          </p>
        ))}
        <dl>
          <dt>Title</dt>
          <dd>{audit.page.title || "Not extracted"}</dd>
          <dt>H1</dt>
          <dd>{audit.page.h1 || "Not extracted"}</dd>
          <dt>Canonical</dt>
          <dd>{audit.page.canonical}</dd>
        </dl>
      </section>
    </div>
  );
}
function Existing({ audit }: { audit: Audit }) {
  return (
    <>
      {!audit.schemaItems.length ? (
        <Empty text="No structured data was extracted from this page." />
      ) : (
        <div className="schema-grid">
          {audit.schemaItems.map((s) => (
            <section className="card" key={s.id}>
              <div className="row">
                <h3>{s.type.join(" + ")}</h3>
                <Badge tone={s.parseStatus === "Valid" ? "pass" : "fail"}>
                  {s.parseStatus}
                </Badge>
              </div>
              <p>
                {s.format} · {s.googleEligibility}
              </p>
              <pre>{pretty(s.properties)}</pre>
              {s.errors.map((e) => (
                <div className="error" key={e}>
                  {e}
                </div>
              ))}
              {s.warnings.map((e) => (
                <div className="warning" key={e}>
                  {e}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
function Requirements({ audit }: { audit: Audit }) {
  return (
    <Table
      heads={[
        "Schema type",
        "Level",
        "Ecosystem",
        "Required/recommended properties",
        "Missing",
        "Reason",
      ]}
      rows={audit.requirements.map((r) => [
        r.schemaType,
        <Badge tone={r.level.includes("Required") ? "fail" : "neutral"}>
          {r.level}
        </Badge>,
        r.ecosystem,
        r.properties.join(", "),
        r.missing.length ? r.missing.join(", ") : "None",
        <span>
          {r.reason}
          {r.prerequisite && <small>{r.prerequisite}</small>}
        </span>,
      ])}
    />
  );
}
function Issues({ audit }: { audit: Audit }) {
  return (
    <Table
      heads={["Severity", "Issue", "Evidence", "Scope", "Recommendation"]}
      rows={audit.issues.map((i) => [
        <Badge
          tone={
            i.severity === "Critical"
              ? "fail"
              : i.severity === "High"
                ? "review"
                : "neutral"
          }
        >
          {i.severity}
        </Badge>,
        <b>{i.title}</b>,
        i.evidence,
        i.scope,
        i.recommendation,
      ])}
    />
  );
}
function Entities({
  audit,
  setAudit,
}: {
  audit: Audit;
  setAudit: React.Dispatch<React.SetStateAction<Audit>>;
}) {
  return (
    <>
      <div className="entity-note">
        <Info />
        “Entity Schema” connects real entities with valid Schema.org types and
        properties such as <b>about</b>, <b>mentions</b>, <b>mainEntity</b> and{" "}
        <b>sameAs</b>. Search candidates remain unapproved until a human
        confirms the exact identity.
      </div>
      {audit.entities.length ? (
        <div className="entity-visual">
          <div className="entity-page">
            <span>WEBPAGE</span>
            <b>{audit.page.h1 || audit.page.title}</b>
            <small>{audit.page.canonical}</small>
          </div>
          <div className="entity-axis" />
          <div className="entity-nodes">
            {audit.entities.map((e) => (
              <div
                className={`entity-node ${e.property === "about" || e.property === "mainEntity" ? "primary-entity" : ""}`}
                key={e.id}
              >
                <span className="relationship">{e.property}</span>
                <b>{e.name}</b>
                <small>
                  {e.type} · {e.role}
                </small>
                {(e.candidateWikipedia || e.candidateWikidata) && (
                  <div className="sameas">
                    <i />
                    sameAs candidate{e.approved ? " · approved" : ""}
                  </div>
                )}
                <div className="identity-links">
                  {e.candidateWikipedia && (
                    <a href={e.candidateWikipedia} target="_blank">
                      Wikipedia
                    </a>
                  )}
                  {e.candidateWikidata && (
                    <a href={e.candidateWikidata} target="_blank">
                      Wikidata
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Empty text="No meaningful entities were found on this page." />
      )}
      <Table
        heads={[
          "Entity",
          "Type & role",
          "Evidence",
          "Property",
          "Identity status",
          "Human approval",
        ]}
        rows={audit.entities.map((e) => [
          <b>{e.name}</b>,
          <span>
            {e.type}
            <small>{e.role}</small>
          </span>,
          e.evidence,
          <code>{e.property}</code>,
          <Badge
            tone={
              e.identityStatus === "Exact verified match"
                ? "pass"
                : e.identityStatus === "Ambiguous"
                  ? "fail"
                  : "review"
            }
          >
            {e.identityStatus}
          </Badge>,
          <label className="approval">
            <input
              type="checkbox"
              checked={e.approved}
              disabled={
                e.identityStatus === "Ambiguous" ||
                e.identityStatus === "No reliable identity"
              }
              onChange={() => setAudit((a) => updateEntityApproval(a, e.id))}
            />
            <span>{e.approved ? "Approved" : "Review"}</span>
          </label>,
        ])}
      />
    </>
  );
}
function Identity({ audit }: { audit: Audit }) {
  return (
    <Table
      heads={[
        "Entity",
        "Wikipedia candidate",
        "Wikidata candidate",
        "Status",
        "Decision",
      ]}
      rows={audit.entities.map((e) => [
        e.name,
        e.candidateWikipedia ? (
          <a href={e.candidateWikipedia} target="_blank">
            Open candidate
          </a>
        ) : (
          "None"
        ),
        e.candidateWikidata ? (
          <a href={e.candidateWikidata} target="_blank">
            Open candidate
          </a>
        ) : (
          "None"
        ),
        e.identityStatus,
        e.approved
          ? "Approved for sameAs"
          : e.identityStatus === "Ambiguous"
            ? "Rejected automatically"
            : "Human review required",
      ])}
    />
  );
}
function JsonLd({ audit, copy }: { audit: Audit; copy: () => void }) {
  const unresolved =
    pretty(audit.recommendation).match(/\[[A-Z][^\]]+\]/g) || [];
  return (
    <>
      <div className={`production ${unresolved.length ? "bad" : "good"}`}>
        {unresolved.length ? (
          <>
            <XCircle />
            Not ready for production — {unresolved.length} unresolved
            prerequisite(s)
          </>
        ) : (
          <>
            <CheckCircle2 />
            Ready for final QA
          </>
        )}
      </div>
      <div className="code-head">
        <h3>Connected JSON-LD recommendation</h3>
        <button onClick={copy}>
          <Clipboard />
          Copy JSON-LD
        </button>
      </div>
      <pre className="code">{pretty(audit.recommendation)}</pre>
      {unresolved.length > 0 && (
        <section className="card">
          <h3>Unresolved placeholders</h3>
          {[...new Set(unresolved)].map((x) => (
            <p className="bullet" key={x}>
              <AlertTriangle />
              {x}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
function Validation({ audit }: { audit: Audit }) {
  return (
    <div className="validation-grid">
      {audit.validation.map((v) => (
        <section className={`validation ${stateClass(v.state)}`} key={v.name}>
          {v.state === "Pass" ? (
            <CheckCircle2 />
          ) : v.state === "Fail" ? (
            <XCircle />
          ) : (
            <AlertTriangle />
          )}
          <div>
            <h3>{v.name}</h3>
            <p>{v.details}</p>
          </div>
          <Badge tone={stateClass(v.state)}>{v.state}</Badge>
        </section>
      ))}
    </div>
  );
}
function SchemaMap({ audit }: { audit: Audit }) {
  if (!audit.siteAudit)
    return (
      <>
        <div className="entity-note">
          <Network />
          Run a Page-Type Audit to build a sitemap-driven schema map. For this
          URL, use the Entity Map to inspect page-level relationships.
        </div>
        <Empty text="No site schema map is available for a single-page audit." />
      </>
    );
  const site = audit.siteAudit;
  return (
    <>
      <div className="map-intro">
        <div>
          <span>SCHEMA ARCHITECTURE</span>
          <h3>Recommended connected graph</h3>
          <p>
            This map separates reusable site identity from template-level page
            schema and primary entities.
          </p>
        </div>
        <div className="map-legend">
          <i className="existing" />
          Existing
          <i className="recommended" />
          Recommended
          <i className="missing" />
          Missing
        </div>
      </div>
      <div className="schema-map">
        <div className="map-root">
          <span>Site identity</span>
          <b>Organization + WebSite</b>
          <small>Reusable @id nodes across every template</small>
        </div>
        <div className="map-trunk" />
        <div className="map-families">
          {site.pageTypes.map((p) => (
            <div className="map-family" key={p.id}>
              <div className="map-page">
                <span>{p.urlCount} URLs</span>
                <b>{p.name}</b>
                <small>
                  WebPage /{" "}
                  {p.name.includes("list")
                    ? "CollectionPage"
                    : "mainEntityOfPage"}
                </small>
              </div>
              <div className="map-line" />
              <div className="map-schemas">
                {p.recommendedSchemas.map((s) => (
                  <div
                    className={`map-schema ${p.existingSchemas.includes(s.type) ? "existing" : s.level === "Required" ? "missing" : "recommended"}`}
                    key={s.type}
                  >
                    <b>{s.type}</b>
                    <small>
                      {p.existingSchemas.includes(s.type)
                        ? "Detected"
                        : s.level}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="map-rule">
        <Info />
        <span>
          <b>Connection rule:</b> Each page node should use{" "}
          <code>isPartOf</code> to reference WebSite, then <code>about</code>,{" "}
          <code>mainEntity</code>, or <code>itemListElement</code> to connect
          its primary subject.
        </span>
      </div>
    </>
  );
}
function Matrix({ audit }: { audit: Audit }) {
  if (audit.siteAudit)
    return (
      <>
        <div className="matrix-summary">
          <div>
            <b>{audit.siteAudit.discoveredUrls}</b>
            <span>URLs discovered</span>
          </div>
          <div>
            <b>{audit.siteAudit.pageTypes.length}</b>
            <span>Page types</span>
          </div>
          <div>
            <b>{audit.siteAudit.sampledUrls}</b>
            <span>Pages sampled</span>
          </div>
          <div>
            <b>
              {
                audit.siteAudit.pageTypes.filter((p) => p.status === "Covered")
                  .length
              }
            </b>
            <span>Templates covered</span>
          </div>
        </div>
        <Table
          heads={[
            "Page type",
            "URLs",
            "Representative samples",
            "Existing schema",
            "Schema needed",
            "Coverage",
            "Status",
          ]}
          rows={audit.siteAudit.pageTypes.map((p) => [
            <b>{p.name}</b>,
            p.urlCount,
            <span>
              {p.sampled} audited<small>{p.patterns.join(" · ")}</small>
            </span>,
            p.existingSchemas.length ? (
              p.existingSchemas.join(", ")
            ) : (
              <Badge tone="fail">None detected</Badge>
            ),
            <div className="schema-needs">
              {p.recommendedSchemas.map((s) => (
                <span key={s.type}>
                  <b>{s.type}</b>
                  <small>
                    {s.level} — {s.reason}
                  </small>
                </span>
              ))}
            </div>,
            `${p.coverage}%`,
            <Badge
              tone={
                p.status === "Covered"
                  ? "pass"
                  : p.status === "Missing"
                    ? "fail"
                    : "review"
              }
            >
              {p.status}
            </Badge>,
          ])}
        />
      </>
    );
  return (
    <Table
      heads={[
        "Page type",
        "Primary/supporting schema",
        "Entity markup",
        "Google feature",
        "Missing elements",
        "Priority",
        "Approval",
      ]}
      rows={[
        [
          audit.page.pageType,
          audit.requirements.map((r) => r.schemaType).join(", "),
          audit.entities.map((e) => `${e.property}: ${e.name}`).join("; ") ||
            "None",
          audit.requirements
            .filter((r) => r.ecosystem.includes("Google"))
            .map((r) => r.schemaType)
            .join(", ") || "None",
          audit.requirements.flatMap((r) => r.missing).join(", ") || "None",
          audit.issues.some((i) => ["Critical", "High"].includes(i.severity))
            ? "High"
            : "Medium",
          "Human approval required",
        ],
      ]}
    />
  );
}
function Plan({ audit }: { audit: Audit }) {
  return (
    <Table
      heads={[
        "Priority",
        "Action",
        "Owner",
        "Effort",
        "Status",
        "Acceptance criteria",
      ]}
      rows={audit.implementation.map((x) => [
        <Badge
          tone={
            x.priority === "Critical"
              ? "fail"
              : x.priority === "High"
                ? "review"
                : "neutral"
          }
        >
          {x.priority}
        </Badge>,
        x.action,
        x.owner,
        x.effort,
        "Proposed",
        x.acceptance,
      ])}
    />
  );
}
function Reports({
  audit,
  exportFile,
  copy,
}: {
  audit: Audit;
  exportFile: (v: unknown, n: string, t?: string) => void;
  copy: () => void;
}) {
  return (
    <div className="export-grid">
      <button onClick={() => exportFile(audit, "schema-audit.json")}>
        <FileJson />
        Full audit JSON<span>All evidence, statuses and recommendations</span>
      </button>
      <button
        onClick={() => exportFile(audit.schemaItems, "existing-schema.json")}
      >
        <Database />
        Existing schema<span>Extracted JSON-LD and parse results</span>
      </button>
      <button onClick={() => exportFile(audit.entities, "entity-map.json")}>
        <GitBranch />
        Entity map<span>Identity candidates and approvals</span>
      </button>
      <button
        onClick={() => exportFile(audit.issues, "implementation-issues.json")}
      >
        <Table2 />
        Issues &amp; requirements
        <span>Prioritised implementation evidence</span>
      </button>
      <button onClick={copy}>
        <Code2 />
        Copy JSON-LD<span>Copy the connected recommendation</span>
      </button>
      <button onClick={() => window.print()}>
        <FileCheck2 />
        Printable report<span>Print or save the current view as PDF</span>
      </button>
    </div>
  );
}
function Saved({
  saved,
  open,
  remove,
}: {
  saved: Audit[];
  open: (a: Audit) => void;
  remove: (id: string) => void;
}) {
  return saved.length ? (
    <div className="saved-list">
      {saved.map((a) => (
        <section className="card row" key={a.id}>
          <div>
            <h3>{a.projectName}</h3>
            <p>
              {a.url} · {new Date(a.auditedAt).toLocaleString()}
            </p>
          </div>
          <div>
            <button onClick={() => open(a)}>Open</button>
            <button onClick={() => remove(a.id)}>Archive</button>
          </div>
        </section>
      ))}
    </div>
  ) : (
    <Empty text="No saved audits yet. Run or save an audit to preserve it in this browser." />
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Archive />
      <h3>{text}</h3>
    </div>
  );
}
function Table({
  heads,
  rows,
}: {
  heads: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Guide({ close }: { close: () => void }) {
  const steps = [
    [
      "1. Choose scope",
      "Start with one URL. Page-type and sitewide audits should use representative samples, not every URL.",
    ],
    [
      "2. Extract first",
      "The auditor fetches visible page signals and existing JSON-LD before recommending anything.",
    ],
    [
      "3. Confirm page type",
      "Review classification evidence. Final recommendations require sufficient confidence or human confirmation.",
    ],
    [
      "4. Separate standards",
      "Google-supported features, Schema.org semantics and entity relationships are reported independently.",
    ],
    [
      "5. Reconcile entities",
      "Use about for primary subjects, mentions for meaningful secondary entities and sameAs only for exact identities.",
    ],
    [
      "6. Resolve prerequisites",
      "Add missing visible authors, dates, images, prices or identity evidence before adding them to markup.",
    ],
    [
      "7. Review JSON-LD",
      "Connected @graph nodes reuse stable @id values. Any placeholder means the code is not production ready.",
    ],
    [
      "8. Validate separately",
      "Check JSON syntax, Schema.org semantics, Google requirements, identity verification and visible-content consistency.",
    ],
    [
      "9. Implement and save",
      "Export the plan, obtain human approvals, validate in QA, save the audit and compare again after release.",
    ],
  ];
  return (
    <div className="modal-bg">
      <div className="modal">
        <button className="close" onClick={close}>
          <X />
        </button>
        <div className="eyebrow">FRAMEWORK &amp; OPERATING INSTRUCTIONS</div>
        <h2>How the Schema &amp; Entity Markup Auditor works</h2>
        <p>
          The workflow prevents schema-first guessing: evidence and page
          classification come before recommendation and code.
        </p>
        <div className="guide-grid">
          {steps.map(([h, p]) => (
            <section key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
            </section>
          ))}
        </div>
        <Disclaimer />
      </div>
    </div>
  );
}
