package api

import (
	"errors"
	"net/http"
	"path"
	"quick-terminal/server/common/guacamole"
	"quick-terminal/server/common/nt"
	"quick-terminal/server/model"
	"quick-terminal/server/utils"
	"strconv"

	"quick-terminal/server/config"
	"quick-terminal/server/global/session"
	"quick-terminal/server/service"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

const (
	TunnelClosed             int = -1
	Normal                   int = 0
	NotFoundSession          int = 800
	NewTunnelError           int = 801
	ForcedDisconnect         int = 802
	AccessGatewayUnAvailable int = 803
	AccessGatewayCreateError int = 804
	AssetNotActive           int = 805
	NewSshClientError        int = 806
)

var UpGrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	Subprotocols: []string{"guacamole"},
}

type GuacamoleApi struct {
}

func (api GuacamoleApi) Guacamole(c echo.Context) error {
	ws, err := UpGrader.Upgrade(c.Response().Writer, c.Request(), nil)
	if err != nil {
		return err
	}

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
	mode := "guacd"
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

	var s model.Session
	s.ID = id
	s.Protocol = protocol
	s.Mode = mode
	s.IP = ip
	s.Port = port
	s.Username = username
	s.Password = password
	s.PrivateKey = privateKey
	s.Passphrase = passphrase
	s.Creator = creator
	s.AssetId = assetId

	width := c.QueryParam("width")
	height := c.QueryParam("height")
	dpi := c.QueryParam("dpi")

	configuration := guacamole.NewConfiguration()

	propertyMap := map[string]string{}

	configuration.SetParameter("width", width)
	configuration.SetParameter("height", height)
	configuration.SetParameter("dpi", dpi)
	api.setConfig(propertyMap, s, configuration)

	configuration.SetParameter("hostname", s.IP)
	configuration.SetParameter("port", strconv.Itoa(s.Port))

	attributes := map[string]string{
		"color-scheme":               "gray-black",
		"cron-log-saved-limit":       "360",
		"disable-bitmap-caching":     "false",
		"disable-offscreen-caching":  "false",
		"enable-desktop-composition": "true",
		"enable-font-smoothing":      "true",
		"enable-full-window-drag":    "true",
		"enable-menu-animations":     "true",
		"enable-recording":           "true",
		"enable-theming":             "true",
		"enable-wallpaper":           "true",
		"font-name":                  "menlo",
		"font-size":                  "12",
		"login-log-saved-limit":      "360",
		"session-saved-limit":        "360",
		"user-default-storage-size":  "5120",
		"version":                    "v1.3.9",
	}
	if len(attributes) > 0 {
		api.setAssetConfig(attributes, s, configuration)
	}
	for name := range configuration.Parameters {
		if configuration.Parameters[name] == "-" {
			configuration.Parameters[name] = ""
		}
	}

	addr := config.GlobalCfg.Guacd.Hostname + ":" + strconv.Itoa(config.GlobalCfg.Guacd.Port)

	guacdTunnel, err := guacamole.NewTunnel(addr, configuration)
	if err != nil {
		guacamole.Disconnect(ws, NewTunnelError, err.Error())
		return err
	}

	quickSession := &session.Session{
		ID:          sessionId,
		Protocol:    s.Protocol,
		Mode:        s.Mode,
		WebSocket:   ws,
		GuacdTunnel: guacdTunnel,
	}

	if configuration.Protocol == nt.SSH {
		quickTerminal, err := CreateQuickTerminalBySession(s)
		if err != nil {
			guacamole.Disconnect(ws, NewSshClientError, "Failed to establish SSH Client: "+err.Error())
			return err
		}
		quickSession.QuickTerminal = quickTerminal
	}

	quickSession.Observer = session.NewObserver(sessionId)
	session.GlobalSessionManager.Add(quickSession)

	guacamoleHandler := NewGuacamoleHandler(ws, guacdTunnel)
	guacamoleHandler.Start()
	defer guacamoleHandler.Stop()

	for {
		_, message, err := ws.ReadMessage()
		if err != nil {
			_ = guacdTunnel.Close()

			service.SessionService.CloseSessionById(sessionId, Normal, "Exited")
			return nil
		}
		_, err = guacdTunnel.WriteAndFlush(message)
		if err != nil {
			service.SessionService.CloseSessionById(sessionId, TunnelClosed, "Remote connection closed")
			return nil
		}
	}
}

func (api GuacamoleApi) setAssetConfig(attributes map[string]string, s model.Session, configuration *guacamole.Configuration) {
	for key, value := range attributes {
		if guacamole.DrivePath == key {
			// Ignore this parameter
			continue
		}
		if guacamole.EnableDrive == key && value == "true" {
			storageId := attributes[guacamole.DrivePath]
			if storageId == "" || storageId == "-" {
				// The default storage ID is the same as the user ID
				storageId = s.Creator
			}
			realPath := path.Join(service.StorageService.GetBaseDrivePath(), storageId)
			configuration.SetParameter(guacamole.EnableDrive, "true")
			configuration.SetParameter(guacamole.DriveName, "Filesystem")
			configuration.SetParameter(guacamole.DrivePath, realPath)
		} else {
			configuration.SetParameter(key, value)
		}
	}
}

func (api GuacamoleApi) setConfig(propertyMap map[string]string, s model.Session, configuration *guacamole.Configuration) {
	if propertyMap[guacamole.EnableRecording] == "true" {
		configuration.SetParameter(guacamole.RecordingPath, path.Join(config.GlobalCfg.Guacd.Recording, s.ID))
		configuration.SetParameter(guacamole.CreateRecordingPath, "true")
	} else {
		configuration.SetParameter(guacamole.RecordingPath, "")
	}

	configuration.Protocol = s.Protocol
	switch configuration.Protocol {
	case "rdp":
		configuration.SetParameter("username", s.Username)
		configuration.SetParameter("password", s.Password)

		configuration.SetParameter("security", "any")
		configuration.SetParameter("ignore-cert", "true")
		configuration.SetParameter("create-drive-path", "true")
		configuration.SetParameter("resize-method", "reconnect")
		configuration.SetParameter(guacamole.EnableWallpaper, propertyMap[guacamole.EnableWallpaper])
		configuration.SetParameter(guacamole.EnableTheming, propertyMap[guacamole.EnableTheming])
		configuration.SetParameter(guacamole.EnableFontSmoothing, propertyMap[guacamole.EnableFontSmoothing])
		configuration.SetParameter(guacamole.EnableFullWindowDrag, propertyMap[guacamole.EnableFullWindowDrag])
		configuration.SetParameter(guacamole.EnableDesktopComposition, propertyMap[guacamole.EnableDesktopComposition])
		configuration.SetParameter(guacamole.EnableMenuAnimations, propertyMap[guacamole.EnableMenuAnimations])
		configuration.SetParameter(guacamole.DisableBitmapCaching, propertyMap[guacamole.DisableBitmapCaching])
		configuration.SetParameter(guacamole.DisableOffscreenCaching, propertyMap[guacamole.DisableOffscreenCaching])
		configuration.SetParameter(guacamole.ColorDepth, propertyMap[guacamole.ColorDepth])
		configuration.SetParameter(guacamole.ForceLossless, propertyMap[guacamole.ForceLossless])
		configuration.SetParameter(guacamole.PreConnectionId, propertyMap[guacamole.PreConnectionId])
		configuration.SetParameter(guacamole.PreConnectionBlob, propertyMap[guacamole.PreConnectionBlob])
	case "ssh":
		if len(s.PrivateKey) > 0 && s.PrivateKey != "-" {
			configuration.SetParameter("username", s.Username)
			configuration.SetParameter("private-key", s.PrivateKey)
			configuration.SetParameter("passphrase", s.Passphrase)
		} else {
			configuration.SetParameter("username", s.Username)
			configuration.SetParameter("password", s.Password)
		}

		configuration.SetParameter(guacamole.FontSize, propertyMap[guacamole.FontSize])
		configuration.SetParameter(guacamole.FontName, propertyMap[guacamole.FontName])
		configuration.SetParameter(guacamole.ColorScheme, propertyMap[guacamole.ColorScheme])
		configuration.SetParameter(guacamole.Backspace, propertyMap[guacamole.Backspace])
		configuration.SetParameter(guacamole.TerminalType, propertyMap[guacamole.TerminalType])
	case "vnc":
		configuration.SetParameter("username", s.Username)
		configuration.SetParameter("password", s.Password)
	case "telnet":
		configuration.SetParameter("username", s.Username)
		configuration.SetParameter("password", s.Password)

		configuration.SetParameter(guacamole.FontSize, propertyMap[guacamole.FontSize])
		configuration.SetParameter(guacamole.FontName, propertyMap[guacamole.FontName])
		configuration.SetParameter(guacamole.ColorScheme, propertyMap[guacamole.ColorScheme])
		configuration.SetParameter(guacamole.Backspace, propertyMap[guacamole.Backspace])
		configuration.SetParameter(guacamole.TerminalType, propertyMap[guacamole.TerminalType])
	case "kubernetes":
		configuration.SetParameter(guacamole.FontSize, propertyMap[guacamole.FontSize])
		configuration.SetParameter(guacamole.FontName, propertyMap[guacamole.FontName])
		configuration.SetParameter(guacamole.ColorScheme, propertyMap[guacamole.ColorScheme])
		configuration.SetParameter(guacamole.Backspace, propertyMap[guacamole.Backspace])
		configuration.SetParameter(guacamole.TerminalType, propertyMap[guacamole.TerminalType])
	default:

	}
}
