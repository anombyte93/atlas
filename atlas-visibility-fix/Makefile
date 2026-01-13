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
	@./tests/test_us001_sqlite_backend.sh
	@./tests/test_us002_uuid.sh
	@./tests/test_us003_error_handling.sh
	@./tests/test_us004_escaping.sh
	@./tests/test_us005_pagination.sh
	@./tests/test_us006_health_check.sh
	@./tests/test_us007_retention.sh
	@./tests/test_us008_retry.sh
	@./tests/test_us009_schema_version.sh
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
