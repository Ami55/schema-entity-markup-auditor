# Schema & Entity Markup Auditor

A Vercel-ready, evidence-first structured-data auditing app. Its core live checks are deterministic and do not require Gemini, Google AI Studio, or an API key.

## Deploy

1. Upload the extracted project files to a new GitHub repository.
2. Import that repository into Vercel.
3. Keep the detected framework as **Vite** and deploy.
4. No environment variables are required for the current MVP.

The Vercel function at `/api/audit` fetches a submitted public URL, extracts visible signals and JSON-LD, classifies the page, reports requirements and issues, and generates a placeholder-safe connected JSON-LD recommendation.

The Page-Type Audit at `/api/page-type-audit` accepts a website or XML sitemap URL. It discovers sitemap indexes, groups up to 5,000 URLs into page families, samples representative URLs, detects existing JSON-LD types, and produces a template-level schema matrix and connected Schema Map.

The Entity Schema Generator at `/api/entity-schema` extracts a page's primary subject and meaningful mentions, searches Wikidata for identity candidates, proposes `about`, `mentions`, and `sameAs` relationships, and produces a connected entity graph. Search matches are never added to `sameAs` until a human approves the exact identity.

Travel template recommendations include `CollectionPage`, `ItemList`, `TouristTrip`, `Product`, `Service`, `Offer`, `Review`, and `AggregateRating` where appropriate. Review, rating, offer, and list markup remains conditional on matching visible, page-specific content; the auditor reports those prerequisites instead of inventing values.

## Local development

```bash
pnpm install
pnpm dev
```

## Important limits

- Single URL Audit runs detailed page-level checks. Page-Type Audit performs representative sitemap sampling rather than fetching every URL.
- Page-type classifications and sample selections must be reviewed before template-level implementation.
- Sitewide URL-by-URL crawling remains gated; the sitemap workflow is the safe default for large sites.
- Some sites block server-side crawlers; the UI reports that fetch error instead of fabricating results.
- Generated JSON-LD containing bracketed prerequisites is not production ready.
- Human approval is required for page classification, entity identity, `sameAs`, and final implementation.
