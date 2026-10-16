# Отчёт: запуск Raincheck в Kubernetes

## Использованные абстракции Kubernetes

- **Namespace `raincheck`** объединяет ресурсы приложения.
- **Deployment** запускают PostgreSQL, backend API и frontend. Для каждого задана одна реплика.
- **Service** предоставляет постоянные сетевые имена внутри кластера: `postgres:5432`, `api:3000` и `web:80`.
- **Job `migrate`** один раз применяет миграции Prisma и завершается. API запускается после успешного выполнения Job.
- **Secret `raincheck-env`** хранит пароль PostgreSQL и URL подключения.

## Взаимодействие сервисов

Пользователь открывает frontend через `kubectl port-forward` к Service `web`. Nginx раздаёт Angular-приложение и перенаправляет запросы `/api/` на Service `api:3000`. Backend обрабатывает запросы и подключается к PostgreSQL через Service `postgres:5432`.

Перед запуском API Job `migrate` подключается к той же базе и применяет Prisma-миграции. API и миграции получают URL базы из Secret. Все ресурсы находятся в Namespace `raincheck`, поэтому сервисы обращаются друг к другу по именам Service.
