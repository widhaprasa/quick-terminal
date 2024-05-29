package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"path"
	"quick-terminal/server/common/nt"
	"quick-terminal/server/utils"
	"strconv"

	"quick-terminal/server/common/term"
	"quick-terminal/server/config"
	"quick-terminal/server/dto"
	"quick-terminal/server/global/session"
	"quick-terminal/server/model"
	"quick-terminal/server/service"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

const (
	Closed    = 0
	Connected = 1
	Data      = 2
	Resize    = 3
	Ping      = 4
)

type WebTerminalApi struct {
}

func WriteMessage(ws *websocket.Conn, msg dto.Message) error {
	message := []byte(msg.ToString())
	return ws.WriteMessage(websocket.TextMessage, message)
}

func CreateQuickTerminalBySession(session model.Session) (*term.QuickTerminal, error) {
	var (
		username   = session.Username
		password   = session.Password
		privateKey = session.PrivateKey
		passphrase = session.Passphrase
		ip         = session.IP
		port       = session.Port
	)
	return term.NewQuickTerminal(ip, port, username, password, privateKey, passphrase, 10, 10, "", "", false)
}

func (api WebTerminalApi) SshEndpoint(c echo.Context) error {
	ws, err := UpGrader.Upgrade(c.Response().Writer, c.Request(), nil)
	if err != nil {
		return err
	}

	defer func() {
		_ = ws.Close()
	}()

	sessionId := c.Param("id")
	id := sessionId

	encodedPayload := c.QueryParam("payload")
	payload, err := utils.DecodePayload(encodedPayload)
	if err != nil {
		return err
	}
	protocol, ok := payload["protocol"].(string)
	if !ok {
		protocol = "ssh"
	}
	mode := "native"
	ip, ok := payload["host"].(string)
	if !ok {
		return errors.New("host not found")
	}
	port := 22
	fport, ok := payload["port"].(float64)
	if ok {
		port = int(fport)
	}
	username, _ := payload["username"].(string)
	password, _ := payload["password"].(string)
	privateKey := ""
	passphrase := ""

	creator := ""
	assetId := ""

	cols, _ := strconv.Atoi(c.QueryParam("cols"))
	rows, _ := strconv.Atoi(c.QueryParam("rows"))

	recording := ""
	var isRecording = false

	if isRecording {
		recording = path.Join(config.GlobalCfg.Guacd.Recording, sessionId, "recording.cast")
	}

	var attributes = map[string]string{
		"color-scheme": "gray-black",
		"font-name":    "menlo",
		"font-size":    "12",
	}

	var xterm = "xterm-256color"
	var quickTerminal *term.QuickTerminal
	if attributes[nt.SocksProxyEnable] == "true" {
		quickTerminal, err = term.NewQuickTerminalUseSocks(ip, port, username, password, privateKey, passphrase, rows, cols, recording, xterm, true, attributes[nt.SocksProxyHost], attributes[nt.SocksProxyPort], attributes[nt.SocksProxyUsername], attributes[nt.SocksProxyPassword])
	} else {
		quickTerminal, err = term.NewQuickTerminal(ip, port, username, password, privateKey, passphrase, rows, cols, recording, xterm, true)
	}

	if err != nil {
		return WriteMessage(ws, dto.NewMessage(Closed, "Failed to create SSH client: "+err.Error()+"."))
	}

	if err := quickTerminal.RequestPty(xterm, rows, cols); err != nil {
		return err
	}

	if err := quickTerminal.Shell(); err != nil {
		return err
	}

	if err := WriteMessage(ws, dto.NewMessage(Connected, "")); err != nil {
		return err
	}

	quickSession := &session.Session{
		ID:            id,
		Protocol:      protocol,
		Mode:          mode,
		WebSocket:     ws,
		GuacdTunnel:   nil,
		QuickTerminal: quickTerminal,
		Observer:      session.NewObserver(id),
	}
	session.GlobalSessionManager.Add(quickSession)

	termHandler := NewTermHandler(creator, assetId, sessionId, isRecording, ws, quickTerminal)
	termHandler.Start()
	defer termHandler.Stop()

	for {
		_, message, err := ws.ReadMessage()
		if err != nil {
			// Actively close the ssh session after the web socket session is closed
			service.SessionService.CloseSessionById(sessionId, Normal, "Exited")
			break
		}

		msg, err := dto.ParseMessage(string(message))
		if err != nil {
			continue
		}

		switch msg.Type {
		case Resize:
			decodeString, err := base64.StdEncoding.DecodeString(msg.Content)
			if err != nil {
				continue
			}
			var winSize dto.WindowSize
			err = json.Unmarshal(decodeString, &winSize)
			if err != nil {
				continue
			}
			if err := termHandler.WindowChange(winSize.Rows, winSize.Cols); err != nil {
			}
		case Data:
			input := []byte(msg.Content)
			err := termHandler.Write(input)
			if err != nil {
				service.SessionService.CloseSessionById(sessionId, TunnelClosed, "Remote connection closed")
			}
		case Ping:
			err := termHandler.SendRequest()
			if err != nil {
				service.SessionService.CloseSessionById(sessionId, TunnelClosed, "Remote connection closed")
			} else {
				_ = termHandler.SendMessageToWebSocket(dto.NewMessage(Ping, ""))
			}

		}
	}
	return err
}
