---
name: verstak
description: Чертежи под замер в приложении «Верстак» (D:\Projects\verstak, библиотека D:\Verstak). Use when the user wants a measurement drawing of a physical part (from a photo) to fill in with calipers, asks to put a drawing into Verstak/верстак, or asks to read entered measurements and build an OpenSCAD model from them.
---

# Верстак: чертёж под замер → замеры → OpenSCAD

Пользователь печатает на 3D-принтере. Рабочий процесс:
фото детали → ты делаешь чертёж с буквенными размерами → пользователь меряет штангенциркулем в приложении «Верстак» → ты читаешь цифры из файла и строишь модель в OpenSCAD.

- Исходники приложения: `D:\Projects\verstak`. Формат файлов: `D:\Projects\verstak\docs\format.md` — прочитай перед первым чертежом.
- Библиотека деталей: `D:\Verstak\<id>\` (путь можно поменять в приложении; актуальный — в `%APPDATA%\dev.verstak.app\settings.json`).
- Пример: `D:\Projects\verstak\examples\easel-bracket\drawing.json`.
- Exe: `D:\Projects\verstak\src-tauri\target\release\verstak.exe`.

## Сделать чертёж

1. Создай `D:\Verstak\<id>\drawing.json` (`id` — латиница через дефис, совпадает с `"id"` в файле). Пиши UTF-8 без BOM (инструмент Write).
2. Буквы `A…Z`, затем `t1, t2, R1…`. Группируй параметры по смыслу; посадочные размеры — в группу с `"critical": true`.
3. Каждому параметру — понятный `label`, по возможности `approx` (оценка по фото) и проверочные суммы в label («Проверка: D+E+F»).
4. Проверь:
   ```
   node D:\Projects\verstak\tools\validate.ts D:\Verstak\<id>
   node D:\Projects\verstak\tools\preview.ts D:\Verstak\<id> <scratchpad>\preview.png
   ```
   Открой PNG и посмотри глазами: подписи не налезают, выносные линии идут к нужным кромкам. `--active A` подсвечивает один размер.
5. Скажи пользователю, что деталь появилась в Верстаке.

## Изменить чертёж (новая ревизия)

1. Скопируй текущий файл в `.history\drawing.r<N>.json`, если такого ещё нет (приложение тоже архивирует, но только когда открыто).
2. Увеличь `revision`, в `changes` коротко напиши, что поменялось.
3. Не переименовывай буквы, которые уже измерены: значения привязаны к `id`. Удалённый параметр не теряет значение, оно показывается в «Значениях из прошлых ревизий».
4. Снова validate + preview.

## Забрать замеры

- Читай `D:\Verstak\<id>\measurements.json`. Не пиши в него — это файл приложения.
- `status: "done"` — пользователь закончил. Иначе можно работать с тем, что есть, но назови пустые параметры.
- `drawingRevision` < `revision` чертежа — пользователь ещё не видел новую ревизию.
- Учитывай `comment` (материал, сопло, что нарисовано неверно).
- Сверь проверочные суммы (например, A ≈ D+E+F+G+H+I) и сообщи о расхождениях до моделирования.

## Модель OpenSCAD

- OpenSCAD 2021.01: `C:\Program Files\OpenSCAD\openscad.exe`.
- Клади `model.scad` в папку детали. В начале файла — блок параметров с теми же буквами (`A = 55.2; // Длина полки`), чтобы цифры можно было подставить через `-D A=…`.
- Проверяй рендером: `openscad.exe -o <scratchpad>\render.png --imgsize=1200,900 --viewall --autocenter model.scad`, затем STL: `-o model.stl`.
