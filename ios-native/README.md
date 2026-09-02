# Астрой для iOS

Нативное приложение на SwiftUI. Версия синхронизирована с Android 1.0.75, build 88.

## Запуск

1. Установить XcodeGen: `brew install xcodegen`.
2. Выполнить `cd ios-native && xcodegen generate`.
3. Открыть `Astroy.xcodeproj` в Xcode и выбрать команду разработки.

Сейчас реализованы нативный каркас, вход через рабочий API, защищенное хранение сессии в Keychain, восстановление входа, загрузка объектов и задач, списки фотоотчетов и документов, карточка объекта и обновление данных жестом вниз.

## Оплата через App Store

Приложение использует StoreKit 2 и ожидает следующие товары в App Store Connect:

- `uz.cloudplus.stroycontrol.one_time_job` - расходуемая разовая покупка.
- `uz.cloudplus.stroycontrol.renovation_monthly` - месячная подписка.
- `uz.cloudplus.stroycontrol.houses_monthly` - месячная подписка.
- `uz.cloudplus.stroycontrol.commercial_monthly` - месячная подписка.

Цены задаются в App Store Connect и автоматически отображаются в приложении. До создания товаров экран сообщает, что оплата пока недоступна.
