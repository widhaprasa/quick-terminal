package service

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"strings"

	"quick-terminal/server/common"
	"quick-terminal/server/config"
	"quick-terminal/server/utils"

	"github.com/labstack/echo/v4"
)

var StorageService = new(storageService)

type storageService struct {
}

type File struct {
	Name    string          `json:"name"`
	Path    string          `json:"path"`
	IsDir   bool            `json:"isDir"`
	Mode    string          `json:"mode"`
	IsLink  bool            `json:"isLink"`
	ModTime common.JsonTime `json:"modTime"`
	Size    int64           `json:"size"`
}

func (service storageService) Ls(drivePath, remoteDir string) ([]File, error) {
	fileInfos, err := ioutil.ReadDir(path.Join(drivePath, remoteDir))
	if err != nil {
		return nil, err
	}

	var files = make([]File, 0)
	for i := range fileInfos {
		file := File{
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
	return files, nil
}

func (service storageService) GetBaseDrivePath() string {
	return config.GlobalCfg.Guacd.Drive
}

func (service storageService) StorageUpload(c echo.Context, file *multipart.FileHeader, storageId string) error {
	drivePath := service.GetBaseDrivePath()
	filename := file.Filename
	src, err := file.Open()
	if err != nil {
		return err
	}

	remoteDir := c.QueryParam("dir")
	remoteFile := path.Join(remoteDir, filename)

	if strings.Contains(remoteDir, "../") {
		return errors.New("illegal_request")
	}
	if strings.Contains(remoteFile, "../") {
		return errors.New("illegal_request")
	}

	dir := path.Join(path.Join(drivePath, storageId), remoteDir)
	if !utils.FileExists(dir) {
		if err := os.MkdirAll(dir, os.ModePerm); err != nil {
			return err
		}
	}
	// Destination
	dst, err := os.Create(path.Join(path.Join(drivePath, storageId), remoteFile))
	if err != nil {
		return err
	}
	defer dst.Close()

	// Copy
	if _, err = io.Copy(dst, src); err != nil {
		return err
	}
	return nil
}

func (service storageService) StorageEdit(file string, fileContent string, storageId string) error {
	drivePath := service.GetBaseDrivePath()
	if strings.Contains(file, "../") {
		return errors.New("illegal_request")
	}
	realFilePath := path.Join(path.Join(drivePath, storageId), file)
	dstFile, err := os.OpenFile(realFilePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0666)
	if err != nil {
		return err
	}
	defer dstFile.Close()
	write := bufio.NewWriter(dstFile)
	if _, err := write.WriteString(fileContent); err != nil {
		return err
	}
	if err := write.Flush(); err != nil {
		return err
	}
	return nil
}

func (service storageService) StorageDownload(c echo.Context, file, storageId string) error {
	drivePath := service.GetBaseDrivePath()
	if strings.Contains(file, "../") {
		return errors.New("illegal_request")
	}
	filenameWithSuffix := path.Base(file)
	p := path.Join(path.Join(drivePath, storageId), file)
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filenameWithSuffix))
	c.Response().Header().Set("Content-Type", "application/octet-stream")

	http.ServeFile(c.Response(), c.Request(), p)
	return nil
}

func (service storageService) StorageLs(remoteDir, storageId string) (error, []File) {
	drivePath := service.GetBaseDrivePath()
	if strings.Contains(remoteDir, "../") {
		return errors.New("illegal_request"), nil
	}
	files, err := service.Ls(path.Join(drivePath, storageId), remoteDir)
	if err != nil {
		return err, nil
	}
	return nil, files
}

func (service storageService) StorageMkDir(remoteDir, storageId string) error {
	drivePath := service.GetBaseDrivePath()
	if strings.Contains(remoteDir, "../") {
		return errors.New("illegal_request")
	}
	if err := os.MkdirAll(path.Join(path.Join(drivePath, storageId), remoteDir), os.ModePerm); err != nil {
		return err
	}
	return nil
}

func (service storageService) StorageRm(file, storageId string) error {
	drivePath := service.GetBaseDrivePath()
	if strings.Contains(file, "../") {
		return errors.New("illegal_request")
	}
	if err := os.RemoveAll(path.Join(path.Join(drivePath, storageId), file)); err != nil {
		return err
	}
	return nil
}

func (service storageService) StorageRename(oldName, newName, storageId string) error {
	drivePath := service.GetBaseDrivePath()
	if strings.Contains(oldName, "../") {
		return errors.New("illegal_request")
	}
	if strings.Contains(newName, "../") {
		return errors.New("illegal_request")
	}
	if err := os.Rename(path.Join(path.Join(drivePath, storageId), oldName), path.Join(path.Join(drivePath, storageId), newName)); err != nil {
		return err
	}
	return nil
}
