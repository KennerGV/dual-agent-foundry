FROM golang:1.22

WORKDIR /app

# Copy go module and codebase
COPY go.mod ./
COPY api ./api
COPY engine ./engine
COPY store ./store
COPY tests ./tests
COPY cmd ./cmd
COPY CONTRACT.md README.md ./

# Pre-compile dependencies, test binaries, and server binary during docker build
RUN go test -c -race ./api && \
    go test -c -race ./engine && \
    go test -c -race ./store && \
    go test -c -race ./tests && \
    go test -c -race ./cmd/server && \
    go build -o /app/server ./cmd/server

# Run go test with race detector enabled at runtime without requiring network
CMD ["go", "test", "-race", "./..."]
