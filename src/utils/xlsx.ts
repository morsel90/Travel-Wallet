// 🆕 مولّد ملفات Excel (.xlsx) مضمّن بالكامل — بلا أي مكتبة خارجية ولا شبكة.
// يُنتج مصنّفاً حقيقياً بصيغة OOXML مضغوطاً في حاوية ZIP (بطريقة "stored" أي بلا
// ضغط) يفتحه Excel/Numbers/LibreOffice مباشرةً. اخترنا هذا المسار بدل SheetJS
// لأنه: (1) لا يتطلّب npm install، (2) يعمل دون اتصال (مناسب لتطبيق PWA)،
// (3) لا يزيد حجم الحزمة. النصوص تُكتب كـ inlineStr فيدعم العربية (UTF-8) دون
// جداول سلاسل مشتركة، وrightToLeft="1" يجعل الورقة تُعرض من اليمين لليسار.

export type XlsxCell = string | number

export interface XlsxSheet {
  name: string
  rows: XlsxCell[][]
  rtl?: boolean
}

const XML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (s: string) => s.replace(/[&<>]/g, c => XML_ESC[c] ?? c)
const escAttr = (s: string) => s.replace(/[&<>"]/g, c => XML_ESC[c] ?? c)

// اسم عمود Excel من فهرس صفري: 0→A, 25→Z, 26→AA ...
function colName(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// اسم ورقة صالح لـ Excel: ≤31 حرفاً وبلا المحارف الممنوعة [ ] : * ? / \
function safeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31)
  return cleaned || `ورقة${index + 1}`
}

function cellXml(cell: XlsxCell, ref: string): string {
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${ref}" t="n"><v>${cell}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(cell))}</t></is></c>`
}

function sheetXml(sheet: XlsxSheet): string {
  const rows = sheet.rows.map((row, ri) => {
    const cells = row.map((cell, ci) => cellXml(cell, colName(ci) + (ri + 1))).join('')
    return `<row r="${ri + 1}">${cells}</row>`
  }).join('')
  const view = `<sheetViews><sheetView${sheet.rtl ? ' rightToLeft="1"' : ''} workbookViewId="0"/></sheetViews>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `${view}<sheetData>${rows}</sheetData></worksheet>`
}

function workbookXml(sheets: XlsxSheet[]): string {
  const tags = sheets.map((s, i) => `<sheet name="${escAttr(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView/></bookViews><sheets>${tags}</sheets></workbook>`
}

function workbookRelsXml(count: number): string {
  const rels = Array.from({ length: count }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
}

function contentTypesXml(count: number): string {
  const overrides = Array.from({ length: count }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `${overrides}</Types>`
}

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

// ─── CRC32 + ZIP (stored) ────────────────────────────────────────────────────
let crcTable: Uint32Array | null = null
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      t[n] = c >>> 0
    }
    crcTable = t
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}

interface ZipEntry { name: string; data: Uint8Array }

function zipStored(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const e of entries) {
    const nameBytes = enc.encode(e.name)
    const crc = crc32(e.data)
    const size = e.data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true)         // version needed
    lv.setUint16(6, 0, true)          // flags
    lv.setUint16(8, 0, true)          // method: 0 = stored
    lv.setUint16(10, 0, true)         // mod time
    lv.setUint16(12, 0x21, true)      // mod date = 1980-01-01
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)      // compressed size
    lv.setUint32(22, size, true)      // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)         // extra length
    local.set(nameBytes, 30)
    chunks.push(local, e.data)

    const cd = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true) // central dir header signature
    cv.setUint16(4, 20, true)         // version made by
    cv.setUint16(6, 20, true)         // version needed
    cv.setUint16(8, 0, true)          // flags
    cv.setUint16(10, 0, true)         // method
    cv.setUint16(12, 0, true)         // mod time
    cv.setUint16(14, 0x21, true)      // mod date
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)         // extra length
    cv.setUint16(32, 0, true)         // comment length
    cv.setUint16(34, 0, true)         // disk number
    cv.setUint16(36, 0, true)         // internal attrs
    cv.setUint32(38, 0, true)         // external attrs
    cv.setUint32(42, offset, true)    // local header offset
    cd.set(nameBytes, 46)
    central.push(cd)

    offset += local.length + size
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)   // end of central dir signature
  ev.setUint16(4, 0, true)            // disk number
  ev.setUint16(6, 0, true)            // disk with central dir
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)      // central dir offset
  ev.setUint16(20, 0, true)           // comment length

  const all = [...chunks, ...central, eocd]
  const total = all.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const c of all) { out.set(c, p); p += c.length }
  return out
}

/** يبني بايتات مصنّف .xlsx كاملة من قائمة الأوراق. لا يعتمد على DOM (قابل للاختبار في Node). */
export function buildXlsxBytes(sheets: XlsxSheet[]): Uint8Array {
  const enc = new TextEncoder()
  const safe = sheets.map((s, i) => ({ ...s, name: safeSheetName(s.name, i) }))
  const parts: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypesXml(safe.length)) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml(safe)) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRelsXml(safe.length)) },
    ...safe.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s)) })),
  ]
  return zipStored(parts)
}

/** يبني الملف وينزّله في المتصفح مباشرةً عبر رابط Blob مؤقت. */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const bytes = buildXlsxBytes(sheets)
  // نمرّر ArrayBuffer الأساس مباشرةً — bytes يغطّي كامل الـ buffer (أُنشئ عبر
  // new Uint8Array(total))، والتحويل يتفادى صرامة نوع BlobPart في TS الحديث.
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
