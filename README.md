# The Parda Inventory

A phone-friendly inventory portal for a curtain store. It includes a dashboard, stock-in/out records, SKU checking, low-stock alerts, product search, and transaction history.

> Status: the committed frontend is a **demo using sample data**. It does not yet load or save live Supabase data. Do not use it to manage production inventory until the data/auth integration is completed.

## Run locally

```bash
npm install
npm run dev
```

The interface opens with sample data so it can be reviewed immediately. The next integration step is to connect the supplied Supabase schema to the UI data layer and enforce Supabase Auth for admin-only controls.

## Supabase setup

1. Create a Supabase project and enable Email/Password Auth for the owner account.
2. In the SQL Editor, run `supabase/migrations/20260716000000_inventory_schema.sql`.
3. Create the owner in **Authentication → Users**, then add a matching profile row and set its role to `admin`:

```sql
insert into public.profiles (id, display_name, role)
values ('AUTH_USER_UUID', 'Owner', 'admin');
```

4. Copy `.env.example` to `.env.local` and fill in the project URL and **publishable** key.

The database applies stock changes in one transaction, blocks negative stock, preserves a movement history, and only lets admin-profile users edit products. Do not use the service-role key in the frontend.

## Deploy to Vercel

Import this folder as a Vercel project. Vercel recognizes Vite automatically; add the two `VITE_SUPABASE_*` environment variables under Project Settings → Environment Variables, then deploy.
