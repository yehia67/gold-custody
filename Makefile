.PHONY: build test test-connectors demo clean

export JAVA_HOME ?= /usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH := $(JAVA_HOME)/bin:$(HOME)/.dpm/bin:$(PATH)

build:
	dpm build

test: build
	dpm test

test-connectors:
	cd connector && npm install && npm test

demo:
	bash scripts/demo.sh

clean:
	rm -rf .daml/dist connector/*/dist evidence-store
	find connector -name node_modules -type d -prune -exec rm -rf {} +
