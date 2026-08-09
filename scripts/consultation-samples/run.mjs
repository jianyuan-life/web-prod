import { pathToFileURL } from 'node:url'
import { parseCliArguments, HELP_TEXT } from './cli.mjs'
import { runSampleHarness, verifyReplayDirectory } from './index.mjs'

export async function main(argumentsList = process.argv.slice(2), environment = process.env) {
  const options = parseCliArguments(argumentsList, environment)
  if (options.help) {
    process.stdout.write(HELP_TEXT)
    return 0
  }
  if (options.verifyDirectory) {
    const verification = await verifyReplayDirectory(options.verifyDirectory)
    process.stdout.write(`${JSON.stringify({
      mode: 'verify',
      valid: verification.valid,
      issueCount: verification.issues.length,
      issues: verification.issues,
    })}\n`)
    return verification.valid ? 0 : 2
  }
  const result = await runSampleHarness(options)
  process.stdout.write(`${JSON.stringify({
    mode: result.mode,
    asOfDate: result.asOfDate,
    targetYear: result.targetYear,
    outputRoot: result.outputRoot,
    peopleCount: result.people.length,
    artifactCount: result.plannedArtifacts.length,
    fetchCount: result.fetchCount,
    reusedCount: result.reusedCount,
  })}\n`)
  return 0
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  main().then((exitCode) => {
    process.exitCode = exitCode
  }).catch((error) => {
    process.stderr.write(`sample harness failed: ${error.message}\n`)
    process.exitCode = 1
  })
}
