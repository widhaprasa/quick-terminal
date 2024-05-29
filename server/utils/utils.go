package utils

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

func FileExists(path string) bool {
	_, err := os.Stat(path)
	if err != nil {
		return os.IsExist(err)
	}
	return true
}

func GetParentDirectory(directory string) string {
	return filepath.Dir(directory)
}

func MkdirP(path string) error {
	if !FileExists(path) {
		if err := os.MkdirAll(path, os.ModePerm); err != nil {
			return err
		}
		fmt.Printf("Create directory: %v \n", path)
	}
	return nil
}

func DecodePayload(encodedPayload string) (map[string]interface{}, error) {

	if encodedPayload == "" {
		return nil, errors.New("invalid payload")
	}
	payloadStr, err := base64.StdEncoding.DecodeString(encodedPayload)
	if err != nil {
		return nil, errors.New("invalid payload")
	}
	var payload map[string]interface{}
	err = json.Unmarshal(payloadStr, &payload)
	return payload, err
}
