# Mini Melts — Order Form

Vercel-hosted order form for Mini Melts Canada DSD customers.

Writes directly to Supabase `orders` table when a customer submits.

## How it works

1. Customer scans QR on their freezer → lands at `orders.minimelts.ca?s=MM-1234`
2. Form looks up the store by `public_code` from the `store_public_info` view
3. Customer confirms contact info + picks stock level → submits
4. Row inserted into `orders` with `source='online'`, status=`pending`
5. Depot manager sees it on the scheduling board (to be built)

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Create .env.local from .env.example
cp .env.example .env.local
# then fill in your Supabase URL and anon key

# 3. Run the dev server
npm run dev
```

Then open:
- `http://localhost:3000` — manual code entry
- `http://localhost:3000?s=MM-1000` — simulates QR scan (Boni Soir 8703)
- `http://localhost:3000?s=MM-1234` — any valid code

## Deploying to Vercel

### Option A: Via Vercel CLI (fastest)

```bash
npm install -g vercel
vercel login
vercel --prod
```

Follow the prompts. After first deploy, set env vars in the Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Option B: Via GitHub

1. Push this directory to a GitHub repo (e.g. `minimelts-orders`)
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the repo
4. Add the two env vars above during setup
5. Deploy

### Custom domain (orders.minimelts.ca)

1. In Vercel → Project → Settings → Domains → add `orders.minimelts.ca`
2. Vercel will show a CNAME value (e.g., `cname.vercel-dns.com`)
3. In your DNS provider, add a CNAME record:
   - Name: `orders`
   - Value: `cname.vercel-dns.com`
   - TTL: 3600
4. Wait 1–10 minutes for propagation. Vercel auto-issues an SSL certificate.

## Schema reference

This form depends on two Supabase objects:

- **View `store_public_info`**: exposes `id`, `public_code`, `name`, `first_name`, `last_name`, `phone`, `email`, `ship_addr1`, `ship_city`, `province`, `ship_postal`, `active` for active stores
- **Table `orders`**: receives INSERTs from the form

RLS policy on `orders` allows anonymous INSERT (the anon key is safe in the browser).

## Security notes

- The anon key is public by design (embedded in every Supabase JS browser client)
- RLS policy restricts anon users to INSERT only, nothing else
- No sensitive store fields (billing terms, prices, QB sync status) are exposed to the anon view
- No authentication required for customers — frictionless ordering

## What this form intentionally does not capture

- Specific flavor quantities (driver chooses based on what sells at each store)
- Payment info (handled at delivery)
- Shipping address changes (rare; customer should call)

## Next steps (not included in this MVP)

- [ ] Photo upload to Supabase Storage
- [ ] Email/Slack notification on new order (via Supabase Edge Function or webhook)
- [ ] Admin dashboard to view/schedule orders
- [ ] Phone order entry UI (same form, admin-only, `source='phone'`)
