# TOOHUU storefront and admin

Storefront: https://toohuubrand.com/ · Protected dashboard: https://toohuubrand.com/admin

The dashboard manages the shared catalog in Cloudflare D1: names, prices, model-level stock, categories, images, descriptions, options and visibility. Both the storefront and admin read this catalog. Orders are still sent through Messenger; no payment or order processing is implied.

`ADMIN_USER` and `ADMIN_PASS` are existing Cloudflare Pages production secrets. They are never bundled in browser assets. Every `/admin` route and API is protected by server-side authentication; writes also require a same-origin request with a validated content type. Keep using HTTPS. Preview deployments have no production database binding or login secrets.

`CATALOG_DB` is configured in `wrangler.jsonc`. Apply `migrations/0001_catalog.sql` once and initialize the singleton catalog from `lib/catalog-seed.json` only for a new database. Never reseed an existing catalog on deployment. Revision checks reject stale edits; an SQL trigger records each successful change and its before/after state atomically. History is immutable through the application and limited to the last 50 entries in the UI. Hiding a product requires a reason, and products can be shown again.

Stock is the total per model, not per size/color. Existing option combinations are preserved for metadata edits. Editing option lists regenerates their combinations while retaining IDs for unchanged combinations. Seed prices, counts and audience assignments are provisional as requested by the owner.

Each product supports an ordered gallery of up to 20 images. The first image is its cover. Uploads are resized to at most 1600 pixels and compressed in the browser, then saved through the authenticated `/admin/api/images` endpoint. Only bounded JPEG, PNG and WebP raster files are accepted. Immutable, content-addressed image bytes and upload attribution are stored separately in D1 (`0002_media.sql`) and served by `/media/:id`. Removing an image from a gallery only removes its reference; it does not erase the stored file or history. Public HTTPS/individual Google Drive image links also remain supported.

Product options use checkboxes (including the 20-color palette); the single product group/audience uses radio choices. Custom option values remain selectable. A model supports up to 1,500 combinations; the full catalog remains bounded to fit atomic before/after audit records. Run focused tests with Node 22.13+ using `node --test tests/gallery-media.test.mjs`.

Build: `node scripts/build.mjs`. Cloudflare Pages builds from `main`, publishes `dist`, and compiles root `functions/`. Only the four browser assets go into `dist`; source, migrations and local secrets are excluded.

For local development, create ignored `.dev.vars` containing separate test-only `ADMIN_USER` and `ADMIN_PASS`, run D1 migrations and seed locally, then run `wrangler pages dev dist`. Local authentication and data are separate from production. Never commit `.dev.vars` or use the production database for test edits.
