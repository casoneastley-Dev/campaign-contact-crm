# Minimal static file server for local development on Windows
# (alternative to `python3 -m http.server` when Python isn't installed).
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8000]
param([int]$Port = 8000)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json"
  ".webmanifest" = "application/manifest+json"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
  ".md"   = "text/markdown; charset=utf-8"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($path -eq "") { $path = "index.html" }
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $path))
      if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and
          (Test-Path -LiteralPath $full -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
        else { $ctx.Response.ContentType = "application/octet-stream" }
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      else {
        $ctx.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      }
    }
    catch { $ctx.Response.StatusCode = 500 }
    finally { $ctx.Response.Close() }
  }
}
finally { $listener.Stop() }
