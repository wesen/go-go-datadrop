---
Title: "The CLI output layer — rows, formats, and the two flags that are not each other"
Slug: cli-output
Short: "How datadrop verbs emit rows rather than text: what --output does, why --format is a different thing, what the column names are and where they come from, and what changed for --output ndjson and --stream."
Topics:
- cli
- output
- glazed
Commands:
- query
- tail
- list
- export
- inspect
Flags:
- output
- format
- fields
- jq
- filter
- select
- stream
- drop-stream
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: GeneralTopic
---

Every datadrop verb that produces data emits **rows**, not text. The command
decides what a row contains; the framework decides how it is rendered, filtered,
sorted and written. That split is why `datadrop query greenhouse --output csv`
works without a line of formatting code in datadrop, and why the column names
are the same ones the browser workbench shows.

This page is for anyone scripting against the CLI. It covers what `--output`
accepts, why `export` has a `--format` that is a different thing, what the
column names are, and the three flags that changed name.

## What --output does, and what you get for free

`--output` selects how the rows a command emitted are rendered on your machine.
It defaults to a boxed ASCII table, which is right at a prompt and wrong in a
pipe, so every other value is one flag away.

```console
$ datadrop query greenhouse --output csv
$ datadrop query greenhouse --output json
$ datadrop query greenhouse --output yaml
$ datadrop query greenhouse --output markdown
$ datadrop query greenhouse --output excel --output-file july.xlsx
```

The full set is `table`, `csv`, `tsv`, `json`, `yaml`, `sql`, `markdown` and
`excel`. Within `table`, `--table-format` picks `ascii`, `markdown`, `html`,
`csv` or `tsv`.

Selecting, filtering and reshaping come from the same layer:

```console
$ datadrop query greenhouse --fields seq,time,data.temp_c
$ datadrop query greenhouse --sort-by -seq
$ datadrop query greenhouse --select seq
$ datadrop query greenhouse --jq 'select(.["data.temp_c"] > 21)'
$ datadrop list --remove-nulls
```

**Two flag names read as each other's opposite and are not.** `--jq` filters
**rows**; `--filter` removes **columns**. `--filter data.temp_c` drops that
column from the output. `--jq 'select(.["data.temp_c"] > 21)'` drops the rows
where the predicate is false. `--select seq` prints one field per line with no
header, which is the `cut -f` of this toolchain. Reaching for the wrong one is
the single most common mistake with this layer.

Two more flags exist on every verb and are worth knowing when something is
configured and you cannot see where from. `--print-schema` dumps the command's
field definitions; `--print-parsed-fields` shows what each flag resolved to and
which source it came from — a default, an environment variable, a config file or
the command line. `--token` is declared as a secret, so it renders redacted in
both.

## --format is not --output

`datadrop export` has a `--format` flag and no `--output`. Every other
data-producing verb has an `--output` and no `--format`. This is deliberate and
the distinction is worth holding onto:

- **`--format` names a SERVER-side format.** The bytes are produced by the
  server and streamed through the CLI untouched. `datadrop export greenhouse
  --format csv` downloads exactly the file that `curl
  '.../export?format=csv'` downloads and that the web UI's download button
  produces.
- **`--output` names a CLIENT-side rendering** of rows the command emitted.

`export` is not a rows-emitting command at all. It opens a response body and
copies it, which is constant-memory over a 400 MB export and cannot disagree
with the server about what a CSV looks like. Converting it to rows would put the
export format in two places and lose the streaming.

The rule for a reviewer: **a verb with both `--format` and `--output` has been
classified wrong.** A test enforces it.

## The column names are a contract

The moment `--fields seq` works, `seq` is something scripts depend on, and
renaming it is a breaking change no compiler catches. So the column names are
declared once per response type and pinned by a test.

For an event — what `query` and `tail` emit — the columns are the nine envelope
fields in this order, followed by the payload:

```
id  drop  stream  seq  time  received_at  source  type  subject  data.*
```

Payload columns are **flattened with a `data.` prefix** and sorted. A payload of
`{"temp_c": 21.7, "location": {"lat": 52.5}}` becomes two columns,
`data.temp_c` and `data.location.lat`. Arrays and anything else that cannot be
spread across columns arrive as compact JSON in one cell.

That flattening is not the CLI's own. It is `pkg/tabular`, the same projection
the server's `/table` endpoint returns and therefore the same names the browser
workbench puts on its field chips. `datadrop query --fields data.temp_c` and the
workbench's `data.temp_c` chip are one column rather than two that look alike.
It is also why `datadrop query --output csv` and `datadrop export --format csv`
produce identical headers.

An imported event additionally carries a `meta` column holding its provenance —
the dataset, version, path and row it came from. If you want the original nested
envelope rather than a flat row, that is what `datadrop export --format ndjson`
is for.

Timestamps everywhere are UTC RFC3339 with fixed-width milliseconds
(`2026-07-26T18:04:11.512Z`). The fixed width matters: `…:05.100Z` and
`…:05.1Z` would be different strings that compare incorrectly in a
lexicographic range query.

## One row is still a set

`whoami`, `inspect`, `create`, `push`, `schema show` and the dataset write verbs
each produce one thing, and each emits one row. `--output json` is therefore an
array of one, not a bare object.

That uniformity is the point. Before, `whoami` printed prose, `inspect` printed
an object and `list` printed an array, and a script had to know which verb it
had called. Now `--output json` means the same thing everywhere, and
`datadrop whoami --select user_id` is something you can type.

## Streaming, and the tail that would otherwise print nothing

`datadrop tail --follow` subscribes to a drop's live stream and emits a row per
event, for as long as you leave it running. An ASCII table cannot be drawn a row
at a time — its column widths are a property of the whole set — so a boxed
`--follow` would print nothing until the stream ended, which it never does.

`tail` therefore defaults to `--stream` and `--table-format markdown`, which
renders and flushes one row at a time:

```console
$ datadrop tail greenhouse --follow --fields time,data.temp_c
| time | data.temp_c |
| --- | --- |
| 2026-07-26T18:06:02.114Z | 22.0 |
| 2026-07-26T18:06:31.902Z | 22.2 |
^C
```

Ctrl-C ends it and exits 0.

Do **not** combine `--follow` with `--table-format ascii`, `--table-format csv`,
`--table-format tsv`, or `--stream=false`. All four buffer, so the command
appears to hang — a failure indistinguishable from "no events are arriving".
All four are the right thing for a bounded `tail` without `--follow`.

`--output json` and `--output yaml` stream correctly and are good choices for a
`--follow` you intend to pipe.

## What changed, and what to update in your scripts

Three flags were renamed, two of them because glazed's own sections already
own the names and two flags cannot share one on a command.

| Before | After | Why |
|---|---|---|
| `--stream NAME` | `--drop-stream NAME` | `--stream` is now the boolean that switches row-at-a-time output |
| `dataset push --flatten` | `dataset push --flatten-paths` | `--flatten` is now the column-flattening output flag |
| `dataset import --format` | `dataset import --row-format` | that verb also has `--output`; two "what shape is the data" flags on one command is the confusion this page exists to prevent |

`--stream` deserves special care when updating a script, because the old
spelling still parses. `datadrop push lab --stdin --stream temps` no longer
means "the temps stream": `--stream` is a boolean now, so `temps` is read as a
positional argument and the error you get is about something else entirely.
Search your scripts for `--stream` rather than waiting for a failure to find it.

`export --format` is unchanged. `--addr`, `--token`, `--limit`, `--from`,
`--to`, `--after`, `--order` and `--follow` are unchanged.

### --output ndjson is deprecated

`--output ndjson` used to print one compact JSON object per line. It still
works, for one more release, and prints a warning naming its successors.

There is no exact replacement, and it is worth being precise about why.
`--output json --output-as-objects` — what `ndjson` now maps to — emits a stream
of concatenated JSON *values*. `jq` reads it correctly and so does any streaming
JSON parser, so if you are piping into `jq`, nothing changes for you. But it is
**not line-oriented**: the objects are indented, so a "line" is now `{` or
`  "seq": 1,`, and

```bash
datadrop query greenhouse --output ndjson | while read -r line; do
  echo "$line" | jq -r .seq          # silently produces garbage
done
```

no longer does what it looks like it does.

If you need one compact object per line, use `datadrop export --format ndjson`.
That is the server's own NDJSON: line-oriented by construction, streamed, and
carrying the original nested envelope rather than a flattened row.

## Exit codes

Unchanged, and still worth branching on rather than parsing stderr:

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | a generic failure |
| 2 | a usage error |
| 3 | the credential was rejected or is not allowed (401, 403) |
| 4 | the drop, dataset or version does not exist (404) |
| 5 | the request was refused: schema validation, a conflict, a body over the limit (400, 409, 413, 422) |

Diagnostics carry a `datadrop: ` prefix and go to stderr, so
`datadrop query … | jq` stays clean at any `--log-level`.

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| `tail --follow` prints nothing | The output format buffers to compute column widths, or to close | Drop `--table-format ascii/csv/tsv` and `--stream=false`; the default (markdown) streams, as do `--output json` and `--output yaml` |
| `--filter` removed rows I wanted, not columns | `--filter` removes columns | Use `--jq 'select(...)'` for rows |
| `--fields data.temp_c` returns nothing | The payload key is spelled differently, or the event has no payload | Run without `--fields` and read the header; payload columns are sorted after the envelope ones |
| `--jq '.data.temp_c'` does not match | The column is named `data.temp_c`, one key with a dot in it, not a nested object | Use `.["data.temp_c"]` |
| A script broke after upgrading and the error mentions positional arguments | `--stream NAME` now parses as `--stream=true` plus a positional | Rename to `--drop-stream NAME` |
| `--output ndjson` warns on stderr | It is deprecated | Use `--output json --output-as-objects` for jq, or `datadrop export --format ndjson` for line-oriented output |
| `datadrop --output json list` says unknown flag | `--output` belongs to the verb, not to the root | Put it after the verb: `datadrop list --output json` |
| `datadrop serve` tries to listen on an http:// URL | It should not: `serve` does not read `$DATADROP_ADDR` | Report it; `serve --addr` is a socket to bind and is deliberately insulated from the client variable |

## See Also

- `datadrop help web-ui-object-model` — the workbench that names the same
  columns this page describes.
- `datadrop query --help --long-help` — the full output flag surface for one
  verb.
- `datadrop export --help` — the server-side formats, and the `--format` half of
  the distinction above.
