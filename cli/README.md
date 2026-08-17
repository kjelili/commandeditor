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


## Notarization (OpenTimestamps)

Anchor a document's SHA-256 into the Bitcoin blockchain — only the hash leaves
your machine. These commands use the real OpenTimestamps library, which is
Node-only, so install it once:

    npm i opentimestamps

Then:

    commandeditor notarize contract.pdf            # writes contract.pdf.ots (pending)
    commandeditor upgrade contract.pdf.ots         # attach the Bitcoin proof once confirmed (hours later)
    commandeditor verify contract.pdf contract.pdf.ots

The .ots is a standard OpenTimestamps proof — it also verifies at opentimestamps.org.
