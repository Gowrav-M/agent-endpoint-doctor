# Examples

Offline demo:

```bash
npx agent-endpoint-doctor demo
```

Local endpoint test:

```bash
npx agent-endpoint-doctor test --base-url http://localhost:1234/v1 --model qwen3-coder
```

Hosted endpoint test:

```bash
$env:OPENAI_COMPATIBLE_API_KEY="sk-..."
npx agent-endpoint-doctor test --base-url https://provider.example.com/v1 --model provider-model
```

Generate config snippets:

```bash
npx agent-endpoint-doctor config --base-url http://localhost:1234/v1 --model qwen3-coder
```
