.PHONY: all install test clean

all: atlas-track-v2

atlas-track-v2:
	@echo "Atlas visibility tracking script is ready"
	@chmod +x atlas-track-v2

install: all
	@echo "Installing atlas-track-v2 to ~/.claude/bin/"
	@install -m 755 atlas-track-v2 ~/.claude/bin/atlas-track-v2
	@install -m 755 src/init-db.sh ~/.claude/bin/atlas-init-db
	@echo "✅ Installed: ~/.claude/bin/atlas-track-v2"
	@echo "✅ Installed: ~/.claude/bin/atlas-init-db"

test:
	@echo "Running tests..."
	@./tests/test_concurrent.sh
	@./tests/test_large_output.sh
	@./tests/test_binary.sh
	@echo ""
	@echo "✅ All tests passed!"

clean:
	@echo "Cleaning up..."
	@rm -f ~/.config/atlas/visibility.db
	@echo "✅ Database removed"

init:
	@./src/init-db.sh
