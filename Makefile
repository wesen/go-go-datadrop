.PHONY: gifs logcopter-generate logcopter-check ui ui-test ui-dev storybook build-storybook compose-up compose-down compose-nuke compose-logs

all: gifs

VERSION=v0.1.14
GORELEASER_ARGS ?= --skip=sign --snapshot --clean
GORELEASER_TARGET ?= --single-target

TAPES=$(wildcard doc/vhs/*tape)
gifs: $(TAPES)
	for i in $(TAPES); do vhs < $$i; done

docker-lint:
	docker run --rm -v $(shell pwd):/app -w /app golangci/golangci-lint:latest golangci-lint run -v

lint:
	GOWORK=off golangci-lint run -v

lintmax:
	GOWORK=off golangci-lint run -v --max-same-issues=100

gosec:
	GOWORK=off go install github.com/securego/gosec/v2/cmd/gosec@latest
	gosec -exclude-generated -exclude=G101,G304,G301,G306 -exclude-dir=.history ./...

govulncheck:
	GOWORK=off go install golang.org/x/vuln/cmd/govulncheck@latest
	govulncheck ./...

test:
	GOWORK=off go test ./...

build:
	GOWORK=off go generate ./...
	GOWORK=off go build ./...

# The web UI. Deliberately NOT wired into `build` or into `go generate`: the
# built assets are committed, so a Go build — and a `go install` of this module
# — must not require bun. Run this after changing anything under ui/.
ui:
	# `bun install --cwd ui`, not `bun --cwd ui install`: the latter makes bun
	# look for a *script* named "install" and fail with "Script not found".
	bun install --cwd ui --frozen-lockfile
	bun run --cwd=ui build

# `--cwd=ui`, with the equals sign. `bun run --cwd ui typecheck` does NOT run
# typecheck: bun takes the space-separated form as a request for help, prints
# its usage page and the list of available scripts, and **exits 0**. A make
# target written that way passes without having done anything, which is the
# worst failure mode a check can have. Verified on bun 1.2.13.
ui-test:
	bun run --cwd=ui typecheck
	bun test --cwd ui

# Vite with HMR on :5173, proxying /v1 to a `datadrop serve` on :8080.
ui-dev:
	bun run --cwd=ui dev

# The design system on :6006. The stories are the only place some states are
# reachable at all — see ui/.storybook/main.ts.
storybook:
	bun run --cwd=ui storybook

build-storybook:
	bun run --cwd=ui build-storybook

# The local stack: datadrop plus a self-hosted Zitadel (DATADROP-5).
#
# See deploy/compose/README.md. First boot takes 30-90s while Zitadel
# initialises its event store; --wait covers it.
compose-up:
	cd deploy/compose && cp -n .env.example .env || true
	cd deploy/compose && docker compose up -d --build --wait
	@echo ""
	@echo "  workbench: http://localhost:7070/ui/"
	@echo "  zitadel:   http://zitadel.test:17070/   (zitadel-admin@zitadel.zitadel.test / Password1!)"
	@echo ""
	@echo "  If those hostnames do not resolve in your shell, add to /etc/hosts:"
	@echo "    127.0.0.1 zitadel.test"

compose-down:
	cd deploy/compose && docker compose down

# The one that actually resets ZITADEL_FIRSTINSTANCE_* configuration, and the
# one to reach for when `provision` reports a rejected machine token. It
# destroys the database, which is why it has its own target rather than being
# improvised at 6pm.
compose-nuke:
	cd deploy/compose && docker compose down -v

compose-logs:
	cd deploy/compose && docker compose logs -f --tail=100

logcopter-generate:
	GOWORK=off go generate ./...

logcopter-check:
	GOWORK=off go tool logcopter-gen -area-prefix go-go-golems.go-go-datadrop -strip-prefix github.com/go-go-golems/go-go-datadrop -check ./pkg/...

goreleaser:
	GOWORK=off goreleaser release $(GORELEASER_ARGS) $(GORELEASER_TARGET)

tag-major:
	git tag $(shell svu major)

tag-minor:
	git tag $(shell svu minor)

tag-patch:
	git tag $(shell svu patch)

release:
	git push origin --tags
	GOWORK=off GOPROXY=proxy.golang.org go list -m github.com/go-go-golems/go-go-datadrop@$(shell svu current)

bump-go-go-golems:
	@deps="$$(awk '/^require[[:space:]]+github\.com\/go-go-golems\// { print $$2 } /^[[:space:]]*github\.com\/go-go-golems\// { print $$1 }' go.mod | sort -u)"; \
	if [ -z "$$deps" ]; then \
		echo "No github.com/go-go-golems dependencies in go.mod"; \
	else \
		echo "Bumping go-go-golems dependencies:"; \
		echo "$$deps"; \
		for dep in $$deps; do GOWORK=off go get "$${dep}@latest"; done; \
	fi
	GOWORK=off go mod tidy

GO_GO_DATADROP_BINARY=$(shell which go-go-datadrop)
install:
	GOWORK=off go build -o ./dist/go-go-datadrop ./cmd/go-go-datadrop && \
		cp ./dist/go-go-datadrop $(GO_GO_DATADROP_BINARY)
