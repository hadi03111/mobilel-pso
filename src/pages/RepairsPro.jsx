import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Plus,
  Clock3,
  Handshake,
  CheckCircle2,
  Printer,
  ArrowRight,
} from 'lucide-react'

import { useApp } from '../context/AppContext'
import {
  Badge,
  Card,
  PageHead,
  SearchBox,
  money,
} from '../components/UI'

/* =========================================================
   REPAIR LIST CONFIGURATION
========================================================= */

const cfg = {
  active: [
    'Active Repairs',
    'All phones currently moving through the workshop.',
    (r) => !['Completed', 'Delivered'].includes(r.status),
  ],

  handover: [
    'Ready for Handover',
    'Completed by technicians and waiting for cashier custody.',
    (r) => r.status === 'Ready for Handover',
  ],

  completed: [
    'Completed Repairs',
    'Finished repair jobs and customer billing.',
    (r) => r.status === 'Completed',
  ],

  warranty: [
    'Warranty / Rework',
    'Linked warranty returns and workmanship follow-up.',
    (r) => r.status === 'Warranty',
  ],

  history: [
    'Repair History',
    'Complete searchable repair record.',
    () => true,
  ],
}

/* =========================================================
   REPAIR CENTER
========================================================= */

export function Repairs() {
  const { repairs } = useApp()

  const activeCount = repairs.filter(
    (r) => !['Completed', 'Delivered'].includes(r.status)
  ).length

  const handoverCount = repairs.filter(
    (r) => r.status === 'Ready for Handover'
  ).length

  const completedCount = repairs.filter(
    (r) => r.status === 'Completed'
  ).length

  const kpis = [
    {
      id: 'active',
      label: 'Active',
      value: activeCount,
      icon: Clock3,
    },
    {
      id: 'handover',
      label: 'Ready Handover',
      value: handoverCount,
      icon: Handshake,
    },
    {
      id: 'completed',
      label: 'Completed',
      value: completedCount,
      icon: CheckCircle2,
    },
  ]

  return (
    <>
      <PageHead
        title="Repair Center"
        subtitle="Control every customer device from reception to delivery."
        actions={
          <Link
            className="btn primary"
            to="/repairs/new"
          >
            <Plus size={17} />
            New Repair
          </Link>
        }
      />

      <div className="repair-kpis">
        {kpis.map((item) => {
          const Icon = item.icon

          return (
            <Card key={item.id}>
              <Icon />

              <b>{item.value}</b>

              <span>{item.label}</span>
            </Card>
          )
        })}
      </div>

      <RepairTable rows={repairs} />
    </>
  )
}

/* =========================================================
   FILTERED REPAIR LISTS
========================================================= */

export function RepairList({ mode }) {
  const { repairs } = useApp()

  const [q, setQ] = useState('')

  const selectedConfig = cfg[mode] || cfg.history

  const [cTitle, sub, filterFn] = selectedConfig

  const search = q.trim().toLowerCase()

  const rows = repairs
    .filter(filterFn)
    .filter((r) => {
      if (!search) return true

      const searchableText = [
        r.id,
        r.customer,
        r.customerPhone,
        r.phone,
        r.imei,
        r.issue,
        r.tech,
        r.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchableText.includes(search)
    })

  return (
    <>
      <PageHead
        title={cTitle}
        subtitle={sub}
        actions={
          <Link
            className="btn primary"
            to="/repairs/new"
          >
            <Plus size={17} />
            New Repair
          </Link>
        }
      />

      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search job, customer, phone or IMEI..."
        />
      </div>

      <RepairTable rows={rows} />
    </>
  )
}

/* =========================================================
   REPAIR TABLE
========================================================= */

function RepairTable({ rows = [] }) {
  return (
    <Card className="table-card">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Customer / Device</th>
            <th>Technician</th>
            <th>Deadline</th>
            <th>Status</th>
            <th>Bill</th>
            <th />
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.id}</b>

                <small>
                  {r.created || '—'}
                </small>
              </td>

              <td>
                <b>{r.phone || 'Unknown device'}</b>

                <small>
                  {r.customer || 'Unknown customer'}
                  {r.issue ? ` · ${r.issue}` : ''}
                </small>
              </td>

              <td>
                {r.tech || 'Unassigned'}
              </td>

              <td>
                <span
                  className={`deadline ${
                    r.urgency || 'ok'
                  }`}
                >
                  {r.deadline || 'No deadline'}
                </span>
              </td>

              <td>
                <Badge>
                  {r.status || 'Received'}
                </Badge>
              </td>

              <td>
                <strong>
                  {money(Number(r.total || 0))}
                </strong>

                <small>
                  {Number(r.paid || 0) > 0
                    ? `${money(
                        Number(r.paid || 0)
                      )} paid`
                    : 'Unpaid'}
                </small>
              </td>

              <td>
                <Link
                  className="iconbtn"
                  to={`/repairs/${r.id}`}
                  aria-label={`Open repair ${r.id}`}
                >
                  <ArrowRight size={18} />
                </Link>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan="7">
                <div className="empty-inline">
                  No repair jobs found.
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

/* =========================================================
   NEW REPAIR
========================================================= */

export function NewRepair() {
  const {
    addRepair,
    techs,
  } = useApp()

  const [done, setDone] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (saving) return

    const form = e.currentTarget
    const f = new FormData(form)

    const data = Object.fromEntries(f)

    const technician = techs.find(
      (t) => t.name === data.tech
    )

    data.technicianId =
      technician?.id || null

    data.total =
      Number(data.total || 0)

    /*
     * No Waiting Approval stage.
     *
     * If technician is selected at reception,
     * backend/application can start the job
     * as Assigned.
     *
     * Otherwise it remains Received.
     */
    data.status = technician
      ? 'Assigned'
      : 'Received'

    try {
      setSaving(true)

      const id = await addRepair(data)

      setDone(id)

      form.reset()
    } catch (error) {
      console.error(
        'Failed to create repair:',
        error
      )

      alert(
        error?.message ||
          'Unable to create repair job.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHead
        title="Receive New Repair"
        subtitle="Create custody record, deadline and technician assignment before the device enters workshop."
      />

      {done && (
        <div className="success-banner">
          <CheckCircle2 />

          <div>
            <b>{done} created successfully.</b>

            <span>
              Print the customer receipt and phone
              tag now.
            </span>
          </div>
        </div>
      )}

      <form
        className="repair-form"
        onSubmit={handleSubmit}
      >
        {/* CUSTOMER */}

        <Card>
          <h3>Customer</h3>

          <div className="formgrid">
            <label>
              Customer name

              <input
                name="customer"
                required
                placeholder="Full name"
              />
            </label>

            <label>
              Mobile number

              <input
                name="customerPhone"
                required
                placeholder="03xx xxxxxxx"
              />
            </label>
          </div>
        </Card>

        {/* DEVICE */}

        <Card>
          <h3>Device & Condition</h3>

          <div className="formgrid">
            <label>
              Brand / Model

              <input
                name="phone"
                required
                placeholder="e.g. Samsung A52"
              />
            </label>

            <label>
              IMEI / Serial

              <input
                name="imei"
                placeholder="Scan or enter IMEI"
              />
            </label>

            <label>
              Problem / Complaint

              <input
                name="issue"
                required
                placeholder="Customer complaint"
              />
            </label>

            <label>
              Existing condition

              <select name="condition">
                <option value="Normal used condition">
                  Normal used condition
                </option>

                <option value="Screen cracked">
                  Screen cracked
                </option>

                <option value="Back damaged">
                  Back damaged
                </option>

                <option value="Water marks">
                  Water marks
                </option>
              </select>
            </label>
          </div>

          <label>
            Accessories / condition notes

            <textarea
              name="conditionNotes"
              placeholder="Cover received, SIM removed, scratches on frame..."
            />
          </label>
        </Card>

        {/* ASSIGNMENT */}

        <Card>
          <h3>Assignment & Promise</h3>

          <div className="formgrid">
            <label>
              Technician

              <select name="tech">
                <option value="">
                  Assign later
                </option>

                {techs.map((t) => (
                  <option
                    key={t.id}
                    value={t.name}
                  >
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Deadline

              <input
                name="deadline"
                type="datetime-local"
                required
              />
            </label>

            <label>
              Estimated amount

              <input
                name="total"
                type="number"
                min="0"
                step="1"
                placeholder="0"
              />
            </label>

            <label>
              Priority

              <select name="urgency">
                <option value="ok">
                  Normal
                </option>

                <option value="warning">
                  Urgent
                </option>

                <option value="critical">
                  Critical
                </option>
              </select>
            </label>
          </div>
        </Card>

        <div className="sticky-actions">
          <button
            type="button"
            className="btn ghost"
          >
            <Printer size={17} />
            Print Preview
          </button>

          <button
            type="submit"
            className="btn primary"
            disabled={saving}
          >
            <Plus size={17} />

            {saving
              ? 'Creating Job...'
              : 'Receive Device & Create Job'}
          </button>
        </div>
      </form>
    </>
  )
}

/* =========================================================
   REPAIR DETAIL
========================================================= */

export function RepairDetail() {
  const { id } = useParams()

  const {
    repairs,
    updateRepair,
  } = useApp()

  const r = repairs.find(
    (repair) =>
      String(repair.id) === String(id)
  )

  const [updating, setUpdating] =
    useState(false)

  if (!r) {
    return (
      <>
        <PageHead
          title="Repair Not Found"
          subtitle="The requested repair job could not be found."
        />

        <Card>
          <div className="empty-inline">
            Repair {id} was not found.
          </div>
        </Card>
      </>
    )
  }

  const timelineStages = [
    'Received',
    'Assigned',
    'Repairing',
    'Ready for Handover',
    'Completed',
    'Delivered',
  ]

  const total = Number(r.total || 0)
  const paid = Number(r.paid || 0)

  const balance = Math.max(
    0,
    total - paid
  )

  const handleMarkReady = async () => {
    try {
      setUpdating(true)

      await updateRepair(id, {
        status: 'Ready for Handover',
      })
    } catch (error) {
      console.error(
        'Unable to update repair:',
        error
      )

      alert(
        error?.message ||
          'Unable to update repair status.'
      )
    } finally {
      setUpdating(false)
    }
  }

  return (
    <>
      <PageHead
        title={`${r.id} · ${r.phone}`}
        subtitle={`${r.customer} · ${
          r.customerPhone || 'No phone number'
        }`}
        actions={
          <>
            <button
              type="button"
              className="btn ghost"
            >
              <Printer size={17} />
              Print
            </button>

            {![
              'Ready for Handover',
              'Completed',
              'Delivered',
            ].includes(r.status) && (
              <button
                type="button"
                className="btn primary"
                disabled={updating}
                onClick={handleMarkReady}
              >
                <Handshake size={17} />

                {updating
                  ? 'Updating...'
                  : 'Mark Ready'}
              </button>
            )}
          </>
        }
      />

      <div className="detail-grid">
        {/* TIMELINE */}

        <Card>
          <h3>Job Timeline</h3>

          {timelineStages.map(
            (stage, index) => (
              <div
                key={`timeline-${stage}`}
                className={`timeline ${
                  stage === r.status
                    ? 'current'
                    : ''
                }`}
              >
                <span>
                  {index + 1}
                </span>

                <div>
                  <b>{stage}</b>

                  <small>
                    {stage === r.status
                      ? 'Current stage'
                      : 'Workflow stage'}
                  </small>
                </div>
              </div>
            )
          )}
        </Card>

        <div className="stack">
          {/* DEVICE INFORMATION */}

          <Card>
            <h3>Device</h3>

            <div className="info">
              <span>Customer</span>
              <b>{r.customer}</b>

              <span>Customer Phone</span>
              <b>
                {r.customerPhone || '—'}
              </b>

              <span>Device</span>
              <b>{r.phone}</b>

              <span>IMEI</span>
              <b>{r.imei || '—'}</b>

              <span>Complaint</span>
              <b>{r.issue}</b>

              <span>Technician</span>
              <b>
                {r.tech || 'Unassigned'}
              </b>

              <span>Deadline</span>
              <b>
                {r.deadline || '—'}
              </b>

              <span>Status</span>
              <b>
                <Badge>{r.status}</Badge>
              </b>
            </div>
          </Card>

          {/* BILLING */}

          <Card>
            <h3>Repair Billing</h3>

            <div className="info">
              <span>Parts used</span>

              <b>
                {Array.isArray(r.parts) &&
                r.parts.length > 0
                  ? r.parts.join(', ')
                  : 'None yet'}
              </b>

              <span>Total bill</span>
              <b>{money(total)}</b>

              <span>Paid</span>
              <b>{money(paid)}</b>

              <span>Balance</span>
              <b>{money(balance)}</b>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}