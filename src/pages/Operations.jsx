import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign,
  ShoppingBag,
  Wrench,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  Package,
  ChevronRight,
  Truck,
  WalletCards,
  ReceiptText,
  Bell,
  ShieldCheck,
  History,
  Settings as SettingsIcon,
} from 'lucide-react'

import { useApp } from '../context/AppContext'
import {
  Badge,
  Card,
  PageHead,
  SearchBox,
  Stat,
  money,
} from '../components/UI'

/* =========================================================
   DASHBOARD
========================================================= */

export function Dashboard() {
  const a = useApp()

  const revenue = a.sales.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0
  )

  const profit = a.sales.reduce(
    (sum, sale) => sum + Number(sale.profit || 0),
    0
  )

  const activeRepairs = a.repairs.filter(
    (repair) => !['Completed', 'Delivered'].includes(repair.status)
  )

  const criticalRepairs = a.repairs.filter(
    (repair) => repair.urgency === 'critical'
  )

  const lowStock = a.products.filter(
    (product) =>
      Number(product.qty || 0) <= Number(product.low || 0)
  )

  const repairStages = [
    'Received',
    'Assigned',
    'Repairing',
    'Ready for Handover',
    'Completed',
  ]

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle="Live overview of your shop operations."
        actions={
          <>
            <button className="btn ghost">
              Export
            </button>

            <Link className="btn primary" to="/pos">
              <ShoppingBag size={17} />
              New Sale
            </Link>
          </>
        }
      />

      {/* TOP STATS */}

      <div className="stats">
        <Stat
          label="Today's Sales"
          value={money(revenue)}
          note={`${a.sales.length} transactions`}
          icon={DollarSign}
        />

        <Stat
          label="Retail Profit"
          value={money(profit)}
          note="Gross retail profit"
          icon={ArrowUpRight}
        />

        <Stat
          label="Active Repairs"
          value={activeRepairs.length}
          note={`${criticalRepairs.length} need attention`}
          icon={Wrench}
        />

        <Stat
          label="Low Stock"
          value={lowStock.length}
          note="Items below reorder level"
          icon={AlertTriangle}
          tone="danger"
        />
      </div>

      {/* REPAIRS + INVENTORY */}

      <div className="grid2">
        <Card>
          <div className="section-title">
            <div>
              <h3>Repair Operations</h3>
              <p>Live workshop pipeline</p>
            </div>

            <Link to="/repairs">
              View all
              <ChevronRight size={15} />
            </Link>
          </div>

          <div className="pipeline">
            {repairStages.map((stage) => {
              const count = a.repairs.filter(
                (repair) => repair.status === stage
              ).length

              return (
                <div key={`repair-stage-${stage}`}>
                  <b>{count}</b>
                  <span>{stage}</span>
                </div>
              )
            })}
          </div>

          <div className="job-list">
            {a.repairs.length === 0 ? (
              <div className="empty-inline">
                No repair jobs yet.
              </div>
            ) : (
              a.repairs.slice(0, 3).map((repair) => (
                <Link
                  key={`dashboard-repair-${repair.id}`}
                  to={`/repairs/${repair.id}`}
                  className="job"
                >
                  <div
                    className={`urgency ${
                      repair.urgency || 'normal'
                    }`}
                  />

                  <div>
                    <b>
                      {repair.id} · {repair.phone}
                    </b>

                    <span>
                      {repair.customer} · {repair.issue}
                    </span>
                  </div>

                  <div>
                    <Badge>{repair.status}</Badge>
                    <small>{repair.deadline}</small>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="section-title">
            <div>
              <h3>Inventory Attention</h3>
              <p>Items requiring action</p>
            </div>

            <Link to="/inventory">
              Inventory
              <ChevronRight size={15} />
            </Link>
          </div>

          {lowStock.length === 0 ? (
            <div className="empty-inline">
              No low-stock items.
            </div>
          ) : (
            lowStock.map((product) => (
              <div
                key={`low-stock-${product.id || product.sku}`}
                className="stockrow"
              >
                <div className="product-icon">
                  <Package size={18} />
                </div>

                <div>
                  <b>{product.name}</b>
                  <span>
                    {product.category} · {product.sku}
                  </span>
                </div>

                <div>
                  <strong>{product.qty}</strong>
                  <small>min {product.low}</small>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* TECHNICIANS + ACTIVITY */}

      <div className="grid2">
        <Card>
          <div className="section-title">
            <div>
              <h3>Technician Snapshot</h3>
              <p>Workload and payable</p>
            </div>

            <Link to="/technician-ledger">
              Ledger
              <ChevronRight size={15} />
            </Link>
          </div>

          {a.techs.length === 0 ? (
            <div className="empty-inline">
              No technicians found.
            </div>
          ) : (
            a.techs.map((technician) => {
              const initials = technician.name
                ? technician.name
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'T'

              return (
                <div
                  key={`technician-${technician.id}`}
                  className="personrow"
                >
                  <div className="avatar small">
                    {initials}
                  </div>

                  <div>
                    <b>{technician.name}</b>
                    <span>
                      {technician.active || 0} active ·{' '}
                      {technician.completed || 0} completed
                    </span>
                  </div>

                  <div>
                    <strong>
                      {money(technician.balance || 0)}
                    </strong>

                    <small>
                      {technician.rate || 0}% share
                    </small>
                  </div>
                </div>
              )
            })
          )}
        </Card>

        <Card>
          <div className="section-title">
            <div>
              <h3>Recent Activity</h3>
              <p>Accountable shop actions</p>
            </div>

            <Link to="/activity">
              Audit log
              <ChevronRight size={15} />
            </Link>
          </div>

          {a.activity.length === 0 ? (
            <div className="empty-inline">
              No activity recorded yet.
            </div>
          ) : (
            a.activity.slice(0, 4).map((activity) => (
              <div
                key={`activity-${activity.id}`}
                className="activity"
              >
                <div className="dot" />

                <div>
                  <b>{activity.action}</b>
                  <span>
                    {activity.user} · {activity.time}
                  </span>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </>
  )
}

/* =========================================================
   INVENTORY
========================================================= */

export function Inventory() {
  const { products } = useApp()

  const [q, setQ] = useState('')

  const search = q.trim().toLowerCase()

  const rows = products.filter((product) => {
    if (!search) return true

    return (
      String(product.name || '')
        .toLowerCase()
        .includes(search) ||
      String(product.sku || '')
        .toLowerCase()
        .includes(search) ||
      String(product.imei || '')
        .toLowerCase()
        .includes(search)
    )
  })

  return (
    <>
      <PageHead
        title="Inventory"
        subtitle="Live stock, actual cost and reorder control."
        actions={
          <button className="btn primary">
            <Plus size={17} />
            Add Item
          </button>
        }
      />

      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search item, SKU or IMEI..."
        />

        <div className="seg">
          <button className="active">All</button>
          <button>Phones</button>
          <button>Parts</button>
          <button>Accessories</button>
        </div>
      </div>

      <Card className="table-card">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Actual Cost</th>
              <th>Stock Health</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {rows.map((product) => {
              const isLow =
                Number(product.qty || 0) <=
                Number(product.low || 0)

              return (
                <tr key={`inventory-${product.id || product.sku}`}>
                  <td>
                    <b>{product.name}</b>
                    <small>{product.sku}</small>
                  </td>

                  <td>{product.category}</td>

                  <td>
                    <strong>{product.qty}</strong>
                  </td>

                  <td>{money(product.cost || 0)}</td>

                  <td>
                    <Badge tone={isLow ? 'low' : 'healthy'}>
                      {isLow ? 'Low stock' : 'Healthy'}
                    </Badge>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`Open ${product.name}`}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </td>
                </tr>
              )
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan="6">
                  <div className="empty-inline">
                    No inventory items found.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  )
}

/* =========================================================
   SUPPLIERS
========================================================= */

export function Suppliers() {
  const { suppliers } = useApp()

  const outstanding = suppliers.reduce(
    (sum, supplier) =>
      sum + Number(supplier.balance || 0),
    0
  )

  return (
    <>
      <PageHead
        title="Suppliers"
        subtitle="Wholesale partners, purchases and outstanding balances."
        actions={
          <button className="btn primary">
            <Plus size={17} />
            Add Supplier
          </button>
        }
      />

      <div className="stats">
        <Stat
          label="Suppliers"
          value={suppliers.length}
          note="Active partners"
          icon={Truck}
        />

        <Stat
          label="Outstanding"
          value={money(outstanding)}
          note="Supplier payable"
          icon={WalletCards}
        />
      </div>

      <Card className="table-card">
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Phone</th>
              <th>Last Purchase</th>
              <th>Balance</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {suppliers.map((supplier) => (
              <tr key={`supplier-${supplier.id}`}>
                <td>
                  <b>{supplier.name}</b>
                </td>

                <td>{supplier.phone || '—'}</td>

                <td>{supplier.last || '—'}</td>

                <td>
                  <strong>
                    {money(supplier.balance || 0)}
                  </strong>
                </td>

                <td>
                  <button
                    type="button"
                    className="btn ghost sm"
                  >
                    View Ledger
                  </button>
                </td>
              </tr>
            ))}

            {suppliers.length === 0 && (
              <tr>
                <td colSpan="5">
                  <div className="empty-inline">
                    No suppliers added yet.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  )
}

/* =========================================================
   EXPENSES
========================================================= */

export function Expenses() {
  const { expenses, addExpense } = useApp()

  const [show, setShow] = useState(false)

  const totalExpenses = expenses.reduce(
    (sum, expense) =>
      sum + Number(expense.amount || 0),
    0
  )

  const handleSubmit = async (event) => {
    event.preventDefault()

    const form = event.currentTarget
    const data = new FormData(form)

    await addExpense({
      title: data.get('title'),
      category: data.get('category'),
      amount: Number(data.get('amount')),
    })

    form.reset()
    setShow(false)
  }

  return (
    <>
      <PageHead
        title="Expenses"
        subtitle="Track operating costs for accurate net profit."
        actions={
          <button
            type="button"
            className="btn primary"
            onClick={() => setShow((current) => !current)}
          >
            <Plus size={17} />
            Add Expense
          </button>
        }
      />

      {show && (
        <Card>
          <form
            className="formgrid"
            onSubmit={handleSubmit}
          >
            <label>
              Expense
              <input
                name="title"
                required
                placeholder="e.g. Electricity bill"
              />
            </label>

            <label>
              Category

              <select name="category">
                <option>Utilities</option>
                <option>Rent</option>
                <option>Salary</option>
                <option>Transport</option>
                <option>Marketing</option>
                <option>Other</option>
              </select>
            </label>

            <label>
              Amount

              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>

            <button className="btn primary">
              Save Expense
            </button>
          </form>
        </Card>
      )}

      <div className="stats">
        <Stat
          label="This Period"
          value={money(totalExpenses)}
          note={`${expenses.length} entries`}
          icon={ReceiptText}
        />
      </div>

      <Card className="table-card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Expense</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>

          <tbody>
            {expenses.map((expense) => (
              <tr key={`expense-${expense.id}`}>
                <td>{expense.date || '—'}</td>

                <td>
                  <b>{expense.title}</b>
                </td>

                <td>
                  <Badge>{expense.category}</Badge>
                </td>

                <td>
                  <strong>
                    {money(expense.amount || 0)}
                  </strong>
                </td>
              </tr>
            ))}

            {expenses.length === 0 && (
              <tr>
                <td colSpan="4">
                  <div className="empty-inline">
                    No expenses recorded yet.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  )
}

/* =========================================================
   ADMIN PAGES
========================================================= */

export function GenericAdmin({ type }) {
  const a = useApp()

  const pageMap = {
    notifications: [
      'Notifications',
      'Operational alerts and actions requiring attention.',
      Bell,
    ],

    users: [
      'Users & Roles',
      'Control staff access and permissions.',
      ShieldCheck,
    ],

    activity: [
      'Activity / Audit Log',
      'Immutable operational history for accountability.',
      History,
    ],

    settings: [
      'Settings',
      'Configure shop, printing, repair and notification preferences.',
      SettingsIcon,
    ],
  }

  const page = pageMap[type] || pageMap.settings

  const [title, subtitle, Icon] = page

  const settingsItems = [
    {
      id: 'shop-profile',
      title: 'Shop Profile',
      description:
        'Name, address, tax and receipt footer',
    },
    {
      id: 'thermal-printing',
      title: 'Thermal Printing',
      description:
        '80mm/58mm printer, margins and auto print',
    },
    {
      id: 'repair-rules',
      title: 'Repair Rules',
      description:
        'Warranty defaults, deadlines and handover rules',
    },
    {
      id: 'technician-commission',
      title: 'Technician Commission',
      description:
        'Default earning percentage and eligible costs',
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description:
        'Low stock, overdue repair and low feedback alerts',
    },
    {
      id: 'security',
      title: 'Security',
      description:
        'Roles, sessions and sensitive action approvals',
    },
  ]

  return (
    <>
      <PageHead
        title={title}
        subtitle={subtitle}
      />

      {/* NOTIFICATIONS */}

      {type === 'notifications' && (
        <div className="stack">
          {a.notifications.length === 0 ? (
            <Card>
              <div className="empty-inline">
                No notifications.
              </div>
            </Card>
          ) : (
            a.notifications.map((notification) => (
              <Card
                key={`notification-${notification.id}`}
                className={`notice ${
                  notification.kind || ''
                }`}
              >
                <div className="notice-icon">
                  <Icon size={20} />
                </div>

                <div>
                  <b>{notification.title}</b>
                  <p>{notification.text}</p>
                  <small>{notification.time}</small>
                </div>

                <button
                  type="button"
                  className="btn ghost sm"
                >
                  Mark read
                </button>
              </Card>
            ))
          )}
        </div>
      )}

      {/* USERS */}

      {type === 'users' && (
        <Card className="table-card">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {a.users.map((user) => (
                <tr key={`user-${user.id}`}>
                  <td>
                    <b>{user.name}</b>
                  </td>

                  <td>
                    <Badge>{user.role}</Badge>
                  </td>

                  <td>{user.phone || '—'}</td>

                  <td>
                    <Badge
                      tone={
                        user.status === 'Active'
                          ? 'healthy'
                          : undefined
                      }
                    >
                      {user.status}
                    </Badge>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="btn ghost sm"
                    >
                      Permissions
                    </button>
                  </td>
                </tr>
              ))}

              {a.users.length === 0 && (
                <tr>
                  <td colSpan="5">
                    <div className="empty-inline">
                      No users found.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* ACTIVITY */}

      {type === 'activity' && (
        <Card>
          {a.activity.length === 0 ? (
            <div className="empty-inline">
              No activity recorded yet.
            </div>
          ) : (
            a.activity.map((activity) => (
              <div
                key={`audit-${activity.id}`}
                className="audit"
              >
                <div className="audit-icon">
                  <History size={17} />
                </div>

                <div>
                  <b>{activity.action}</b>
                  <span>{activity.user}</span>
                </div>

                <time>{activity.time}</time>
              </div>
            ))
          )}
        </Card>
      )}

      {/* SETTINGS */}

      {type === 'settings' && (
        <div className="settings-grid">
          {settingsItems.map((setting) => (
            <Card
              key={setting.id}
              className="setting"
            >
              <Icon size={21} />

              <div>
                <b>{setting.title}</b>
                <p>{setting.description}</p>
              </div>

              <ChevronRight size={18} />
            </Card>
          ))}
        </div>
      )}
    </>
  )
}