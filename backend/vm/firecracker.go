package vm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"time"
)

// FirecrackerClient talks to a single Firecracker process via its Unix socket.
type FirecrackerClient struct {
	socketPath string
	client     *http.Client
}

func newFirecrackerClient(socketPath string) *FirecrackerClient {
	return &FirecrackerClient{
		socketPath: socketPath,
		client: &http.Client{
			Transport: &http.Transport{
				DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
					return net.Dial("unix", socketPath)
				},
			},
			Timeout: 10 * time.Second,
		},
	}
}

func (fc *FirecrackerClient) put(path string, body any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPut, "http://localhost"+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := fc.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("firecracker %s returned %d: %s", path, resp.StatusCode, string(b))
	}
	return nil
}

// SpawnProcess starts the firecracker binary for this VM and returns the process.
func SpawnProcess(id, socketPath, logPath string) (*exec.Cmd, error) {
	// Remove stale socket if exists
	os.Remove(socketPath)

	// Ensure /dev/kvm is accessible
	if _, err := os.Stat("/dev/kvm"); err != nil {
		return nil, fmt.Errorf("/dev/kvm not available: %w", err)
	}

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return nil, fmt.Errorf("open log file: %w", err)
	}

	cmd := exec.Command("firecracker",
		"--id", id,
		"--api-sock", socketPath,
		"--log-path", logPath,
		"--level", "Info",
	)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("failed to start firecracker: %w", err)
	}

	// Wait for socket to appear (up to 5 seconds)
	for i := 0; i < 50; i++ {
		if _, err := os.Stat(socketPath); err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if _, err := os.Stat(socketPath); err != nil {
		// Collect log output to surface in the error
		logFile.Close()
		logs, _ := os.ReadFile(logPath)
		cmd.Process.Kill()
		return nil, fmt.Errorf("firecracker socket never appeared at %s\nlog: %s", socketPath, string(logs))
	}
	return cmd, nil
}

// ConfigureAndBoot applies machine config, boot source, rootfs, then starts the VM.
func (fc *FirecrackerClient) ConfigureAndBoot(cfg CreateRequest, kernelPath, rootfsPath string) error {
	// 1. Machine config
	if err := fc.put("/machine-config", map[string]any{
		"vcpu_count":   cfg.VCPUs,
		"mem_size_mib": cfg.MemoryMiB,
	}); err != nil {
		return fmt.Errorf("machine-config: %w", err)
	}

	// 2. Boot source
	if err := fc.put("/boot-source", map[string]any{
		"kernel_image_path": kernelPath,
		"boot_args":         "console=ttyS0 reboot=k panic=1 pci=off",
	}); err != nil {
		return fmt.Errorf("boot-source: %w", err)
	}

	// 3. Root drive (copy rootfs so each VM is isolated)
	if err := fc.put("/drives/rootfs", map[string]any{
		"drive_id":       "rootfs",
		"path_on_host":   rootfsPath,
		"is_root_device": true,
		"is_read_only":   false,
	}); err != nil {
		return fmt.Errorf("drives/rootfs: %w", err)
	}

	// 4. Start the instance
	if err := fc.put("/actions", map[string]any{
		"action_type": "InstanceStart",
	}); err != nil {
		return fmt.Errorf("InstanceStart: %w", err)
	}

	return nil
}