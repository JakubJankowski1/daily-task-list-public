$ErrorActionPreference = "Stop"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "Node.js was not found. Install Node.js and add it to PATH."
}

$playwrightCli = Join-Path $PSScriptRoot "..\node_modules\playwright\cli.js"
if (-not (Test-Path -LiteralPath $playwrightCli)) {
  throw "Playwright was not found. Run 'pnpm install' from the repository root first."
}

& $nodeCommand.Source $playwrightCli test @args
exit $LASTEXITCODE
