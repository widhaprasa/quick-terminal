package nt

import (
	"quick-terminal/server/common/guacamole"
)

type Key string

const (
	DB Key = "db"

	SSH    = "ssh"
	RDP    = "rdp"
	VNC    = "vnc"
	Telnet = "telnet"
	K8s    = "kubernetes"

	SshMode = "ssh-mode" // ssh mode

	Guacd    = "guacd"
	Native   = "native"
	Terminal = "terminal"

	SocksProxyEnable   = "socks-proxy-enable"
	SocksProxyHost     = "socks-proxy-host"
	SocksProxyPort     = "socks-proxy-port"
	SocksProxyUsername = "socks-proxy-username"
	SocksProxyPassword = "socks-proxy-password"

	Anonymous = "anonymous"
)

var SSHParameterNames = []string{guacamole.FontName, guacamole.FontSize, guacamole.ColorScheme, guacamole.Backspace, guacamole.TerminalType, SshMode, SocksProxyEnable, SocksProxyHost, SocksProxyPort, SocksProxyUsername, SocksProxyPassword}
var RDPParameterNames = []string{guacamole.Domain, guacamole.RemoteApp, guacamole.RemoteAppDir, guacamole.RemoteAppArgs, guacamole.EnableDrive, guacamole.DrivePath, guacamole.ColorDepth, guacamole.ForceLossless, guacamole.PreConnectionId, guacamole.PreConnectionBlob}
var VNCParameterNames = []string{guacamole.ColorDepth, guacamole.Cursor, guacamole.SwapRedBlue, guacamole.DestHost, guacamole.DestPort}
var TelnetParameterNames = []string{guacamole.FontName, guacamole.FontSize, guacamole.ColorScheme, guacamole.Backspace, guacamole.TerminalType, guacamole.UsernameRegex, guacamole.PasswordRegex, guacamole.LoginSuccessRegex, guacamole.LoginFailureRegex}
var KubernetesParameterNames = []string{guacamole.FontName, guacamole.FontSize, guacamole.ColorScheme, guacamole.Backspace, guacamole.TerminalType, guacamole.Namespace, guacamole.Pod, guacamole.Container, guacamole.UesSSL, guacamole.ClientCert, guacamole.ClientKey, guacamole.CaCert, guacamole.IgnoreCert}
