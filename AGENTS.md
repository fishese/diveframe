# Codex project instructions

## Private project documentation

- Private planning and development documentation for this project is stored at:
  `.private-repo/diveframe/docs/`
- When planning work, reviewing previous decisions, or when the user refers to project plans/specifications, inspect that directory when relevant.
- Use the real `.private-repo/diveframe/docs/` path rather than relying on the `docs-private` symlink, because automated file discovery may not traverse that symlink.
- Do not assume the private documentation directory is empty just because it is ignored by the main Git repository.

## Repository boundaries

- `/workspaces/diveframe` is the main/public DiveFrame Git repository.
- `.private-repo` is a separate private Git repository.
- Never copy private documentation into the public repository unless explicitly requested.
- Do not stage or commit `.private-repo` contents as part of the main DiveFrame repository.
- If private documentation is intentionally modified, use Git from `.private-repo` separately.

## Saved-data compatibility

- Preserve compatibility with current IndexedDB saves and app-data backups in
  future features and bug fixes. Prefer additive fields with safe defaults;
  validate reads, edits, and backup round trips using representative current saves.
- Do not reset stores or discard existing data to simplify a migration. Changes
  to the current save format need an explicit preservation/migration test.
- Support for saves from before IndexedDB v8 is not required. This does not
  relax compatibility requirements for current saves.
