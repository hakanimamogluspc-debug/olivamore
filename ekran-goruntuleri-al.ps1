# Olivamore reklam videosu için site ekran görüntüleri (Chrome/Edge headless, 2x çözünürlük)
# Çalıştır: powershell -ExecutionPolicy Bypass -File ".\ekran-goruntuleri-al.ps1"
$ErrorActionPreference = 'Continue'
$cikis = Join-Path $PSScriptRoot 'reklam-ekran-goruntuleri'
New-Item -ItemType Directory -Force -Path $cikis | Out-Null

$adaylar = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$tarayici = $adaylar | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $tarayici) { Write-Host "Chrome veya Edge bulunamadi." -ForegroundColor Red; exit 1 }
Write-Host "Tarayici: $tarayici"

$S = 'https://olivamore.com'
# ad, adres, genislik, yukseklik, olcek
$cekimler = @(
  @('01-anasayfa',            "$S/?sunum=1",                                  1440, 900, 2),
  @('02-menu-kategoriler',    "$S/?sunum=menu",                               1440, 900, 2),
  @('03-koleksiyon',          "$S/koleksiyon?sunum=1",                        1440, 900, 2),
  @('04-arama',               "$S/koleksiyon?sunum=ara&q=teneke",             1440, 900, 2),
  @('05-urun-sayfasi',        "$S/p?id=ay500&sunum=1",                        1440, 900, 2),
  @('06-cesnili-yaglar',      "$S/koleksiyon?sunum=1#cesnili-zeytinyaglari",  1440, 900, 2),
  @('07-uretici-uydu-harita', "$S/ureticiler?sunum=1#bahce-liste",            1440, 900, 2),
  @('08-tarif-asistani',      "$S/tarif-asistani?sunum=1",                    1440, 900, 2),
  @('09-abonelik',            "$S/abonelik?sunum=1",                          1440, 900, 2),
  @('10-kendi-setini-olustur',"$S/hediye-olustur?sunum=1",                    1440, 900, 2),
  @('11-sepet',               "$S/sepet?sunum=sepet",                         1440, 900, 2),
  @('12-kalite-oduller',      "$S/kalite?sunum=1",                            1440, 900, 2),
  @('m01-mobil-anasayfa',     "$S/?sunum=1",                                  390,  844, 3),
  @('m02-mobil-koleksiyon',   "$S/koleksiyon?sunum=1",                        390,  844, 3),
  @('m03-mobil-urun',         "$S/p?id=ay500&sunum=1",                        390,  844, 3)
)

foreach ($c in $cekimler) {
  $dosya = Join-Path $cikis ($c[0] + '.png')
  $profil = Join-Path $env:TEMP ('om-ss-' + [guid]::NewGuid().ToString('N'))
  $arg = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
           "--user-data-dir=`"$profil`"", "--window-size=$($c[2]),$($c[3])", "--force-device-scale-factor=$($c[4])",
           '--virtual-time-budget=15000', "--screenshot=`"$dosya`"", "`"$($c[1])`"")
  if ($c[2] -lt 500) { $arg = @('--user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"') + $arg }
  Start-Process -FilePath $tarayici -ArgumentList $arg -Wait -WindowStyle Hidden
  Remove-Item -Recurse -Force $profil -ErrorAction SilentlyContinue
  if (Test-Path $dosya) { Write-Host ("OK   " + $c[0]) -ForegroundColor Green } else { Write-Host ("HATA " + $c[0]) -ForegroundColor Red }
}
Write-Host "`nBitti: $cikis"
Invoke-Item $cikis
