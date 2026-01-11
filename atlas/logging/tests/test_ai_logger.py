import os
import tempfile
import unittest

from atlas.logging.ai_logger import AILogWrapper


class TestAILogger(unittest.TestCase):
    def test_log_event_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_path = os.path.join(tmp, "log.jsonl")
            logger = AILogWrapper(log_path, "dev-1", "agent-1", world_repo_path=".")
            entry = logger.log_event("ai_call", {"prompt": "hi"}, model="test", tokens=3)
            self.assertEqual(entry["device_id"], "dev-1")
            self.assertEqual(entry["agent_id"], "agent-1")
            self.assertEqual(entry["event_type"], "ai_call")
            self.assertIn("timestamp", entry)
            with open(log_path, "r", encoding="utf-8") as f:
                line = f.readline().strip()
            self.assertTrue(line.startswith("{"))

    def test_wrap_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_path = os.path.join(tmp, "log.jsonl")
            logger = AILogWrapper(log_path, "dev-1", "agent-1", world_repo_path=".")

            @logger.wrap_call
            def fake_call(x):
                return x + 1

            result = fake_call(1)
            self.assertEqual(result, 2)


if __name__ == "__main__":
    unittest.main()
