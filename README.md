# The Parda Inventory

A phone-friendly inventory portal for a curtain store. It includes a dashboard, stock-in/out records, SKU checking, low-stock alerts, product search, and transaction history.

> Status: **Live with Supabase.** The frontend supports two login modes on the same screen:
> - **Owner** (email + password) — full access including adding products and managing the staff roster. Requires a `profiles` row with `role = 'admin'` in the database.
> - **Staff** (username only) — signs in via Supabase Anonymous Auth, then validates the entered name against the `public.staff` table (case-insensitive, active members only). Staff can record stock updates and view all inventory data, but cannot add products or manage users. Attribution on all stock movements is set to the validated staff name stored in `localStorage`.
>
> Admin-only controls (Add product, Users) are gated by `profiles.role` and enforced by Postgres RLS. The app is ready for production inventory use once the owner Auth user and admin profile row have been created (see setup steps below).

## Run locally

```bash
npm install
npm run dev
```

The interface connects to Supabase on startup. If the environment variables are not set the app will display a configuration error instead of a login screen. Ensure `.env.local` contains both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` before running.

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
