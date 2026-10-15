param([string]$File, [int[]]$Lines)
# Turns a Power Fx CSV-building Concat into: a template with {n} placeholders + the list of field expressions.
$all = Get-Content $File -Encoding UTF8
foreach ($ln in $Lines) {
  $s = $all[$ln - 1].Trim()
  $s = $s.Replace('Char(34) & Char(34)', 'QQ').Replace('Char(34)', 'Q').Replace('Char(13) & Char(10)', '"<CRLF>"')
  $out = New-Object System.Text.StringBuilder
  $exprs = New-Object System.Collections.Generic.List[string]
  $i = 0
  # skip to the first field token or string literal after the row-iterator prefix
  $start = $s.IndexOf('Q & Substitute(')
  $lit = $s.IndexOf('"""')
  if ($lit -ge 0 -and ($start -lt 0 -or $lit -lt $start)) { $start = $lit }
  $i = $start
  while ($i -lt $s.Length) {
    if ($s.Substring($i).StartsWith('Q & Substitute(')) {
      $j = $i + 'Q & Substitute('.Length; $depth = 1; $inStr = $false; $b = $j
      while ($depth -gt 0) {
        $c = $s[$j]
        if ($c -eq '"') { $inStr = -not $inStr }
        elseif (-not $inStr) { if ($c -eq '(') { $depth++ } elseif ($c -eq ')') { $depth-- } }
        $j++
      }
      $inner = $s.Substring($b, $j - 1 - $b)
      $inner = $inner -replace ',\s*Q,\s*QQ$', ''
      [void]$out.Append('{' + $exprs.Count + '}'); $exprs.Add($inner)
      $i = $j
      if ($s.Substring($i).StartsWith(' & Q')) { $i += 4 }
    } elseif ($s[$i] -eq '"') {
      $j = $i + 1; $sb = New-Object System.Text.StringBuilder
      while ($true) {
        if ($s[$j] -eq '"' -and $j + 1 -lt $s.Length -and $s[$j + 1] -eq '"') { [void]$sb.Append('"'); $j += 2; continue }
        if ($s[$j] -eq '"') { break }
        [void]$sb.Append($s[$j]); $j++
      }
      [void]$out.Append($sb.ToString()); $i = $j + 1
    } elseif ($s.Substring($i).StartsWith(' & ')) { $i += 3 }
    else { break }
  }
  "=== LINE $ln  (stopped at: " + $s.Substring($i, [Math]::Min(60, $s.Length - $i)) + ")"
  "TEMPLATE: " + $out.ToString()
  for ($k = 0; $k -lt $exprs.Count; $k++) { "  {$k} " + $exprs[$k] }
}
