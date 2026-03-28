package vm

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusStarting Status = "starting"
	StatusRunning  Status = "running"
	StatusStopped  Status = "stopped"
	StatusError    Status = "error"
)

type VM struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	VCPUs     int       `json:"vcpus"`
	MemoryMiB int       `json:"memory_mib"`
	Status    Status    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	Error     string    `json:"error,omitempty"`

	process    *exec.Cmd
	socketPath string
	rootfsPath string
}

type CreateRequest struct {
	Name      string `json:"name"`
	VCPUs     int    `json:"vcpus"`
	MemoryMiB int    `json:"memory_mib"`
}

type Manager struct {
	mu         sync.RWMutex
	vms        map[string]*VM
	kernelPath string
	rootfsBase string // base rootfs image (read-only template)
	dataDir    string // working directory for sockets, per-VM rootfs copies, logs
}

func NewManager(kernelPath, rootfsBase, dataDir string) *Manager {
	os.MkdirAll(dataDir, 0755)
	return &Manager{
		vms:        make(map[string]*VM),
		kernelPath: kernelPath,
		rootfsBase: rootfsBase,
		dataDir:    dataDir,
	}
}

func (m *Manager) List() []*VM {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]*VM, 0, len(m.vms))
	for _, v := range m.vms {
		list = append(list, v)
	}
	return list
}

func (m *Manager) Get(id string) (*VM, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.vms[id]
	return v, ok
}

func (m *Manager) Create(req CreateRequest) (*VM, error) {
	if req.VCPUs <= 0 {
		req.VCPUs = 1
	}
	if req.MemoryMiB <= 0 {
		req.MemoryMiB = 128
	}
	if req.VCPUs > 8 {
		return nil, fmt.Errorf("max 8 vCPUs")
	}
	if req.MemoryMiB > 4096 {
		return nil, fmt.Errorf("max 4096 MiB memory")
	}

	id := uuid.New().String()[:8]
	socketPath := filepath.Join(m.dataDir, fmt.Sprintf("fc-%s.sock", id))
	rootfsPath := filepath.Join(m.dataDir, fmt.Sprintf("rootfs-%s.ext4", id))
	logPath := filepath.Join(m.dataDir, fmt.Sprintf("fc-%s.log", id))

	v := &VM{
		ID:         id,
		Name:       req.Name,
		VCPUs:      req.VCPUs,
		MemoryMiB:  req.MemoryMiB,
		Status:     StatusStarting,
		CreatedAt:  time.Now(),
		socketPath: socketPath,
		rootfsPath: rootfsPath,
	}

	m.mu.Lock()
	m.vms[id] = v
	m.mu.Unlock()

	// Boot in background
	go func() {
		if err := m.boot(v, req); err != nil {
			m.mu.Lock()
			v.Status = StatusError
			v.Error = err.Error()
			m.mu.Unlock()
			return
		}
		m.mu.Lock()
		v.Status = StatusRunning
		m.mu.Unlock()
	}()

	return v, nil
}

func (m *Manager) boot(v *VM, req CreateRequest) error {
	// Copy rootfs image for this VM (so each VM has its own writable disk)
	if err := copyFile(m.rootfsBase, v.rootfsPath); err != nil {
		return fmt.Errorf("copy rootfs: %w", err)
	}

	// Spawn firecracker process
	process, err := SpawnProcess(v.socketPath, filepath.Join(m.dataDir, fmt.Sprintf("fc-%s.log", v.ID)))
	if err != nil {
		return err
	}
	m.mu.Lock()
	v.process = process
	m.mu.Unlock()

	// Configure and boot via API
	fc := newFirecrackerClient(v.socketPath)
	if err := fc.ConfigureAndBoot(req, m.kernelPath, v.rootfsPath); err != nil {
		process.Process.Kill()
		return err
	}

	// Monitor process exit
	go func() {
		process.Wait()
		m.mu.Lock()
		if v.Status == StatusRunning {
			v.Status = StatusStopped
		}
		m.mu.Unlock()
	}()

	return nil
}

func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.vms[id]
	if !ok {
		return fmt.Errorf("vm %s not found", id)
	}
	if v.process != nil && v.process.Process != nil {
		v.process.Process.Kill()
	}
	os.Remove(v.socketPath)
	os.Remove(v.rootfsPath)
	delete(m.vms, id)
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = out.ReadFrom(in)
	return err
}
