# Raincheck в Minikube

Команды выполняйте из корня проекта. Перед запуском Minikube должен быть активен, а образы `raincheck-api:dev`, `raincheck-web:dev` и `raincheck-migrate:dev` загружены в него.

## Секреты

Создайте `k8s/.env`:

```env
POSTGRES_PASSWORD=ваш-пароль
K8S_DATABASE_URL=postgresql://raincheck:<url-кодированный-пароль>@postgres:5432/raincheck
```

Укажите один и тот же пароль: обычный в `POSTGRES_PASSWORD`, URL-кодированный — в `K8S_DATABASE_URL`. Замените текст вместе с угловыми скобками. Не берите значения в кавычки. Файл `k8s/.env` исключён из Git.

## Запуск

Выполняйте команды по порядку. Переходите дальше, когда предыдущий шаг завершился успешно.

1. Создайте namespace и Secret:

```sh
kubectl apply -f k8s/00-namespace.yaml
kubectl create secret generic raincheck-env --from-env-file=k8s/.env -n raincheck
```

2. Запустите PostgreSQL. Продолжайте, когда база принимает подключения:

```sh
kubectl apply -f k8s/10-postgres.yaml
kubectl get pods -n raincheck
```

3. Запустите миграции и дождитесь их успешaного завершения:

```sh
kubectl apply -f k8s/20-migrate.yaml
kubectl get jobs -n raincheck
```

4. Запустите API, затем frontend:

```sh
kubectl apply -f k8s/30-api.yaml
kubectl get pods -n raincheck

kubectl apply -f k8s/40-web.yaml
kubectl get pods -n raincheck

kubectl port-forward service/web 8080:80 -n raincheck
```

5. Масштабирование бэкэнда:

```sh
kubectl scale deployment api --replicas=3 -n raincheck
```

6. Удаление ns:

```sh
kubectl delete namespace raincheck
```

Откройте http://localhost:8080. Оставьте port-forward работающим.
