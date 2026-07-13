# Vendor: `@oai/artifact-tool`

Този zip съдържа частния Codex пакет `@oai/artifact-tool` (с вложените му зависимости), за да може presentation build-ът да работи **без Codex cache**.

| Файл | Съдържание |
|------|------------|
| `artifact-tool.zip` | Папка `artifact-tool/` (~15 MB compressed) |

## Възстановяване

```powershell
powershell -File presentation/build/setup-deps.ps1
```

Скриптът разопакова zip-а в `presentation/build/node_modules/@oai/artifact-tool`, ако липсва Codex cache.

## Обновяване на vendor zip

Само при нова версия на tool-а или при смяна на машина с по-пълен install:

```powershell
$src = "presentation\build\node_modules\@oai\artifact-tool"
$zip = "presentation\build\vendor\artifact-tool.zip"
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $src -DestinationPath $zip -CompressionLevel Optimal
```

След това commit на `artifact-tool.zip`.

## Лиценз / видимост

Пакетът е private Codex dependency — vendor-ът е за **вътрешно** ползване в този repo, не за публично разпространение извън екипа.
