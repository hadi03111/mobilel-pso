# POS and Repair update — setup

## Existing Supabase project

1. Extract this project and keep your shop's `.env` configuration.
2. Open Supabase → SQL Editor, paste the complete contents of `supabase/migrations/202610070001_pos_repairs_returns.sql`, and Run once. Then run `supabase/migrations/202610070002_technician_ledger_controls.sql`. If the first update migration was already applied, run only the new ledger migration. It assumes your previous migrations 001–006 are already installed. For a new project, apply all migration files in filename order.
3. Deploy the updated user creation function from this folder:

   ```powershell
   supabase functions deploy create-user --project-ref YOUR_PROJECT_REF
   ```

4. Run locally:

   ```powershell
   npm install
   npm run dev
   ```

5. For your hosted frontend, commit/push the updated source and lockfile through your existing deployment workflow.

The live database and function are not updated just by extracting the ZIP. Apply step 2 and deploy the function before using the new screens.

## What changed

- Product prices use a styled form instead of a browser prompt. Sale prices still cannot go below cost.
- Pending orders have Edit. Additions can be saved directly. Removing a line, reducing quantity, or reducing its selling price requires the email and password of an active Admin or Manager. Approval is checked in the database and audited without storing the password. Cashiers edit only their own pending orders.
- Only Admin and Manager can see completed POS orders. This is enforced with database row policies, including the Developer role restriction requested here.
- Admin and Manager have a Sales Returns page. Search the original invoice/token, select quantities or the full remaining order, and enter a reason. Refund prices come from the original sale, not current inventory prices. Returned quantities restore inventory and reduce net sales and profit. Already-returned quantities cannot be returned again. Any unpaid balance is reduced before a cash refund is calculated; refund amounts and return lines are kept in return history tables.
- Purchases allow a custom category. Saved categories appear on future purchases and inventory edits.
- Repair intake supports multiple spare parts, quantities and separate unit prices. A blank price uses the current cost. The entire job and attached parts save in one transaction. The base service estimate excludes attached parts; parts are added separately to the bill.
- Cashiers can view Repair History and use Edit in repair lists, then Edit Repair Details on the job. Customer, device, complaint, notes, deadline and technician can be corrected. Technician reassignment is blocked after handover/payment. These changes do not silently alter billed amounts or stock.
- New technician accounts have a default profit percentage. Admin can update it under Users & Roles.
- Purchases and Inventory Edit have an optional technician percentage per part. Blank means the technician's default; 0 means no share; 100 means all profit on that part.
- Repair part rates are snapshotted at attachment so later product-rate edits do not rewrite attached-part rates. Earnings post once when the repair is fully paid. Separate service/labour charges use the technician default percentage.
- Fixed the labour audit error: `audit_log` uses `metadata`, not `details`. Zero technician percentages are preserved.

## Earnings example

A technician's default is 40%. Panel cost 500, charged 700, with a 100% item override: technician gets 200. IC cost 300, charged 500, without an override: technician gets 80. Technician total is 280. Separate labour/service charges use the technician default. These are **profit shares**, following this request, and do not rewrite existing posted earnings.

## Checks

`npm run build` and `npm run test:db` verify the production bundle and database flows. Database tests use an isolated in-memory PostgreSQL instance and test accounts; they never connect to your live Supabase project. Coverage includes approval credentials, role policies, original-price partial/full returns, refunds and stock, duplicate returns, remaining-only reversal, atomic repair rollback, default part costs, mixed percentages, labour audits and duplicate-payment prevention.

Live Supabase deployment, real staff authentication and a visual browser run still require verification on your installation. See `LEDGER_UI_UPDATE.md` for the latest ledger and interface changes and verification.

## Existing data loading fix

Historical sales and repairs now use nested `*` reads so the optional new return/rate columns do not prevent old records from loading before migration. Each table loads independently. Errors are shown at the top of the page instead of silently leaving the whole application blank. No existing records are deleted or reset by this fix. If a warning remains, use its exact error to identify the missing schema or permissions. Keep the `.env` from the folder where your original data was visible; a different Supabase project has different records.
