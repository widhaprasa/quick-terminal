package api

import (
	"bytes"
	"context"
	"sync"
	"time"
	"unicode/utf8"

	"quick-terminal/server/common/term"
	"quick-terminal/server/dto"
	"quick-terminal/server/global/session"

	"github.com/gorilla/websocket"
)

type TermHandler struct {
	sessionId     string
	isRecording   bool
	webSocket     *websocket.Conn
	quickTerminal *term.QuickTerminal
	ctx           context.Context
	cancel        context.CancelFunc
	dataChan      chan rune
	tick          *time.Ticker
	mutex         sync.Mutex
	buf           bytes.Buffer
}

func NewTermHandler(userId, assetId, sessionId string, isRecording bool, ws *websocket.Conn, quickTerminal *term.QuickTerminal) *TermHandler {
	ctx, cancel := context.WithCancel(context.Background())
	tick := time.NewTicker(time.Millisecond * time.Duration(60))

	return &TermHandler{
		sessionId:     sessionId,
		isRecording:   isRecording,
		webSocket:     ws,
		quickTerminal: quickTerminal,
		ctx:           ctx,
		cancel:        cancel,
		dataChan:      make(chan rune),
		tick:          tick,
	}
}

func (r *TermHandler) Start() {
	go r.readFormTunnel()
	go r.writeToWebsocket()
}

func (r *TermHandler) Stop() {
	// Record the last command when the session ends
	r.tick.Stop()
	r.cancel()
}

func (r *TermHandler) readFormTunnel() {
	for {
		select {
		case <-r.ctx.Done():
			return
		default:
			rn, size, err := r.quickTerminal.StdoutReader.ReadRune()
			if err != nil {
				return
			}
			if size > 0 {
				r.dataChan <- rn
			}
		}
	}
}

func (r *TermHandler) writeToWebsocket() {
	for {
		select {
		case <-r.ctx.Done():
			return
		case <-r.tick.C:
			s := r.buf.String()
			if s == "" {
				continue
			}
			if err := r.SendMessageToWebSocket(dto.NewMessage(Data, s)); err != nil {
				return
			}
			// Record screen
			if r.isRecording {
				_ = r.quickTerminal.Recorder.WriteData(s)
			}
			// Monitor
			SendObData(r.sessionId, s)
			r.buf.Reset()
		case data := <-r.dataChan:
			if data != utf8.RuneError {
				p := make([]byte, utf8.RuneLen(data))
				utf8.EncodeRune(p, data)
				r.buf.Write(p)
			} else {
				r.buf.Write([]byte("@"))
			}
		}
	}
}

func (r *TermHandler) Write(input []byte) error {
	// Normal character input
	_, err := r.quickTerminal.Write(input)
	return err
}

func (r *TermHandler) WindowChange(h int, w int) error {
	return r.quickTerminal.WindowChange(h, w)
}

func (r *TermHandler) SendRequest() error {
	_, _, err := r.quickTerminal.SshClient.Conn.SendRequest("widhaprasa@github.com", true, nil)
	return err
}

func (r *TermHandler) SendMessageToWebSocket(msg dto.Message) error {
	if r.webSocket == nil {
		return nil
	}
	defer r.mutex.Unlock()
	r.mutex.Lock()
	message := []byte(msg.ToString())
	return r.webSocket.WriteMessage(websocket.TextMessage, message)
}

func SendObData(sessionId, s string) {
	quickSession := session.GlobalSessionManager.GetById(sessionId)
	if quickSession != nil && quickSession.Observer != nil {
		quickSession.Observer.Range(func(key string, ob *session.Session) {
			_ = ob.WriteMessage(dto.NewMessage(Data, s))
		})
	}
}
