import { useState } from "react";
import { AppBody, Stack, Toolbar } from "../../layout";
import { SectionLabel, Text } from "../../foundation";
import { Button } from "../../atoms";
import { EmptyState, InlineRename } from "../../molecules";
import styles from "./TemplateTable.module.css";

/**
 * The stored template library: rows, a detail pane, and four verbs.
 *
 * **Not a presentation type**, and the restraint is deliberate (DR-71's
 * neighbour). A fourth presentation for templates is possible and is not worth
 * it: a template is a stored *file*, not an object in the interface that other
 * objects can accept. The row's four buttons are the whole vocabulary, and a
 * menu would be a second way to reach them.
 *
 * Presentational: DTOs in, callbacks out, no store and no `localStorage`.
 * `TemplatesApp` is the container that reads the library and dispatches.
 *
 * **Only deletion confirms.** A deleted tile, workspace or stage is a layout,
 * and the user can rebuild it or reload the page. A deleted template may be the
 * only copy of something a colleague sent last month, and `localStorage` has no
 * undo. Confirming everything trains people to dismiss confirmations, which is
 * how the one that mattered gets dismissed.
 */
export interface TemplateView {
  id: string;
  name: string;
  kind: "tile" | "workspace" | "stage";
  /** ISO 8601. Rendered as a date; the time of day is noise here. */
  savedAt: string;
  /** One sentence from `describeBundle`. */
  summary: string;
  /** The applications it names, for the row of chips in the detail pane. */
  apps: string[];
}

export interface TemplateTableProps {
  templates: readonly TemplateView[];
  /** How full the library is, already formatted. */
  usage: { count: number; limit: number; kb: number; limitKb: number };
  onLoad(id: string): void;
  onCopy(id: string): void;
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
  /** Import a bundle from the clipboard straight into the library's stage. */
  onImport(): void;
  /** Shown above the table: a refusal, or a confirmation. */
  message?: string | null;
}

export function TemplateTable({
  templates,
  usage,
  onLoad,
  onCopy,
  onRename,
  onDelete,
  onImport,
  message,
}: TemplateTableProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Local, and only ever one at a time: a confirmation that persists across a
  // re-render is a confirmation that can be answered for the wrong row.
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <AppBody>
      <Toolbar tight bordered>
        <SectionLabel>Templates</SectionLabel>
        <Text size="tiny" tone="faint">
          {usage.count} of {usage.limit} saved · {usage.kb} kB of {usage.limitKb} kB
        </Text>
        <span className={styles.spacer} />
        <Button variant="framed" onClick={onImport}>
          Import from clipboard
        </Button>
      </Toolbar>

      {message && (
        <div className={styles.message}>
          <Text size="small" tone="faint" prose>
            {message}
          </Text>
        </div>
      )}

      {templates.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState
            message="No stored templates."
            hint="Right-click a tile, a workspace or the stage name and choose “Save as a template …”. A template is a bundle under a name; loading one is an import, so it goes through the same dialog."
          />
        </div>
      ) : (
        <div className={styles.rows}>
          {templates.map((template) => {
            const expanded = open === template.id;
            return (
              <div
                key={template.id}
                className={styles.row}
                data-state={expanded ? "open" : undefined}
              >
                <div className={styles.head}>
                  <Button
                    variant="bare"
                    size="small"
                    onClick={() => setOpen(expanded ? null : template.id)}
                  >
                    {expanded ? "▾" : "▸"}
                  </Button>

                  {renaming === template.id ? (
                    <InlineRename
                      initial={template.name}
                      label="template name"
                      fallback={template.name}
                      onCommit={(name) => {
                        onRename(template.id, name);
                        setRenaming(null);
                      }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <Text size="small" strong truncate title={template.name}>
                      {template.name}
                    </Text>
                  )}

                  <span className={styles.kind}>
                    <Text size="micro">{template.kind}</Text>
                  </span>
                  <Text size="tiny" tone="faint">
                    {template.savedAt.slice(0, 10)}
                  </Text>
                  <span className={styles.spacer} />
                  <Button variant="framed" size="tiny" onClick={() => onLoad(template.id)}>
                    Load
                  </Button>
                </div>

                {expanded && (
                  <div className={styles.detail}>
                    <Stack gap={2}>
                      <Text size="small" tone="faint" prose>
                        {template.summary}
                      </Text>
                      {template.apps.length > 0 && (
                        <Stack direction="row" gap={2} wrap>
                          {template.apps.map((app) => (
                            <span key={app} className={styles.app}>
                              <Text size="micro">{app}</Text>
                            </span>
                          ))}
                        </Stack>
                      )}

                      {confirming === template.id ? (
                        <Stack direction="row" gap={2} align="center" wrap>
                          {/* The only confirmation in the ticket, because this
                              is the only deletion with no way back. */}
                          <Text size="small" tone="danger">
                            Delete “{template.name}” permanently?
                          </Text>
                          <Button
                            variant="raised"
                            tone="danger"
                            size="small"
                            onClick={() => {
                              onDelete(template.id);
                              setConfirming(null);
                            }}
                          >
                            Delete it
                          </Button>
                          <Button size="small" onClick={() => setConfirming(null)}>
                            Keep it
                          </Button>
                        </Stack>
                      ) : (
                        <Stack direction="row" gap={2} wrap>
                          <Button variant="framed" size="small" onClick={() => onLoad(template.id)}>
                            Load into this stage
                          </Button>
                          <Button variant="framed" size="small" onClick={() => onCopy(template.id)}>
                            Copy to clipboard
                          </Button>
                          <Button
                            variant="framed"
                            size="small"
                            onClick={() => setRenaming(template.id)}
                          >
                            Rename
                          </Button>
                          <Button
                            variant="framed"
                            size="small"
                            tone="danger"
                            onClick={() => setConfirming(template.id)}
                          >
                            Delete
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppBody>
  );
}
