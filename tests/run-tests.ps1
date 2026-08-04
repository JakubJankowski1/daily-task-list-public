$ErrorActionPreference = "Stop"

$localPlaywright = Join-Path $PSScriptRoot "..\node_modules\playwright\cli.js"
$localNode = Get-Command node -ErrorAction SilentlyContinue
$dependencies = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$bundledNode = Join-Path $dependencies "node\bin\node.exe"
$node = if ($localNode) { $localNode.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode }

if ($node -and (Test-Path -LiteralPath $localPlaywright)) {
  $env:PATH = "$(Split-Path $node);$(Join-Path $dependencies 'bin\fallback');$env:PATH"
  & $node $localPlaywright test @args
  exit $LASTEXITCODE
}

$runtimeModules = Join-Path $dependencies "node\node_modules"
$runtimePlaywright = Join-Path $runtimeModules "playwright\cli.js"

if ((Test-Path -LiteralPath $bundledNode) -and (Test-Path -LiteralPath $runtimePlaywright)) {
  $env:NODE_PATH = $runtimeModules
  $env:PATH = "$(Split-Path $bundledNode);$(Join-Path $dependencies 'bin\fallback');$env:PATH"

  & $bundledNode $runtimePlaywright test @args
  exit $LASTEXITCODE
}

$pnpmModules = Join-Path $dependencies "node\node_modules\.pnpm"
$playwrightPackage = Get-ChildItem -LiteralPath $pnpmModules -Directory -Filter "playwright@*" |
  Sort-Object Name -Descending |
  Select-Object -First 1

if (-not $playwrightPackage -or -not (Test-Path -LiteralPath $bundledNode)) {
  Write-Error "Nie znaleziono Playwrighta. Uruchom najpierw: pnpm install"
}

$moduleRoot = Join-Path $playwrightPackage.FullName "node_modules"
$playwrightCli = Join-Path $moduleRoot "playwright\cli.js"
$env:NODE_PATH = $moduleRoot
$env:PATH = "$(Split-Path $bundledNode);$(Join-Path $dependencies 'bin\fallback');$env:PATH"

& $bundledNode $playwrightCli test @args
exit $LASTEXITCODE
