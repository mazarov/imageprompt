# 30-09 — Разбор фото по паттерну кадра (imageprompt.tools)

> Дата: 2026-09-30
> Ветка: `feature/30-09-analyze-pattern-router`
> Источник: promptshot.ru (`aiphoto`), `docs/30-09-analyze-pattern-router.md`

`POST /api/extension/analyze` (Extension Lite, AI Image Describer) при флаге
`landing_generation_config.analyze_pattern_router_enabled = 'true'` выбирает паттерн
кадра `person | object | layout | scene` и носитель `photo | illustration | graphic | 3d`
и пишет только секции этого паттерна. Иначе — прежний 12-секционный photoreal extract
с хвостом «preserve face».

## Что общее с promptshot.ru

- Один Supabase-проект: флаг и колонки `analyze_history.analyze_pattern` /
  `analyze_medium` уже созданы миграцией `261` в репозитории `aiphoto`. Здесь SQL нет.
- `landing/src/lib/analyze-pattern.ts` — **дословная копия** модуля из `aiphoto`.
  Без импортов из проекта. Правки вносить в обоих репозиториях, затем
  `diff` на идентичность.

## Что меняется в роуте

- До 2 попыток по 22 с; `thinkingBudget` 0 при роутере (256 на старом пути).
- Ответ парсится (`Pattern:` / `Medium:` в первых строках), раскладка секций
  нормализуется (`Lighting: текст` → `Lighting:\nтекст`), затем валидируется:
  все секции паттерна, ни одной чужой, без «not applicable». Отказ → `REJECTED:`
  суффикс и вторая попытка; обе неудачны → 502, квота возвращается.
- `CRITICAL RULES` — под паттерн и носитель; для object / layout / scene лицо не
  сохраняем.
- В JSON ответа добавлены `pattern` и `medium`. Лог `analyze.gemini_response`
  получает `pattern`, `medium`, `attempts`; отказы — `analyze.pattern_rejected`.
- Remix (`/api/extension/remix`) знает заголовки новых секций
  (`Appearance`, `Object`, `Regions`, `Environment`, …) и берёт для них спеки из
  `analyze-pattern.ts`.

## Промт v3 (2026-11-08, секция Rendering во всех паттернах)

- `Rendering` добавлена в `PERSON_SECTIONS`, `OBJECT_SECTIONS`, `SCENE_SECTIONS` сразу после `Genre`.
- `SECTION_SPECS.Rendering` — 2–3 предложения под `Medium`: для `illustration | graphic | 3d` — точная техника (импасто масло/акрил, акварель, тушь, сел-шейдинг, вектор, 3D-шейдер), видимость мазка/штриха, жёсткость граней светотени vs лепка плоскостями, зерно холста/бумаги и степень стилизации/карикатурности пропорций; для `photo` — характер оптики и микротекстуры кожи/зерна.
- `SECTION_SPECS.Appearance`, `Color`, `Avoid` и `patternCriticalRules` синхронизированы с `aiphoto`.

## Проверка после деплоя

```bash
curl -s https://imageprompt.tools/api/extension/analyze -X POST \
  -H 'Content-Type: application/json' -H 'Origin: https://promptshot.ru' \
  -d '{"image_url":"<url>","locale":"ru"}' | jq '{pattern, medium}'
```

В `/admin/analyze-history` promptshot.ru у строк `extension_lite` появляется бейдж паттерна.
