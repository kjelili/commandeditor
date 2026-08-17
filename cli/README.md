# CommandEditor CLI

The same privacy-first toolkit, headless — for scripts, CI pipelines, and
hot-folder automation. Files never leave the machine.

## Run

```bash
node cli/index.js <command> ...
# or, once published:
npx commandeditor <command> ...
```

## Commands

| Command | Example |
|---|---|
| merge | `commandeditor merge a.pdf b.pdf -o combined.pdf` |
| split | `commandeditor split in.pdf --pages 1-3,7 -o excerpt.pdf` |
| rotate | `commandeditor rotate in.pdf --degrees 90 --pages 2,4` |
| pagenum | `commandeditor pagenum in.pdf -o numbered.pdf` |
| watermark | `commandeditor watermark in.pdf --text "CONFIDENTIAL"` |
| compress | `commandeditor compress in.pdf -o small.pdf` |
| hash | `commandeditor hash in.pdf` → SHA-256 |
| info | `commandeditor info in.pdf` |

Requires Node 18+. The only runtime dependency is `pdf-lib` (already in the
project's dependencies).

## Automation example — watch folder

```bash
# stamp every new invoice with page numbers
fswatch -o ./incoming | while read; do
  for f in ./incoming/*.pdf; do
    node cli/index.js pagenum "$f" -o "./done/$(basename "$f")" && mv "$f" ./archive/
  done
done
```

(The web app's **Watch Folder** tool does the same in-browser, no shell needed.)
