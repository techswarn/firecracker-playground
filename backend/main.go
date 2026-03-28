package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/yourname/firecracker-playground/vm"
)

var manager *vm.Manager

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	kernelPath := getenv("KERNEL_PATH", "/opt/fc/vmlinux")
	rootfsBase := getenv("ROOTFS_PATH", "/opt/fc/rootfs.ext4")
	dataDir := getenv("DATA_DIR", "/opt/fc/data")
	listenAddr := getenv("LISTEN_ADDR", ":8080")

	manager = vm.NewManager(kernelPath, rootfsBase, dataDir)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", withCORS(handleHealth))
	mux.HandleFunc("/api/vms", withCORS(handleVMs))
	mux.HandleFunc("/api/vms/", withCORS(handleVMOrConsole))

	log.Printf("🔥 Firecracker Playground API listening on %s", listenAddr)
	if err := http.ListenAndServe(listenAddr, mux); err != nil {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]string{"status": "ok"})
}

func handleVMs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		jsonOK(w, manager.List())
	case http.MethodPost:
		var req vm.CreateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			httpError(w, "invalid body: "+err.Error(), http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			req.Name = "vm-" + randomSuffix()
		}
		v, err := manager.Create(req)
		if err != nil {
			httpError(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		jsonOK(w, v)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// Routes /api/vms/:id and /api/vms/:id/console
func handleVMOrConsole(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/vms/")
	if strings.HasSuffix(path, "/console") {
		id := strings.TrimSuffix(path, "/console")
		handleConsole(w, r, id)
	} else {
		handleVM(w, r, path)
	}
}

func handleVM(w http.ResponseWriter, r *http.Request, id string) {
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodGet:
		v, ok := manager.Get(id)
		if !ok {
			httpError(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, v)
	case http.MethodDelete:
		if err := manager.Delete(id); err != nil {
			httpError(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleConsole upgrades to WebSocket and bridges VM serial console (stdin/stdout).
func handleConsole(w http.ResponseWriter, r *http.Request, id string) {
	v, ok := manager.Get(id)
	if !ok {
		httpError(w, "not found", http.StatusNotFound)
		return
	}
	if v.Stdin == nil || v.Stdout == nil {
		httpError(w, "console not available yet", http.StatusServiceUnavailable)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	// VM stdout → WebSocket (send VM output to browser)
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := v.Stdout.Read(buf)
			if n > 0 {
				if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	// WebSocket → VM stdin (send browser keystrokes to VM)
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if _, err := v.Stdin.Write(msg); err != nil {
			return
		}
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func randomSuffix() string {
	b := make([]byte, 4)
	for i := range b {
		b[i] = "abcdefghijklmnopqrstuvwxyz0123456789"[b[i]%36]
	}
	return string(b)
}
