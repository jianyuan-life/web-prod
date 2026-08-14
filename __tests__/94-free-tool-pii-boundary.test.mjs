import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = process.cwd()
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8')

const parse = (path, scriptKind = ts.ScriptKind.TSX) => {
  const source = read(...path)
  return {
    source,
    file: ts.createSourceFile(path.join('/'), source, ts.ScriptTarget.Latest, true, scriptKind),
  }
}

const walk = (node, visit) => {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

const jsxTagName = (node) => node.tagName?.getText()

const jsxElements = (file, tagName) => {
  const matches = []
  walk(file, (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && jsxTagName(node) === tagName) {
      matches.push(node)
    }
  })
  return matches
}

const attributeMap = (element) => new Map(
  element.attributes.properties
    .filter(ts.isJsxAttribute)
    .map((attribute) => [attribute.name.getText(), attribute]),
)

const trackedInsertPayloads = (file, tableName) => {
  const payloads = []

  walk(file, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return
    if (node.expression.name.text !== 'insert') return

    const fromCall = node.expression.expression
    if (!ts.isCallExpression(fromCall) || !ts.isPropertyAccessExpression(fromCall.expression)) return
    if (fromCall.expression.name.text !== 'from') return

    const [table] = fromCall.arguments
    const [payload] = node.arguments
    if (!table || !ts.isStringLiteral(table) || table.text !== tableName) return
    assert.ok(payload && ts.isObjectLiteralExpression(payload), `${tableName} insert must use an object literal`)
    payloads.push(payload)
  })

  return payloads
}

const objectProperties = (objectLiteral) => new Map(
  objectLiteral.properties.map((property) => {
    assert.ok(ts.isPropertyAssignment(property), 'tracking payload must use explicit property assignments')
    return [property.name.getText().replaceAll(/["']/gu, ''), property.initializer]
  }),
)

const evaluateExpression = (expression, scope) => {
  const names = Object.keys(scope)
  const values = Object.values(scope)
  // The expression comes from the repository AST and is limited below to an exact allow-list.
  return Function(...names, `'use strict'; return (${expression});`)(...values)
}

test('freemium CTA is an exact non-PII checkout URL', () => {
  const { source, file } = parse(['components', 'FreemiumPaywall.tsx'])
  const links = jsxElements(file, 'Link')

  assert.equal(links.length, 1, 'FreemiumPaywall must expose one checkout Link')
  const href = attributeMap(links[0]).get('href')
  assert.ok(href?.initializer && ts.isStringLiteral(href.initializer), 'checkout href must be a static string')
  assert.equal(href.initializer.text, '/checkout?plan=C')
  assert.equal(source.includes('checkoutQuery'), false)
  assert.equal(source.includes('sessionStorage'), false)
})

test('free-tool pages do not pass checkout query data and keep current public-claims disclosures', () => {
  const pages = [
    ['app', 'tools', 'name', 'page.tsx'],
    ['app', 'tools', 'bazi', 'page.tsx'],
    ['app', 'tools', 'ziwei', 'page.tsx'],
  ]

  for (const path of pages) {
    const { source, file } = parse(path)
    const paywalls = jsxElements(file, 'FreemiumPaywall')

    assert.equal(paywalls.length, 1, `${path.join('/')} must render one FreemiumPaywall`)
    assert.equal(attributeMap(paywalls[0]).has('checkoutQuery'), false, `${path.join('/')} must not pass checkoutQuery`)
    assert.equal(paywalls[0].getText(file).includes('URLSearchParams'), false)
    assert.equal(source.includes('sessionStorage'), false)
    assert.match(source, /PUBLIC_CLAIMS\.tools/u)
    assert.match(source, /PUBLIC_CLAIMS\.privacy\.freeToolAnalytics/u)
  }
})

test('free-tool APIs retain only anonymous aggregate tracking payloads', () => {
  const routes = [
    {
      path: ['app', 'api', 'free-name', 'route.ts'],
      clientName: 'free-name',
      aiExpression: '!!aiAnalysis',
      falseScope: { aiAnalysis: '' },
      trueScope: { aiAnalysis: 'analysis' },
    },
    {
      path: ['app', 'api', 'free-bazi', 'route.ts'],
      clientName: 'free-bazi',
      aiExpression: 'Object.keys(aiSections).length > 0',
      falseScope: { aiSections: {} },
      trueScope: { aiSections: { summary: 'analysis' } },
    },
    {
      path: ['app', 'api', 'free-ziwei', 'route.ts'],
      clientName: 'free-ziwei',
      aiExpression: '!!aiAnalysis',
      falseScope: { aiAnalysis: '' },
      trueScope: { aiAnalysis: 'analysis' },
    },
  ]

  for (const route of routes) {
    const { file } = parse(route.path, ts.ScriptKind.TS)
    const stringLiterals = []
    walk(file, (node) => {
      if (ts.isStringLiteral(node)) stringLiterals.push(node.text)
    })
    assert.equal(stringLiterals.includes('user_analytics'), false, `${route.path.join('/')} must not write user_analytics`)

    const payloads = trackedInsertPayloads(file, 'free_tool_usage')
    assert.equal(payloads.length, 1, `${route.path.join('/')} must write one aggregate usage event`)

    const properties = objectProperties(payloads[0])
    assert.deepEqual([...properties.keys()].sort(), ['birth_year', 'client_name', 'gender', 'has_ai_result'])

    const clientName = properties.get('client_name')
    assert.ok(clientName && ts.isStringLiteral(clientName))
    assert.equal(clientName.text, route.clientName)
    assert.equal(properties.get('birth_year')?.kind, ts.SyntaxKind.NullKeyword)
    assert.equal(properties.get('gender')?.kind, ts.SyntaxKind.NullKeyword)

    const aiResult = properties.get('has_ai_result')
    assert.ok(aiResult)
    const aiExpression = aiResult.getText(file)
    assert.equal(aiExpression, route.aiExpression)
    assert.equal(evaluateExpression(aiExpression, route.falseScope), false)
    assert.equal(evaluateExpression(aiExpression, route.trueScope), true)
  }
})
