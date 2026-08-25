# Schema & Entity Markup Auditor

A Vercel-ready, evidence-first structured-data auditing app. Its core live checks are deterministic and do not require Gemini, Google AI Studio, or an API key.

## Deploy

1. Upload the extracted project files to a new GitHub repository.
2. Import that repository into Vercel.
3. Keep the detected framework as **Vite** and deploy.
4. No environment variables are required for the current MVP.

The Vercel function at `/api/audit` fetches a submitted public URL, extracts visible signals and JSON-LD, classifies the page, reports requirements and issues, and generates a placeholder-safe connected JSON-LD recommendation.

## Local development

```bash
pnpm install
pnpm dev
```

## Important limits

- Live auditing currently supports one URL at a time.
- Some sites block server-side crawlers; the UI reports that fetch error instead of fabricating results.
- Generated JSON-LD containing bracketed prerequisites is not production ready.
- Human approval is required for page classification, entity identity, `sameAs`, and final implementation.
