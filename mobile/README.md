# StroyControl Mobile

Мобильное приложение (раздел 13 ТЗ): единый кроссплатформенный код iOS/Android,
офлайн-режим с автосинхронизацией, геолокация, QR-сканер, голосовой ввод.

## Решение по стеку

Рекомендация: **React Native (Expo)** — переиспользование TS-логики с `web/`,
единый код под iOS/Android, зрелая экосистема офлайн-синхронизации
(WatermelonDB / RxDB) и push-уведомлений.

## Реализовано (первый инкремент): `app/`

Expo (managed workflow) + React Native + TypeScript, структура:
`src/api` (типизированный клиент, `x-company-id`, base URL из
`EXPO_PUBLIC_API_BASE_URL`), `src/screens`, `src/navigation`
(`@react-navigation/native`), `src/offline` (офлайн-очередь), `src/theme`.

Два флагманских экрана, подключённых к реальному backend API (не моки):
- **Объекты** — список (`GET /api/objects`) → карточка объекта со стадиями/
  разделами/задачами и датами (`GET /api/objects/:id/gantt`); без интерактивной
  диаграммы Ганта, просто список с риск-статусом.
- **Задачи — закрытие с фото и геометкой** — список задач объекта (дерево из
  `GET /api/objects/:id`, отдельного эндпоинта списка задач в backend нет),
  экран закрытия: фото (`expo-image-picker`, камера), геометка
  (`expo-location`), отправка на `POST /api/tasks/:id/close`.

Офлайн-очередь (`src/offline/offlineQueue.ts`) — самая важная часть этого
инкремента (раздел 13 ТЗ: «офлайн-режим... критично на стройплощадке»):
класс `OfflineQueue` без каких-либо RN-импортов (enqueue/persist/flush/retry
— чистая логика), RN-обвязка — тонкая (`asyncStorageQueueStorage.ts` для
персистентности, `useTaskCloseQueue.ts` для `@react-native-community/netinfo`
и автоматического flush при восстановлении сети). Если POST не проходит —
задание остаётся в очереди и автоматически повторяется при следующем
подключении к сети или явном flush. Это простой JSON-массив в одном ключе
хранилища, не WatermelonDB/RxDB — для одного сценария (закрытие задачи) этого
достаточно; при добавлении новых офлайн-сценариев стоит рассмотреть более
развитую библиотеку синхронизации.

**Верификация** — выполнено только то, что возможно в headless-окружении без
симулятора/устройства:
- `npm run typecheck` (`tsc --noEmit`) — чисто.
- `npm run lint` (ESLint, тот же набор правил `@typescript-eslint`, что и в
  `backend/`) — чисто.
- `npm test` (vitest, 7 тестов на `OfflineQueue`: enqueue, persist,
  submit-or-queue при успехе/неудаче, flush с частичным успехом, retry на
  следующем flush, hydrate) — все проходят.
- `npx expo-doctor` — 20/20 проверок пройдено.
- Реальный запуск на устройстве/симуляторе, рендер экранов — **не
  проверялись**, симулятора iOS/Android в этом окружении нет.

**Явно не реализовано в этом инкременте**: остальные экраны (лента,
фотоконтроль, документы, кабинет заказчика), голосовой ввод, QR-сканер, push-
уведомления, полноценная офлайн-синхронизация всех сущностей,
загрузка фото на реальный backend (в системе пока нет ни одного эндпоинта
загрузки файлов — `photoUrl` временно содержит локальный URI с устройства).

## Демо-APK (визуальный, не production)

`stroycontrol-demo/` — экраны из `../design/` обёрнуты через Capacitor в
Android-приложение, чтобы посмотреть UI на телефоне уже сейчас, не дожидаясь
React Native разработки. См. `stroycontrol-demo/README.md`.

## Debug-APK из настоящего RN-приложения (`app/`) — CI

Job `mobile-apk` в `.github/workflows/ci.yml` собирает debug-APK реального
Expo/React Native приложения (`expo prebuild --platform android` +
`./gradlew assembleDebug`) на каждый push в `main`, используя только
предустановленные на GitHub-раннере Android SDK/JDK — без EAS Build и без
внешних облачных сервисов сборки.

Как скачать собранный APK:
1. Открыть репозиторий на GitHub → вкладка **Actions**.
2. Выбрать последний зелёный run workflow **CI** (или конкретный commit).
3. В самом низу страницы run — секция **Artifacts** → скачать
   `stroycontrol-debug-apk` (zip с `app-debug.apk` внутри).
4. Либо через `gh` CLI: `gh run download <run-id> -R cloudplus-admin/StroyControl`.

**Важно**: это debug-сборка, подписанная стандартным debug-keystore Android
(не production/Play Store релиз). Годится для установки и демонстрации на
тестовом устройстве, не для публикации в магазине.
