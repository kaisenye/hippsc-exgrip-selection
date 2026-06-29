# hippsc-exgrip-selection

API + Shopify UI for the EXGRIP tool-holder selection console.
Express on Vercel, data in DynamoDB, 3D files (STL/STEP) in S3.

## Run

```bash
npm i
npm run dev          # nodemon, :3000
```

Needs `.env`:

```
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DB_TABLE_NAME=
AWS_BUCKET_NAME=
```

## Endpoints

### `POST /process-data`
Final search. Body = full selection, returns matching products + presigned STL/STEP URLs.

```json
{ "spindle":"HSK63A", "length":"201-250", "toolType":"Standard End Mills", "boreDiameter":"8" }
```

### `POST /available-options`
Progressive UI. Given picks so far, returns the distinct values that exist for the next field (no dead ends).

```json
{ "selections": { "spindle":"HSK63A" }, "nextField": "length" }
→ { "field":"length", "values":["<=200","201-250"] }
```

- `selections` — accumulated picks; `{}` on the first step.
- `nextField` — `spindle | length | toolType | boreDiameter | thread | cuttingDiameter | edgeRadius`.
- `length` returns only non-empty buckets (`<=200 … >600`). Sub-spec field per toolType: bore/thread/cuttingDiameter/edgeRadius.

## Data model (DynamoDB)

One row per buildable combo: `spindle`, `length` (N), `toolType`, one sub-spec (`boreDiameter|thread|cuttingDiameter|edgeRadius`), product handles/SKUs, `id`.
S3 keys: `3d-files/{spindle}/{id}.STL` and `.step`.

## Layout

```
server.js              endpoints
utils/dynamoHelper.js  filter build, length buckets, scan, toolType→subspec map
aws/                   dynamo + s3 clients
shopify/               Liquid for the storefront (hand-copy into Shopify, no build)
  page.exgrip.liquid              progressive selector UI (page template)
  exgrip-product-display.liquid   results grid (Shopify section)
```

Frontend calls the Vercel base in `page.exgrip.liquid` (`API_BASE`). Edit there if it changes.

## Deploy

Push to `main` → Vercel (config in `vercel.json`). Shopify Liquid is copied by hand.
