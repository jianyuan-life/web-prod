import {
  DEFAULT_CALCULATOR_API,
  defaultPrivateOutputRoot,
} from './index.mjs'

function takeValue(argumentsList, index, flag) {
  const value = argumentsList[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} 缺少值`)
  return value
}

export function parseCliArguments(argumentsList, environment = process.env) {
  const options = {
    dryRun: true,
    resume: false,
    outputRoot: defaultPrivateOutputRoot(environment),
    requestedPlans: ['C', 'G15'],
    apiBaseUrl: DEFAULT_CALCULATOR_API,
    verifyDirectory: undefined,
    help: false,
  }
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument === '--run-llm' || argument === '--paid' || argument === '--generate-report') {
      throw new Error('付費 LLM 執行被硬性封鎖；只能由 integration owner 另行啟動')
    }
    if (argument === '--execute') options.dryRun = false
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--resume') options.resume = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--output') {
      options.outputRoot = takeValue(argumentsList, index, argument)
      index += 1
    } else if (argument === '--plans') {
      options.requestedPlans = takeValue(argumentsList, index, argument)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      index += 1
    } else if (argument === '--api-url') {
      options.apiBaseUrl = takeValue(argumentsList, index, argument)
      index += 1
    } else if (argument === '--verify') {
      options.verifyDirectory = takeValue(argumentsList, index, argument)
      index += 1
    } else {
      throw new Error(`未知參數: ${argument}`)
    }
  }
  if (options.resume && options.dryRun) throw new Error('--resume 必須搭配 --execute')
  if (options.verifyDirectory && argumentsList.some((argument) => argument === '--execute')) {
    throw new Error('--verify 與 --execute 不可同時使用')
  }
  return options
}

export const HELP_TEXT = `鑑源 C/G15 授權樣本重放工具

預覽（不連網、不寫檔）:
  node scripts/consultation-samples/run.mjs --dry-run

只讀 Fly 並建立 repo 外的 private replay bundles:
  node scripts/consultation-samples/run.mjs --execute

驗證並重用既有完整 bundles（不重新呼叫 Fly）:
  node scripts/consultation-samples/run.mjs --execute --resume

獨立驗證:
  node scripts/consultation-samples/run.mjs --verify <private-directory>

可用參數:
  --output <directory>  指定 repo 外的輸出目錄
  --plans C,G15        只允許 C、G15
  --api-url <url>      只接受 fortune-reports-api.fly.dev
  --help               顯示本說明

本工具不會執行付費 LLM，也不會產生可對外交付的最終報告。
`
