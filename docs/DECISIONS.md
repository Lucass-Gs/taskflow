# Decisões técnicas

## 1. TypeScript e NestJS

Módulos, injeção de dependências e validação Zod delimitam a entrada HTTP. React separa sessão, carregamento, erro e estado do domínio. Os hooks são próprios nesta versão; TanStack Query não é uma dependência implícita.

## 2. PostgreSQL e SQL explícito

Consultas parametrizadas e transações tornam locks, invariantes e índices visíveis para revisão. Migrations são ordenadas, registradas e protegidas por advisory lock. A contrapartida é escrever mapeamento e SQL manualmente, sem Prisma.

## 3. Autenticação e autorização

Senhas usam scrypt com salt; o banco guarda hash da sessão aleatória. Cookie HttpOnly/SameSite, token CSRF em mutações e validação de Origin protegem o fluxo local. Sessões duram 24 horas e logout revoga o registro. Autorização de domínio acontece no servidor. O limitador de login é por processo; exposição pública exigiria HTTPS, configuração de cookie Secure, rate limit compartilhado e política de cadastro/reset de senha.

## 4. Consistência do domínio

Um monólito modular atende este domínio sem o custo operacional de microserviços. A versão da tarefa participa do UPDATE e transforma conflitos em uma resposta explícita. Todas as consultas de recursos verificam associação ao workspace; esconder botões não é autorização.

## 5. Operação reproduzível

Imagens multi-stage, processo de aplicação sem root, healthchecks, volumes e migrations antes da API. CI executa o mesmo Compose. Isso facilita demonstração e revisão, mas não transforma a configuração local em infraestrutura de produção.
