#!/usr/bin/env bash
# Проверка доступа к Bedrock после выдачи прав. Запускать из корня проекта.
set -uo pipefail
REGION="${AWS_REGION:-eu-central-1}"
ok=0; fail=0
step() { printf '\n%s\n' "$1"; }
pass() { printf '  ✓ %s\n' "$1"; ok=$((ok+1)); }
bad()  { printf '  ✗ %s\n     %s\n' "$1" "$2"; fail=$((fail+1)); }

step "1. Учётная запись"
if who=$(aws sts get-caller-identity --query Arn --output text 2>&1); then
  pass "$who"
else
  bad "не удалось определить учётную запись" "$who"; exit 1
fi

step "2. Список моделей Anthropic в $REGION"
if models=$(aws bedrock list-foundation-models --region "$REGION" --by-provider anthropic \
            --query 'modelSummaries[].modelId' --output text 2>&1); then
  pass "доступно моделей: $(echo "$models" | wc -w | tr -d ' ')"
  echo "$models" | tr '\t' '\n' | grep -iE 'haiku|sonnet' | sed 's/^/     /'
else
  bad "нет прав bedrock:ListFoundationModels" "$models"
fi

step "3. Эмбеддинги Cohere в $REGION"
if emb=$(aws bedrock list-foundation-models --region "$REGION" --by-provider cohere \
         --query 'modelSummaries[?contains(modelId,`embed`)].modelId' --output text 2>&1); then
  if [ -n "$emb" ]; then
    pass "найдено: $emb"
  else
    bad "модели эмбеддингов Cohere в регионе нет" "переходим на self-hosted BGE-M3, см. 06-Implement/stack.md"
  fi
else
  bad "не удалось получить список" "$emb"
fi

step "4. Настоящий вызов модели (тем же клиентом, что и приложение)"
cat > .bedrock-probe.mjs <<'JS'
import { claude, modelFor } from './src/llm/claude.js';
try {
  const r = await claude.messages.create({ model: modelFor('base'), max_tokens: 16,
    messages: [{ role: 'user', content: 'Ответь одним словом: работает?' }] });
  console.log('OK ' + r.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim());
} catch (e) {
  console.log('ERR ' + String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300));
}
JS
result=$(AWS_REGION="$REGION" npx tsx .bedrock-probe.mjs 2>&1 | tail -1)
rm -f .bedrock-probe.mjs
case "$result" in
  OK*)       pass "модель ответила: ${result#OK }" ;;
  *use\ case*) bad "нужна форма сценария использования Anthropic" "Bedrock → Model catalog → Claude Haiku 4.5 → заполнить форму, затем подождать ~15 минут" ;;
  *)         bad "вызов не прошёл" "${result#ERR }" ;;
esac

step "5. Эмбеддинги: настоящий вызов"
EMB_MODEL="${EMBEDDING_MODEL:-amazon.titan-embed-text-v2:0}"
# У Titan и Cohere разные схемы запроса — берём ту, что соответствует модели.
case "$EMB_MODEL" in
  cohere.*) EMB_BODY='{"texts":["test"],"input_type":"search_document"}' ;;
  *)        EMB_BODY='{"inputText":"test","dimensions":1024,"normalize":true}' ;;
esac
emb_out=$(aws bedrock-runtime invoke-model --region "$REGION" \
  --model-id "$EMB_MODEL" --content-type application/json --accept application/json \
  --body "$(printf '%s' "$EMB_BODY" | base64)" /dev/stdout 2>&1 | head -c 300)
case "$emb_out" in
  *'"embedding'*) pass "эмбеддинги работают ($EMB_MODEL)" ;;
  *Marketplace*|*subscri*) bad "модель требует подписки AWS Marketplace" "используйте amazon.titan-embed-text-v2:0 — она от самой AWS" ;;
  *) bad "эмбеддинги не работают" "$emb_out" ;;
esac

printf '\n%s пройдено, %s не пройдено\n' "$ok" "$fail"
[ "$fail" -eq 0 ] && printf 'Всё готово — можно прогонять полный цикл.\n'
exit "$fail"
