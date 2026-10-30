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

## Обновление образа API

После изменения backend пересоберите образ и загрузите его в Minikube через архив, затем обновите API. Команды для PowerShell:

```powershell
docker build -f backend/Dockerfile -t raincheck-api:dev .
New-Item -ItemType Directory -Force output | Out-Null
docker image save --platform=linux/amd64 --output output/raincheck-api.tar raincheck-api:dev
minikube image load output/raincheck-api.tar --overwrite
kubectl rollout restart deployment/api -n raincheck
kubectl rollout status deployment/api -n raincheck --timeout=240s
```

Выполняйте следующую команду только после успешного завершения предыдущей. При `imagePullPolicy: Never` простой перезапуск использует образ из Minikube: без загрузки нового образа изменения кода, включая HTTP-метрики, не появятся. Число реплик при таком обновлении сохраняется.

При первом включении HTTP-метрик дождитесь полного окна 5 минут. До этого старые бизнес-счётчики без соответствующих HTTP-счётчиков могут временно дать backend SLI выше 100%. Для демонстрации выбирайте интервал после накопления полного окна.

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

2. Создайте ConfigMap дашборда **до** установки или обновления VictoriaMetrics:

```sh
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap raincheck-vmui-dashboards --from-file=k8s/dashboards/raincheck-slo.json -n monitoring --dry-run=client -o yaml | kubectl apply -f -
```

Установите VictoriaMetrics с настройками из values-файла. Для существующего release эта команда выполняет обновление на той же версии чарта и сохраняет текущие values, PVC и данные:

```sh
helm upgrade --install vm-single vm/victoria-metrics-single --version 0.49.0 -n monitoring --reuse-values -f k8s/70-victoria-metrics-values.yaml --wait
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

## Дашборд SLI / SLO в VMUI

Конфигурация хранится в `k8s/dashboards/raincheck-slo.json`. Команда `kubectl create configmap --from-file` генерирует из JSON манифест ConfigMap `raincheck-vmui-dashboards` в `monitoring`, а `kubectl apply -f -` создаёт или обновляет его в кластере. Values монтируют каталог целиком, без `subPath`, и передают `-vmui.customDashboardsPath=/etc/victoria-metrics/dashboards`. Grafana не требуется.

Проверено с чартом `victoria-metrics-single 0.49.0` и VictoriaMetrics `v1.154.0`. Используется [формат VMUI этой версии](https://github.com/VictoriaMetrics/VictoriaMetrics/blob/v1.154.0/app/vmui/README.md#predefined-dashboards): `title`, `rows`, `panels`, массивы `expr` и `alias`. Для загрузки через флаг `index.js` не нужен. Единый порог SLO 99% для всех операций показан запросом `vector(99)` на графиках пробера и backend.

Для подключения дашборда к уже работающему release или обновления его конфигурации выполните из корня репозитория:

```sh
kubectl create configmap raincheck-vmui-dashboards --from-file=k8s/dashboards/raincheck-slo.json -n monitoring --dry-run=client -o yaml | kubectl apply -f -
helm upgrade vm-single vm/victoria-metrics-single --version 0.49.0 -n monitoring --reuse-values -f k8s/70-victoria-metrics-values.yaml --wait
kubectl rollout status statefulset/vm-single-victoria-metrics-single-server -n monitoring
```

Переустановка release и удаление PVC не нужны. Обновлять vmagent для подключения дашборда не требуется. Если изменился только JSON, достаточно повторить команду создания или обновления ConfigMap:

```sh
kubectl create configmap raincheck-vmui-dashboards --from-file=k8s/dashboards/raincheck-slo.json -n monitoring --dry-run=client -o yaml | kubectl apply -f -
```

Дождитесь обновления проекции ConfigMap (обычно до двух минут) и перезагрузите страницу VMUI. Дашборд читается при загрузке страницы и сохраняется при перезапуске VictoriaMetrics.

Откройте VMUI через port-forward в отдельном терминале:

```sh
kubectl port-forward -n monitoring service/vm-single-victoria-metrics-single-server 8428:8428
```

Перейдите на http://localhost:8428/vmui/ → **Dashboards** → **Raincheck SLI / SLO**. Для демонстрации удобно выбрать последние 15 минут и автообновление 15 секунд. Каждая точка графика использует фиксированное скользящее окно **5 минут**, независимо от выбранного диапазона времени.

На дашборде три графика:

- **Доступность операций и цели SLO (%)** — три SLI (доли `result="success"` в `raincheck_probe_checks_total`) и единая целевая линия SLO 99% для всех операций. Пробер проверяет содержимое ответа и время: `poll_read` ≤ 0,5 с, `availability_save` и `common_slots` ≤ 1 с. Все остальные результаты (`slow`, `timeout`, `error`, `invalid_result`) считаются неуспешными. Фактическая линия ниже цели означает нарушение SLO на этом окне.
- **Общая доступность (демо SLA, %)** — минимум SLI трёх операций за 5 минут и линия требования 99%. Это **демонстрационная оценка**. Договорный период составляет **30 дней**; этот график не рассчитывает договорную SLA.
- **Успешность создания сущностей (backend SLI)** — три доли созданных групп, опросов и ответов относительно всех POST-запросов к соответствующим маршрутам за 5 минут и единая цель SLO 99%. Используются бизнес-счётчики и `http_request_duration_seconds_count` с метками `method="POST"` и `route` (шаблон маршрута). Фильтра по `status_code` нет: ошибки валидации и конфликты тоже снижают показатель. Это успешность создания, а не чистая доступность API. Без POST-запросов или HTTP-метрики линия отсутствует.

Если есть провалы, но серия `success` ещё не появилась, числитель SLI принимается равным нулю на основе реально наблюдаемой серии проверок. При отсутствии проверок значение не показывается; подстановки 100% нет. SLA показывается только при наличии измерений всех трёх операций. Для краткого переиспользования формулы SLI запрос SLA использует `WITH` из MetricsQL, поддерживаемый VictoriaMetrics.

### Проверка на реальных метриках

В VMUI → Query выполните:

```promql
raincheck_probe_checks_total
```

Должны присутствовать `operation="poll_read"`, `"availability_save"`, `"common_slots"`, а также `result`. Сравните SLI дашборда с исходной формулой (когда есть серия `success`):

```promql
100 * sum by (operation) (increase(raincheck_probe_checks_total{result="success"}[5m]))
/ sum by (operation) (increase(raincheck_probe_checks_total[5m]))
```

Проверьте состояние `up` и `pg_up`: backend, prober и PostgreSQL exporter должны продолжать собираться. Конфигурацию, которую получает VMUI, можно проверить на http://localhost:8428/vmui/custom-dashboards.

При отключении PostgreSQL readiness API становится неуспешной, и Kubernetes исключает Pod из Service. Для проверки именно HTTP 500 и их влияния на backend SLI отправляйте диагностические POST-запросы напрямую на IP Pod API: так запрос доходит до приложения. Обращение через Service без готовых Pod не учитывается в HTTP-гистограмме backend; такую недоступность фиксирует пробер.

Для проверки сбоя в тестовом Minikube временно остановите API на 60–90 секунд, оставив prober и vmagent работающими. Пример для PowerShell сохраняет исходное число реплик и восстанавливает его в `finally`:

```powershell
$apiReplicas = kubectl get deployment api -n raincheck -o jsonpath='{.spec.replicas}'
try {
  kubectl scale deployment api -n raincheck --replicas=0
  Start-Sleep -Seconds 90
  # Фактическая доступность падает ниже целевых линий.
} finally {
  kubectl scale deployment api -n raincheck --replicas=$apiReplicas
  kubectl rollout status deployment/api -n raincheck --timeout=180s
}
```

После восстановления SLI растёт по мере вытеснения ошибок из окна; через 5 минут успешных проверок возвращается к 100%. Данные в VictoriaMetrics не подмешиваются: используются только реальные проверки пробера.

Для проверки сохранности после перезапуска:

```sh
kubectl get pvc -n monitoring
kubectl rollout restart statefulset/vm-single-victoria-metrics-single-server -n monitoring
kubectl rollout status statefulset/vm-single-victoria-metrics-single-server -n monitoring
kubectl get pvc -n monitoring
```

Если port-forward завершился при перезапуске Pod, запустите его снова. Перезагрузите VMUI, убедитесь, что дашборд доступен, история графиков сохранилась, PVC остался прежним и `up` / `pg_up` снова равны 1.
