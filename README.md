# 🔥 Firecracker Playground

A self-hosted micro-VM playground inspired by iximiuz Labs. Spin up isolated Firecracker microVMs from a web UI in seconds.

## Architecture

```
Browser (React + Vite)
        │  HTTP / REST
        ▼
  Nginx (port 80)
   ├── /         → frontend/dist (static files)
   └── /api/*    → Go backend (port 8080)
                        │
                        │  HTTP over Unix socket
                        ▼
              firecracker (one process per VM)
```

**Stack:**
- **Frontend**: Vite + React (served by Nginx)
- **Backend**: Go — REST API, manages Firecracker processes
- **Hypervisor**: Firecracker (via KVM)

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/vms` | List all VMs |
| POST | `/api/vms` | Create a new VM |
| GET | `/api/vms/:id` | Get single VM |
| DELETE | `/api/vms/:id` | Terminate VM |

**Create VM request body:**
```json
{
  "name": "my-vm",
  "vcpus": 1,
  "memory_mib": 128
}
```

## Deploy on DigitalOcean

### 1. Create a Droplet

- **Image**: Ubuntu 22.04 LTS
- **Size**: Premium Intel or Premium AMD (KVM nested-virt required)
  - Minimum: 2 GB RAM, 1 vCPU
  - Recommended: 4 GB RAM, 2 vCPU
- **Region**: Any

> ⚠️ Standard Droplets do **not** support KVM. You need a **Premium Intel** or **Premium AMD** Droplet with nested virtualization enabled.

### 2. Enable KVM (nested virtualization)

Contact DigitalOcean support or use the API to enable nested virtualization on your Droplet. Verify with:

```bash
ls /dev/kvm   # must exist
```

### 3. Clone and run setup

```bash
git clone https://github.com/yourname/firecracker-playground /opt/firecracker-playground
chmod +x /opt/firecracker-playground/scripts/setup.sh
sudo /opt/firecracker-playground/scripts/setup.sh
```

The script will:
1. Install Firecracker binary
2. Download a Linux kernel and Ubuntu rootfs image
3. Build and install the Go backend as a systemd service
4. Build the React frontend
5. Configure Nginx to serve everything

### 4. Access

Open `http://<your-droplet-ip>` in your browser.

## Local Development

**Prerequisites**: Linux with KVM, Go 1.22+, Node.js 18+, Firecracker binary in PATH.

```bash
# Backend
cd backend
go run .

# Frontend (in another terminal)
cd frontend
npm install
npm run dev   # → http://localhost:3000 (proxies /api to :8080)
```

## Project Structure

```
firecracker-playground/
├── backend/
│   ├── main.go              # HTTP server, routes, CORS
│   ├── go.mod
│   └── vm/
│       ├── manager.go       # VM lifecycle (create, list, delete)
│       └── firecracker.go   # Firecracker process + API client
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── App.jsx          # Main app, polling, state
│       ├── index.css        # Global dark theme
│       └── components/
│           ├── VMCard.jsx         # VM display card
│           └── CreateVMModal.jsx  # New VM form
└── scripts/
    └── setup.sh             # DigitalOcean bootstrap script
```

## How It Works

1. User clicks **New Instance** and fills in vCPUs / memory
2. Frontend `POST /api/vms` → Go backend
3. Backend:
   - Copies the base rootfs image (so each VM has its own writable disk)
   - Spawns a `firecracker` process with a unique Unix socket
   - Configures it via HTTP-over-socket: machine config → kernel → rootfs → start
   - Tracks VM state in memory
4. Frontend polls every 3 seconds to update status (`starting` → `running`)
5. Clicking **Terminate** sends `DELETE /api/vms/:id` → kills the process, cleans up files

## Notes & Limitations

- **State is in-memory**: restarting the backend loses VM records (the Firecracker processes keep running but are untracked). For persistence, add a SQLite/BoltDB store.
- **Networking**: VMs are not yet network-configured. To add network access, create a TAP device per VM and configure it via the Firecracker `/network-interfaces` API.
- **Security**: No auth. For production, add an auth layer in front of the API.
