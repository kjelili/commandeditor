// utils/formExtract.ts — Stage 8 gap-filler: Form Data Extractor
// Reads existing AcroForm field values out of a filled PDF → CSV or JSON.
// Complements csvMailMerge (which fills forms FROM csv); this closes the loop.

import { bytesBlob } from './blob'

export interface FormFieldValue { name: string; type: string; value: string }

export async function extractFormData(file: File): Promise<FormFieldValue[]> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  let form: any
  try { form = doc.getForm() } catch { return [] }
  const out: FormFieldValue[] = []
  for (const field of form.getFields()) {
    const name: string = field.getName()
    let type = 'text', value = ''
    try {
      if (field instanceof PDFTextField) { type = 'text'; value = field.getText() ?? '' }
      else if (field instanceof PDFCheckBox) { type = 'checkbox'; value = field.isChecked() ? 'checked' : '' }
      else if (field instanceof PDFDropdown) { type = 'dropdown'; value = (field.getSelected() ?? []).join('; ') }
      else if (field instanceof PDFOptionList) { type = 'list'; value = (field.getSelected() ?? []).join('; ') }
      else if (field instanceof PDFRadioGroup) { type = 'radio'; value = field.getSelected() ?? '' }
      else if (field instanceof PDFSignature) { type = 'signature'; value = '(signed)' }
    } catch { value = '' }
    out.push({ name, type, value })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function csvEscape(s: string): string {
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function formDataToCsv(fields: FormFieldValue[]): string {
  return 'name,type,value\n' + fields.map(f => [f.name, f.type, f.value].map(csvEscape).join(',')).join('\n') + '\n'
}

export function formDataCsvBlob(fields: FormFieldValue[]): Blob {
  return bytesBlob(new TextEncoder().encode(formDataToCsv(fields)), 'text/csv')
}

export function formDataJsonBlob(fields: FormFieldValue[]): Blob {
  const obj: Record<string, string> = {}
  for (const f of fields) obj[f.name] = f.value
  return bytesBlob(new TextEncoder().encode(JSON.stringify(obj, null, 2)), 'application/json')
}
