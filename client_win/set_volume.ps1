param([int]$Volume)

if ($Volume -lt 0) { $Volume = 0 }
if ($Volume -gt 100) { $Volume = 100 }

$wsh = New-Object -ComObject WScript.Shell

# Mettre le volume système à 0% (50 réductions successives de 2%)
for ($i = 0; $i -lt 50; $i++) {
    $wsh.SendKeys([char]174)
}

# Augmenter le volume jusqu'au pourcentage cible (1 augmentation = 2%)
$steps = [math]::Round($Volume / 2)
for ($i = 0; $i -lt $steps; $i++) {
    $wsh.SendKeys([char]175)
}
