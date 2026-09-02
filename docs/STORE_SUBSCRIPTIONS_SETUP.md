# Настройка покупок

Приложения и сервер используют одинаковые идентификаторы товаров:

- `uz.cloudplus.stroycontrol.one_time_job` - разовая непотребляемая покупка
- `uz.cloudplus.stroycontrol.renovation_monthly` - месячная подписка
- `uz.cloudplus.stroycontrol.houses_monthly` - месячная подписка
- `uz.cloudplus.stroycontrol.commercial_monthly` - месячная подписка

## App Store Connect

Создать один Non-Consumable и одну Subscription Group с тремя Auto-Renewable Subscriptions. На сервере заполнить `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`. Для TestFlight оставить `APPLE_STORE_ENV=sandbox`, перед выпуском переключить на `production`.

## Google Play Console

Создать один In-app product и три Subscriptions с месячными base plans. Сервисному аккаунту дать только право просмотра финансовых данных и управления заказами и подписками. На сервере заполнить `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PLAY_PRIVATE_KEY`, `GOOGLE_PLAY_PACKAGE_NAME`.

Цены задаются только в App Store Connect и Google Play Console. Сервер принимает только четыре идентификатора из фиксированного списка, повторно проверяет чек напрямую у магазина и не позволяет привязать один чек к двум компаниям.
