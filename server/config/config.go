package config

import (
	"fmt"
	"strings"

	"quick-terminal/server/utils"

	"github.com/mitchellh/go-homedir"
	"github.com/spf13/pflag"
	"github.com/spf13/viper"
)

var GlobalCfg *Config

type Config struct {
	Debug  bool
	Demo   bool
	Server *Server
	Guacd  *Guacd
}

type Server struct {
	Addr string
	Cert string
	Key  string
}

type Guacd struct {
	Hostname  string
	Port      int
	Recording string
	Drive     string
}

func SetupConfig() (*Config, error) {

	viper.SetConfigName("config")
	viper.SetConfigType("yml")
	viper.AddConfigPath("/etc/quick-terminal/")
	viper.AddConfigPath("$HOME/.quick-terminal")
	viper.AddConfigPath(".")
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	pflag.String("server.addr", "", "server listen addr")
	pflag.String("server.cert", "", "tls cert file")
	pflag.String("server.key", "", "tls key file")

	pflag.String("guacd.hostname", "127.0.0.1", "")
	pflag.Int("guacd.port", 4822, "")
	pflag.String("guacd.recording", "/usr/local/quick-terminal/data/recording", "")
	pflag.String("guacd.drive", "/usr/local/quick-terminal/data/drive", "")

	pflag.Parse()
	if err := viper.BindPFlags(pflag.CommandLine); err != nil {
		return nil, err
	}
	_ = viper.ReadInConfig()

	guacdRecording, err := homedir.Expand(viper.GetString("guacd.recording"))
	if err != nil {
		return nil, err
	}

	guacdDrive, err := homedir.Expand(viper.GetString("guacd.drive"))
	if err != nil {
		return nil, err
	}

	var config = &Config{
		Server: &Server{
			Addr: viper.GetString("server.addr"),
			Cert: viper.GetString("server.cert"),
			Key:  viper.GetString("server.key"),
		},
		Debug: viper.GetBool("debug"),
		Demo:  viper.GetBool("demo"),
		Guacd: &Guacd{
			Hostname:  viper.GetString("guacd.hostname"),
			Port:      viper.GetInt("guacd.port"),
			Recording: guacdRecording,
			Drive:     guacdDrive,
		},
	}
	if err := utils.MkdirP(config.Guacd.Recording); err != nil {
		panic(fmt.Sprintf("Create directory %v failed: %v", config.Guacd.Recording, err.Error()))
	}
	if err := utils.MkdirP(config.Guacd.Drive); err != nil {
		panic(fmt.Sprintf("Create directory %v failed: %v", config.Guacd.Drive, err.Error()))
	}
	return config, nil
}

func init() {
	var err error
	GlobalCfg, err = SetupConfig()
	if err != nil {
		panic(err)
	}
}
