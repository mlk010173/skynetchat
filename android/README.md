# SKYNET em modo app (Android)

APK nativo que abre o site oficial (GitHub Pages) em janela própria, sem barra de
endereço e sem abas. O site continua publicado só no GitHub Pages; este projeto é a
casca Android dele.

- Pacote: `ai.skynet.chat` (debug: `ai.skynet.chat.debug`)
- Site carregado: `https://skynetchat-xi.vercel.app/` (constante `SKYNET_URL` em
  `app/build.gradle.kts`)
- minSdk 24 · targetSdk 34 · Kotlin + WebView (AndroidX)

## O que a casca faz

- WebView com JavaScript, DOM storage e cookies de terceiros (login do Supabase funciona)
- Swipe para recarregar, barra de progresso fina no topo
- Tela de erro com "Tentar de novo" quando fica sem internet
- Botão voltar do Android navega no histórico do site
- Upload de arquivo (foto/PDF) vindo do site abre o seletor do Android
- Downloads vão para a pasta Downloads do aparelho
- Links de outros domínios abrem no navegador, o app continua no SKYNET
- Media playback sem exigir gesto (áudio do chat toca)

## Como gerar o APK

Precisa de JDK 17, Android SDK (platform 34, build-tools 34.0.0) e Gradle 8.7.

```bash
cd android
gradle assembleRelease     # assinado, se as variáveis abaixo existirem
gradle assembleDebug       # instalável, assinatura de debug
```

Variáveis usadas na assinatura (opcionais):

| variável | uso |
|---|---|
| `KEYSTORE_BASE64` | keystore em base64; sem ela o build sai sem assinatura de release |
| `KEYSTORE_PASSWORD` | senha do keystore |
| `KEY_ALIAS` | alias da chave (`skynet`) |
| `KEY_PASSWORD` | senha da chave |

O keystore oficial do app está guardado como segredo na plataforma
(`SKYNET_KEYSTORE_BASE64`). **Use sempre o mesmo**: trocar a chave impede atualizar
por cima da versão instalada.

## Publicar a versão

```bash
gh release create android-v1.0.0 dist/skynet-1.0.0.apk -t "SKYNET app 1.0.0"
```

Ou pela API (foi como a 1.0.0 saiu):

```bash
curl -X POST https://api.github.com/repos/mlk010173/skynetchat/releases \
  -H "Authorization: Bearer $GITHUB_ACCESS_TOKEN" -H "content-type: application/json" \
  -d '{"tag_name":"android-v1.0.0","name":"SKYNET app 1.0.0"}'
```

## Observação sobre CI

O token de automação disponível hoje tem escopo `repo` sem `workflow`, então o
GitHub Actions recusa commit de arquivo em `.github/workflows/`. Por isso o APK é
gerado localmente (JDK + SDK + Gradle) e publicado como Release. Quando quiser
build automático a cada mudança, basta criar o workflow pelo site do GitHub: os
passos estão descritos acima.
