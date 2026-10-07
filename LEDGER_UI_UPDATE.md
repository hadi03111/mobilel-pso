# Technician Ledger and Shared Interface Update

## Apply to your existing shop

Keep your original `.env` so the app uses the Supabase project holding your past data. This update does not delete, reset or replace shop records.

In Supabase → SQL Editor, run `supabase/migrations/202610070002_technician_ledger_controls.sql` once. If you have not applied the previous POS/returns migration `202610070001_pos_repairs_returns.sql`, apply it first. Do not rerun migrations that you already applied. A clean project needs all migrations in filename order.

Run `npm install` and `npm run dev`, or push the updated code through your existing hosting workflow. Keep the previously updated `create-user` function deployed for account percentages.

## Technician ledger

- Every technician card has **Details** and **Settlement**.
- Admin and Manager can open the ledger, record partial payments, add account earnings, and adjust individual repair earnings. Existing Developer access is preserved. Cashier and Technician cannot make these financial changes.
- Settlement uses a dialog with amount paid, payment method, note/reference and a live remaining-balance preview. For PKR 7,000 payable, a PKR 5,000 payment leaves PKR 2,000. Payments cannot exceed the payable balance.
- Details has repair earnings sorted by repair/completion date, date-range filters, search, customer/device, status, bill, and the technician's actual earned amount.
- **Adjust Earning** sets the final earning for a fully paid repair whose original earning has posted. Enter 600 to change a 500 earning to 600, or 400 to reduce it to 400. Do not enter only the difference.
- **Manual Earning** adds an account-level earning unrelated to a repair, with a required reason.
- **Payments & Adjustments** shows the transaction history, dates and notes. All financial corrections append audited ledger entries instead of overwriting old records. Customer bills and inventory remain unchanged by technician adjustments.
- An earning reduction after payment can produce an overpaid credit, which is displayed clearly and offsets future earnings. Past settlements are retained.

## Consistent interface

The old stylesheet had conflicting sidebar breakpoints and table rules. It has been replaced with one shared design system for the login, navigation, headers, cards, buttons, fields, badges, tables, empty states and dialogs. The sidebar uses a single tablet/mobile breakpoint; wide tables scroll inside their cards. Inputs and standalone labels receive consistent styling across pages. Text is readable and the interface uses system fonts without relying on an external font download.

A route-wrapper remount bug was also fixed: loading or saving data no longer resets the active page, filters or in-progress dialog state.

## Verification

- `npm run test:db` exercises the isolated PostgreSQL migration set, manager/admin settlements, PKR 7,000 → 5,000 → 2,000, payment limits, earning changes 500 → 600 → 400, duplicate target handling, cashier denial, and unchanged customer bills.
- `npm run test:data` checks independent data loading and warnings.
- `npm run build` checks the production bundle.
- Browser checks passed for the settlement/earning forms, Manager access, and 19 main pages at desktop (1440px), tablet (850px) and phone (390px) widths, with no page-wide horizontal overflow or browser runtime errors. These checks use mocked shop records and authentication; they do not touch the live Supabase database. Live deployment and real-account verification remain necessary after applying the migration.
