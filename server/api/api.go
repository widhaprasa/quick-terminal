package api

import (
	"quick-terminal/server/common/maps"

	"github.com/labstack/echo/v4"
)

func Fail(c echo.Context, code int, message string) error {
	return c.JSON(200, maps.Map{
		"code":    code,
		"message": message,
	})
}

func FailWithData(c echo.Context, code int, message string, data interface{}) error {
	return c.JSON(200, maps.Map{
		"code":    code,
		"message": message,
		"data":    data,
	})
}

func Success(c echo.Context, data interface{}) error {
	return c.JSON(200, maps.Map{
		"code":    1,
		"message": "success",
		"data":    data,
	})
}
