# Atlas + chezmoi

This directory holds the chezmoi source for Atlas machine-local configuration.

Current contents:
- `private_dot_config/atlas/control-plane.json.tmpl`: templated control-plane config.
- `private_dot_config/atlas/agent.json.tmpl`: templated node-agent config.
- `dot_config/zshrc.d/atlas.zsh.tmpl` and `dot_config/fish/conf.d/atlas.fish.tmpl`: optional shell helpers to one-shot bootstrap + start dev stack.

Usage:
1) Install chezmoi (see https://chezmoi.io/install/).
2) From repo root: `atlas/scripts/bootstrap_chezmoi.sh`
3) Override values at apply time with `chezmoi` template data, e.g.:
   - `chezmoi apply -D atlas_api_token=... -D atlas_world_repo=/home/user/Atlas -D atlas_control_plane_url=http://localhost:8080`
   - `chezmoi apply -D atlas_agent_id=my-laptop -D atlas_allowed_commands='["echo","ls","cat","python3"]'`
4) (Optional) Source your shell so `atlas-dev` helper is available, then run `atlas-dev` to bootstrap + launch control-plane and agent in tmux.

Notes:
- Secrets should be provided via template data, not committed.
- Template defaults are safe for local dev; adjust for production.
- Agent and control-plane configs land in `~/.config/atlas/`.
