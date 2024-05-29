package api

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"quick-terminal/server/common"
	"quick-terminal/server/global/session"
	"quick-terminal/server/service"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/pkg/sftp"
)

type SessionApi struct{}

func (api SessionApi) SessionCreateEndpoint(c echo.Context) error {
	assetId := c.QueryParam("assetId")

	return Success(c, echo.Map{
		"id":         assetId,
		"upload":     "1",
		"download":   "1",
		"delete":     "1",
		"rename":     "1",
		"edit":       "1",
		"storageId":  "",
		"fileSystem": "1",
		"copy":       "1",
		"paste":      "1",
	})
}

func (api SessionApi) SessionUploadEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	protocol := strings.Split(sessionId, "_")[0]
	if protocol == "" {
		protocol = "ssh"
	}
	file, err := c.FormFile("file")
	if err != nil {
		return err
	}

	filename := file.Filename
	src, err := file.Open()
	if err != nil {
		return err
	}

	remoteDir := c.QueryParam("dir")
	remoteFile := path.Join(remoteDir, filename)

	if protocol == "ssh" {
		quickSession := session.GlobalSessionManager.GetById(sessionId)
		if quickSession == nil {
			return errors.New("session not found")
		}

		sftpClient := quickSession.QuickTerminal.SftpClient
		if _, err := sftpClient.Stat(remoteDir); os.IsNotExist(err) {
			// Automatically create the directory if it does not exist
			if err := sftpClient.MkdirAll(remoteDir); err != nil {
				return err
			}
		}

		dstFile, err := sftpClient.Create(remoteFile)
		if err != nil {
			return err
		}
		defer dstFile.Close()

		counter := &WriteCounter{Resp: c.Response()}

		c.Response().Header().Set(echo.HeaderContentType, `text/event-stream`)
		c.Response().WriteHeader(http.StatusOK)

		srcReader := io.TeeReader(src, counter)
		if _, err = io.Copy(dstFile, srcReader); err != nil {
			return err
		}
		return Success(c, nil)
	} else if protocol == "rdp" {
		storageId := sessionId
		if err := service.StorageService.StorageUpload(c, file, storageId); err != nil {
			return err
		}
		return Success(c, nil)
	}

	return err
}

func (api SessionApi) SessionEditEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	protocol := strings.Split(sessionId, "_")[0]
	if protocol == "" {
		protocol = "ssh"
	}
	file := c.FormValue("file")
	fileContent := c.FormValue("fileContent")

	if protocol == "ssh" {
		quickSession := session.GlobalSessionManager.GetById(sessionId)
		if quickSession == nil {
			return errors.New("session not found")
		}

		sftpClient := quickSession.QuickTerminal.SftpClient
		dstFile, err := sftpClient.OpenFile(file, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
		if err != nil {
			return err
		}
		defer dstFile.Close()
		write := bufio.NewWriter(dstFile)
		// replace \r\n to \n
		if _, err := write.WriteString(strings.Replace(fileContent, "\r\n", "\n", -1)); err != nil {
			return err
		}
		// fix neoel
		if !strings.HasSuffix(fileContent, "\n") {
			if _, err := write.WriteString("\n"); err != nil {
				return err
			}
		}
		if err := write.Flush(); err != nil {
			return err
		}
		return Success(c, nil)
	} else if protocol == "rdp" {
		storageId := sessionId
		if err := service.StorageService.StorageEdit(file, fileContent, storageId); err != nil {
			return err
		}
		return Success(c, nil)
	}
	return nil
}

func (api SessionApi) SessionDownloadEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	protocol := strings.Split(sessionId, "_")[0]
	if protocol == "" {
		protocol = "ssh"
	}
	file := c.QueryParam("file")
	// Get the file name with suffix
	filenameWithSuffix := path.Base(file)

	if protocol == "ssh" {
		quickSession := session.GlobalSessionManager.GetById(sessionId)
		if quickSession == nil {
			return errors.New("session not found")
		}

		dstFile, err := quickSession.QuickTerminal.SftpClient.Open(file)
		if err != nil {
			return err
		}

		defer dstFile.Close()
		c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filenameWithSuffix))

		var buff bytes.Buffer
		if _, err := dstFile.WriteTo(&buff); err != nil {
			return err
		}

		return c.Stream(http.StatusOK, echo.MIMEOctetStream, bytes.NewReader(buff.Bytes()))
	} else if protocol == "rdp" {
		storageId := sessionId
		return service.StorageService.StorageDownload(c, file, storageId)
	}

	return nil
}

func (api SessionApi) SessionLsEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	protocol := strings.Split(sessionId, "_")[0]
	if protocol == "" {
		protocol = "ssh"
	}
	remoteDir := c.FormValue("dir")

	if protocol == "ssh" {
		quickSession := session.GlobalSessionManager.GetById(sessionId)
		if quickSession == nil {
			return errors.New("session not found")
		}

		if quickSession.QuickTerminal.SftpClient == nil {
			sftpClient, err := sftp.NewClient(quickSession.QuickTerminal.SshClient)
			if err != nil {
				return err
			}
			quickSession.QuickTerminal.SftpClient = sftpClient
		}

		fileInfos, err := quickSession.QuickTerminal.SftpClient.ReadDir(remoteDir)
		if err != nil {
			return err
		}

		var files = make([]service.File, 0)
		for i := range fileInfos {

			file := service.File{
				Name:    fileInfos[i].Name(),
				Path:    path.Join(remoteDir, fileInfos[i].Name()),
				IsDir:   fileInfos[i].IsDir(),
				Mode:    fileInfos[i].Mode().String(),
				IsLink:  fileInfos[i].Mode()&os.ModeSymlink == os.ModeSymlink,
				ModTime: common.NewJsonTime(fileInfos[i].ModTime()),
				Size:    fileInfos[i].Size(),
			}

			files = append(files, file)
		}

		return Success(c, files)
	} else if protocol == "rdp" {
		storageId := sessionId
		err, files := service.StorageService.StorageLs(remoteDir, storageId)
		if err != nil {
			return err
		}
		return Success(c, files)
	}

	return errors.New("protocol not supported")
}

func (api SessionApi) SessionMkDirEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	protocol := strings.Split(sessionId, "_")[0]
	if protocol == "" {
		protocol = "ssh"
	}
	remoteDir := c.QueryParam("dir")

	if protocol == "ssh" {
		quickSession := session.GlobalSessionManager.GetById(sessionId)
		if quickSession == nil {
			return errors.New("session not found")
		}
		if err := quickSession.QuickTerminal.SftpClient.Mkdir(remoteDir); err != nil {
			return err
		}
		return Success(c, nil)
	} else if protocol == "rdp" {
		storageId := sessionId
		if err := service.StorageService.StorageMkDir(remoteDir, storageId); err != nil {
			return err
		}
		return Success(c, nil)
	}
	return errors.New("protocol not supported")
}

func (api SessionApi) SessionRmEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	protocol := strings.Split(sessionId, "_")[0]
	if protocol == "" {
		protocol = "ssh"
	}
	// Directory or file
	file := c.FormValue("file")

	if protocol == "ssh" {
		quickSession := session.GlobalSessionManager.GetById(sessionId)
		if quickSession == nil {
			return errors.New("session not found")
		}

		sftpClient := quickSession.QuickTerminal.SftpClient

		stat, err := sftpClient.Stat(file)
		if err != nil {
			return err
		}

		if stat.IsDir() {
			fileInfos, err := sftpClient.ReadDir(file)
			if err != nil {
				return err
			}

			for i := range fileInfos {
				if err := sftpClient.Remove(path.Join(file, fileInfos[i].Name())); err != nil {
					return err
				}
			}

			if err := sftpClient.RemoveDirectory(file); err != nil {
				return err
			}
		} else {
			if err := sftpClient.Remove(file); err != nil {
				return err
			}
		}

		return Success(c, nil)
	} else if protocol == "rdp" {
		storageId := sessionId
		if err := service.StorageService.StorageRm(file, storageId); err != nil {
			return err
		}
		return Success(c, nil)
	}

	return errors.New("protocol not supported")
}

func (api SessionApi) SessionRenameEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	protocol := strings.Split(sessionId, "_")[0]
	if protocol == "" {
		protocol = "ssh"
	}
	oldName := c.QueryParam("oldName")
	newName := c.QueryParam("newName")

	if protocol == "ssh" {
		quickSession := session.GlobalSessionManager.GetById(sessionId)
		if quickSession == nil {
			return errors.New("session not found")
		}

		sftpClient := quickSession.QuickTerminal.SftpClient

		if err := sftpClient.Rename(oldName, newName); err != nil {
			return err
		}

		return Success(c, nil)
	} else if protocol == "rdp" {
		storageId := sessionId
		if err := service.StorageService.StorageRename(oldName, newName, storageId); err != nil {
			return err
		}
		return Success(c, nil)
	}
	return errors.New("protocol not supported")
}
