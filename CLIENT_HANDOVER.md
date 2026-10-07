# Mobile Shop POS V6 — Client Handover

## Role workspaces
- Developer: full system access.
- Admin: full operational + profit/reporting + user/settings access.
- Manager: operational management, purchases, inventory, repairs, expenses, reports and users; profit/payable-sensitive views are hidden.
- Cashier: POS / Sales and New Repair only.
- Technician: Technician Workspace (own jobs, parts, handover, earnings) only.

Route guards enforce the same frontend access even when a user types a URL directly. Supabase RLS/RPC remains the backend security boundary.

## V6 changes
- Premium responsive shell, navigation, tables, cards and counter styling.
- POS rebuilt as catalog + checkout workspace for phones/accessories/parts.
- Pending orders, hold/resume, manager/admin cancellation and admin/developer reversal preserved.
- Logged-in technician now resolves their own jobs instead of the first technician profile.
- Technician handover cashier selection is wired to the secure handover RPC.
- Supplier creation is wired through a new secure RPC migration.
- Manager profit-sensitive dashboard/report/technician payable views removed.
- Cashier/technician menus reduced to their actual workspace.

## Deployment
1. Apply Supabase migration `supabase/migrations/20261004_mobile_shop_v6_handover.sql`.
2. Deploy the existing `create-user` Edge Function if not already deployed.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host.
4. Run `npm install` then `npm run build` from a clean checkout. Never commit `node_modules`.
