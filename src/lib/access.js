export const ROLES={DEVELOPER:'Developer',ADMIN:'Admin',MANAGER:'Manager',CASHIER:'Cashier',TECHNICIAN:'Technician'};
export const ACCESS={
 dashboard:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
 pos:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER,ROLES.CASHIER],
 purchases:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
 inventory:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER,ROLES.CASHIER,ROLES.TECHNICIAN],
 repairs:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
 repairDetail:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER,ROLES.CASHIER,ROLES.TECHNICIAN],
 repairReturn:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER,ROLES.CASHIER],
 newRepair:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER,ROLES.CASHIER],
 technician:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER,ROLES.TECHNICIAN],
 customers:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER,ROLES.CASHIER],
 suppliers:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
 technicianLedger:[ROLES.DEVELOPER,ROLES.ADMIN],
 expenses:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
 feedback:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
 reports:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
 notifications:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER,ROLES.CASHIER,ROLES.TECHNICIAN],
 users:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
 activity:[ROLES.DEVELOPER,ROLES.ADMIN],
 settings:[ROLES.DEVELOPER,ROLES.ADMIN],
 profit:[ROLES.DEVELOPER,ROLES.ADMIN],
 cost:[ROLES.DEVELOPER,ROLES.ADMIN,ROLES.MANAGER],
};
export const can=(role,key)=>!!role&&(ACCESS[key]||[]).includes(role);
export const routeAccess=[
 ['/technician-ledger','technicianLedger'],['/technician','technician'],['/purchases','purchases'],['/inventory','inventory'],['/repairs/return','repairReturn'],['/repairs','repairs'],['/customers','customers'],['/suppliers','suppliers'],['/expenses','expenses'],['/feedback','feedback'],['/reports','reports'],['/notifications','notifications'],['/users','users'],['/activity','activity'],['/settings','settings'],['/pos','pos'],['/','dashboard']
];
export const accessKeyForPath=path=>(routeAccess.find(([prefix])=>prefix==='/'?path==='/':path.startsWith(prefix))||['','dashboard'])[1];
export const homeForRole=role=>role===ROLES.TECHNICIAN?'/technician/jobs':role===ROLES.CASHIER?'/pos':'/';
