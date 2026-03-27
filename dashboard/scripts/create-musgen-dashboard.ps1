$connectionId = "9e676718-1cf4-408d-b54f-11b881941e6d"
$connectionType = "postgres"
$W = 580; $H = 400; $GAP = 24

function pos($col, $row) {
    return @{ x = $col * ($W + $GAP); y = $row * ($H + $GAP) }
}

function makeNode($id, $title, $chartName, $vizType, $tableKey, $mapping, $col, $row) {
    return @{
        id       = $id
        type     = "chart"
        name     = $chartName
        title    = $title
        position = pos $col $row
        size     = @{ width = $W; height = $H }
        data     = @{
            kind           = "db-table"
            connectionId   = $connectionId
            connectionType = $connectionType
            tableKey       = $tableKey
            chartName      = $chartName
            columnMapping  = $mapping
            chartConfig    = @{ general = @{ vizType = $vizType } }
            columnsMeta    = @()
        }
    }
}

$nodes = @(
    # Row 0 - KPI cards
    (makeNode "node_kpi_users"   "Total Users"        "KPI: Total Users"       "kpi"  "musgen.chat"             @{ yColumns=@(@{col="id";agg="COUNT"}); detailsColumns=@() } 0 0),
    (makeNode "node_kpi_gen"     "Total Generations"  "KPI: Total Generations" "kpi"  "musgen.music_generation" @{ yColumns=@(@{col="id";agg="COUNT"}); detailsColumns=@() } 1 0),
    (makeNode "node_kpi_rev"     "Total Revenue RUB"  "KPI: Total Revenue"     "kpi"  "musgen.payment"          @{ yColumns=@(@{col="amount_value";agg="SUM"}); detailsColumns=@() } 2 0),

    # Row 1 - Line charts
    (makeNode "node_line_users"  "New Users per Day"    "Line Chart: New Users per Day"    "line" "musgen.chat"             @{ xColumn="created_at"; yColumns=@(@{col="id";agg="COUNT"}); groupBy="" } 0 1),
    (makeNode "node_line_gen"    "Generations per Day"  "Line Chart: Generations per Day"  "line" "musgen.music_generation" @{ xColumn="created_at"; yColumns=@(@{col="id";agg="COUNT"}); groupBy="" } 1 1),
    (makeNode "node_line_rev"    "Revenue per Day"      "Line Chart: Revenue per Day"      "line" "musgen.payment"          @{ xColumn="created_at"; yColumns=@(@{col="amount_value";agg="SUM"}); groupBy="" } 2 1),

    # Row 2 - Bar + Pie
    (makeNode "node_bar_status"  "Generations by Status"  "Bar Chart: Generations by Status" "bar"  "musgen.music_generation" @{ xColumn="status";     yColumns=@(@{col="id";agg="COUNT"}); groupBy="" } 0 2),
    (makeNode "node_bar_err"     "Errors by Type"         "Bar Chart: Errors by Type"        "bar"  "musgen.music_generation" @{ xColumn="error_type"; yColumns=@(@{col="id";agg="COUNT"}); groupBy="" } 1 2),
    (makeNode "node_pie_free"    "Free vs Paid"           "Pie Chart: Free vs Paid"          "pie"  "musgen.user_music_generation_cost" @{ groupBy="is_free"; xColumn="is_free"; yColumns=@(@{col="music_generation_id";agg="COUNT"}) } 2 2)
)

$projectId = "project_musgen_datalens_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$body = @{
    id          = $projectId
    name        = "Musgen Analytics"
    description = "Musgen dashboard: users, generations, revenue, statuses. DataLens dywbxwlualpix parity."
    thumbnail   = ""
    nodes       = $nodes
    viewport    = @{ pan=@{x=-12;y=-12}; zoom=0.75 }
} | ConvertTo-Json -Depth 20 -Compress

$response = Invoke-RestMethod `
    -Uri "http://localhost:3000/api/projects" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

if ($response.ok) {
    Write-Host ""
    Write-Host "Project created!" -ForegroundColor Green
    Write-Host "   ID:     $($response.project.id)"
    Write-Host "   Name:   $($response.project.name)"
    Write-Host "   Charts: $($nodes.Count)"
    Write-Host ""
    Write-Host "Open: http://localhost:3000  -> My Projects -> Musgen Analytics" -ForegroundColor Cyan
} else {
    Write-Host "ERROR: $($response | ConvertTo-Json)" -ForegroundColor Red
}
