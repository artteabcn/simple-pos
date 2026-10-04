# The repo lives in OneDrive, which breaks npm installs and locks build folders.
# This copies the source to a plain folder, runs the requested npm script there, and leaves OneDrive clean.
#   usage:  .\scripts\mirror.ps1 test        (or: build | check | dev | "install")
param([Parameter(Mandatory = $true)][string]$Task)

$src = Split-Path -Parent $PSScriptRoot
$dst = Join-Path $env:USERPROFILE "_mig\simple-pos-saas"
New-Item -ItemType Directory -Force $dst | Out-Null

# The lockfile is kept in the mirror (not purged) and copied back to the repo after an install.
robocopy $src $dst /MIR /XD node_modules dist .astro .wrangler /XF .env package-lock.json /NFL /NDL /NJH /NJS /NP | Out-Null
$srcLock = Join-Path $src "package-lock.json"
if (Test-Path $srcLock) { Copy-Item $srcLock (Join-Path $dst "package-lock.json") -Force }

Set-Location $dst
if (-not (Test-Path (Join-Path $dst "node_modules"))) { npm install --no-audit --no-fund }
if ($Task -eq "install") { npm install --no-audit --no-fund } else { npm run $Task }
if (Test-Path (Join-Path $dst "package-lock.json")) { Copy-Item (Join-Path $dst "package-lock.json") $srcLock -Force }
# `db:generate` writes SQL migrations in the mirror: bring them back into the repo.
if ($Task -eq "db:generate" -and (Test-Path (Join-Path $dst "migrations"))) {
  robocopy (Join-Path $dst "migrations") (Join-Path $src "migrations") /E /NFL /NDL /NJH /NJS /NP | Out-Null
}
