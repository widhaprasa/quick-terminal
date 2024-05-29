package api

import (
	"context"
	"quick-terminal/server/common/guacamole"

	"github.com/gorilla/websocket"
)

type GuacamoleHandler struct {
	ws     *websocket.Conn
	tunnel *guacamole.Tunnel
	ctx    context.Context
	cancel context.CancelFunc
}

func NewGuacamoleHandler(ws *websocket.Conn, tunnel *guacamole.Tunnel) *GuacamoleHandler {
	ctx, cancel := context.WithCancel(context.Background())
	return &GuacamoleHandler{
		ws:     ws,
		tunnel: tunnel,
		ctx:    ctx,
		cancel: cancel,
	}
}

func (r GuacamoleHandler) Start() {
	go func() {
		for {
			select {
			case <-r.ctx.Done():
				return
			default:
				instruction, err := r.tunnel.Read()
				if err != nil {
					guacamole.Disconnect(r.ws, TunnelClosed, "Remote connection closed.")
					return
				}
				if len(instruction) == 0 {
					continue
				}
				err = r.ws.WriteMessage(websocket.TextMessage, instruction)
				if err != nil {
					return
				}
			}
		}
	}()
}

func (r GuacamoleHandler) Stop() {
	r.cancel()
}
