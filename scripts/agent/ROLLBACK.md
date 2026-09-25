# Откат настройки инженерной среды (не выполнять без явного запроса)

Не `git switch` на грязном дереве. Не `git reset --hard`, `git clean -fd`, `--discard-changes`.

Перед **реальным** откатом (не в CI):

```bash
scripts/agent/rollback-check.sh
```

Это проверка конкретной резервной копии владельца (`backup/pre-agent-env-20260925`) и `rollback-manifest.txt`. Отсутствие ветки или рассинхрон manifest — **FAIL**, не PASS. Скрипт **не** откатывает дерево. `--apply` отвергается.

Обычные `check.sh` / CI эту команду не вызывают: механизм проверяется в `self-test-rollback.mjs` на временном репозитории с тестовыми файлами, без личной backup-ветки.

Секреты отсекаются правилами в `scripts/agent/secret-excludes` и функцией `is_secret_path` в `rollback-check.sh` (не комментарием «не копировать .env»).

## Ссылки

| Ссылка | Значение |
|---|---|
| HEAD работы | `chore/agent-engineering-env` @ `b6ca435` |
| Снимок WIP | `backup/pre-agent-env-20260925` |
| Пути удаления | `scripts/agent/rollback-manifest.txt` |

Если `rollback-check.sh` завершился с кодом 1 — остановиться: обновить manifest или разобрать новый файл. Не удалять «лишнее» наугад.

Дамп рабочих БД не снимался. Откат Git не доказывает сохранность томов.

## После успешного check (только вручную, по запросу)

1. Скопировать текущее дерево фильтром `secret-excludes` (rsync `--exclude-from=scripts/agent/secret-excludes`).
2. `git worktree add ../PA_owner_wip backup/pre-agent-env-20260925`
3. `git restore --source=backup/pre-agent-env-20260925 --` только смешанные tracked из отчёта (deploy.yml, README.md, …).
4. Удалить **только** пути из `rollback-manifest.txt`.
5. Сверить `git status` с owner WIP. Пропавшее — из копии шага 1.
