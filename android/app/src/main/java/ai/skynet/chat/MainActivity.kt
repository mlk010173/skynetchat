package ai.skynet.chat

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * SKYNET em modo app: uma janela nativa em volta do site oficial
 * (GitHub Pages). Nada de navegador: sem barra de endereço, sem abas.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var barra: ProgressBar
    private lateinit var erroBox: LinearLayout
    private var arquivoCallback: ValueCallback<Array<Uri>>? = null

    private val escolherArquivo = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { resultado ->
        val uris = WebChromeClient.FileChooserParams.parseResult(resultado.resultCode, resultado.data)
        arquivoCallback?.onReceiveValue(uris)
        arquivoCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = ContextCompat.getColor(this, R.color.skynet_fundo)
        window.navigationBarColor = ContextCompat.getColor(this, R.color.skynet_fundo)
        supportActionBar?.hide()

        val raiz = FrameLayout(this)
        refresh = SwipeRefreshLayout(this)
        web = WebView(this)
        barra = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
            visibility = View.GONE
        }
        refresh.addView(web, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        raiz.addView(refresh, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        raiz.addView(barra, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 6, Gravity.TOP))

        erroBox = montarTelaDeErro()
        raiz.addView(erroBox, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        setContentView(raiz)

        configurarWeb()
        refresh.setOnRefreshListener { web.reload() }
        web.loadUrl(BuildConfig.SKYNET_URL)
    }

    private fun montarTelaDeErro(): LinearLayout {
        val caixa = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.skynet_fundo))
            visibility = View.GONE
            setPadding(48, 48, 48, 48)
        }
        caixa.addView(TextView(this).apply {
            text = "Sem conexão com o SKYNET"
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.skynet_texto))
            textSize = 20f
            gravity = Gravity.CENTER
        })
        caixa.addView(TextView(this).apply {
            text = "Confira a internet e tente de novo."
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.skynet_apagado))
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 12, 0, 28)
        })
        caixa.addView(Button(this).apply {
            text = "Tentar de novo"
            setOnClickListener {
                erroBox.visibility = View.GONE
                web.visibility = View.VISIBLE
                web.reload()
            }
        })
        return caixa
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configurarWeb() {
        val prefs = web.settings
        prefs.javaScriptEnabled = true
        prefs.domStorageEnabled = true
        prefs.databaseEnabled = true
        prefs.loadWithOverviewMode = true
        prefs.useWideViewPort = true
        prefs.setSupportZoom(false)
        prefs.builtInZoomControls = false
        prefs.mediaPlaybackRequiresUserGesture = false
        prefs.cacheMode = WebSettings.LOAD_DEFAULT
        prefs.allowFileAccess = false
        prefs.allowContentAccess = false
        prefs.userAgentString = prefs.userAgentString + " SKYNETApp/" + BuildConfig.VERSION_NAME

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.setBackgroundColor(ContextCompat.getColor(this, R.color.skynet_fundo))
        web.overScrollMode = View.OVER_SCROLL_NEVER

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, pedido: WebResourceRequest): Boolean {
                val url = pedido.url.toString()
                val interno = url.startsWith(BuildConfig.SKYNET_URL.trimEnd('/')) ||
                    url.startsWith("https://mlk010173.github.io/skynetchat") ||
                    url.startsWith("https://rkgwhhtenfozdwzpvxjj.supabase.co")
                if (interno) return false
                // link externo: abre no navegador, o app continua no SKYNET
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                } catch (_: ActivityNotFoundException) { }
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                refresh.isRefreshing = false
                erroBox.visibility = View.GONE
                web.visibility = View.VISIBLE
            }

            override fun onReceivedError(view: WebView, pedido: WebResourceRequest, erro: WebResourceError) {
                if (pedido.isForMainFrame) {
                    erroBox.visibility = View.VISIBLE
                    web.visibility = View.GONE
                    refresh.isRefreshing = false
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, progresso: Int) {
                barra.progress = progresso
                barra.visibility = if (progresso in 1..99) View.VISIBLE else View.GONE
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                arquivoCallback?.onReceiveValue(null)
                arquivoCallback = callback
                return try {
                    escolherArquivo.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    arquivoCallback = null
                    false
                }
            }
        }

        web.setDownloadListener { url, _, _, mime, _ ->
            try {
                val pedido = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mime)
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, Uri.parse(url).lastPathSegment ?: "skynet")
                }
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(pedido)
            } catch (_: Exception) { }
        }
    }

    override fun onBackPressed() {
        when {
            erroBox.visibility == View.VISIBLE -> super.onBackPressed()
            web.canGoBack() -> web.goBack()
            else -> super.onBackPressed()
        }
    }

    override fun onPause() { web.onPause(); super.onPause() }
    override fun onResume() { super.onResume(); web.onResume() }
}
