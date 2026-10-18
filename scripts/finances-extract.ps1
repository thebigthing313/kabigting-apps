<#
.SYNOPSIS
Extracts the old Finances Access database, read-only, into the normalised JSON that
`pnpm finances:import` reads (spec section 8).

.DESCRIPTION
The old table and column names live only in scripts/finances-extract.map.json, which is
git-ignored and filled in locally from scripts/finances-extract.map.example.json. This script
names no table, column, path or data of its own. It reads only the mapped columns, writes
categories, schedules, transactions, ledger and balances JSON to exports/finances-extract/, and
prints only file names and row counts. It needs the Microsoft Access ODBC driver.

.EXAMPLE
pwsh scripts/finances-extract.ps1 <path to the Access file>
#>
#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Path,
  [string]$MapPath = (Join-Path $PSScriptRoot 'finances-extract.map.json'),
  [string]$OutDir = (Join-Path (Join-Path (Join-Path $PSScriptRoot '..') 'exports') 'finances-extract')
)
$ErrorActionPreference = 'Stop'
$invariant = [System.Globalization.CultureInfo]::InvariantCulture

# The normalised fields of each file, and how each value is written. Neutral names only.
$fields = [ordered]@{
  categories   = [ordered]@{ id = 'id'; name = 'text' }
  schedules    = [ordered]@{ id = 'id'; name = 'text'; categoryId = 'id' }
  transactions = [ordered]@{
    id = 'id'; scheduleId = 'id'; date = 'date'; amount = 'amount'; note = 'text'
    pending = 'flag'; posted = 'flag'
  }
  ledger       = [ordered]@{
    id = 'id'; isExpense = 'requiredFlag'; transactionId = 'id'; date = 'date'; payee = 'text'
    amount = 'amount'; categoryId = 'id'; note = 'text'; bankDescription = 'text'; bankDate = 'date'
  }
  balances     = [ordered]@{ id = 'id'; enteredAt = 'timestamp'; amount = 'amount' }
}
# Files whose map entry is a list of tables, each with the `kind` its rows carry.
$byKind = @('schedules', 'transactions')

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "No Access file at the given path." }
if (-not (Test-Path -LiteralPath $MapPath -PathType Leaf)) {
  throw "No extract map. Copy scripts/finances-extract.map.example.json to $MapPath and fill it in."
}
$map = Get-Content -LiteralPath $MapPath -Raw | ConvertFrom-Json

function Get-Sources([string]$file) {
  $entry = $map.$file
  if ($null -eq $entry) { throw "The map has no '$file' section." }
  $sources = @($entry)
  if ($byKind -contains $file) {
    foreach ($source in $sources) {
      if (@('expense', 'income') -notcontains $source.kind) {
        throw "Each '$file' table in the map needs a kind of 'expense' or 'income'."
      }
    }
  } elseif ($sources.Count -ne 1) {
    throw "The map's '$file' section must name one table."
  }
  foreach ($source in $sources) {
    if (-not $source.table) { throw "A '$file' entry in the map has no table." }
    foreach ($field in $fields[$file].Keys) {
      if (-not $source.columns.$field) { throw "The map's '$file' table $($source.table) has no column for '$field'." }
    }
  }
  return $sources
}

function Convert-Value($value, [string]$type) {
  if ($null -eq $value -or $value -is [System.DBNull]) {
    if ($type -eq 'flag') { return $false }
    return $null
  }
  switch ($type) {
    'id' { if ($value -is [string]) { return $value } return [long]$value }
    'text' { return [string]$value }
    'flag' { return [bool]$value }
    'requiredFlag' { return [bool]$value }
    'amount' {
      # Currency columns carry four decimals. Whole cents print as dollars and cents; anything
      # finer is kept as it is, so the import refuses it instead of rounding.
      $amount = [decimal]$value
      if ($amount -eq [decimal]::Round($amount, 2)) { return $amount.ToString('0.00', $invariant) }
      return $amount.ToString($invariant)
    }
    'date' { return ([datetime]$value).ToString('yyyy-MM-dd', $invariant) }
    'timestamp' { return ([datetime]$value).ToString('yyyy-MM-ddTHH:mm:ss', $invariant) }
  }
  throw "Unknown field type $type"
}

$connection = New-Object System.Data.Odbc.OdbcConnection
$connection.ConnectionString = "Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=$((Resolve-Path -LiteralPath $Path).ProviderPath);ReadOnly=1;Exclusive=0;"
$connection.Open()
try {
  # Check every mapped table and column against the file's own schema before reading anything.
  $tables = @($connection.GetSchema('Tables').Rows | ForEach-Object { $_['TABLE_NAME'] })
  $plan = [ordered]@{}
  foreach ($file in $fields.Keys) {
    $sources = Get-Sources $file
    foreach ($source in $sources) {
      if ($tables -notcontains $source.table) { throw "The Access file has no table '$($source.table)' (mapped for $file)." }
      # The Access driver has no column schema, so read the names off an empty result.
      $probe = $connection.CreateCommand()
      $probe.CommandText = "SELECT * FROM [$($source.table)] WHERE 1 = 0"
      $reader = $probe.ExecuteReader()
      try {
        $columns = @(for ($i = 0; $i -lt $reader.FieldCount; $i++) { $reader.GetName($i) })
      } finally {
        $reader.Close()
      }
      foreach ($field in $fields[$file].Keys) {
        $column = $source.columns.$field
        if ($columns -notcontains $column) {
          throw "Table '$($source.table)' has no column '$column' (mapped for $file.$field)."
        }
      }
    }
    $plan[$file] = $sources
  }

  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  foreach ($file in $plan.Keys) {
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($source in $plan[$file]) {
      $names = @($fields[$file].Keys)
      $select = ($names | ForEach-Object { "[$($source.columns.$_)]" }) -join ', '
      $command = $connection.CreateCommand()
      $command.CommandText = "SELECT $select FROM [$($source.table)]"
      $reader = $command.ExecuteReader()
      try {
        while ($reader.Read()) {
          $row = [ordered]@{}
          for ($i = 0; $i -lt $names.Count; $i++) {
            $row[$names[$i]] = Convert-Value $reader.GetValue($i) $fields[$file][$names[$i]]
            if ($i -eq 0 -and $byKind -contains $file) { $row['kind'] = $source.kind }
          }
          $rows.Add([pscustomobject]$row)
        }
      } finally {
        $reader.Close()
      }
    }
    $json = ConvertTo-Json -InputObject @($rows.ToArray()) -Depth 3 -Compress
    $target = Join-Path $OutDir "$file.json"
    [System.IO.File]::WriteAllText($target, $json, (New-Object System.Text.UTF8Encoding $false))
    Write-Output "$file.json: $($rows.Count) rows"
  }
} finally {
  $connection.Close()
}
