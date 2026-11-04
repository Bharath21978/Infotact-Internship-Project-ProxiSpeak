$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
npm.cmd --prefix frontend test
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }
npm.cmd --prefix frontend run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
} finally { Pop-Location }
