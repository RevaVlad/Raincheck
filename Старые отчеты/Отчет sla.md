## Чтение опроса

Пробер проверяет ID и статус `OPEN` за **500 мс**. `slow` считается неуспехом.

**SLI** = 100% × успешные проверки чтения / все проверки чтения за 30 дней.

```promql
100 * (sum(increase(raincheck_probe_checks_total{operation="poll_read",result="success"}[30d])) or vector(0))
/ (sum(increase(raincheck_probe_checks_total{operation="poll_read"}[30d])) > 0)
```

**SLO** — SLI чтения ≥ 99,5% за 30 дней (`vector(99.5)`). **SLA** — SLI чтения ≥ 99% за 30 дней (`vector(99)`).

## Сохранение доступности

Пробер сохраняет ответ пользователя и проверяет их повторным чтением. Порог на весь сценарий — **1 с**. `slow` считается неуспехом.

**SLI** = 100% × успешные проверки сохранения / все проверки сохранения за 30 дней.

```promql
100 * (sum(increase(raincheck_probe_checks_total{operation="availability_save",result="success"}[30d])) or vector(0))
/ (sum(increase(raincheck_probe_checks_total{operation="availability_save"}[30d])) > 0)
```

**SLO** - SLI сохранения ≥ 99,5% за 30 дней (`vector(99.5)`). **SLA** — SLI сохранения ≥ 99% за 30 дней (`vector(99)`).

## Получение результатов

Пробер получает и сверяет результаты за **1 с**. `slow` считается неуспехом.

**SLI** = 100% × успешные проверки получения результатов / все проверки получения результатов за 30 дней.

```promql
100 * (sum(increase(raincheck_probe_checks_total{operation="common_slots",result="success"}[30d])) or vector(0))
/ (sum(increase(raincheck_probe_checks_total{operation="common_slots"}[30d])) > 0)
```

**SLO** - SLI получения результатов ≥ 99,5% за 30 дней (`vector(99.5)`). **SLA** — SLI получения результатов ≥ 99% за 30 дней (`vector(99)`).
