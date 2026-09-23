# Operação local

## Inspeção

```sh
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web
```

GET /api/health verifica a conexão da API com seu banco. Um endpoint saudável não garante que todos os workers estejam processando eventos. Examine os logs do worker/consumidor e o estado do domínio. Nunca publique cookies, tokens ou dados pessoais coletados em diagnóstico.

## Parar e retomar

```sh
docker compose stop
docker compose up -d --wait
```

Volumes preservam dados. docker compose down remove containers/rede; down -v também apaga os dados de demonstração, portanto só use para um reset intencional. Execute o seed novamente após reset.

## Erro no primeiro boot

Verifique Docker em execução, porta 4101 livre, download das imagens e serviço de migration. Bancos usam credenciais definidas no primeiro boot do volume. Não edite uma migration já aplicada: adicione outra.

## API

Login: POST /api/auth/login com email/password; a resposta fornece csrf e Set-Cookie. GET /api/auth/me recupera usuário e token. Envie cookie e X-CSRF-Token em POST/PATCH/DELETE autenticados. Use Origin correspondente ao endereço aberto no navegador. Há validação de payload e respostas 401/403/404/409 conforme o caso. Os testes em tests/integration são exemplos executáveis de chamadas.

## Recuperação

Reinicie a API e entre novamente se necessário. O estado confirmado está no PostgreSQL. No Support Desk, a reconexão usa o histórico REST; no Taskflow, um conflito 409 exige obter a versão atual antes de alterar novamente.
