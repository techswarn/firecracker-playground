import { useState } from 'react'

const STATUS_CONFIG = {
  running: { color: 'var(--green)', bg: 'var(--green-dim)', label: '● RUNNING' },
  starting: { color: 'var(--yellow)', bg: 'rgba(255,210,63,0.12)', label: '◌ STARTING' },
  stopped: { color: 'var(--text-dim)', bg: 'rgba(90,106,126,0.12)', label: '○ STOPPED' },
  error: { color: 'var(--red)', bg: 'var(--red-dim)', label: '✕ ERROR' },
}

export default function VMCard({ vm, onDelete }) {
  const [deleting, setDeleting] = useState(false)
  const st = STATUS_CONFIG[vm.status] || STATUS_CONFIG.stopped

  const handleDelete = async () => {
    if (!confirm(`Delete VM "${vm.name}"?`)) return
    setDeleting(true)
    await onDelete(vm.id)
  }

  const created = new Date(vm.created_at).toLocaleString()

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{vm.name}</span>
          <span style={{ ...styles.badge, color: st.color, background: st.bg }}>
            {st.label}
          </span>
        </div>
        <span style={styles.id}>#{vm.id}</span>
      </div>

      <div style={styles.specs}>
        <Spec icon="⬡" label="vCPUs" value={vm.vcpus} />
        <Spec icon="▣" label="Memory" value={`${vm.memory_mib} MiB`} />
        <Spec icon="◷" label="Created" value={created} />
      </div>

      {vm.error && (
        <div style={styles.errorBox}>
          <span style={{ color: 'var(--red)', marginRight: 6 }}>ERR</span>
          {vm.error}
        </div>
      )}

      <div style={styles.footer}>
        <button
          style={{ ...styles.btn, ...styles.deleteBtn, opacity: deleting ? 0.5 : 1 }}
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? 'TERMINATING...' : 'TERMINATE'}
        </button>
      </div>
    </div>
  )
}

function Spec({ icon, label, value }) {
  return (
    <div style={styles.spec}>
      <span style={styles.specIcon}>{icon}</span>
      <span style={styles.specLabel}>{label}</span>
      <span style={styles.specValue}>{value}</span>
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    transition: 'border-color 0.2s',
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  name: {
    fontFamily: 'var(--sans)',
    fontWeight: 700,
    fontSize: 16,
    color: 'var(--text-bright)',
    letterSpacing: '0.02em',
  },
  badge: {
    fontSize: 10,
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: 2,
    letterSpacing: '0.08em',
  },
  id: {
    fontSize: 11,
    color: 'var(--text-dim)',
    letterSpacing: '0.06em',
  },
  specs: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px 0',
    borderTop: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
  },
  spec: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 12,
  },
  specIcon: {
    color: 'var(--accent)',
    width: 14,
    textAlign: 'center',
  },
  specLabel: {
    color: 'var(--text-dim)',
    width: 64,
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: '0.06em',
  },
  specValue: {
    color: 'var(--text)',
  },
  errorBox: {
    background: 'var(--red-dim)',
    border: '1px solid rgba(255,77,109,0.2)',
    borderRadius: 3,
    padding: '8px 12px',
    fontSize: 11,
    color: 'var(--text)',
    wordBreak: 'break-all',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  btn: {
    background: 'none',
    border: '1px solid',
    borderRadius: 3,
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.08em',
    transition: 'all 0.15s',
  },
  deleteBtn: {
    borderColor: 'rgba(255,77,109,0.3)',
    color: 'var(--red)',
  },
}
