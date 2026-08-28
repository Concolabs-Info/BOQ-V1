param(
  [string]$Database = "quanto",
  [string]$User = "postgres",
  [string]$PsqlPath = "psql"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

if ($PsqlPath -eq "psql") {
  $command = Get-Command psql -ErrorAction SilentlyContinue
  if ($command) {
    $PsqlPath = $command.Source
  } elseif (Test-Path "E:\Softwares\PostgreSQL-17\bin\psql.exe") {
    $PsqlPath = "E:\Softwares\PostgreSQL-17\bin\psql.exe"
  } else {
    throw "psql was not found. Pass -PsqlPath with the full path to psql.exe."
  }
}

$migrations = Get-ChildItem (Join-Path $Root "database\migrations\*.sql") | Sort-Object Name
foreach ($migration in $migrations) {
  Write-Host "Applying $($migration.Name)..."
  & $PsqlPath -v ON_ERROR_STOP=1 -U $User -d $Database -f $migration.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "Migration failed: $($migration.Name)"
  }
}

Write-Host "Quanto database schemas are up to date." -ForegroundColor Green
