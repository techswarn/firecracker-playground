package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/yourname/firecracker-playground/vm"
)

var manager *vm.Manager

func main() {
	kernelPath := getenv("KERNEL_PATH", "/opt/fc/vmlinux")
	rootfsBase := getenv("ROOTFS_PATH", "/opt/fc/rootfs.ext4")
	dataDir := getenv("DATA_DIR", "/opt/fc/data")
	listenAddr := getenv("LISTEN_ADDR", ":8080")

	manager = vm.NewManager(kernelPath, rootfsBase, dataDir)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/vms", withCORS(handleVMs))
	mux.HandleFunc("/api/vms/", withCORS(handleVM))
	mux.HandleFunc("/api/health", withCORS(handleHealth))

	log.Printf("🔥 Firecracker Playground API listening on %s", listenAddr)
	if err := http.ListenAndServe(listenAddr, mux); err != nil {
		log.Fatal(err)
	}
}

// GET /api/health
func handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]string{"status": "ok"})
}

// GET /api/vms       → list all VMs
// POST /api/vms      → create a VM
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

// GET    /api/vms/:id  → get one VM
// DELETE /api/vms/:id  → delete VM
func handleVM(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/vms/")
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
