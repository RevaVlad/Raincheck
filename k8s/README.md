# Raincheck в Minikube

Команды выполняйте из корня проекта. Minikube должен быть активен; используются образы `raincheck-api:dev`, `raincheck-web:dev`, `raincheck-migrate:dev` и `raincheck-prober:dev`.

## Секреты

Создайте `k8s/.env` по образцу `k8s/.env.example`:

```env
POSTGRES_PASSWORD=ваш-пароль
K8S_DATABASE_URL=postgresql://raincheck:<url-кодированный-пароль>@postgres:5432/raincheck
PROBER_INVITE_CODE=код-тестовой-группы
PROBER_POLL_ID=uuid-открытого-опроса
PROBER_PARTICIPANT_TOKEN=токен-тестового-участника
```

Укажите один и тот же пароль: обычный в `POSTGRES_PASSWORD`, URL-кодированный — в `K8S_DATABASE_URL`. Замените текст вместе с угловыми скобками. Не берите значения в кавычки. Файл `k8s/.env` исключён из Git.

Данные пробера создаются один раз через API или UI: отдельная группа, один участник и открытый текущий опрос. При первой установке БД сначала запустите API, создайте эти данные, затем заполните три `PROBER_*` и обновите Secret той же командой ниже.

## Запуск

Выполняйте команды по порядку. Переходите дальше, когда предыдущий шаг завершился успешно.

1. Создайте namespace и Secret:

```sh
kubectl apply -f k8s/00-namespace.yaml
kubectl create secret generic raincheck-env --from-env-file=k8s/.env -n raincheck --dry-run=client -o yaml | kubectl apply -f -
```

2. Запустите PostgreSQL. Продолжайте, когда база принимает подключения:

```sh
kubectl apply -f k8s/10-postgres.yaml
kubectl get pods -n raincheck
```

3. Миграции выполняются initContainer API. Для отдельного запуска:

```sh
kubectl apply -f k8s/20-migrate.yaml
kubectl get jobs -n raincheck
```

4. Запустите API, затем frontend. Команду `minikube tunnel` выполняйте в отдельном терминале:

```sh
kubectl apply -f k8s/30-api.yaml
kubectl get pods -n raincheck

minikube addons enable ingress
kubectl apply -f k8s/40-web.yaml
kubectl get pods -n raincheck

minikube tunnel --bind-address=127.0.0.1
```

5. Запуск пробера:

```sh
kubectl apply -f k8s/90-prober.yaml
```

6. Масштабирование бэкэнда:

```sh
kubectl scale deployment api --replicas=3 -n raincheck
```

7. Удаление ns (включая PVC и данные):

```sh
kubectl delete namespace raincheck
```

Откройте http://localhost. В Minikube с Docker на Windows оставьте `minikube tunnel` работающим.

## Логи

VictoriaLogs и collector используются для логов

```sh
helm upgrade --install vls vm/logs screenshots-single --version 0.13.10 -n raincheck -f k8s/50-logs screenshots-values.yaml --wait
helm upgrade --install collector vm/logs screenshots-collector --version 0.3.8 -n raincheck -f k8s/60-logs screenshots-collector-values.yaml --wait
```

## Метрики

Использованы готовые чарты из репозитория VictoriaMetrics:

```sh
helm repo add vm https://victoriametrics.github.io/helm-charts/
helm repo update
```

2. Установите VictoriaMetrics с настройками из values-файла:

```sh
helm upgrade --install vm-single vm/victoria-metrics-single --version 0.49.0 -n monitoring --create-namespace -f k8s/70-victoria-metrics-values.yaml --wait
```

3. Установите [vmagent](https://docs.victoriametrics.com/helm/victoria-metrics-agent/) для сбора метрик и отправки в VictoriaMetrics:

```sh
helm upgrade --install vmagent vm/victoria-metrics-agent --version 0.50.0 -n monitoring -f k8s/70-victoria-metrics-values.yaml --wait
```

Один values-файл используется для обоих чартов: `server` настраивает VictoriaMetrics, `service`, `remoteWrite` и `config` — vmagent. Встроенный сборщик VictoriaMetrics отключён, метрики собирает только vmagent.

4. Создание PostgreSQL exporter:

```sh
kubectl apply -f k8s/80-postgres-exporter.yaml
```

## Просмотр метрик в VictoriaMetrics

Для синтетических проверок основного сценария запустите пробер. Его метрики обнаруживается vmagent по аннотациям.

VictoriaMetrics, vmagent и PostgreSQL exporter должны быть запущены в namespace `monitoring`, API — в `raincheck`:

Каждый port-forward для метрик запускайте в отдельном терминале и оставьте работающим.

```powershell
kubectl port-forward -n monitoring service/vm-single-victoria-metrics-single-server 8428:8428

kubectl get pods -n monitoring
kubectl get pods -n raincheck
```

- http://localhost:8428/vmui/ — интерфейс запросов и графиков.
- http://localhost:8429/targets — состояние сбора метрик в vmagent.
- http://localhost:8429/metrics — собственные метрики vmagent.

Бизнес метрики:

```
{__name__=~"raincheck_.*"}
```
