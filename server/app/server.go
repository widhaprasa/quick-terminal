package app

import (
	"io/fs"
	"net/http"
	"os"

	"quick-terminal/server/api"
	mw "quick-terminal/server/app/middleware"
	"quick-terminal/server/config"
	"quick-terminal/server/log"
	"quick-terminal/server/resource"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func getFS(useOS bool) fs.FS {
	if useOS {
		log.Debug("using live mode")
		return os.DirFS("web/build")
	}

	log.Debug("using embed mode")
	fsys, err := fs.Sub(resource.Resource, "build")
	if err != nil {
		panic(err)
	}

	return fsys
}

func WrapHandler(h http.Handler) echo.HandlerFunc {
	return func(c echo.Context) error {
		c.Response().Header().Set("Cache-Control", `public, max-age=31536000`)
		h.ServeHTTP(c.Response(), c.Request())
		return nil
	}
}

func setupRoutes() *echo.Echo {

	e := echo.New()
	e.HideBanner = true
	//e.Logger = log.GetEchoLogger()
	//e.Use(log.Hook())

	fsys := getFS(config.GlobalCfg.Debug)
	fileServer := http.FileServer(http.FS(fsys))
	handler := WrapHandler(fileServer)
	e.GET("/", handler)
	e.GET("/favicon.ico", handler)
	e.GET("/static/*", handler)

	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		Skipper:      middleware.DefaultSkipper,
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodHead, http.MethodPut, http.MethodPatch, http.MethodPost, http.MethodDelete},
	}))
	e.Use(mw.ErrorHandler)
	e.Use(middleware.Gzip())

	guacamoleApi := new(api.GuacamoleApi)
	webTerminalApi := new(api.WebTerminalApi)
	SessionApi := new(api.SessionApi)

	quick := e.Group("/quick")
	{
		quick.POST("", SessionApi.SessionCreateEndpoint)
		quick.GET("/:id/tunnel", guacamoleApi.Guacamole)
		quick.GET("/:id/ssh", webTerminalApi.SshEndpoint)

		quick.POST("/:id/ls", SessionApi.SessionLsEndpoint)
		quick.GET("/:id/download", SessionApi.SessionDownloadEndpoint)
		quick.POST("/:id/upload", SessionApi.SessionUploadEndpoint)
		quick.POST("/:id/edit", SessionApi.SessionEditEndpoint)
		quick.POST("/:id/mkdir", SessionApi.SessionMkDirEndpoint)
		quick.POST("/:id/rm", SessionApi.SessionRmEndpoint)
		quick.POST("/:id/rename", SessionApi.SessionRenameEndpoint)
	}

	return e
}
