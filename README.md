# Верстак

Настольное приложение для чертежей под замер. Claude рисует чертёж детали с буквенными размерами и кладёт его в библиотеку, пользователь вводит замеры штангенциркулем, Claude забирает цифры из файла и строит модель в OpenSCAD.

- Стек: Tauri 2 (Rust) + Vite + TypeScript без фреймворка, движок WebView2.
- Библиотека: `D:\Verstak\<деталь>\` (меняется в приложении), см. [docs/format.md](docs/format.md).
- Обмен только через файлы: `drawing.json` пишет Claude, `measurements.json` пишет приложение.

## Команды

```powershell
npm install
npm test                 # тесты ядра (vitest)
npm run coverage
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml   # тесты Rust-части
npm run tauri dev        # приложение в режиме разработки
npm run exe              # src-tauri/target/release/verstak.exe (без установщика)
npm run dev              # только интерфейс в браузере, на демо-данных
```

Инструменты для Claude:

```powershell
node tools/validate.ts D:\Verstak\easel-bracket
node tools/preview.ts D:\Verstak\easel-bracket out.png --active A
```

## Устройство

```
src/core/      формат, проверка, рендерер JSON→SVG, логика замеров (без DOM, общий для приложения и tools)
src/app/       интерфейс: библиотека, окно детали, связь с Rust
src-tauri/     чтение/атомарная запись файлов, слежение за папкой, настройки
tools/         validate.ts, preview.ts (PNG через resvg)
examples/      кронштейн полочки мольберта
```
