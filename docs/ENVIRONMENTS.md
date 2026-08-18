# Окружения, CI/CD, бэкапы

## Окружения

| Окружение | Назначение | Ветка |
|---|---|---|
| dev | разработка, нестабильно | `develop` |
| staging | демо для заказчика перед приёмкой этапа (раздел 19 ТЗ) | `release/*` |
| prod | боевая эксплуатация | `main` |

Конфигурация окружения передаётся через переменные окружения (`.env`, см.
`backend/.env.example`), секреты — через GitHub Actions Secrets / секрет-менеджер
целевого облака (провайдер не выбран, см. ARCHITECTURE.md).

## CI/CD

CI настроен в `.github/workflows/ci.yml`: на каждый PR — установка зависимостей,
линт и сборка backend и web. Деплой в staging/prod добавляется отдельным workflow
после выбора облачного провайдера (не входит в Этап 0 — нужны реальные учётные
данные провайдера).

## Бэкапы

Требование раздела 15 ТЗ: резервное копирование, доступность 99.9%, режим 24/7.
До выбора облачного провайдера зафиксирован план:
- ежедневный снапшот PostgreSQL с хранением 30 дней;
- версионирование объектного хранилища (S3) — защита от случайного удаления медиа;
- еженедельная проверка восстановления из бэкапа на staging.

Локальный/серверный сценарий уже реализован в `backend/scripts/backup.sh`.
Он создает консистентный дамп PostgreSQL, архив каталога загрузок и SHA-256
контрольные суммы, затем удаляет каталоги старше `BACKUP_RETENTION_DAYS`.
Проверка целостности выполняется `backend/scripts/verify-backup.sh BACKUP_DIR`.
Полная проверка восстановления выполняется только в отдельную тестовую базу:

```bash
POSTGRES_CONTAINER=stroycontrol-test-postgres \
POSTGRES_USER=stroycontrol \
RESTORE_DATABASE=stroycontrol_restore_20260810 \
backend/scripts/restore-backup-test.sh backups/production/20260809T222127Z
```

Скрипт намеренно принимает только имя базы с префиксом
`stroycontrol_restore_`, восстанавливает дамп, проверяет наличие таблиц и
распаковывает uploads во временный каталог. Тестовая база остается для ручной
проверки и удаляется оператором после приемки.
Если PostgreSQL работает в Docker, укажи `POSTGRES_CONTAINER`,
`POSTGRES_USER` и `POSTGRES_DB`; иначе на хосте нужны `pg_dump` и `pg_restore`.
Для production установи `stroycontrol-backup.service` и
`stroycontrol-backup.timer` из `deploy/systemd/`. Еженедельную проверку полного
восстановления запускают `stroycontrol-restore-test.service` и соответствующий
timer. Каталог бэкапа нужно дополнительно копировать на другой узел.

`GET /health` проверяет соединение с PostgreSQL, доступность каталога загрузок и
минимальный остаток диска (`MIN_UPLOAD_FREE_BYTES`). При проблеме возвращает 503.

Для регулярной проверки API установи `stroycontrol-healthcheck.service` и
`stroycontrol-healthcheck.timer` из `deploy/systemd/`. Timer вызывает health-check
каждые пять минут, а systemd сохраняет неуспех в журнале и статусе unit. Внешнее
оповещение следует подключить к failed unit средствами мониторинга сервера.

После копирования unit-файлов включи все расписания одной командой:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stroycontrol-maintenance.timer \
  stroycontrol-backup.timer stroycontrol-restore-test.timer \
  stroycontrol-healthcheck.timer
systemctl list-timers 'stroycontrol-*'
```

## Серверные процедуры

Команда `npm run maintenance` обрабатывает все компании: помечает просроченные
задачи и создает ежедневные экземпляры повторяющихся задач. После `npm run build`
установи файлы из `deploy/systemd/` в `/etc/systemd/system/`, проверь пути и
пользователя в service-файле, затем выполни:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stroycontrol-maintenance.timer
systemctl list-timers stroycontrol-maintenance.timer
```
