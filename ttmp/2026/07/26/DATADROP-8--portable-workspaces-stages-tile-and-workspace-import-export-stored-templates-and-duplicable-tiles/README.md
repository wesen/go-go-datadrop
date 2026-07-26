# Portable workspaces: stages, tile and workspace import/export, stored templates, and duplicable tiles

This is the document workspace for ticket DATADROP-8.

## Structure

- **design/**: Design documents and architecture notes
- **reference/**: Reference documentation and API contracts
- **playbooks/**: Operational playbooks and procedures
- **scripts/**: Utility scripts and automation
- **sources/**: External sources and imported documents
- **various/**: Scratch or meeting notes, working notes
- **archive/**: Optional space for deprecated or reference-only artifacts

## Getting Started

Use docmgr commands to manage this workspace:

- Add documents: `docmgr doc add --ticket DATADROP-8 --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket DATADROP-8 --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket DATADROP-8 --field Status --value review`
