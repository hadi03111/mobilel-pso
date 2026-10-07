Latest update: read [LEDGER_UI_UPDATE.md](LEDGER_UI_UPDATE.md) and [UPDATE_SETUP.md](UPDATE_SETUP.md) before running this version.

# MobilityOS — Mobile Shop Management

Production-oriented React + Supabase application. This package contains **no demo business data**. Empty Supabase tables render as an empty shop.

## Setup
1. Create a Supabase project.
2. In Supabase SQL Editor run `supabase/migrations/20261004_mobile_shop_core.sql`, then `supabase/migrations/20261004_mobile_shop_production.sql`.
3. Copy `.env.example` to `.env` and enter your project URL and anon/publishable key.
4. Run `npm install` then `npm run dev`.

## Repair workflow
Received → Assigned → Repairing → Ready for Handover → Completed → Delivered. Warranty/Rework is a separate path. There is no customer-approval queue because approval is handled face-to-face at reception.

## Important backend rule
`complete_pos_sale()` validates selling price against cost inside PostgreSQL, locks stock, creates the sale and item snapshot, and deducts inventory atomically. Frontend validation is only an additional convenience.

## First users
Create staff in Supabase Auth and insert matching rows into `profiles` with roles: Developer, Admin, Manager, Cashier, Technician. No fake users are seeded.

## V4 secure Supabase backend

Run migrations in filename order in Supabase SQL Editor. The last migration is `20261004_secure_backend_v4.sql`.

V4 changes the backend from prototype table writes to protected PostgreSQL RPC transactions:

- `receive_purchase` — receives stock and updates weighted cost atomically.
- `complete_pos_sale_v2` — multi-item POS, validates cost floor, IMEI availability, stock, payment, movements and audit in one transaction.
- `create_repair_job` — face-to-face repair reception with optional technician assignment. There is no Waiting Approval stage.
- `change_repair_status` — server-enforced repair status machine.
- `use_repair_part` / `return_repair_part` — inventory-safe repair consumption and return.
- `request_repair_handover` / `accept_repair_handover` — technician-to-cashier custody trail.
- `collect_repair_payment` — records payment and posts technician earning once the repair is fully paid.
- `settle_technician` — Admin/Developer settlement; ledger history remains and payable balance reduces to zero when fully settled.
- `adjust_technician` — audited bonus/deduction with mandatory reason.
- `submit_feedback` — anonymous token-based QR feedback; 1–2 star feedback generates management notifications.

### Security

RLS is enabled across production tables. Financial/stock writes are intentionally performed through `SECURITY DEFINER` RPC functions that verify the authenticated user's role. Technician users only see their permitted repair/ledger data; cashiers see operational data; management sees management reports. Repair photos use a private Supabase Storage bucket named `repair-photos`.

### First admin

After creating the first Auth user, promote that user from the Supabase SQL Editor (service/admin context):

```sql
update public.profiles set role='Developer' where id='<AUTH USER UUID>';
```

Do not put the Supabase service-role key in the Vite frontend. The browser uses only the anon/publishable key; RLS and RPC authorization protect the backend.

## V5 Operations Upgrade

Apply `supabase/migrations/20261004_mobile_shop_v5_operations.sql` in Supabase SQL Editor after the earlier migrations.

Deploy secure user creation:

```bash
supabase functions deploy create-user
```

The Edge Function uses Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY`. Never place that key in Vite `.env` or browser code.

V5 adds: Admin/Manager staff creation, pending POS orders, manager/admin pending cancellation, admin/developer paid-sale reversal with stock restoration, purchase history, inventory low-stock/edit/adjustment controls, and persistent settings.
