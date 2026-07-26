---
Title: Markdown to reMarkable, with the font fallback that makes the glyphs survive
Ticket: DATADROP-7
Status: active
Topics:
    - playbook
    - pandoc
    - remarkable
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "The pandoc/xelatex invocation for putting a ticket guide on the reMarkable, including the DejaVu font switch and the single-codepoint fallback for U+2316."
LastUpdated: 2026-07-26
WhatFor: ""
WhenToUse: ""
---

# Markdown to reMarkable

DATADROP-6 solved this once and the diary's own follow-up said to write it down
so the glyph problem is solved once rather than each time. This is that.

## Why it is not just `pandoc -o out.pdf`

**Missing glyphs in xelatex render as nothing — not as a box.** The failure is
silent on the page and loud in the log. A visual check of a few pages will not
find it: the DATADROP-6 guide was missing five characters and none of them
appeared on the three pages that were checked.

Our documents are full of the glyphs the workbench uses — `✓ ✕ ⌖ ⬌ ⬍ ⠿ ≠ ⊳ ↦ ↺
▶ ▸ ▾` — and several of them are the literal subject matter of the sections
they appear in. Fixing the renderer rather than the content is the right
direction whenever the content is the point.

## The invocation

Run from the ticket directory.

```bash
GUIDE=design/01-....md
OUT=DATADROP-7-landing-page-and-embedded-workbenches.pdf

cat > /tmp/fallback.tex <<'TEX'
\usepackage{newunicodechar}
\newfontfamily\symbolfont{Noto Sans Symbols2}
\newunicodechar{⌖}{{\symbolfont ⌖}}
\newunicodechar{✓}{{\symbolfont ✓}}
\newunicodechar{✕}{{\symbolfont ✕}}
TEX

pandoc "$GUIDE" -o "$OUT" \
  --pdf-engine=xelatex \
  -V geometry:margin=2cm -V fontsize=9pt \
  -V mainfont="DejaVu Serif" \
  -V monofont="DejaVu Sans Mono" \
  -V sansfont="DejaVu Sans" \
  -H /tmp/fallback.tex \
  --toc --toc-depth=2 2>&1 | tee /tmp/pandoc.log

# TREAT A MISSING CHARACTER AS A BUILD FAILURE, NOT A WARNING.
grep -c 'Missing character' /tmp/pandoc.log   # must be 0
```

```bash
rmapi mkdir Projects/2026/07     # idempotent; already exists after DATADROP-6
rmapi put "$OUT" Projects/2026/07
rmapi ls Projects/2026/07
```

## The two things that go wrong

**Latin Modern (pandoc's default) is missing most of the glyphs.** Switching the
three font variables to DejaVu fixes most of them.

**DejaVu Serif is missing U+2713 CHECK MARK (`✓`) and DejaVu is missing U+2316
POSITION INDICATOR (`⌖`).** DATADROP-6's diary recorded that the DejaVu switch
fixed `✓`; that was wrong, and the reason is worth knowing. `fc-list
':charset=2713' family` lists *DejaVu Sans* and *DejaVu Sans Mono* — but not
*DejaVu Serif*, which is the `mainfont`, and not *DejaVu Sans Mono Oblique*,
which is what emphasised code resolves to. A per-family check is not a per-face
check, and the log names the face:

```text
[WARNING] Missing character: There is no ✓ (U+2713) in font DejaVu Sans Mono Oblique/OT:s
[WARNING] Missing character: There is no ✓ (U+2713) in font DejaVu Serif/OT:script=latn
```

Map all three codepoints, not just `⌖`. Find a font that has a given codepoint
with:

```console
$ fc-list ':charset=2316' family
FreeSerif
Noto Sans Symbols2
PragmataPro Liga
```

That command is the tool for this whole class of problem: it answers "which
installed font has this codepoint" in one line, instead of guessing at font
names. The three-line `fallback.tex` above maps that one codepoint and leaves
everything else on DejaVu.

## Mermaid

Pandoc renders ` ```mermaid ` blocks as verbatim code. That is acceptable — the
diagrams in these guides are readable as text — and installing a diagram filter
is not worth it for a document whose destination is an e-ink reader. If a
diagram ever stops being readable as source, that is a signal the diagram is too
complicated, not that the toolchain needs work.

## Device location

`Projects/2026/07`, matching the Obsidian vault's `Projects/YYYY/MM/DD` layout.
There was no pre-existing convention when DATADROP-6 looked for one; this is it
now.
