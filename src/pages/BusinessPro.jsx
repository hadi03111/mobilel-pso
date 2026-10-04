
import React from 'react'
import { Link } from 'react-router-dom'
import {
  Handshake,
  WalletCards,
  CheckCircle2,
  Clock3,
  TrendingUp,
  Star,
  MessageSquareText,
  BarChart3,
  BriefcaseBusiness,
} from 'lucide-react'

import { useApp } from '../context/AppContext'
import {
  Badge,
  Card,
  PageHead,
  Stat,
  money,
} from '../components/UI'

/* =========================================================
   TECHNICIAN WORKSPACE
   ========================================================= */

export function TechnicianWorkspace({ mode = 'jobs' }) {
  const {
    repairs = [],
    techs = [],
    profile,
    users = [],
    requestHandover,
  } = useApp()

  const isTechnician = profile?.role === 'Technician'

  const me = isTechnician
    ? techs.find(
        (tech) =>
          tech.id === profile?.id ||
          tech.userId === profile?.id
      ) || null
    : techs[0] || null

  const myJobs = me
    ? repairs.filter(
        (repair) =>
          repair.technicianId === me.id &&
          !['Completed', 'Delivered', 'Cancelled'].includes(
            repair.status
          )
      )
    : []

  const pages = {
    jobs: {
      title: 'My Jobs',
      subtitle:
        'Open assigned repairs, add parts, add labour charges and complete repair work.',
    },

    parts: {
      title: 'Parts Used',
      subtitle:
        'Review inventory parts consumed against your repair jobs.',
    },

    handover: {
      title: 'Handover',
      subtitle:
        'Send repaired devices to a cashier for payment and customer return.',
    },

    earnings: {
      title: 'My Earnings',
      subtitle:
        'Review completed repairs, profit share and payable balance.',
    },
  }

  const page = pages[mode] || pages.jobs

  const urgencyOrder = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  const sortedJobs = [...myJobs].sort((a, b) => {
    const aUrgency =
      urgencyOrder[String(a.urgency || '').toLowerCase()] ?? 9

    const bUrgency =
      urgencyOrder[String(b.urgency || '').toLowerCase()] ?? 9

    if (aUrgency !== bUrgency) {
      return aUrgency - bUrgency
    }

    const aDeadline = a.deadline
      ? new Date(a.deadline).getTime()
      : Number.MAX_SAFE_INTEGER

    const bDeadline = b.deadline
      ? new Date(b.deadline).getTime()
      : Number.MAX_SAFE_INTEGER

    return aDeadline - bDeadline
  })

  const readyJobs = me
    ? repairs.filter(
        (repair) =>
          repair.technicianId === me.id &&
          repair.status === 'Ready for Handover'
      )
    : []

  const cashiers = users.filter(
    (user) =>
      user.role === 'Cashier' &&
      user.active !== false
  )

  async function handleHandover(repair) {
    const repairDbId = repair.dbId || repair.id

    const select = document.getElementById(
      `cashier-${repairDbId}`
    )

    const cashierId = select?.value

    if (!cashierId) {
      alert('Please select a cashier.')
      return
    }

    try {
      await requestHandover(
        repairDbId,
        cashierId
      )

      alert(
        'Device handover request sent to cashier.'
      )
    } catch (error) {
      alert(
        error?.message ||
          'Unable to request device handover.'
      )
    }
  }

  return (
    <>
      <PageHead
        title={page.title}
        subtitle={page.subtitle}
      />

      {!me && (
        <Card>
          <h3>No technician account found</h3>

          <p>
            This account is not connected to a technician
            profile.
          </p>
        </Card>
      )}

      {/* =====================================================
          MY JOBS
          ===================================================== */}

      {me && mode === 'jobs' && (
        <>
          {sortedJobs.length === 0 ? (
            <Card>
              <h3>No Active Jobs</h3>

              <p>
                New repairs assigned to you will appear here.
              </p>
            </Card>
          ) : (
            <div className="jobcards">
              {sortedJobs.map((repair) => {
                const total = Number(
                  repair.total || 0
                )

                const labour = Number(
                  repair.labourCharge ||
                    repair.labour_charge ||
                    0
                )

                return (
                  <Card
                    key={repair.dbId || repair.id}
                    className="techjob"
                  >
                    <div
                      className={`urgency ${
                        repair.urgency || 'medium'
                      }`}
                    />

                    <div className="techjob-head">
                      <div>
                        <b>
                          {repair.id || 'Repair'}
                        </b>

                        <h3>
                          {repair.phone ||
                            repair.device ||
                            'Unknown Device'}
                        </h3>

                        <p>
                          {repair.issue ||
                            'No issue specified'}
                          {' · '}
                          {repair.customer ||
                            'Unknown Customer'}
                        </p>
                      </div>

                      <Badge>
                        {repair.status || 'Received'}
                      </Badge>
                    </div>

                    <div className="jobmeta">
                      <span>
                        <Clock3 size={16} />

                        {repair.deadline ||
                          'No deadline'}
                      </span>

                      <span>
                        <WalletCards size={16} />

                        {money(total)}
                      </span>
                    </div>

                    {labour > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 13,
                          opacity: 0.75,
                        }}
                      >
                        Labour charge:{' '}
                        <b>{money(labour)}</b>
                      </div>
                    )}

                    <Link
                      className="btn primary"
                      to={`/repairs/${repair.id}`}
                    >
                      Open Job
                    </Link>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* =====================================================
          PARTS USED
          ===================================================== */}

      {me && mode === 'parts' && (
        <Card className="table-card">
          <table>
            <thead>
              <tr>
                <th>Repair</th>
                <th>Device</th>
                <th>Part</th>
                <th>Qty</th>
                <th>Customer Charge</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {myJobs.flatMap((repair) =>
                (repair.parts || []).map(
                  (part, index) => {
                    const isObject =
                      typeof part === 'object' &&
                      part !== null

                    const partName = isObject
                      ? part.name ||
                        part.productName ||
                        'Inventory Item'
                      : String(part)

                    const qty = isObject
                      ? Number(part.qty || 1)
                      : 1

                    const charge = isObject
                      ? Number(
                          part.charge ||
                            part.customerCharge ||
                            part.customer_charge ||
                            0
                        )
                      : 0

                    const state = isObject
                      ? part.state || 'Used'
                      : 'Used'

                    return (
                      <tr
                        key={`${
                          repair.dbId ||
                          repair.id
                        }-${index}`}
                      >
                        <td>
                          <b>{repair.id}</b>
                        </td>

                        <td>
                          {repair.phone ||
                            repair.device ||
                            '—'}
                        </td>

                        <td>
                          <b>{partName}</b>
                        </td>

                        <td>{qty}</td>

                        <td>
                          {money(charge)}
                        </td>

                        <td>
                          <Badge>
                            {state}
                          </Badge>
                        </td>
                      </tr>
                    )
                  }
                )
              )}

              {myJobs.every(
                (repair) =>
                  !repair.parts ||
                  repair.parts.length === 0
              ) && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      padding: 30,
                    }}
                  >
                    No inventory parts have been used yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* =====================================================
          HANDOVER
          ===================================================== */}

      {me && mode === 'handover' && (
        <>
          {readyJobs.length === 0 ? (
            <Card>
              <h3>No Devices Waiting</h3>

              <p>
                Devices marked Ready for Handover will
                appear here.
              </p>
            </Card>
          ) : (
            <div className="jobcards">
              {readyJobs.map((repair) => {
                const repairDbId =
                  repair.dbId || repair.id

                return (
                  <Card
                    key={repairDbId}
                    className="techjob"
                  >
                    <div className="techjob-head">
                      <div>
                        <b>{repair.id}</b>

                        <h3>
                          {repair.phone ||
                            repair.device ||
                            'Unknown Device'}
                        </h3>

                        <p>
                          {repair.customer ||
                            'Unknown Customer'}
                        </p>
                      </div>

                      <Badge>
                        Ready for Handover
                      </Badge>
                    </div>

                    <div
                      style={{
                        marginBottom: 12,
                      }}
                    >
                      <strong>
                        Customer Total:{' '}
                      </strong>

                      {money(
                        Number(
                          repair.total || 0
                        )
                      )}
                    </div>

                    <label>
                      Cashier Receiving Device
                    </label>

                    <select
                      id={`cashier-${repairDbId}`}
                      defaultValue=""
                    >
                      <option value="">
                        Select cashier
                      </option>

                      {cashiers.map(
                        (cashier) => (
                          <option
                            key={cashier.id}
                            value={cashier.id}
                          >
                            {cashier.name ||
                              cashier.full_name ||
                              'Cashier'}
                          </option>
                        )
                      )}
                    </select>

                    {cashiers.length === 0 && (
                      <p
                        style={{
                          opacity: 0.7,
                          marginTop: 8,
                        }}
                      >
                        No active cashier account found.
                      </p>
                    )}

                    <button
                      type="button"
                      className="btn primary"
                      disabled={
                        cashiers.length === 0
                      }
                      onClick={() =>
                        handleHandover(repair)
                      }
                    >
                      <Handshake size={17} />

                      Request Handover
                    </button>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* =====================================================
          EARNINGS
          ===================================================== */}

      {me && mode === 'earnings' && (
        <>
          <div className="stats">
            <Stat
              label="Current Payable"
              value={money(
                Number(me.balance || 0)
              )}
              note="Available for settlement"
              icon={WalletCards}
            />

            <Stat
              label="Completed Repairs"
              value={Number(
                me.completed || 0
              )}
              note="Lifetime completed"
              icon={CheckCircle2}
            />

            <Stat
              label="Profit Share"
              value={`${Number(
                me.rate || 0
              )}%`}
              note="Current technician rate"
              icon={TrendingUp}
            />
          </div>

          <Card>
            <h3>How Earnings Work</h3>

            <p>
              Your technician earnings are calculated from
              completed repair jobs and recorded in the
              technician ledger.
            </p>
          </Card>
        </>
      )}
    </>
  )
}

/* =========================================================
   TECHNICIAN LEDGER
   ========================================================= */

export function TechnicianLedger() {
  const {
    techs = [],
    settleTech,
  } = useApp()

  async function handleSettlement(tech) {
    const balance = Number(
      tech.balance || 0
    )

    if (balance <= 0) {
      return
    }

    const confirmed = window.confirm(
      `Settle ${money(balance)} for ${
        tech.name || 'this technician'
      }?`
    )

    if (!confirmed) {
      return
    }

    try {
      await settleTech(
        tech.id,
        balance
      )

      alert(
        'Technician balance settled successfully.'
      )
    } catch (error) {
      alert(
        error?.message ||
          'Unable to settle technician balance.'
      )
    }
  }

  return (
    <>
      <PageHead
        title="Technician Ledger"
        subtitle="Earnings, adjustments, settlements and current payable balances."
      />

      {techs.length === 0 ? (
        <Card>
          <h3>No Technicians</h3>

          <p>
            Technician accounts will appear here.
          </p>
        </Card>
      ) : (
        <div className="tech-ledgers">
          {techs.map((tech) => {
            const name =
              tech.name || 'Technician'

            const initials = name
              .split(' ')
              .filter(Boolean)
              .map((word) => word[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()

            return (
              <Card key={tech.id}>
                <div className="personrow">
                  <div className="avatar">
                    {initials}
                  </div>

                  <div>
                    <h3>{name}</h3>

                    <span>
                      {Number(
                        tech.completed || 0
                      )}{' '}
                      completed ·{' '}
                      {Number(
                        tech.rate || 0
                      )}
                      % share
                    </span>
                  </div>
                </div>

                <div className="big-balance">
                  <span>
                    Current Payable
                  </span>

                  <strong>
                    {money(
                      Number(
                        tech.balance || 0
                      )
                    )}
                  </strong>
                </div>

                <div className="split">
                  <span>
                    Active jobs{' '}
                    <b>
                      {Number(
                        tech.active || 0
                      )}
                    </b>
                  </span>

                  <span>
                    Status{' '}
                    <b>
                      {tech.status ||
                        'Active'}
                    </b>
                  </span>
                </div>

                <button
                  type="button"
                  className="btn primary full"
                  disabled={
                    Number(
                      tech.balance || 0
                    ) <= 0
                  }
                  onClick={() =>
                    handleSettlement(tech)
                  }
                >
                  Settle Full Balance
                </button>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

/* =========================================================
   CUSTOMERS
   ========================================================= */

export function Customers() {
  const {
    customers = [],
    repairs = [],
  } = useApp()

  const rows = customers.map(
    (customer, index) => {
      const customerRepairs =
        repairs.filter(
          (repair) =>
            repair.customerPhone ===
            customer.phone
        )

      const latestRepair =
        customerRepairs.length > 0
          ? customerRepairs[
              customerRepairs.length - 1
            ]
          : null

      const collected =
        customerRepairs.reduce(
          (total, repair) =>
            total +
            Number(repair.paid || 0),
          0
        )

      return {
        id:
          customer.id ||
          customer.phone ||
          index,

        name:
          customer.name ||
          'Unknown Customer',

        phone:
          customer.phone || '',

        device:
          latestRepair?.phone ||
          latestRepair?.device ||
          '—',

        jobs:
          customerRepairs.length,

        collected,
      }
    }
  )

  return (
    <>
      <PageHead
        title="Customers"
        subtitle="Customer repair, device and payment history."
      />

      <Card className="table-card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Latest Device</th>
              <th>Repair Jobs</th>
              <th>Collected</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <b>{customer.name}</b>
                </td>

                <td>
                  {customer.phone || '—'}
                </td>

                <td>
                  {customer.device}
                </td>

                <td>
                  {customer.jobs}
                </td>

                <td>
                  <strong>
                    {money(
                      customer.collected
                    )}
                  </strong>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    textAlign: 'center',
                    padding: 30,
                  }}
                >
                  No customer records found.
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
   FEEDBACK
   ========================================================= */

export function Feedback() {
  const {
    feedback = [],
  } = useApp()

  const average =
    feedback.length > 0
      ? feedback.reduce(
          (sum, item) =>
            sum +
            Number(item.rating || 0),
          0
        ) / feedback.length
      : 0

  const lowRatings =
    feedback.filter(
      (item) =>
        Number(item.rating || 0) < 3
    ).length

  return (
    <>
      <PageHead
        title="Customer Feedback"
        subtitle="Monitor customer satisfaction and service quality."
      />

      <div className="stats">
        <Stat
          label="Average Rating"
          value={`${average.toFixed(1)} / 5`}
          note={`${feedback.length} responses`}
          icon={Star}
        />

        <Stat
          label="Needs Attention"
          value={lowRatings}
          note="Ratings below 3 stars"
          icon={MessageSquareText}
        />
      </div>

      {feedback.length === 0 ? (
        <Card>
          <h3>No Feedback Yet</h3>

          <p>
            Customer feedback will appear here after
            submission.
          </p>
        </Card>
      ) : (
        <div className="stack">
          {feedback.map(
            (item, index) => {
              const rating = Math.max(
                0,
                Math.min(
                  5,
                  Number(item.rating || 0)
                )
              )

              return (
                <Card
                  key={
                    item.id ||
                    `feedback-${index}`
                  }
                >
                  <div className="stars">
                    {'★'.repeat(rating)}
                    {'☆'.repeat(
                      5 - rating
                    )}
                  </div>

                  <h3>
                    {item.name ||
                      'Customer'}
                  </h3>

                  {item.type && (
                    <Badge>
                      {item.type}
                    </Badge>
                  )}

                  <p>
                    {item.comment ||
                      'No written feedback.'}
                  </p>

                  {item.date && (
                    <small>
                      {item.date}
                    </small>
                  )}
                </Card>
              )
            }
          )}
        </div>
      )}
    </>
  )
}

/* =========================================================
   REPORTS
   ========================================================= */

export function Reports() {
  const {
    sales = [],
    repairs = [],
    expenses = [],
    techs = [],
  } = useApp()

  const salesRevenue =
    sales.reduce(
      (sum, sale) =>
        sum +
        Number(sale.total || 0),
      0
    )

  const retailProfit =
    sales.reduce(
      (sum, sale) =>
        sum +
        Number(sale.profit || 0),
      0
    )

  const completedRepairs =
    repairs.filter((repair) =>
      ['Completed', 'Delivered'].includes(
        repair.status
      )
    )

  const repairRevenue =
    completedRepairs.reduce(
      (sum, repair) =>
        sum +
        Number(repair.total || 0),
      0
    )

  const labourRevenue =
    completedRepairs.reduce(
      (sum, repair) =>
        sum +
        Number(
          repair.labourCharge ||
            repair.labour_charge ||
            0
        ),
      0
    )

  const expenseTotal =
    expenses.reduce(
      (sum, expense) =>
        sum +
        Number(expense.amount || 0),
      0
    )

  const cashierNames = [
    ...new Set(
      sales
        .map(
          (sale) =>
            sale.cashier ||
            sale.cashierName
        )
        .filter(Boolean)
    ),
  ]

  return (
    <>
      <PageHead
        title="Reports & Profit"
        subtitle="Retail, repair, labour, cashier and technician performance."
      />

      <div className="stats">
        <Stat
          label="Sales Revenue"
          value={money(
            salesRevenue
          )}
          note="Retail sales"
          icon={BarChart3}
        />

        <Stat
          label="Retail Profit"
          value={money(
            retailProfit
          )}
          note="Before expenses"
          icon={TrendingUp}
        />

        <Stat
          label="Repair Revenue"
          value={money(
            repairRevenue
          )}
          note="Completed repairs"
          icon={BriefcaseBusiness}
        />

        <Stat
          label="Labour Charges"
          value={money(
            labourRevenue
          )}
          note="Technician work charges"
          icon={WalletCards}
        />

        <Stat
          label="Expenses"
          value={money(
            expenseTotal
          )}
          note="Operating expenses"
          icon={WalletCards}
        />
      </div>

      <div className="grid2">
        <Card>
          <h3>Cashier Performance</h3>

          {cashierNames.length === 0 ? (
            <p>
              No cashier sales available.
            </p>
          ) : (
            cashierNames.map(
              (cashier) => {
                const cashierSales =
                  sales.filter(
                    (sale) =>
                      (sale.cashier ||
                        sale.cashierName) ===
                      cashier
                  )

                const total =
                  cashierSales.reduce(
                    (sum, sale) =>
                      sum +
                      Number(
                        sale.total || 0
                      ),
                    0
                  )

                return (
                  <div
                    className="ledgerline"
                    key={cashier}
                  >
                    <span>
                      {cashier}
                    </span>

                    <span>
                      {cashierSales.length}{' '}
                      orders
                    </span>

                    <b>
                      {money(total)}
                    </b>
                  </div>
                )
              }
            )
          )}
        </Card>

        <Card>
          <h3>Technician Payable</h3>

          {techs.length === 0 ? (
            <p>
              No technician balances available.
            </p>
          ) : (
            techs.map((tech) => (
              <div
                className="ledgerline"
                key={tech.id}
              >
                <span>
                  {tech.name ||
                    'Technician'}
                </span>

                <span>
                  {Number(
                    tech.completed || 0
                  )}{' '}
                  completed
                </span>

                <b>
                  {money(
                    Number(
                      tech.balance || 0
                    )
                  )}
                </b>
              </div>
            ))
          )}
        </Card>
      </div>
    </>
  )
}
