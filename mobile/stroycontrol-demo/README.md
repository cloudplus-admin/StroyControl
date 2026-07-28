# StroyControl — демо-APK

Визуальные макеты из `../../design/` (иконки, анимации, фон), упакованные
через [Capacitor](https://capacitorjs.com) в нативную Android-оболочку
(WebView), чтобы посмотреть дизайн приложения на телефоне.

**Это не production-приложение.** Экраны статичны, без связи с backend/API —
только визуальная демонстрация UI/UX для обсуждения с командой и заказчиком.
Полноценное мобильное приложение (офлайн-режим, геолокация, QR-сканер,
голосовой ввод — раздел 13 ТЗ) описано в `../README.md` как отдельная задача
Этапа 1 на React Native.

## Структура

- `www/` — копия экранов из `design/` (index.html = список объектов)
- `android/` — нативный Android-проект (Capacitor)
- `capacitor.config.json` — appId `com.cloudplus.stroycontrol.demo`

## Пересборка APK

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug
# результат: android/app/build/outputs/apk/debug/app-debug.apk
```

Требуются JDK 17+ и Android SDK (`ANDROID_HOME`/`local.properties`).

## Установка на телефон

Скачать `app-debug.apk`, разрешить установку из неизвестных источников,
установить. Debug-сборка не подписана релизным ключом — для публикации в
Google Play потребуется release-сборка с подписью.
