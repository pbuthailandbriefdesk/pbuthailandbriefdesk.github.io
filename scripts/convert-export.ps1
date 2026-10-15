<#
  Converts data/sharepoint_export.json (raw SharePoint REST items) into
    - data/seed.json            rows keyed by Supabase table, used by demo mode
    - supabase/seed/NN_*.sql    INSERT files to load into Supabase

  Run from the project folder:
    powershell -ExecutionPolicy Bypass -File scripts\convert-export.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$inv = [Globalization.CultureInfo]::InvariantCulture
$utf8 = New-Object Text.UTF8Encoding($false)

$export = Get-Content (Join-Path $root 'data\sharepoint_export.json') -Raw -Encoding UTF8 | ConvertFrom-Json

# SharePoint list -> table, and SharePoint field -> column:type
# Types: t = text, n = number, d = date only (Bangkok calendar day), ts = timestamp
$maps = [ordered]@{
  DeskTeam = @{ table = 'desk_team'; cols = [ordered]@{ Title='email:t'; field_1='name:t'; field_2='role:t'; field_3='team:t' } }
  Brands = @{ table = 'brands'; cols = [ordered]@{ Title='brand_name:t'; AdvertiserName='advertiser_name:t'; AdvertiserID='advertiser_id:t'; BrandCode='brand_code:t' } }
  Holidays = @{ table = 'holidays'; cols = [ordered]@{ Title='holiday_name:t'; HolidayDate='holiday_date:d' } }
  SdfDefaults = @{ table = 'sdf_defaults'; cols = [ordered]@{ Title='title:t'; Value='value:t'; Note='note:t' } }
  Briefs = @{ table = 'briefs'; cols = [ordered]@{
    Title='brief_id:t'; field_1='brief_version:n'; field_2='status:t'; field_3='team:t'; field_4='brand:t'
    field_6='campaign_name:t'; field_7='campaign_taxonomy:t'; field_8='planner_email:t'; field_9='planner_name:t'
    field_10='launch_date:d'; field_11='end_date:d'; field_12='objective:t'; field_13='kpi_model:t'; field_14='kpi_target:n'
    field_15='po_number:t'; field_16='po_amount:n'; field_17='po_link:t'; field_18='total_budget:n'; field_19='buying_type:t'
    field_20='deal_id:t'; field_21='tracking:t'; field_22='is_test:t'; field_23='test_design:t'; field_24='handover_needed:t'
    field_25='handover_notes:t'; field_26='brand_safety:t'; field_27='reporting:t'; field_28='is_exception:t'
    field_29='exception_approver:t'; field_30='notes:t'; field_31='lead_time_wd:n'; field_38='ad_ops_email:t'
    field_39='buyer_email:t'; field_40='gatekeeper_email:t'; field_41='gate_result:t'; field_42='gate_gaps:t'
    field_43='gate_attempts:n'; field_44='passed_first_time:t'; field_45='revisions_major:n'; field_46='revisions_minor:n'
    field_47='taxonomy_fixes:n'; field_48='post_launch_naming_fixes:n'; SubmittedAt='submitted_at:ts'; SentToAOAt='sent_to_ao_at:ts'
    TaxonomyDoneAt='taxonomy_done_at:ts'; GateRepliedAt='gate_replied_at:ts'; LockedAt='locked_at:ts'; SetupDoneAt='setup_done_at:ts'
    Advertiser='advertiser:t'; BuyerName='buyer_name:t'; BuyerAcceptedAt='buyer_accepted_at:ts'; AdvertiserName='advertiser_name:t'
    Category='category:t'; Franchise='franchise:t'; CampaignDesc='campaign_desc:t'; CampaignOther='campaign_other:t'
    BriefType='brief_type:t'; EffectiveDate='effective_date:d'; Geo='geo:t'; BrandLift='brand_lift:t'; BLSNotes='bls_notes:t'
    DV360CampaignId='dv360_campaign_id:t'; Resubmits='resubmits:n' } }
  BriefEvents = @{ table = 'brief_events'; cols = [ordered]@{ Title='brief_id:t'; field_1='event:t'; field_2='by_email:t'; field_4='detail:t'; At='at:ts' } }
  BriefIOs = @{ table = 'brief_ios'; cols = [ordered]@{
    Title='brief_id:t'; IONo='io_no:n'; IOName='io_name:t'; Channel='channel:t'; IOType='io_type:t'; BuyingType='buying_type:t'
    DealID='deal_id:t'; Budget='budget:n'; StartDate='start_date:d'; EndDate='end_date:d'; Pacing='pacing:t'; FreqCap='freq_cap:t'
    KPIModel='kpi_model:t'; KPITarget='kpi_target:n'; Verification='verification:t'; Notes='notes:t'; IOFormat='io_format:t'
    IOObjective='io_objective:t'; IOOther='io_other:t'; Action='action:t'; DV360Id='dv360_id:t'; SegmentStart='segment_start:d'
    SegmentEnd='segment_end:d'; PriorBudget='prior_budget:n'; FreqExposures='freq_exposures:n'; FreqPeriod='freq_period:t' } }
  BriefLines = @{ table = 'brief_lines'; cols = [ordered]@{
    Title='brief_id:t'; field_1='line_no:n'; field_2='format:t'; field_3='inventory:t'; field_4='audience:t'; field_5='budget:n'
    field_6='start_date:d'; field_7='end_date:d'; field_8='creative:t'; field_9='landing_url:t'; field_10='io_name:t'
    field_11='line_item_name:t'; IONo='io_no:n'; BidStrategy='bid_strategy:t'; BidTarget='bid_target:n'; Exclusions='exclusions:t'
    DealType='deal_type:t'; PublisherName='publisher_name:t'; YTLIType='yt_li_type:t'; AudTargeting='aud_targeting:t'
    AudTactic='aud_tactic:t'; Gender='gender:t'; AgeMin='age_min:n'; AgeMax='age_max:n'; Language='language:t'; Device='device:t'
    Environment='environment:t'; Dims='dims:t'; Sustainability='sustainability:t'; ServiceDisc='service_disc:t'; Action='action:t'
    DV360Id='dv360_id:t' } }
  BriefAdGroups = @{ table = 'brief_ad_groups'; cols = [ordered]@{
    Title='brief_id:t'; IONo='io_no:n'; LineNo='line_no:n'; AGNo='ag_no:n'; AdGroupName='ad_group_name:t'; Audience='audience:t'
    Demographics='demographics:t'; Notes='notes:t'; AudTargeting='aud_targeting:t'; AudTactic='aud_tactic:t'; Gender='gender:t'
    AgeMin='age_min:n'; AgeMax='age_max:n'; Language='language:t'; VideoAdFormat='video_ad_format:t'; AGOther='ag_other:t'
    Action='action:t'; DV360Id='dv360_id:t'; SdfAffinity='sdf_affinity:t'; SdfAudInclude='sdf_aud_include:t'
    SdfAudExclude='sdf_aud_exclude:t'; SdfCustomList='sdf_custom_list:t'; BidCost='bid_cost:n' } }
  BriefAds = @{ table = 'brief_ads'; cols = [ordered]@{
    Title='brief_id:t'; IONo='io_no:n'; LineNo='line_no:n'; AGNo='ag_no:n'; AdNo='ad_no:n'; AdName='ad_name:t'; AssetURL='asset_url:t'
    VideoLength='video_length:n'; CreativeSize='creative_size:t'; LandingURL='landing_url:t'; DisplayURL='display_url:t'; CTA='cta:t'
    Headline='headline:t'; Description='description:t'; AssetDesc='asset_desc:t'; AssetSource='asset_source:t'; AdFormat='ad_format:t'
    CTACode='cta_code:t'; Skippable='skippable:t'; AdBuyingType='ad_buying_type:t'; Rotation='rotation:t'; Redirect='redirect:t'
    Retailer='retailer:t'; AdOther='ad_other:t'; Action='action:t'; DV360Id='dv360_id:t'; Description2='description2:t' } }
}

function To-BangkokDate([string]$iso) {
  $dt = [DateTimeOffset]::Parse($iso, $inv).ToOffset([TimeSpan]::FromHours(7))
  return $dt.ToString('yyyy-MM-dd', $inv)
}
function To-Iso([string]$iso) {
  return [DateTimeOffset]::Parse($iso, $inv).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", $inv)
}
function Sql-Lit($v, [string]$type) {
  if ($null -eq $v) { return 'null' }
  switch ($type) {
    'n' { return ([double]$v).ToString('R', $inv) }
    'j' { return "'" + ($v -replace "'", "''") + "'::jsonb" }
    default { return "'" + ([string]$v -replace "'", "''") + "'" }
  }
}

$seed = [ordered]@{ exportedAt = $export.exportedAt; source = $export.site }
$seedDir = Join-Path $root 'supabase\seed'
New-Item -ItemType Directory -Force $seedDir | Out-Null
Get-ChildItem $seedDir -Filter *.sql | Remove-Item
$n = 0
$summary = @()

foreach ($list in $maps.Keys) {
  $m = $maps[$list]; $table = $m.table
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($item in @($export.items.$list)) {
    if ($null -eq $item) { continue }
    $row = [ordered]@{ id = [long]$item.ID }
    $legacy = [ordered]@{}
    foreach ($c in $m.cols.Values) { $row[$c.Split(':')[0]] = $null }
    foreach ($p in $item.PSObject.Properties) {
      $k = $p.Name; $v = $p.Value
      if ($k -in 'ID') { continue }
      if ($k -eq 'Created') { $row['created_at'] = To-Iso $v; continue }
      if ($k -eq 'Modified') { $row['modified_at'] = To-Iso $v; continue }
      if ($m.cols.Contains($k)) {
        $col, $type = $m.cols[$k].Split(':')
        switch ($type) {
          'd' { $row[$col] = To-BangkokDate $v }
          'ts' { $row[$col] = To-Iso $v }
          'n' { $row[$col] = [double]$v }
          default { $row[$col] = [string]$v }
        }
      } else { $legacy[$k] = $v }
    }
    $row['sp_legacy'] = if ($legacy.Count) { $legacy } else { $null }
    $rows.Add($row)
  }
  $seed[$table] = $rows
  $summary += "{0,-16} {1,4} rows" -f $table, $rows.Count

  # SQL
  $n++
  $file = Join-Path $seedDir ('{0:00}_{1}.sql' -f $n, $table)
  $sb = New-Object Text.StringBuilder
  [void]$sb.AppendLine("-- $table : $($rows.Count) rows from SharePoint list '$list' (export $($export.exportedAt))")
  if ($rows.Count -gt 0) {
    $cols = @('id') + @($m.cols.Values | ForEach-Object { $_.Split(':')[0] }) + @('created_at', 'modified_at', 'sp_legacy')
    $types = @{ id = 'n'; created_at = 't'; modified_at = 't'; sp_legacy = 'j' }
    foreach ($c in $m.cols.Values) { $cn, $ct = $c.Split(':'); $types[$cn] = if ($ct -eq 'n') { 'n' } else { 't' } }
    $batch = 100
    for ($i = 0; $i -lt $rows.Count; $i += $batch) {
      [void]$sb.AppendLine("insert into public.$table (" + ($cols -join ', ') + ") values")
      $chunk = $rows[$i..([Math]::Min($i + $batch, $rows.Count) - 1)]
      $vals = foreach ($r in $chunk) {
        $parts = foreach ($c in $cols) {
          $v = $r[$c]
          if ($c -eq 'sp_legacy' -and $null -ne $v) { $v = ($v | ConvertTo-Json -Compress -Depth 5) }
          Sql-Lit $v $types[$c]
        }
        '  (' + ($parts -join ', ') + ')'
      }
      [void]$sb.AppendLine(($vals -join ",`r`n") + ';')
    }
  }
  [void]$sb.AppendLine("select setval(pg_get_serial_sequence('public.$table', 'id'), coalesce((select max(id) from public.$table), 0) + 1, false);")
  [IO.File]::WriteAllText($file, $sb.ToString(), $utf8)
}

$json = $seed | ConvertTo-Json -Depth 6 -Compress
[IO.File]::WriteAllText((Join-Path $root 'data\seed.json'), $json, $utf8)
$summary
"Wrote data\seed.json and $n files in supabase\seed"
