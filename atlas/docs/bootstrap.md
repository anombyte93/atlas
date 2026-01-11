# Device Bootstrap

## Script
`atlas/scripts/bootstrap_device.py`

## Usage
```
python3 atlas/scripts/bootstrap_device.py --repo /path/to/Atlas --dest /tmp/atlas-world \
  --role server --hostname atlas-node-1 --control-plane http://localhost:8080 --register
```

## Notes
- Creates device + agent config under `atlas/config/devices` and `atlas/config/agents`.
- Uses UUID-derived device IDs.
- Registration is optional; the script POSTs to `/register` if enabled.
- Use `--dry-run` to preview without writing.
