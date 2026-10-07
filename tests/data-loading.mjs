import assert from 'node:assert/strict'
import {normalizeDataQueries} from '../src/lib/loadResults.js'
const originalSales=[{id:'historic-sale',total:1200}],originalRepairs=[{id:'historic-repair'}]
const inventory={data:[{id:'existing-product'}],error:null}
const sales={data:originalSales,error:null}
const repairs={data:originalRepairs,error:null}
const purchases={data:null,error:{message:'relation purchase_receipts does not exist'}}
const warnings=normalizeDataQueries(['Inventory','Sales','Repairs','Purchases'],[inventory,sales,repairs,purchases])
assert.strictEqual(sales.data,originalSales)
assert.strictEqual(repairs.data,originalRepairs)
assert.equal(inventory.data.length,1)
assert.deepEqual(purchases.data,[])
assert.deepEqual(warnings,['Purchases: relation purchase_receipts does not exist'])
assert.deepEqual(normalizeDataQueries(['Sales'],[{data:[],error:null}]),[])
console.log('PASS failed module does not block historical sales, repairs or inventory; error identifies affected module')
