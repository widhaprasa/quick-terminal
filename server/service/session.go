package service

import (
	"quick-terminal/server/common/guacamole"
	"quick-terminal/server/common/nt"
	"quick-terminal/server/global/session"
	"strconv"
	"sync"
)

var SessionService = new(sessionService)

type sessionService struct {
}

var mutex sync.Mutex

func (service sessionService) WriteCloseMessage(sess *session.Session, mode string, code int, reason string) {
	switch mode {
	case nt.Guacd:
		err := guacamole.NewInstruction("error", "", strconv.Itoa(code))
		_ = sess.WriteString(err.String())
		disconnect := guacamole.NewInstruction("disconnect")
		_ = sess.WriteString(disconnect.String())
	case nt.Native, nt.Terminal:
		msg := `0` + reason
		_ = sess.WriteString(msg)
	}
}

func (service sessionService) CloseSessionById(sessionId string, code int, reason string) {
	mutex.Lock()
	defer mutex.Unlock()
	nextSession := session.GlobalSessionManager.GetById(sessionId)
	if nextSession != nil {
		service.WriteCloseMessage(nextSession, nextSession.Mode, code, reason)

		if nextSession.Observer != nil {
			nextSession.Observer.Range(func(key string, ob *session.Session) {
				service.WriteCloseMessage(ob, ob.Mode, code, reason)
			})
		}
	}
	session.GlobalSessionManager.Del(sessionId)
}
