# V7 Inventory + Technician Charges

## Included
- Cashier POS catalog uses all active inventory items with stock, across every category.
- Cashier and Technician Inventory access remains read-only; management retains edit/adjust permissions.
- Technician repair part picker now shows every active in-stock inventory item, not only Repair Parts/Accessories.
- Technician can set a separate Labour / Work Charge from Repair Detail.
- Labour charge is stored separately in repair_jobs.labour_charge and is included in quote_total.
- Labour charge update is protected by a SECURITY DEFINER RPC and limited to assigned Technician or management while the job is in workshop.
- Repair billing displays parts/estimate, labour, total, paid and balance separately.
- Fixed malformed TechnicianWorkspace function ending in BusinessPro.jsx from the uploaded ZIP.

## Required Supabase step
Run the new migration:
`supabase/migrations/20261004_mobile_shop_v7_technician_labour.sql`

If the project is linked with Supabase CLI, run:
`supabase db push`

Then run:
`npm run build`
