| Method | Parameters | Return | Electron Bridge | Description |
| :--- | :--- | :--- | :--- | :--- |
| session.create | cols | Object | Yes | No description |
| session.list | limit | Object | Yes | No description |
| session.most_recent | None | Object | Yes | Return the most recent human-facing session id, or ``None``.      Mirrors ``session.list``'s deny-li... |
| session.resume | cols, session_id | Object | Yes | No description |
| session.delete | session_id | Object | Yes | Delete a stored session and its on-disk transcript files.      Used by the TUI resume picker (``d`` ... |
| session.title | title | Object | No | No description |
| session.usage | None | Object | No | No description |
| session.status | session_id | Object | No | No description |
| session.history | None | Object | Yes | No description |
| session.undo | None | Object | Yes | No description |
| session.compress | focus_topic, session_id | Object | Yes | No description |
| session.save | None | Object | No | No description |
| session.close | session_id | Object | No | No description |
| session.branch | name | Object | No | No description |
| session.interrupt | session_id | Object | Yes | No description |
| delegation.status | None | Object | No | No description |
| delegation.pause | paused | Object | No | No description |
| subagent.interrupt | subagent_id | Object | No | No description |
| spawn_tree.save | finished_at, label, session_id, started_at, subagents | Object | No | No description |
| spawn_tree.list | cross_session, limit, session_id | Object | No | No description |
| spawn_tree.load | path | Object | No | No description |
| session.steer | text | Object | No | Inject a user message into the next tool result without interrupting.      Mirrors AIAgent.steer(). ... |
| terminal.resize | cols | Object | No | No description |
| prompt.submit | session_id, text | {status: streaming} | Yes | Poll completion_queue and dispatch notifications autonomously.      Runs in a daemon thread started ... |
| clipboard.paste | None | Object | No | No description |
| image.attach | path | Object | No | No description |
| input.detect_drop | text | Object | No | No description |
| prompt.background | session_id, text | Object | No | No description |
| clarify.respond | None | Object | No | No description |
| sudo.respond | None | Object | No | No description |
| secret.respond | None | Object | No | No description |
| approval.respond | all, choice | Object | No | No description |
| config.set | key, session_id, value | Object | Yes | No description |
| config.get | key, session_id | Object | No | No description |
| setup.status | None | Object | No | No description |
| process.stop | None | Object | No | No description |
| reload.mcp | always, confirm, session_id | Object | No | No description |
| reload.env | None | Object | No | Re-read ``~/.hermes/.env`` into the gateway process via     ``hermes_cli.config.reload_env``, matchi... |
| commands.catalog | None | Object | No | Registry-backed slash metadata for the TUI — categorized, no aliases. |
| cli.exec | argv, timeout | Object | No | Run `python -m hermes_cli.main` with argv; capture stdout/stderr (non-interactive only). |
| command.resolve | name | Object | No | No description |
| command.dispatch | arg, name, session_id | Object | No | No description |
| paste.collapse | text | Object | No | No description |
| complete.path | word | Object | No | No description |
| complete.slash | text | Object | No | No description |
| model.options | session_id | Object | Yes | No description |
| model.save_key | api_key, session_id, slug | Object | No | Save an API key for a provider, then return its refreshed model list.      Params:         slug: pro... |
| model.disconnect | slug | Object | No | Remove credentials for a provider.      Params:         slug: provider slug (e.g. "deepseek", "xai")... |
| slash.exec | command, session_id | Object | Yes | No description |
| voice.toggle | action | Object | No | CLI parity for the ``/voice`` slash command.      Subcommands:      * ``status`` — report mode + TTS... |
| voice.record | action, session_id | Object | No | VAD-bounded push-to-talk capture, CLI-parity.      ``start`` begins one VAD-bounded capture and emit... |
| voice.tts | text | Object | No | No description |
| insights.get | days | Object | No | No description |
| rollback.list | None | Object | No | No description |
| rollback.restore | file_path, hash | Object | No | No description |
| rollback.diff | hash | Object | No | No description |
| browser.manage | action, session_id, url | Object | No | No description |
| plugins.list | None | Object | No | No description |
| config.show | None | Object | No | No description |
| tools.list | session_id | Object | No | No description |
| tools.show | session_id | Object | No | No description |
| tools.configure | action, names, session_id | Object | No | No description |
| toolsets.list | session_id | Object | No | No description |
| agents.list | None | Object | No | No description |
| cron.manage | action, name, prompt, schedule | Object | No | No description |
| skills.manage | action, page, page_size, query | Object | No | No description |
| skills.reload | None | Object | No | No description |
| shell.exec | command | Object | No | No description |
