import { useState, useEffect, useCallback } from 'react'
import VMCard from './components/VMCard'
import CreateVMModal from './components/CreateVMModal'

const API = '/api'

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export default function App() {
  const [vms, setVMs] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchVMs = useCallback(async () => {
    try {
      const data = await apiFetch('/vms')
      setVMs(data || [])
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVMs()
    // Poll every 3s to pick up status changes (starting → running)
    const id = setInterval(fetchVMs, 3000)
    return () => clearInterval(id)
  }, [fetchVMs])

  const createVM = async (form) => {
    await apiFetch('/vms', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name || undefined,
        vcpus: form.vcpus,
        memory_mib: form.memory_mib,
      }),
    })
    fetchVMs()
  }

  const deleteVM = async (id) => {
    await apiFetch(`/vms/${id}`, { method: 'DELETE' })
    setVMs(v => v.filter(x => x.id !== id))
  }

  const sorted = [...vms].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div style={styles.shell}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.flame}>🔥</div>
          <div>
            <div style={styles.logo}>FIRECRACKER</div>
            <div style={styles.logoSub}>PLAYGROUND</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.stat}>
            <span style={styles.statValue}>{vms.filter(v => v.status === 'running').length}</span>
            <span style={styles.statLabel}>RUNNING</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            <span style={styles.statValue}>{vms.length}</span>
            <span style={styles.statLabel}>TOTAL</span>
          </div>
          <button style={styles.createBtn} onClick={() => setShowModal(true)}>
            + NEW INSTANCE
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={styles.main}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <span style={styles.toolbarTitle}>
            INSTANCES
            <span style={styles.toolbarCount}>{vms.length}</span>
          </span>
          <button style={styles.refreshBtn} onClick={fetchVMs} title="Refresh">↻</button>
        </div>

        {error && (
          <div style={styles.errorBanner}>
            ⚠ Backend unreachable — {error}
          </div>
        )}

        {loading ? (
          <div style={styles.empty}>
            <span style={styles.emptyIcon}>◌</span>
            <span>LOADING...</span>
          </div>
        ) : sorted.length === 0 ? (
          <div style={styles.empty}>
            <span style={styles.emptyIcon}>⬡</span>
            <span style={{ color: 'var(--text-dim)' }}>No instances running.</span>
            <button style={styles.emptyBtn} onClick={() => setShowModal(true)}>
              Launch your first VM →
            </button>
          </div>
        ) : (
          <div style={styles.grid}>
            {sorted.map(vm => (
              <VMCard key={vm.id} vm={vm} onDelete={deleteVM} />
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <CreateVMModal
          onClose={() => setShowModal(false)}
          onCreate={createVM}
        />
      )}
    </div>
  )
}

const styles = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 32px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    gap: 16,
    flexWrap: 'wrap',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  flame: {
    fontSize: 28,
    lineHeight: 1,
  },
  logo: {
    fontFamily: 'var(--sans)',
    fontWeight: 800,
    fontSize: 20,
    color: 'var(--text-bright)',
    letterSpacing: '0.04em',
    lineHeight: 1.1,
  },
  logoSub: {
    fontSize: 9,
    letterSpacing: '0.18em',
    color: 'var(--accent)',
    fontWeight: 500,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  statValue: {
    fontFamily: 'var(--sans)',
    fontWeight: 700,
    fontSize: 18,
    color: 'var(--text-bright)',
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 9,
    letterSpacing: '0.1em',
    color: 'var(--text-dim)',
  },
  statDivider: {
    width: 1,
    height: 28,
    background: 'var(--border)',
  },
  createBtn: {
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    borderRadius: 3,
    padding: '9px 18px',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    boxShadow: 'var(--accent-glow)',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  main: {
    flex: 1,
    padding: '28px 32px',
    maxWidth: 1200,
    width: '100%',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbarTitle: {
    fontSize: 11,
    letterSpacing: '0.1em',
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  toolbarCount: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 2,
    padding: '1px 7px',
    fontSize: 10,
    color: 'var(--text)',
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-dim)',
    borderRadius: 3,
    padding: '4px 10px',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  errorBanner: {
    background: 'var(--red-dim)',
    border: '1px solid rgba(255,77,109,0.25)',
    borderRadius: 3,
    padding: '10px 16px',
    color: 'var(--red)',
    fontSize: 12,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '80px 0',
    color: 'var(--text-dim)',
    fontSize: 13,
    letterSpacing: '0.06em',
  },
  emptyIcon: {
    fontSize: 40,
    color: 'var(--border-bright)',
  },
  emptyBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: 13,
    letterSpacing: '0.04em',
    marginTop: 4,
  },
}
