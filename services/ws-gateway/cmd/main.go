package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/vibeos/shared/models"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
}

type Client struct {
	conn        *websocket.Conn
	send        chan []byte
	workspaceID string
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*Client]bool)}
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
	slog.Info("client connected", "workspace", c.workspaceID, "total", len(h.clients))
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
	}
	h.mu.Unlock()
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) Broadcast(workspaceID string, data []byte) {
	if workspaceID == "" {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.workspaceID == workspaceID {
			select {
			case c.send <- data:
			default:
				go h.Unregister(c)
			}
		}
	}
}

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.Unregister(c)
		c.conn.Close()
	}()
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// Any received message (including client-side JSON pings) resets the deadline,
		// keeping the connection alive even when a proxy strips WebSocket-level pongs.
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
	}
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8020"
	}
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Error("invalid REDIS_URL", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opt)
	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		slog.Warn("redis not available at startup", "error", err)
	}

	publishSecret := os.Getenv("PUBLISH_SECRET")
	if publishSecret == "" {
		publishSecret = "vibeos-internal"
	}

	hub := NewHub()

	go func() {
		pubsub := rdb.Subscribe(ctx, "vibeos:events")
		defer pubsub.Close()
		for msg := range pubsub.Channel() {
			raw := []byte(msg.Payload)
			var envelope models.WSEvent
			if err := json.Unmarshal(raw, &envelope); err != nil {
				slog.Warn("invalid event payload", "error", err)
				continue
			}
			hub.Broadcast(envelope.WorkspaceID, raw)
		}
	}()

	r := chi.NewRouter()
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		wsID := r.URL.Query().Get("workspace_id")
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Error("websocket upgrade failed", "error", err)
			return
		}
		client := &Client{
			conn:        conn,
			send:        make(chan []byte, 256),
			workspaceID: wsID,
		}
		hub.Register(client)
		go client.writePump()
		go client.readPump(hub)
	})

	r.Post("/api/publish", func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("X-Internal-Token")
		if token != publishSecret {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			http.Error(w, `{"error":"read failed"}`, http.StatusBadRequest)
			return
		}
		var envelope models.WSEvent
		if err := json.Unmarshal(raw, &envelope); err != nil {
			http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
			return
		}
		if envelope.WorkspaceID == "" {
			http.Error(w, `{"error":"workspaceId required"}`, http.StatusBadRequest)
			return
		}

		rdb.Publish(ctx, "vibeos:events", string(raw))

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		status := "ok"
		if err := rdb.Ping(ctx).Err(); err != nil {
			status = "degraded"
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  status,
			"clients": hub.ClientCount(),
		})
	})

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("ws-gateway starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down ws-gateway")
	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx)
	rdb.Close()
}
