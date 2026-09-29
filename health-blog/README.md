# Everyday Health - health blog at /blog

The health blog shares the main domain with the existing static site. The Cloudflare build packages the original site at `/` and the React blog at `/blog`. It does not edit the original source pages.

## Fixing the homepage deployment

The old build deployed only the standalone blog, so assigning the main domain to it displayed the blog at `/`. The updated `npm run build` creates a combined deployment:

| URL | Content |
| --- | --- |
| `/` | Original repository `index.html`, copied unchanged |
| Existing static URLs | Original pages and assets |
| `/blog` or `/blog/` | Health blog listing |
| `/blog/:slug` | Published health article |
| `/blog/admin` | Health blog administrator |
| `/admin` | Redirect to `/blog/admin` for existing bookmarks |
| `/blog/sitemap.xml` | Dynamic health article sitemap |
| `/robots.txt`, `/sitemap.xml` | Existing static files, unchanged |

Push these code changes and redeploy Cloudflare Pages using the same root `health-blog/web`, build command `npm ci && npm run build`, and output `dist` (not `dist/blog`). Redeploy the Railway API changes too. Set Railway `SITE_URL` to the exact main-domain origin used in your browser, such as `https://vipnightbeauties.com`, **without `/blog`**. Keep Cloudflare `API_ORIGIN` set to the Railway API origin.

The build output includes `_routes.json` so the homepage and existing static pages do not invoke the blog function or depend on Railway availability. Blog JavaScript/CSS assets are under `/blog/assets/`; existing site assets remain under `/assets/`. A top-level `404.html` prevents missing static routes falling back to the React app. Public files are copied using an allowlist; `.env`, backend source, and dependencies are never published. Add any future static directories to `web/scripts/build-site.mjs` explicitly.

## Features

- React `/blog` listing and `/blog/:slug` articles. The root homepage remains static.
- `/blog/admin` login, create/edit, preview, draft, publish, and unpublish. Drafts are excluded from all public API, HTML, and sitemap responses.
- PostgreSQL storage, password hashing, expiring HttpOnly sessions, origin checks, login throttling, and concurrent-edit protection.
- Editable title, slug, summary, plain-text article body, author, category, HTTPS image URL/alt text, meta title, meta description, and Article/BlogPosting schema selection.
- Cloudflare Pages Functions render article content, canonical links, metadata and JSON-LD into the initial HTML. Publishing does not require a frontend rebuild.
- Schema properties derive from the editor fields and stored dates; arbitrary script or JSON injection is not accepted. Image uploads and rich-text formatting are not included.

## Local development

Requires Node 22+ and PostgreSQL. Create an empty database, then copy `api/.env.example` to `api/.env` and set your database connection and administrator credentials (password at least 16 characters).

From `api`:

```sh
npm ci
npm start
```

From `web`, in another terminal:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/blog/`, with admin at `/blog/admin`. Use that exact hostname because the API validates the Origin against SITE_URL. Vite proxies `/api` to port 3001. Local Vite serves only the blog development UI; the combined static site is in the production `dist` output. Initial-HTML SEO rendering runs through Pages Functions in production. To verify those functions locally after building, use the Wrangler Pages development server with `API_ORIGIN` bound to the local API and set SITE_URL to that server's origin.

## Railway API + PostgreSQL

1. Create a Neon PostgreSQL database and a Railway API service from this repository. A separate Railway database is not needed.
2. Set its root directory to `/health-blog/api`, start command to `npm start`, and healthcheck path to `/api/health`. Use one API replica with the built-in login limiter; configure a shared limiter before scaling replicas.
3. Set `DATABASE_URL` to the full Neon connection URL, preserving its SSL parameters, `SITE_URL` to the exact HTTPS blog frontend origin (no path), `ADMIN_EMAIL`, a strong unique `ADMIN_PASSWORD`, and `NODE_ENV=production`. Railway supplies PORT.
4. Generate the API's public HTTPS domain. Use this as Cloudflare's API_ORIGIN. No database credentials belong in frontend variables.
5. The server creates tables if missing at startup and updates the configured administrator password. Restarting revokes sessions. Changing ADMIN_EMAIL adds another administrator; remove obsolete admin rows explicitly if changing ownership.
6. Enable database backups through your hosting plan and verify a restore before using the blog for important content. Store image files in durable image hosting and paste their HTTPS URLs in the editor.

## Cloudflare Pages frontend

1. Connect this repository to Pages, set root directory to `health-blog/web`, build command `npm ci && npm run build`, and output directory `dist`.
2. Set the Pages **runtime environment variable** `API_ORIGIN` to the Railway API HTTPS origin. The `functions` folder must deploy with the project. Use the Git build integration or Wrangler Pages deployment; a static-only upload will not provide the API proxy or SEO rendering.
3. Set Node version to 22 or newer. Use the main domain and set Railway SITE_URL to exactly that origin, without `/blog`. Redeploy after updating Pages environment variables.
4. Admin cookies use the frontend's origin through the Pages proxy. No cross-domain cookie settings or public API tokens are required. Preview deployments need their own matching SITE_URL/API environment to permit admin writes.
5. Open `/blog/admin` and log in with the Railway administrator credentials. Create a draft, preview, then publish. Verify that `/` still displays the original homepage; check `/blog`, an article including its source metadata, `/blog/sitemap.xml`, and the original static pages. Submit `/blog/sitemap.xml` separately in Search Console if needed.

The Pages function intentionally uses no-store for fresh publication and unpublication. The frontend brand “Everyday Health” is a placeholder editable in `web/src/main.jsx` and the API render titles in `api/app.js`.

## Verification

```sh
cd api
npm test
cd ../web
npm run build
node --test --experimental-test-isolation=none scripts/build-site.test.mjs
```

On Windows, if `npm test` fails with `spawn EPERM`, run `node --test --experimental-test-isolation=none` from `api`.

API integration tests use an in-memory PostgreSQL emulator, not a live PostgreSQL server. Run the deployment acceptance flow above against actual Railway PostgreSQL and Cloudflare Pages before launch. No medical articles or production admin credentials are seeded.

Hosting references: [Railway monorepos](https://docs.railway.com/deployments/monorepo), [Railway PostgreSQL](https://docs.railway.com/databases/postgresql), [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/), [Pages runtime bindings](https://developers.cloudflare.com/pages/functions/bindings/).
