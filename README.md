# imageprompt

Next.js лендинг **imageprompt.tools** (STV / ImagePrompt, **`landing/`**) и Chrome-расширение Steal This Vibe (**`extension/`**). Вынесено из монорепо **aiphoto** (вариант A, см. `docs/requirements/30-03-variant-a-landing-extension-new-repo.md`).

**Репозиторий GitHub:** [github.com/azarovmaxim/imageprompt](https://github.com/azarovmaxim/imageprompt) — если репозиторий ещё пустой, создай его на GitHub, затем:

```bash
cd /path/to/imageprompt
git remote add origin git@github.com:azarovmaxim/imageprompt.git
git push -u origin main
```

## Локальная разработка (лендинг)

```bash
cd landing
npm install
npm run build:stv-web   # или сразу npm run build
npm run dev             # http://localhost:3001
```

Соседний каталог **`extension/sidepanel`** нужен для `npm run build:stv-web` (см. `landing/scripts/build-stv-web.mjs`). В Docker используется зеркало **`landing/stv-web-sidepanel/`** — после правок в `extension/sidepanel/` из `landing/` выполни `npm run sync:stv-sidepanel` и закоммить зеркало.

## Docker

Контекст сборки — только **`landing/`**:

```bash
docker build -f landing/Dockerfile ./landing
```

Детали: `.cursor/rules/landing-docker-next-standalone.mdc` (скопировано из aiphoto).

## Документация

- `docs/requirements/` — требования по домену **imageprompt.tools** и план выноса.
- Ссылки на `docs/architecture/01-landing.md` в старых документах относятся к монорепо **aiphoto** до переноса архитектурного файла сюда.

## Переменные окружения

Шаблон: `landing/.env.example`. Секреты не коммитить.
