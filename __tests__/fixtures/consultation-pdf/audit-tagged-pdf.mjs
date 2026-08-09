import { inflateSync } from 'node:zlib'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function parseObjects(pdfBytes) {
  const buffer = Buffer.from(pdfBytes)
  const source = buffer.toString('latin1')
  const starts = [...source.matchAll(/(?:^|[\r\n])(\d+)\s+0\s+obj\b/g)]
  const objects = new Map()

  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index]
    const objectNumber = Number.parseInt(match[1], 10)
    const bodyStart = match.index + match[0].length
    const nextStart = index + 1 < starts.length ? starts[index + 1].index : source.length
    const endObject = source.lastIndexOf('endobj', nextStart)
    assert(endObject >= bodyStart, `PDF object ${objectNumber} has no endobj marker`)
    objects.set(objectNumber, {
      bytes: buffer.subarray(bodyStart, endObject),
      text: source.slice(bodyStart, endObject),
    })
  }

  assert(objects.size > 0, 'PDF contains no readable indirect objects')
  return objects
}

function referenceFor(body, key) {
  const match = body.match(new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R\\b`))
  assert(match, `PDF dictionary is missing /${key} indirect reference`)
  return Number.parseInt(match[1], 10)
}

function objectFor(objects, objectNumber) {
  const object = objects.get(objectNumber)
  assert(object, `PDF indirect object ${objectNumber} is missing`)
  return object
}

function decodeStream(object) {
  const source = object.bytes.toString('latin1')
  const streamMarker = source.match(/stream\r?\n/)
  assert(streamMarker, 'PDF content object has no stream')
  const streamStart = streamMarker.index + streamMarker[0].length
  const streamEnd = source.lastIndexOf('endstream')
  assert(streamEnd >= streamStart, 'PDF content stream has no endstream')
  const compressed = object.bytes.subarray(streamStart, streamEnd)
  if (/\/FlateDecode\b/.test(source.slice(0, streamMarker.index))) {
    return inflateSync(compressed).toString('latin1')
  }
  return compressed.toString('latin1')
}

function validateVisualOrder(pageNumber, positions) {
  assert(positions.length > 0, `page ${pageNumber} has no positioned semantic text`)
  for (const position of positions) {
    assert(
      position.x >= 40 && position.x <= 555 && position.y >= 45 && position.y <= 795,
      `page ${pageNumber} semantic text origin is outside the readable page bounds: ${JSON.stringify(position)}`,
    )
  }
  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1]
    const current = positions[index]
    assert(
      current.y <= previous.y + 0.01,
      `page ${pageNumber} semantic text moves upward visually at item ${index + 1}`,
    )
    if (Math.abs(current.y - previous.y) <= 0.01) {
      assert(
        current.x >= previous.x - 0.01,
        `page ${pageNumber} same-line text does not run left-to-right`,
      )
    }
  }
}

function validateArtifacts(pageIndex, positions) {
  const expected = pageIndex === 0 ? 2 : 4
  assert(
    positions.length === expected,
    `page ${pageIndex + 1} must contain exactly ${expected} recurring chrome text objects`,
  )
  const bottom = positions.filter(({ y }) => y <= 50)
  const top = positions.filter(({ y }) => y >= 790)
  const middle = positions.filter(({ y }) => y > 50 && y < 790)
  assert(middle.length === 0, `page ${pageIndex + 1} has Artifact text in the body band`)
  if (pageIndex === 0) {
    assert(bottom.length === 2 && top.length === 0, 'cover Artifact text must be footer-only')
  } else {
    assert(bottom.length === 2 && top.length === 2, 'body page chrome quota is invalid')
  }
}

function auditContentStream(content, pageIndex) {
  const stack = []
  const semanticMcids = []
  const semanticPositions = []
  const artifactPositions = []
  let pendingTag
  let pendingMcid
  let activeText

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim()
    const tag = line.match(/^\/(Artifact|Span)\b/u)?.[1]
    if (tag) pendingTag = tag
    const mcid = line.match(/^\/MCID\s+(\d+)\b/u)?.[1]
    if (mcid !== undefined) pendingMcid = Number.parseInt(mcid, 10)

    if (/\bBDC\s*$/u.test(line)) {
      assert(pendingTag, `page ${pageIndex + 1} BDC has no auditable tag`)
      const entry = { tag: pendingTag, mcid: pendingMcid }
      stack.push(entry)
      if (entry.mcid !== undefined) semanticMcids.push(entry.mcid)
      pendingTag = undefined
      pendingMcid = undefined
      continue
    }
    if (/\bBMC\s*$/u.test(line)) {
      assert(pendingTag, `page ${pageIndex + 1} BMC has no auditable tag`)
      stack.push({ tag: pendingTag, mcid: undefined })
      pendingTag = undefined
      pendingMcid = undefined
      continue
    }
    if (line === 'EMC') {
      assert(stack.length > 0, `page ${pageIndex + 1} has unmatched EMC`)
      stack.pop()
      continue
    }
    if (line === 'BT') {
      assert(!activeText, `page ${pageIndex + 1} contains nested text objects`)
      const semantic = [...stack].reverse().find((entry) => entry.mcid !== undefined)
      const artifact = stack.some((entry) => entry.tag === 'Artifact')
      assert(semantic || artifact, `page ${pageIndex + 1} contains unmarked text`)
      activeText = { kind: semantic ? 'semantic' : 'artifact', position: undefined }
      continue
    }
    if (activeText && !activeText.position) {
      const matrix = line.match(
        /^[-+\d.]+\s+[-+\d.]+\s+[-+\d.]+\s+[-+\d.]+\s+([-+\d.]+)\s+([-+\d.]+)\s+Tm$/u,
      )
      const translate = line.match(/^([-+\d.]+)\s+([-+\d.]+)\s+T[Dd]$/u)
      const position = matrix || translate
      if (position) {
        activeText.position = {
          x: Number.parseFloat(position[1]),
          y: Number.parseFloat(position[2]),
        }
      }
    }
    if (line === 'ET') {
      assert(activeText, `page ${pageIndex + 1} has ET without BT`)
      assert(activeText.position, `page ${pageIndex + 1} text has no Tm/Td position`)
      if (activeText.kind === 'semantic') semanticPositions.push(activeText.position)
      else artifactPositions.push(activeText.position)
      activeText = undefined
    }
  }

  assert(stack.length === 0, `page ${pageIndex + 1} has unclosed marked content`)
  assert(!activeText, `page ${pageIndex + 1} has an unclosed text object`)
  assert(semanticMcids.length > 0, `page ${pageIndex + 1} has no semantic marked content`)
  assert(
    semanticMcids.every((mcid, index) => mcid === index),
    `page ${pageIndex + 1} MCIDs are not consecutive in content order`,
  )
  validateVisualOrder(pageIndex + 1, semanticPositions)
  validateArtifacts(pageIndex, artifactPositions)

  return {
    markedContentItems: semanticMcids.length,
    semanticTextObjects: semanticPositions.length,
    artifactTextObjects: artifactPositions.length,
  }
}

export function auditTaggedPdfBytes(pdfBytes) {
  const objects = parseObjects(pdfBytes)
  const objectEntries = [...objects.entries()]
  const catalogEntry = objectEntries.find(([, object]) => /\/Type\s*\/Catalog\b/u.test(object.text))
  assert(catalogEntry, 'PDF catalog is missing')
  const catalog = catalogEntry[1].text
  assert(/\/Lang\s*\(zh-TW\)/u.test(catalog), 'PDF catalog language must be zh-TW')

  const markInfo = objectFor(objects, referenceFor(catalog, 'MarkInfo')).text
  assert(/\/Marked\s+true\b/u.test(markInfo), 'PDF catalog must declare MarkInfo/Marked true')

  const structureRoot = objectFor(objects, referenceFor(catalog, 'StructTreeRoot')).text
  assert(/\/Type\s*\/StructTreeRoot\b/u.test(structureRoot), 'StructTreeRoot has the wrong type')
  const parentTreeNextKey = Number.parseInt(
    structureRoot.match(/\/ParentTreeNextKey\s+(\d+)\b/u)?.[1] || '-1',
    10,
  )
  const documentReference = structureRoot.match(/\/K\s*\[?\s*(\d+)\s+0\s+R/u)?.[1]
  assert(documentReference, 'StructTreeRoot must contain one Document root reference')
  const documentRoot = objectFor(objects, Number.parseInt(documentReference, 10)).text
  assert(/\/S\s*\/Document\b/u.test(documentRoot), 'logical structure root must be Document')

  const parentTree = objectFor(objects, referenceFor(structureRoot, 'ParentTree')).text
  assert(!/\/_items\b|\/limits\b/u.test(parentTree), 'ParentTree leaked implementation fields')
  const nums = parentTree.match(/\/Nums\s*\[([\s\S]*?)\]\s*\/Limits/u)?.[1]
  assert(nums, 'ParentTree must expose /Nums')
  const parentKeys = [...nums.matchAll(/(?:^|\])\s*(\d+)\s*\[/gu)]
    .map((match) => Number.parseInt(match[1], 10))
  const limits = parentTree.match(/\/Limits\s*\[\s*(\d+)\s+(\d+)\s*\]/u)
  assert(limits, 'ParentTree must expose /Limits')

  const pages = objectEntries
    .filter(([, object]) => /\/Type\s*\/Page\b/u.test(object.text) && !/\/Type\s*\/Pages\b/u.test(object.text))
    .map(([, object]) => object)
    .sort((left, right) => {
      const leftKey = Number.parseInt(left.text.match(/\/StructParents\s+(\d+)\b/u)?.[1] || '-1', 10)
      const rightKey = Number.parseInt(right.text.match(/\/StructParents\s+(\d+)\b/u)?.[1] || '-1', 10)
      return leftKey - rightKey
    })
  assert(pages.length > 0, 'PDF has no page objects')
  assert(parentTreeNextKey === pages.length, 'ParentTreeNextKey must equal page count')
  assert(parentKeys.length === pages.length, 'ParentTree must contain one /Nums entry per page')
  assert(parentKeys.every((key, index) => key === index), 'ParentTree keys must be consecutive')
  assert(Number.parseInt(limits[1], 10) === 0, 'ParentTree lower limit must be zero')
  assert(Number.parseInt(limits[2], 10) === pages.length - 1, 'ParentTree upper limit is wrong')

  const totals = {
    markedContentItems: 0,
    semanticTextObjects: 0,
    artifactTextObjects: 0,
  }
  pages.forEach((page, pageIndex) => {
    const structParents = Number.parseInt(
      page.text.match(/\/StructParents\s+(\d+)\b/u)?.[1] || '-1',
      10,
    )
    assert(structParents === pageIndex, `page ${pageIndex + 1} StructParents key is wrong`)
    assert(/\/Tabs\s*\/S\b/u.test(page.text), `page ${pageIndex + 1} tab order is not structural`)
    const content = decodeStream(objectFor(objects, referenceFor(page.text, 'Contents')))
    const result = auditContentStream(content, pageIndex)
    for (const key of Object.keys(totals)) totals[key] += result[key]
  })

  const allObjects = objectEntries.map(([, object]) => object.text).join('\n')
  const structureTags = Object.fromEntries(
    ['Document', 'H1', 'H2', 'P'].map((tag) => [
      tag,
      [...allObjects.matchAll(new RegExp(`/S\\s*/${tag}\\b`, 'gu'))].length,
    ]),
  )
  assert(structureTags.Document === 1, 'PDF must contain exactly one Document structure element')
  assert(structureTags.H1 >= 1 && structureTags.H2 >= 1 && structureTags.P >= 1, 'required semantic tags are missing')

  return {
    marked: true,
    language: 'zh-TW',
    pages: pages.length,
    structureTags,
    ...totals,
    expectedArtifactTextObjects: 2 + (Math.max(0, pages.length - 1) * 4),
    readingOrderVerified: true,
    visualOrderVerified: true,
    textBoundsVerified: true,
    artifactPolicyVerified: true,
    parentTreeVerified: true,
    allTextMarked: true,
  }
}
