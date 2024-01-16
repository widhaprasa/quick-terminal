FROM golang:alpine as builder

ENV GO111MODULE=on

ENV GOPROXY=https://goproxy.cn,direct

WORKDIR /app

COPY . .

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN #apk add upx
RUN go mod tidy
RUN sh get_arch.sh
RUN echo "Hello, my CPU architecture is $(uname -m)"
RUN cp -r /app/web/build /app/server/resource/
RUN go env;CGO_ENABLED=0 GOOS=linux GOARCH=$ARCH go build -ldflags '-s -w' -o quick-terminal main.go
RUN #upx quick-terminal

FROM alpine:latest

ENV SERVER_PORT 8088
ENV SERVER_ADDR 0.0.0.0:$SERVER_PORT

WORKDIR /usr/local/quick-terminal
RUN touch config.yml

COPY --from=builder /app/quick-terminal ./
COPY --from=builder /app/LICENSE ./

EXPOSE $SERVER_PORT

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
ENTRYPOINT ./quick-terminal