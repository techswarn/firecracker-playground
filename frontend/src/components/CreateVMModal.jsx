import { useState } from 'react'

export default function CreateVMModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', vcpus: 1, memory_mib: 128 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      await onCreate(form)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        {/* Title */}
        <div style={styles.titleBar}>
          <span style={styles.titleDots}>
            <span style={{ ...styles.dot, background: 'var(--red)' }} />
            <span style={{ ...styles.dot, background: 'var(--yellow)' }} />
            <span style={{ ...styles.dot, background: 'var(--green)' }} />
          </span>
          <span style={styles.title}>NEW INSTANCE</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.body}>
          <Field label="INSTANCE NAME" hint="optional — auto-generated if blank">
            <input
              style={styles.input}
              placeholder="my-vm-01"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </Field>

          <Field label="vCPUs" hint="1 – 8">
            <div style={styles.stepRow}>
              <button style={styles.stepBtn} onClick={() => set('vcpus', Math.max(1, form.vcpus - 1))}>−</button>
              <span style={styles.stepValue}>{form.vcpus}</span>
              <button style={styles.stepBtn} onClick={() => set('vcpus', Math.min(8, form.vcpus + 1))}>+</button>
            </div>
          </Field>

          <Field label="MEMORY (MiB)" hint="64 – 4096">
            <select
              style={styles.input}
              value={form.memory_mib}
              onChange={e => set('memory_mib', Number(e.target.value))}
            >
              {[64, 128, 256, 512, 1024, 2048, 4096].map(m => (
                <option key={m} value={m}>{m} MiB</option>
              ))}
            </select>
          </Field>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.actions}>
            <button style={{ ...styles.btn, ...styles.cancelBtn }} onClick={onClose}>
              CANCEL
            </button>
            <button
              style={{ ...styles.btn, ...styles.launchBtn, opacity: loading ? 0.6 : 1 }}
              onClick={submit}
              disabled={loading}
            >
              {loading ? 'LAUNCHING...' : '⚡ LAUNCH VM'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={fieldStyles.wrap}>
      <div style={fieldStyles.labelRow}>
        <span style={fieldStyles.label}>{label}</span>
        {hint && <span style={fieldStyles.hint}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const fieldStyles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  labelRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  label: { fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase' },
  hint: { fontSize: 10, color: 'var(--text-dim)' },
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: 'var(--surface)',
    border: '1px solid var(--border-bright)',
    borderRadius: 6,
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 0 60px rgba(0,0,0,0.6), var(--accent-glow)',
    overflow: 'hidden',
  },
  titleBar: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px',
    background: 'var(--surface2)',
    borderBottom: '1px solid var(--border)',
  },
  titleDots: { display: 'flex', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: '50%' },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-dim)',
  },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--text-dim)',
    fontSize: 12, cursor: 'pointer', padding: '0 2px',
  },
  body: {
    padding: '24px',
    display: 'flex', flexDirection: 'column', gap: 20,
  },
  input: {
    width: '100%',
    background: 'var(--surface2)',
    border: '1px solid var(--border-bright)',
    borderRadius: 3,
    color: 'var(--text-bright)',
    padding: '9px 12px',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  stepRow: {
    display: 'flex', alignItems: 'center', gap: 0,
  },
  stepBtn: {
    background: 'var(--surface2)',
    border: '1px solid var(--border-bright)',
    color: 'var(--accent)',
    width: 36, height: 36,
    fontSize: 16, cursor: 'pointer',
    transition: 'background 0.15s',
  },
  stepValue: {
    width: 48, textAlign: 'center',
    color: 'var(--text-bright)',
    fontWeight: 500, fontSize: 15,
    background: 'var(--surface2)',
    borderTop: '1px solid var(--border-bright)',
    borderBottom: '1px solid var(--border-bright)',
    lineHeight: '34px',
  },
  error: {
    background: 'var(--red-dim)',
    border: '1px solid rgba(255,77,109,0.25)',
    borderRadius: 3,
    padding: '8px 12px',
    color: 'var(--red)',
    fontSize: 12,
  },
  actions: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
    paddingTop: 4,
  },
  btn: {
    border: '1px solid', borderRadius: 3,
    padding: '9px 20px', fontSize: 11,
    fontWeight: 500, letterSpacing: '0.08em',
    transition: 'all 0.15s',
    cursor: 'pointer',
  },
  cancelBtn: {
    background: 'none',
    borderColor: 'var(--border-bright)',
    color: 'var(--text-dim)',
  },
  launchBtn: {
    background: 'var(--accent-dim)',
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
    boxShadow: 'var(--accent-glow)',
  },
}
