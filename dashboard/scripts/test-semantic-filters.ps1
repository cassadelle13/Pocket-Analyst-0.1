param(
  [string]$ProjectId = 'project_1771280519979_wsr421553',
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$SemanticModelId = ''
)

$ErrorActionPreference = 'Stop'

# Silence noisy progress output from Invoke-WebRequest
$ProgressPreference = 'SilentlyContinue'

function PostJson([string]$Url, $Obj) {
  $json = $Obj | ConvertTo-Json -Depth 50
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-WebRequest -Uri $Url -Method POST -ContentType 'application/json; charset=utf-8' -Body $bytes -UseBasicParsing
}

function ReadErrorBody($Exception) {
  try {
    $resp = $Exception.Response
    if (-not $resp) { return $null }
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    return $sr.ReadToEnd()
  } catch {
    return $null
  }
}

function ParseJsonOrNull([string]$Text) {
  try { return ($Text | ConvertFrom-Json) } catch { return $null }
}

function GetProp($Obj, [string]$Name) {
  try {
    if ($null -eq $Obj) { return $null }
    if ($Obj.PSObject.Properties.Name -contains $Name) { return $Obj.$Name }
    return $null
  } catch { return $null }
}

function FilterLabel($f) {
  $scope = [string](GetProp $f 'scope')
  $pageKey = [string](GetProp $f 'pageKey')
  $src = [string](GetProp $f 'sourceChartId')
  $field = [string](GetProp $f 'field')
  $op = [string](GetProp $f 'op')
  $vals = GetProp $f 'values'
  $valsStr = if ($vals -and ($vals -is [System.Array])) { ($vals | ForEach-Object { [string]$_ }) -join ',' } else { [string]$vals }
  return "$scope|pk=$pageKey|src=$src|$field|$op|$valsStr"
}

function HasFilter($filters, [string]$scope, [string]$pageKey, [string]$sourceChartId) {
  foreach ($f in @($filters)) {
    $s = [string](GetProp $f 'scope')
    $pk = [string](GetProp $f 'pageKey')
    $sc = [string](GetProp $f 'sourceChartId')
    if ($s -ne $scope) { continue }
    if ($pageKey -ne "__any__" -and $pk -ne $pageKey) { continue }
    if ($sourceChartId -ne "__any__" -and $sc -ne $sourceChartId) { continue }
    return $true
  }
  return $false
}

$semanticModelId = [string]$SemanticModelId
if (-not $semanticModelId) {
  $semanticModelId = [string]$env:SEMANTIC_MODEL_ID
}

if (-not $semanticModelId) {
  try {
    $bindingRaw = Invoke-WebRequest -Uri "$BaseUrl/api/semantic/binding?projectId=$ProjectId" -Method GET -UseBasicParsing
    $bindingObj = ParseJsonOrNull ([string]$bindingRaw.Content)
    if (-not $bindingObj) { throw "binding endpoint returned non-JSON" }
    if (-not $bindingObj.data.binding) { throw "No semantic binding for projectId=$ProjectId" }
    $semanticModelId = [string]$bindingObj.data.binding.semantic_model_id
  } catch {
    $body = ReadErrorBody $_.Exception
    $hint = if ($body) { $body } else { $_.Exception.Message }
    throw "Failed to resolve semanticModelId from binding endpoint. Pass -SemanticModelId <id> or set env:SEMANTIC_MODEL_ID. Details: $hint"
  }
}

$model = 'user_music_generation_cost'

$reportField = "$model.chat_id"
$pageFieldP1 = "$model.is_demo"
$pageFieldP2 = "$model.music_generation_id"
$visualFieldC1 = "$model.is_free"
$visualFieldC2 = "$model.created_at"

$timeField = $visualFieldC2

$globalFilters = @(
  @{ scope='report'; field=$reportField; op='neq'; values=@('___never___') },
  @{ scope='page'; pageKey='p1'; field=$pageFieldP1; op='eq'; values=@('1') },
  @{ scope='page'; pageKey='p2'; field=$pageFieldP2; op='neq'; values=@('___never___') },
  @{ scope='visual'; sourceChartId='c1'; field=$visualFieldC1; op='eq'; values=@('1') },
  @{ scope='visual'; sourceChartId='c2'; field=$visualFieldC2; op='gte'; values=@('2026-01-01T00:00:00Z') }
)

# Slicer-like filters (op=in). These emulate canvas slicers writing BiFilters.
$slicerFilters = @(
  @{ name='slicer.page.in(p1)'; filter=@{ scope='page'; pageKey='p1'; sourceChartId='s1'; field=$pageFieldP2; op='in'; values=@('___never___') } },
  @{ name='slicer.visual.in(c1)'; filter=@{ scope='visual'; sourceChartId='c1'; field=$visualFieldC1; op='in'; values=@('1') } }
)

# Slicer-like date filters (op=between/gte/lte). These emulate date-range slicers.
$slicerDateFilters = @(
  @{ name='slicer.page.date.between(p1)'; filter=@{ scope='page'; pageKey='p1'; sourceChartId='s_date'; field=$timeField; op='between'; values=@('2026-01-01T00:00:00Z','2026-12-31T23:59:59Z') } },
  @{ name='slicer.page.date.gte(p1)'; filter=@{ scope='page'; pageKey='p1'; sourceChartId='s_date'; field=$timeField; op='gte'; values=@('2026-01-01T00:00:00Z') } },
  @{ name='slicer.page.date.lte(p1)'; filter=@{ scope='page'; pageKey='p1'; sourceChartId='s_date'; field=$timeField; op='lte'; values=@('2026-12-31T23:59:59Z') } }
)

$slicerVisualDateFilters = @(
  @{ name='slicer.visual.date.between(c1)'; filter=@{ scope='visual'; sourceChartId='c1'; field=$timeField; op='between'; values=@('2026-01-01T00:00:00Z','2026-12-31T23:59:59Z') } },
  @{ name='slicer.visual.date.gte(c1)'; filter=@{ scope='visual'; sourceChartId='c1'; field=$timeField; op='gte'; values=@('2026-01-01T00:00:00Z') } },
  @{ name='slicer.visual.date.lte(c1)'; filter=@{ scope='visual'; sourceChartId='c1'; field=$timeField; op='lte'; values=@('2026-12-31T23:59:59Z') } }
)

$timeFilters = @(
  @{ name='time.gte'; filter=@{ scope='report'; field=$timeField; op='gte'; values=@('2026-01-01T00:00:00Z') } },
  @{ name='time.lte'; filter=@{ scope='report'; field=$timeField; op='lte'; values=@('2026-12-31T23:59:59Z') } },
  @{ name='time.between'; filter=@{ scope='report'; field=$timeField; op='between'; values=@('2026-01-01T00:00:00Z','2026-12-31T23:59:59Z') } }
)

$cases = @(
  @{ name='ctx(c1,p1)'; requestContext=@{ chartId='c1'; pageKey='p1' }; expect='report + page(p1) + visual(c1)' },
  @{ name='ctx(c9,p1)'; requestContext=@{ chartId='c9'; pageKey='p1' }; expect='report + page(p1)' },
  @{ name='ctx(c1,p9)'; requestContext=@{ chartId='c1'; pageKey='p9' }; expect='report + visual(c1)' },
  @{ name='ctx(chartOnly=c1)'; requestContext=@{ chartId='c1' }; expect='report + visual(c1)' },
  @{ name='ctx(chartOnly=c9)'; requestContext=@{ chartId='c9' }; expect='report only (no visual(c1), no page(p1))' },
  @{ name='ctx(pageOnly=p1)'; requestContext=@{ pageKey='p1' }; expect='report + page(p1)' },
  @{ name='ctx(tabOnly=tab:1)'; requestContext=@{ pageKey='tab:1' }; expect='report only (no page filters for tab:1 configured)' },
  @{ name='ctx(tabOnly=tab:2)'; requestContext=@{ pageKey='tab:2' }; expect='report only (no page filters for tab:2 configured)' },
  @{ name='ctx(empty)'; requestContext=@{}; expect='back-compat: all filters (report+all pages+all visuals)' }
)

$queryResults = @()
$valuesResults = @()

$queryResults += [pscustomobject]@{ case='sentinel'; status=0; mergedCount=0 }
$valuesResults += [pscustomobject]@{ case='sentinel'; status=0; mergedCount=0 }

foreach ($c in $cases) {
  $req = @{ 
    projectId=$ProjectId
    semanticModelId=$semanticModelId
    query=@{ sourceModel=$model; dimensions=@($reportField); measures=@(); limit=5 }
    globalContext=@{ filters=$globalFilters }
    requestContext=$c.requestContext
    debug=$true
    compileOnly=$true
  }

  try {
    $raw = PostJson "$BaseUrl/api/semantic/query" $req
    $obj = ParseJsonOrNull ([string]$raw.Content)
    $mf = @($obj.debug.scopedGlobalFilters)
    $sql = [string]$obj.debug.sql

    $expectOk = $true
    if ($c.name -eq 'ctx(empty)') { $expectOk = $true }
    elseif ($c.name -eq 'ctx(c1,p1)') {
      $expectOk = (HasFilter $mf 'report' '__any__' '__any__') -and (HasFilter $mf 'page' 'p1' '__any__') -and (HasFilter $mf 'visual' '__any__' 'c1')
    }
    elseif ($c.name -eq 'ctx(c9,p1)') {
      $expectOk = (HasFilter $mf 'report' '__any__' '__any__') -and (HasFilter $mf 'page' 'p1' '__any__') -and (-not (HasFilter $mf 'visual' '__any__' 'c1'))
    }
    elseif ($c.name -eq 'ctx(c1,p9)') {
      $expectOk = (HasFilter $mf 'report' '__any__' '__any__') -and (-not (HasFilter $mf 'page' 'p1' '__any__')) -and (HasFilter $mf 'visual' '__any__' 'c1')
    }
    elseif ($c.name -eq 'ctx(chartOnly=c9)') {
      $expectOk = (HasFilter $mf 'report' '__any__' '__any__') -and (-not (HasFilter $mf 'page' 'p1' '__any__')) -and (-not (HasFilter $mf 'visual' '__any__' 'c1'))
    }
    elseif ($c.name -eq 'ctx(pageOnly=p1)') {
      $expectOk = (HasFilter $mf 'report' '__any__' '__any__') -and (HasFilter $mf 'page' 'p1' '__any__')
    }
    elseif ($c.name -eq 'ctx(tabOnly=tab:1)') {
      $expectOk = (HasFilter $mf 'report' '__any__' '__any__') -and (-not (HasFilter $mf 'page' '__any__' '__any__'))
    }
    elseif ($c.name -eq 'ctx(tabOnly=tab:2)') {
      $expectOk = (HasFilter $mf 'report' '__any__' '__any__') -and (-not (HasFilter $mf 'page' '__any__' '__any__'))
    }

    $queryResults += [pscustomobject]@{
      case=$c.name
      expect=$c.expect
      status=[int]$raw.StatusCode
      mergedCount=$mf.Count
      mergedLabels=($mf | ForEach-Object { FilterLabel $_ }) -join ' || '
      globalFiltersLabels=(@($obj.debug.globalFilters) | ForEach-Object { FilterLabel $_ }) -join ' || '
      sqlLen=$sql.Length
      sqlPreview= if ($sql.Length -gt 0) { $sql.Substring(0,[Math]::Min(200,$sql.Length)) } else { '' }
      expectOk=$expectOk
      error=$null
    }
  } catch {
    $body = ReadErrorBody $_.Exception
    $errObj = if ($body) { ParseJsonOrNull $body } else { $null }
    $queryResults += [pscustomobject]@{
      case=$c.name
      expect=$c.expect
      status=500
      mergedCount=$null
      mergedLabels=$null
      sqlLen=$null
      sqlPreview=$null
      expectOk=$false
      error= if ($errObj -and $errObj.error) { $errObj.error } else { if ($body) { $body } else { $_.Exception.Message } }
    }
  }
}

foreach ($tf in $timeFilters) {
  foreach ($c in $cases[0..4]) {
    $req = @{ 
      projectId=$ProjectId
      semanticModelId=$semanticModelId
      query=@{ sourceModel=$model; dimensions=@($reportField); measures=@(); limit=5 }
      globalContext=@{ filters=@($tf.filter) }
      requestContext=$c.requestContext
      debug=$true
      compileOnly=$true
    }

    try {
      $raw = PostJson "$BaseUrl/api/semantic/query" $req
      $obj = ParseJsonOrNull ([string]$raw.Content)
      $mf = @($obj.debug.mergedLogicalFilters)
      if ($mf.Count -eq 0) { $mf = @($obj.debug.mergedFilters) }
      $sql = [string]$obj.debug.sql
      $queryResults += [pscustomobject]@{
        case="${($c.name)} + ${($tf.name)}"
        expect='time op should be preserved and rendered in SQL'
        status=[int]$raw.StatusCode
        mergedCount=$mf.Count
        mergedFields=($mf | ForEach-Object { $_.field }) -join ','
        sqlLen=$sql.Length
        sqlPreview= if ($sql.Length -gt 0) { $sql.Substring(0,[Math]::Min(250,$sql.Length)) } else { '' }
        error=$null
      }
    } catch {
      $body = ReadErrorBody $_.Exception
      $errObj = if ($body) { ParseJsonOrNull $body } else { $null }
      $queryResults += [pscustomobject]@{
        case="${($c.name)} + ${($tf.name)}"
        expect='time op should be preserved and rendered in SQL'
        status=500
        mergedCount=$null
        mergedFields=$null
        sqlLen=$null
        sqlPreview=$null
        error= if ($errObj -and $errObj.error) { $errObj.error } else { if ($body) { $body } else { $_.Exception.Message } }
      }
    }
  }
}

# Slicer cases: verify that op=in is preserved and scoping rules apply.
foreach ($sf in $slicerFilters) {
  foreach ($c in $cases[0..4]) {
    $req = @{ 
      projectId=$ProjectId
      semanticModelId=$semanticModelId
      query=@{ sourceModel=$model; dimensions=@($reportField); measures=@(); limit=5 }
      globalContext=@{ filters=@($sf.filter) }
      requestContext=$c.requestContext
      debug=$true
      compileOnly=$true
    }

    try {
      $raw = PostJson "$BaseUrl/api/semantic/query" $req
      $obj = ParseJsonOrNull ([string]$raw.Content)
      $mf = @($obj.debug.scopedGlobalFilters)
      $sql = [string]$obj.debug.sql

      $expectOk = $true
      if ($sf.name -eq 'slicer.page.in(p1)') {
        if ($c.name -eq 'ctx(c1,p1)' -or $c.name -eq 'ctx(c9,p1)' -or $c.name -eq 'ctx(pageOnly=p1)') {
          $expectOk = (HasFilter $mf 'page' 'p1' 's1')
        } elseif ($c.name -eq 'ctx(c1,p9)') {
          $expectOk = (-not (HasFilter $mf 'page' 'p1' 's1'))
        } elseif ($c.name -eq 'ctx(chartOnly=c1)' -or $c.name -eq 'ctx(chartOnly=c9)') {
          $expectOk = (-not (HasFilter $mf 'page' 'p1' 's1'))
        }
      }
      elseif ($sf.name -eq 'slicer.visual.in(c1)') {
        if ($c.name -eq 'ctx(c1,p1)' -or $c.name -eq 'ctx(chartOnly=c1)') {
          $expectOk = (HasFilter $mf 'visual' '__any__' 'c1')
        } elseif ($c.name -eq 'ctx(c9,p1)' -or $c.name -eq 'ctx(chartOnly=c9)') {
          $expectOk = (-not (HasFilter $mf 'visual' '__any__' 'c1'))
        }
      }

      $queryResults += [pscustomobject]@{
        case="${($c.name)} + ${($sf.name)}"
        expect='slicer op=in should be preserved; scope should apply correctly'
        requestContext=($c.requestContext | ConvertTo-Json -Compress)
        status=[int]$raw.StatusCode
        mergedCount=$mf.Count
        mergedLabels=($mf | ForEach-Object { FilterLabel $_ }) -join ' || '
        globalFiltersLabels=(@($obj.debug.globalFilters) | ForEach-Object { FilterLabel $_ }) -join ' || '
        sqlLen=$sql.Length
        sqlPreview= if ($sql.Length -gt 0) { $sql.Substring(0,[Math]::Min(250,$sql.Length)) } else { '' }
        expectOk=$expectOk
        error=$null
      }
    } catch {
      $body = ReadErrorBody $_.Exception
      $errObj = if ($body) { ParseJsonOrNull $body } else { $null }
      $queryResults += [pscustomobject]@{
        case="${($c.name)} + ${($sf.name)}"
        expect='slicer op=in should be preserved; scope should apply correctly'
        requestContext=($c.requestContext | ConvertTo-Json -Compress)
        status=500
        mergedCount=$null
        mergedLabels=$null
        globalFiltersLabels=$null
        sqlLen=$null
        sqlPreview=$null
        expectOk=$false
        error= if ($errObj -and $errObj.error) { $errObj.error } else { if ($body) { $body } else { $_.Exception.Message } }
      }
    }
  }
}

# Slicer date-range cases: verify that op=between/gte/lte is preserved, scoped, and rendered in SQL.
foreach ($sf in $slicerDateFilters) {
  foreach ($c in $cases[0..4]) {
    $req = @{ 
      projectId=$ProjectId
      semanticModelId=$semanticModelId
      query=@{ sourceModel=$model; dimensions=@($reportField); measures=@(); limit=5 }
      globalContext=@{ filters=@($sf.filter) }
      requestContext=$c.requestContext
      debug=$true
      compileOnly=$true
    }

    try {
      $raw = PostJson "$BaseUrl/api/semantic/query" $req
      $obj = ParseJsonOrNull ([string]$raw.Content)
      $mf = @($obj.debug.scopedGlobalFilters)
      $sql = [string]$obj.debug.sql

      $expectOk = $true
      if ($c.name -eq 'ctx(c1,p1)' -or $c.name -eq 'ctx(c9,p1)' -or $c.name -eq 'ctx(pageOnly=p1)') {
        $expectOk = (HasFilter $mf 'page' 'p1' 's_date') -and ($sql -match 'WHERE')
      } elseif ($c.name -eq 'ctx(c1,p9)' -or $c.name -eq 'ctx(chartOnly=c1)' -or $c.name -eq 'ctx(chartOnly=c9)') {
        $expectOk = (-not (HasFilter $mf 'page' 'p1' 's_date')) -and (-not ($sql -match 'created_at'))
      }

      if ($expectOk -and ($c.name -eq 'ctx(c1,p1)' -or $c.name -eq 'ctx(c9,p1)' -or $c.name -eq 'ctx(pageOnly=p1)')) {
        if ($sf.filter.op -eq 'between') { $expectOk = $sql -match 'BETWEEN' }
        elseif ($sf.filter.op -eq 'gte') { $expectOk = $sql -match '>=' }
        elseif ($sf.filter.op -eq 'lte') { $expectOk = $sql -match '<=' }
      }

      $queryResults += [pscustomobject]@{
        case="${($c.name)} + ${($sf.name)}"
        expect='slicer date op should be preserved; page scope should apply; SQL should include predicate'
        requestContext=($c.requestContext | ConvertTo-Json -Compress)
        status=[int]$raw.StatusCode
        mergedCount=$mf.Count
        mergedLabels=($mf | ForEach-Object { FilterLabel $_ }) -join ' || '
        globalFiltersLabels=(@($obj.debug.globalFilters) | ForEach-Object { FilterLabel $_ }) -join ' || '
        sqlLen=$sql.Length
        sqlPreview= if ($sql.Length -gt 0) { $sql.Substring(0,[Math]::Min(250,$sql.Length)) } else { '' }
        expectOk=$expectOk
        error=$null
      }
    } catch {
      $body = ReadErrorBody $_.Exception
      $errObj = if ($body) { ParseJsonOrNull $body } else { $null }
      $queryResults += [pscustomobject]@{
        case="${($c.name)} + ${($sf.name)}"
        expect='slicer date op should be preserved; page scope should apply; SQL should include predicate'
        requestContext=($c.requestContext | ConvertTo-Json -Compress)
        status=500
        mergedCount=$null
        mergedLabels=$null
        globalFiltersLabels=$null
        sqlLen=$null
        sqlPreview=$null
        expectOk=$false
        error= if ($errObj -and $errObj.error) { $errObj.error } else { if ($body) { $body } else { $_.Exception.Message } }
      }
    }
  }
}

# Visual-scoped slicer date-range cases
foreach ($sf in $slicerVisualDateFilters) {
  foreach ($c in $cases[0..4]) {
    $req = @{ 
      projectId=$ProjectId
      semanticModelId=$semanticModelId
      query=@{ sourceModel=$model; dimensions=@($reportField); measures=@(); limit=5 }
      globalContext=@{ filters=@($sf.filter) }
      requestContext=$c.requestContext
      debug=$true
      compileOnly=$true
    }

    try {
      $raw = PostJson "$BaseUrl/api/semantic/query" $req
      $obj = ParseJsonOrNull ([string]$raw.Content)
      $mf = @($obj.debug.scopedGlobalFilters)
      $sql = [string]$obj.debug.sql

      $expectOk = $true
      if ($c.name -eq 'ctx(c1,p1)' -or $c.name -eq 'ctx(chartOnly=c1)' -or $c.name -eq 'ctx(c1,p9)') {
        $expectOk = (HasFilter $mf 'visual' '__any__' 'c1') -and ($sql -match 'WHERE')
      } elseif ($c.name -eq 'ctx(c9,p1)' -or $c.name -eq 'ctx(chartOnly=c9)') {
        $expectOk = (-not (HasFilter $mf 'visual' '__any__' 'c1')) -and (-not ($sql -match 'created_at'))
      }

      if ($expectOk -and ($c.name -eq 'ctx(c1,p1)' -or $c.name -eq 'ctx(chartOnly=c1)' -or $c.name -eq 'ctx(c1,p9)')) {
        if ($sf.filter.op -eq 'between') { $expectOk = $sql -match 'BETWEEN' }
        elseif ($sf.filter.op -eq 'gte') { $expectOk = $sql -match '>=' }
        elseif ($sf.filter.op -eq 'lte') { $expectOk = $sql -match '<=' }
      }

      $queryResults += [pscustomobject]@{
        case="${($c.name)} + ${($sf.name)}"
        expect='visual slicer date op should be preserved; visual scope should apply only to matching chartId; SQL should include predicate'
        requestContext=($c.requestContext | ConvertTo-Json -Compress)
        status=[int]$raw.StatusCode
        mergedCount=$mf.Count
        mergedLabels=($mf | ForEach-Object { FilterLabel $_ }) -join ' || '
        globalFiltersLabels=(@($obj.debug.globalFilters) | ForEach-Object { FilterLabel $_ }) -join ' || '
        sqlLen=$sql.Length
        sqlPreview= if ($sql.Length -gt 0) { $sql.Substring(0,[Math]::Min(250,$sql.Length)) } else { '' }
        expectOk=$expectOk
        error=$null
      }
    } catch {
      $body = ReadErrorBody $_.Exception
      $errObj = if ($body) { ParseJsonOrNull $body } else { $null }
      $queryResults += [pscustomobject]@{
        case="${($c.name)} + ${($sf.name)}"
        expect='visual slicer date op should be preserved; visual scope should apply only to matching chartId; SQL should include predicate'
        requestContext=($c.requestContext | ConvertTo-Json -Compress)
        status=500
        mergedCount=$null
        mergedLabels=$null
        globalFiltersLabels=$null
        sqlLen=$null
        sqlPreview=$null
        expectOk=$false
        error= if ($errObj -and $errObj.error) { $errObj.error } else { if ($body) { $body } else { $_.Exception.Message } }
      }
    }
  }
}

foreach ($c in $cases[0..4]) {
  $vreq = @{ 
    projectId=$ProjectId
    semanticModelId=$semanticModelId
    field=$reportField
    search='x'
    limit=10
    globalContext=@{ filters=$globalFilters }
    requestContext=$c.requestContext
    debug=$true
    compileOnly=$true
  }

  try {
    $raw = PostJson "$BaseUrl/api/semantic/values" $vreq
    $obj = ParseJsonOrNull ([string]$raw.Content)
    $gf = @($obj.debug.globalFilters)
    $mlf = @($obj.debug.mergedLogicalFilters)
    $valuesResults += [pscustomobject]@{
      case=$c.name
      status=[int]$raw.StatusCode
      globalFiltersCount=$gf.Count
      globalFiltersLabels=($gf | ForEach-Object { FilterLabel $_ }) -join ' || '
      mergedLogicalCount=$mlf.Count
      mergedLogicalLabels=($mlf | ForEach-Object { FilterLabel $_ }) -join ' || '
      sqlLen=([string]$obj.debug.sql).Length
      error=$null
    }
  } catch {
    $body = ReadErrorBody $_.Exception
    $errObj = if ($body) { ParseJsonOrNull $body } else { $null }
    $valuesResults += [pscustomobject]@{
      case=$c.name
      status=500
      globalFiltersCount=$null
      globalFiltersLabels=$null
      mergedLogicalCount=$null
      mergedLogicalLabels=$null
      sqlLen=$null
      error= if ($errObj -and $errObj.error) { $errObj.error } else { if ($body) { $body } else { $_.Exception.Message } }
    }
  }
}

Write-Host "\n=== M4-1 Отчёт (page/tab + visual scoping) ===" -ForegroundColor Cyan
foreach ($r in $queryResults) {
  if ($r.case -eq 'sentinel') { continue }
  $expectOkVal = if ($r.PSObject.Properties.Name -contains 'expectOk') { [bool]$r.expectOk } else { $true }
  $ok = if ($expectOkVal -eq $true -and [int]$r.status -eq 200) { 'OK' } else { 'FAIL' }
  Write-Host ("{0,-18} | {1,3} | {2,-4} | merged={3,2} | {4}" -f $r.case, $r.status, $ok, $r.mergedCount, $r.expect)
  if ($r.mergedLabels) {
    Write-Host ("  merged: {0}" -f $r.mergedLabels)
  }
  if ($r.globalFiltersLabels) {
    Write-Host ("  raw:    {0}" -f $r.globalFiltersLabels)
  }
  if ($ok -eq 'FAIL' -and $r.requestContext) {
    Write-Host ("  ctx: {0}" -f $r.requestContext)
  }
  if ($r.sqlPreview) {
    Write-Host ("  sql: {0}" -f $r.sqlPreview)
  }
}

Write-Host "\n=== RU Summary ===" -ForegroundColor Cyan
Write-Host "  case          | RU (query) | RU (values)"
Write-Host "  --------------|------------|------------"
foreach ($r in $queryResults) {
  if ($r.case -eq 'sentinel') { continue }
  $valuesRu = (($valuesResults | Where-Object { $_.case -eq $r.case } | Select-Object -First 1).sqlLen)
  Write-Host ("  {0,-12} | {1,10} | {2,10}" -f $r.case, $r.sqlLen, $valuesRu)
}

@{ 
  projectId=$ProjectId
  semanticModelId=$semanticModelId
  model=$model
  reportField=$reportField
  queryResultsCount=$queryResults.Count
  valuesResultsCount=$valuesResults.Count
  query=$queryResults
  values=$valuesResults
} | ConvertTo-Json -Depth 50
