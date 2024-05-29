package main

import (
	"quick-terminal/server/app"

	"github.com/labstack/gommon/log"
)

func main() {
	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
