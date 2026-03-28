import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export default function VMTerminal({ vmId, onClose }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", monospace',
      theme: {
        background: '#0a0c0f',
        foreground: '#c8d6e5',
        cursor: '#00e5ff',
        selectionBackground: 'rgba(0,229,255,0.2)',
        black: '#0a0c0f',
        brightBlack: '#3a4a5e',
        red: '#ff4d6d',
        green: '#39ff6a',
        yellow: '#ffd23f',
        blue: '#00e5ff',
        cyan: '#00e5ff',
        white: '#c8d6e5',
        brightWhite: '#eaf2ff',
      },
      scrollback: 1000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term

    term.writeln('\x1b[36m── Connecting to VM console...\x1b[0m')

    // Connect WebSocket
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${wsProto}://${window.location.host}/api/vms/${vmId}/console`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      term.writeln('\x1b[32m── Connected. Press Enter to get a prompt.\x1b[0m\r\n')
    }

    ws.onmessage = (e) => {
      const data = e.data instanceof ArrayBuffer
        ? new Uint8Array(e.data)
        : e.data
      term.write(data)
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[33m── Connection closed.\x1b[0m')
    }

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m── WebSocket error.\x1b[0m')
    }

    // Keystrokes → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data))
      }
    })

    // Resize handler
    const onResize = () => fitAddon.fit()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      ws.close()
      term.dispose()
    }
  }, [vmId])

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.window}>
        <div style={styles.titleBar}>
          <span style={styles.titleDots}>
            <span style={{ ...styles.dot, background: '#ff4d6d' }} onClick={onClose} title="Close" />
            <span style={{ ...styles.dot, background: '#ffd23f' }} />
            <span style={{ ...styles.dot, background: '#39ff6a' }} />
          </span>
          <span style={styles.title}>console — vm:{vmId}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div ref={containerRef} style={styles.terminal} />
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.8)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200,
  },
  window: {
    width: '85vw', maxWidth: 900,
    height: '70vh',
    background: '#0a0c0f',
    border: '1px solid var(--border-bright)',
    borderRadius: 6,
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 0 80px rgba(0,0,0,0.8), 0 0 30px rgba(0,229,255,0.1)',
    overflow: 'hidden',
  },
  titleBar: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px',
    background: '#111418',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  titleDots: { display: 'flex', gap: 6 },
  dot: {
    width: 10, height: 10, borderRadius: '50%', cursor: 'pointer',
  },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-dim)',
    fontFamily: 'var(--mono)',
  },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--text-dim)',
    fontSize: 12, cursor: 'pointer',
  },
  terminal: {
    flex: 1,
    padding: '8px',
    overflow: 'hidden',
  },
}
