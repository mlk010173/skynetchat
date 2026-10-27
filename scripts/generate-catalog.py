#!/usr/bin/env python3
"""Generate a transparent, declarative catalog (not fake/live integrations)."""
import json
from pathlib import Path

GROUPS = {
"Modelos de IA": ["OpenAI", "Anthropic Claude", "Google Gemini", "Google AI Studio", "Hugging Face", "NVIDIA NIM", "Cohere", "Mistral AI", "Groq", "Together AI", "Fireworks AI", "OpenRouter", "Perplexity", "Replicate", "Fal.ai", "Stability AI", "DeepSeek", "xAI Grok", "AWS Bedrock", "Azure OpenAI", "Vertex AI", "Ollama", "LM Studio", "vLLM", "Watsonx AI", "AI21 Labs", "Aleph Alpha", "Writer", "SambaNova", "Novita AI"],
"Avaliação e observabilidade de IA": ["LangSmith", "Langfuse", "Helicone", "Weights & Biases", "Arize Phoenix", "Braintrust", "Humanloop", "PromptLayer", "Portkey", "LiteLLM", "TruLens", "Ragas", "DeepEval", "Patronus AI"],
"Busca e RAG": ["Pinecone", "Weaviate", "Qdrant", "Chroma", "Milvus", "Zilliz Cloud", "Elasticsearch", "OpenSearch", "Algolia", "Meilisearch", "Typesense", "Tavily", "Exa", "Brave Search", "Bing Search API", "SerpAPI", "Firecrawl", "Wikipedia API"],
"Repositórios e desenvolvimento": ["GitHub", "GitLab", "Bitbucket", "Gitea", "Azure DevOps", "Linear", "Jira", "ClickUp", "YouTrack", "Sentry", "Datadog", "New Relic", "Grafana", "Prometheus", "CircleCI", "GitHub Actions", "Jenkins", "Buildkite", "Travis CI", "Codecov", "SonarQube", "Snyk", "Dependabot", "Renovate", "Docker Hub", "Docker Engine", "Kubernetes", "Argo CD", "Terraform Cloud", "Pulumi", "LaunchDarkly", "Flagsmith"],
"Hospedagem e infraestrutura": ["Vercel", "Netlify", "Render", "Fly.io", "Railway", "Heroku", "Cloudflare", "AWS", "Google Cloud", "Microsoft Azure", "DigitalOcean", "Hetzner Cloud", "Vultr", "Linode/Akamai", "Oracle Cloud", "Firebase", "Supabase", "Appwrite", "Convex", "Deno Deploy", "Cloud Run", "Cloudflare Workers", "AWS Lambda", "Azure Functions", "Google Cloud Functions"],
"Arquivos e armazenamento": ["Amazon S3", "Google Cloud Storage", "Azure Blob Storage", "Cloudinary", "ImageKit", "Uploadcare", "Supabase Storage", "Firebase Storage", "Dropbox", "Google Drive", "Microsoft OneDrive", "Box", "Nextcloud", "MinIO", "Backblaze B2", "Wasabi", "Cloudflare R2", "DigitalOcean Spaces", "SharePoint", "pCloud", "MEGA", "SFTP", "WebDAV"],
"Bancos e dados": ["PostgreSQL", "MySQL", "MariaDB", "SQLite", "Redis", "Upstash Redis", "MongoDB Atlas", "DynamoDB", "Firestore", "Neon", "PlanetScale", "Turso", "CockroachDB", "ClickHouse", "BigQuery", "Snowflake", "Databricks", "Amazon Redshift", "MotherDuck", "Airtable", "Baserow", "NocoDB", "Xata", "Fauna", "Convex DB", "InfluxDB", "TimescaleDB", "QuestDB", "Supabase Vector", "DuckDB"],
"Produtividade e documentos": ["Notion", "Google Docs", "Google Sheets", "Google Slides", "Google Calendar", "Gmail", "Microsoft Outlook", "Microsoft Teams", "OneNote", "SharePoint", "Confluence", "Slab", "Evernote", "Coda", "Asana", "Trello", "Monday.com", "Todoist", "TickTick", "Any.do", "Basecamp", "Miro", "FigJam", "Figma", "Canva", "Adobe Express", "Framer", "Webflow", "WordPress", "Ghost", "Medium", "Typeform", "Tally", "Jotform", "Google Forms", "Microsoft Forms", "Dropbox Paper", "ClickUp Docs", "Airtable Interfaces"],
"Comunicação e reuniões": ["Slack", "Discord", "Telegram Bot API", "WhatsApp Business Cloud API", "Twilio", "Vonage", "Bird/MessageBird", "Matrix", "Mattermost", "Rocket.Chat", "Zulip", "Zoom", "Google Meet", "Jitsi", "Calendly", "Cal.com", "SavvyCal", "Pumble", "Flock", "Intercom Messenger", "Microsoft Teams Chat", "Google Chat", "Signal (gateway próprio)", "SMTP", "Web Push"],
"E-mail e campanhas": ["SendGrid", "Resend", "Mailgun", "Postmark", "Amazon SES", "Brevo", "Mailchimp", "ActiveCampaign", "Klaviyo", "ConvertKit/Kit", "Campaign Monitor", "Customer.io", "Loops", "Beehiiv", "Substack", "Buttondown", "MailerLite", "GetResponse", "Moosend", "Sendinblue Legacy", "SparkPost", "Mandrill", "SMTP2GO"],
"CRM, suporte e vendas": ["HubSpot", "Salesforce", "Pipedrive", "Zoho CRM", "Freshsales", "Close", "Attio", "Zendesk", "Freshdesk", "Help Scout", "Crisp", "Tidio", "LiveChat", "Gorgias", "Front", "Kustomer", "Gladly", "ServiceNow", "Dynamics 365", "SugarCRM", "SuiteCRM", "Insightly", "Copper CRM", "Keap", "Odoo CRM", "Apollo.io", "Clay", "ZoomInfo", "Hunter.io", "Clearbit", "Lemlist", "Outreach", "Salesloft"],
"Pagamentos e assinaturas": ["Stripe", "PayPal", "Mercado Pago", "PagSeguro", "Pagar.me", "Asaas", "Iugu", "Adyen", "Paddle", "Lemon Squeezy", "Chargebee", "Recurly", "Braintree", "Square", "Razorpay", "Wise Platform", "OpenPix", "Gerencianet/Efi", "PagBank", "Yampi", "Appmax", "Kiwify", "Hotmart", "Eduzz"],
"Comércio eletrônico": ["Shopify", "WooCommerce", "Magento/Adobe Commerce", "BigCommerce", "Nuvemshop", "VTEX", "Etsy", "Gumroad", "Lojas Integradas", "Tray Commerce", "Mercado Livre", "Amazon Selling Partner", "eBay", "Wix Stores", "PrestaShop", "OpenCart", "Saleor", "Medusa.js", "Commerce.js", "Shopware"],
"Automação e agentes": ["n8n", "Zapier", "Make", "Pipedream", "Activepieces", "Node-RED", "IFTTT", "Workato", "Tray.io", "Parabola", "Bardeen", "Apify", "Browserless", "Browser Use", "Playwright", "Puppeteer", "MCP Server", "Webhooks", "HTTP API", "Cron/Scheduler", "Airbyte", "Fivetran", "Kestra", "Windmill", "Temporal", "Inngest", "Trigger.dev", "Prefect", "Dagster", "Apache Airflow"],
"Redes sociais e publicação": ["Instagram Graph API", "Facebook Graph API", "TikTok for Developers", "YouTube Data API", "YouTube Analytics", "LinkedIn API", "X API", "Reddit API", "Pinterest API", "Mastodon", "Bluesky", "Threads API", "Buffer", "Hootsuite", "Metricool", "Later", "Publer", "SocialBee", "Sprout Social", "Typefully", "Taplio", "RSS/Atom", "Feedly", "Pocket", "Raindrop.io"],
"Análises e experimentação": ["Google Analytics 4", "Google Tag Manager", "Matomo", "Plausible Analytics", "PostHog", "Segment", "RudderStack", "Mixpanel", "Amplitude", "Heap", "FullStory", "Hotjar", "Microsoft Clarity", "Pendo", "Statsig", "Optimizely", "VWO", "GrowthBook", "Snowplow", "Looker Studio", "Metabase", "Apache Superset"],
"Autenticação e identidade": ["Supabase Auth", "Auth0", "Clerk", "Better Auth", "WorkOS", "Keycloak", "Authentik", "Okta", "Microsoft Entra ID", "Google Identity", "Firebase Auth", "Amazon Cognito", "Descope", "Stytch", "Ory", "FusionAuth", "Zitadel", "Logto", "Casdoor", "Passkeys/WebAuthn"],
"PDF, assinatura e OCR": ["DocuSign", "PandaDoc", "SignWell", "Adobe PDF Services", "PDF.co", "CloudConvert", "ConvertAPI", "OCR.Space", "Google Cloud Vision", "AWS Textract", "Azure AI Document Intelligence", "Mindee", "Veryfi", "Nanonets", "Tesseract OCR", "PDFMonkey", "Plumsail", "Formstack Documents"],
"Clima, mapas e geocoding": ["Open-Meteo", "OpenWeather", "WeatherAPI", "Visual Crossing", "Mapbox", "Google Maps Platform", "HERE Maps", "OpenStreetMap", "OpenRouteService", "MapTiler", "TomTom Maps", "Geoapify", "Radar", "Positionstack", "IPinfo", "ipapi", "Nominatim"],
"Finanças, câmbio e mercado": ["ExchangeRate-API", "Frankfurter FX", "Fixer", "CurrencyAPI", "Alpha Vantage", "Finnhub", "Polygon.io", "Twelve Data", "Financial Modeling Prep", "FRED", "SEC EDGAR", "OpenFIGI", "CoinGecko", "CoinMarketCap", "Binance API", "Kraken API", "Coinbase API", "Brapi", "StatusInvest (adaptador próprio)"],
"Notícias e pesquisa": ["NewsAPI", "GNews", "The Guardian API", "New York Times API", "BBC RSS", "Google News RSS", "Bing News Search", "Wikipedia API", "Wikidata", "Crossref", "OpenAlex", "Semantic Scholar", "PubMed/Entrez", "Europe PMC", "arXiv API", "Open Library", "Internet Archive", "Brave Search API", "Tavily", "Exa Search"],
"Monitoramento e segurança": ["Better Stack", "UptimeRobot", "Pingdom", "Statuspage", "Incident.io", "PagerDuty", "Opsgenie", "Grafana OnCall", "Axiom", "Logtail", "Logflare", "Elastic Observability", "Honeycomb", "OpenTelemetry Collector", "Checkly", "Datadog Synthetics", "Cloudflare Security", "VirusTotal", "urlscan.io", "Have I Been Pwned"],
"Educação e conteúdo": ["Moodle", "Canvas LMS", "Google Classroom", "Microsoft Teams for Education", "Teachable", "Thinkific", "Kajabi", "Podia", "LearnWorlds", "TalentLMS", "Coursera (dados públicos)", "Udemy Business", "Quizlet (integração autorizada)", "Kahoot!", "H5P", "Discourse", "Circle.so", "Mighty Networks", "Discord Community", "YouTube Studio"],
"Gestão de projetos e RH": ["Jira Service Management", "Shortcut", "Height", "Plane", "Taiga", "OpenProject", "Redmine", "Linear Issues", "Wrike", "Smartsheet", "Aha!", "Productboard", "Lattice", "BambooHR", "Personio", "Rippling", "Gusto", "Deel", "Factorial HR", "Toggl Track", "Harvest", "Clockify", "Everhour", "Timely"],
}

HOMEPAGES = {
"OpenAI":"https://platform.openai.com/docs", "Anthropic Claude":"https://docs.anthropic.com", "Google Gemini":"https://ai.google.dev/gemini-api/docs", "Google AI Studio":"https://aistudio.google.com", "Hugging Face":"https://huggingface.co/docs", "NVIDIA NIM":"https://docs.nvidia.com/nim", "Groq":"https://console.groq.com/docs", "OpenRouter":"https://openrouter.ai/docs", "GitHub":"https://docs.github.com", "GitLab":"https://docs.gitlab.com", "Supabase":"https://supabase.com/docs", "Vercel":"https://vercel.com/docs", "Render":"https://docs.render.com", "Netlify":"https://docs.netlify.com", "Cloudflare":"https://developers.cloudflare.com", "Notion":"https://developers.notion.com", "Google Sheets":"https://developers.google.com/sheets/api", "Google Calendar":"https://developers.google.com/calendar/api", "Gmail":"https://developers.google.com/gmail/api", "Slack":"https://api.slack.com", "Discord":"https://discord.com/developers/docs", "Telegram Bot API":"https://core.telegram.org/bots/api", "WhatsApp Business Cloud API":"https://developers.facebook.com/docs/whatsapp/cloud-api", "Stripe":"https://docs.stripe.com", "PayPal":"https://developer.paypal.com/docs", "Mercado Pago":"https://www.mercadopago.com.br/developers", "Shopify":"https://shopify.dev/docs", "WooCommerce":"https://woocommerce.github.io/woocommerce-rest-api-docs", "n8n":"https://docs.n8n.io", "Zapier":"https://docs.zapier.com", "Make":"https://developers.make.com", "Pipedream":"https://pipedream.com/docs", "Playwright":"https://playwright.dev/docs", "Puppeteer":"https://pptr.dev", "MCP Server":"https://modelcontextprotocol.io", "Google Analytics 4":"https://developers.google.com/analytics", "PostHog":"https://posthog.com/docs", "Auth0":"https://auth0.com/docs", "Clerk":"https://clerk.com/docs", "Firebase Auth":"https://firebase.google.com/docs/auth", "Open-Meteo":"https://open-meteo.com/en/docs", "OpenWeather":"https://openweathermap.org/api", "Mapbox":"https://docs.mapbox.com", "Wikipedia API":"https://www.mediawiki.org/wiki/API:Main_page", "NewsAPI":"https://newsapi.org/docs", "Sentry":"https://docs.sentry.io", "Datadog":"https://docs.datadoghq.com", "Grafana":"https://grafana.com/docs", "MongoDB Atlas":"https://www.mongodb.com/docs/atlas", "PostgreSQL":"https://www.postgresql.org/docs", "Redis":"https://redis.io/docs", "Pinecone":"https://docs.pinecone.io", "Qdrant":"https://qdrant.tech/documentation", "Weaviate":"https://docs.weaviate.io", "Resend":"https://resend.com/docs", "SendGrid":"https://www.twilio.com/docs/sendgrid", "Twilio":"https://www.twilio.com/docs", "HubSpot":"https://developers.hubspot.com/docs", "Salesforce":"https://developer.salesforce.com/docs", "Jira":"https://developer.atlassian.com/cloud/jira/platform/rest/v3", "Linear":"https://developers.linear.app/docs", "Google Maps Platform":"https://developers.google.com/maps/documentation", "Google Cloud Vision":"https://cloud.google.com/vision/docs", "AWS Textract":"https://docs.aws.amazon.com/textract", "Cloudinary":"https://cloudinary.com/documentation", "Dropbox":"https://www.dropbox.com/developers/documentation", "Google Drive":"https://developers.google.com/drive/api", "Microsoft OneDrive":"https://learn.microsoft.com/onedrive/developer", "BigQuery":"https://cloud.google.com/bigquery/docs", "Snowflake":"https://docs.snowflake.com", "Airtable":"https://airtable.com/developers/web/api/introduction", "WordPress":"https://developer.wordpress.org/rest-api", "Figma":"https://developers.figma.com/docs", "Canva":"https://www.canva.dev/docs", "Instagram Graph API":"https://developers.facebook.com/docs/instagram-platform", "YouTube Data API":"https://developers.google.com/youtube/v3", "Reddit API":"https://www.reddit.com/dev/api", "TikTok for Developers":"https://developers.tiktok.com", "OpenTelemetry Collector":"https://opentelemetry.io/docs/collector", "Terraform Cloud":"https://developer.hashicorp.com/terraform/cloud-docs", "Docker Engine":"https://docs.docker.com/engine/api", "Kubernetes":"https://kubernetes.io/docs", "Ollama":"https://github.com/ollama/ollama/blob/main/docs/api.md"
}

out = []
seen = set()
for category, names in GROUPS.items():
    for name in names:
        slug = ''.join(c.lower() if c.isalnum() else '-' for c in name).strip('-')
        while '--' in slug: slug = slug.replace('--', '-')
        if slug in seen: continue
        seen.add(slug)
        home = HOMEPAGES.get(name)
        if any(term in category.lower() for term in ('modelo de ia','avaliação e observabilidade de ia','busca e rag')):
            mode = 'api_key'
        elif category in ('Comunicação e reuniões', 'E-mail e campanhas', 'Produtividade e documentos', 'CRM, suporte e vendas', 'Redes sociais e publicação'):
            mode = 'oauth2_or_api_key'
        elif category in ('Repositórios e desenvolvimento', 'Hospedagem e infraestrutura', 'Bancos e dados', 'Monitoramento e segurança'):
            mode = 'api_key_or_oauth2'
        elif category == 'Automação e agentes':
            mode = 'webhook_http_mcp'
        else:
            mode = 'api_key_or_oauth2'
        no_credential_names = {"Open-Meteo", "RSS/Atom", "Wikipedia API", "Wikidata", "OpenStreetMap", "Google News RSS", "BBC RSS", "PubMed/Entrez", "Europe PMC", "arXiv API", "Open Library", "Internet Archive", "MCP Server", "HTTP API", "Webhooks", "Cron/Scheduler", "Nominatim", "OpenRouteService"}
        out.append({
            'id': slug,
            'name': name,
            'category': category,
            'status': 'catalog_only',
            'integrationMode': mode,
            'requiresSetup': True,
            'credentialsExpected': name not in no_credential_names,
            'officialDocsUrl': home,
            'capabilities': ['discover', 'configure_adapter'],
            'note': 'Catálogo: ainda requer adaptador, credenciais e testes antes de operar.'
        })

payload = {
  'schemaVersion': 1,
  'generatedAt': '2026-10-26',
  'displayName': 'SKYNETchat Connector Catalog',
  'total': len(out),
  'important': 'Entries are catalog metadata only. They are NOT active integrations until an adapter, server-side credentials, scopes and tests are implemented.',
  'connectors': out,
}
root = Path(__file__).resolve().parents[1]
for rel in ['integrations/registry.json', 'frontend/src/data/connectors.json']:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Generated {len(out)} catalog entries into integrations/registry.json and frontend/src/data/connectors.json')
