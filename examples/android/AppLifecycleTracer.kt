/**
 * Drop-in WIRING tracer for Android apps.
 *
 * Usage: Add these methods to your existing Application class, AppLifecycleTracker,
 * or any singleton. Don't create a new class if you already have one.
 *
 * All methods are no-ops when BuildConfig.DEBUG == false (zero production overhead).
 *
 * Created by CodeRuntimeVisor — https://github.com/kuriandungu/CodeRuntimeVisor
 */

import android.util.Log
import java.text.SimpleDateFormat
import java.util.*

// ---- Add these to your existing singleton/companion object ----

private const val TAG = "WIRING"
private val tsFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

/**
 * Core trace function. All other methods delegate to this.
 * Format: timestamp|EVENT_CODE|subject|details
 */
fun wiring(eventCode: String, subject: String, details: String = "") {
    if (!BuildConfig.DEBUG) return
    val ts = tsFormat.format(Date())
    val msg = if (details.isEmpty()) "$ts|$eventCode|$subject"
              else "$ts|$eventCode|$subject|$details"
    Log.d(TAG, msg)
}

// ---- Convenience methods ----

/** Activity lifecycle: ACT_CREATE, ACT_RESUME, ACT_PAUSE, ACT_DESTROY */
fun actCreate(name: String, isFresh: Boolean) =
    wiring("ACT_CREATE", name, if (isFresh) "FRESH" else "RELAUNCH")
fun actResume(name: String) = wiring("ACT_RESUME", name)
fun actPause(name: String) = wiring("ACT_PAUSE", name)
fun actDestroy(name: String) = wiring("ACT_DESTROY", name)

/** Fragment lifecycle: FRAG_RESUME, FRAG_PAUSE, FRAG_DESTROY_VIEW */
fun fragResume(name: String, host: String) =
    wiring("FRAG_RESUME", name, "host=$host")
fun fragPause(name: String, host: String) =
    wiring("FRAG_PAUSE", name, "host=$host")
fun fragDestroyView(name: String, host: String) =
    wiring("FRAG_DESTROY_VIEW", name, "host=$host")

/** Database operations */
fun dbRead(table: String, rows: Int, durationMs: Long) =
    wiring("DB_READ", table, "rows=$rows dur=${durationMs}ms")
fun dbWrite(table: String, operation: String, rows: Int = 1) =
    wiring("DB_WRITE", table, "op=$operation rows=$rows")

/** HTTP calls */
fun http(method: String, endpoint: String, responseCode: Int, durationMs: Long) =
    wiring("HTTP", "$method $endpoint", "code=$responseCode dur=${durationMs}ms")

/** Background workers */
fun worker(name: String, state: String) = wiring("WORKER", name, state)

/** Security gates */
fun securityGate(gate: String, result: String) = wiring("SEC_GATE", gate, result)

/** App init steps */
fun initStep(component: String, durationMs: Long = 0) =
    wiring("INIT", component, if (durationMs > 0) "dur=${durationMs}ms" else "")

/** Settings/preferences read at decision points */
fun setting(key: String, value: String) = wiring("SETTING", key, "value=$value")

/** Routing/branching decisions */
fun branch(screen: String, decision: String) = wiring("BRANCH", screen, decision)

/** SMS or message parsing (domain-specific, remove if not needed) */
fun smsParse(step: String, details: String = "") = wiring("SMS_PARSE", step, details)


// ---- Auto-wiring via lifecycle callbacks (add to Application.onCreate) ----

/*
 * Paste this in your Application.onCreate() to automatically capture all
 * activity and fragment lifecycle events:
 *
 *   registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
 *       override fun onActivityCreated(a: Activity, b: Bundle?) =
 *           actCreate(a.javaClass.simpleName, b == null)
 *       override fun onActivityResumed(a: Activity) =
 *           actResume(a.javaClass.simpleName)
 *       override fun onActivityPaused(a: Activity) =
 *           actPause(a.javaClass.simpleName)
 *       override fun onActivityDestroyed(a: Activity) =
 *           actDestroy(a.javaClass.simpleName)
 *       override fun onActivityStarted(a: Activity) {}
 *       override fun onActivityStopped(a: Activity) {}
 *       override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
 *   })
 *
 * For fragments, add this in your main Activity's onCreate():
 *
 *   supportFragmentManager.registerFragmentLifecycleCallbacks(
 *       object : FragmentManager.FragmentLifecycleCallbacks() {
 *           override fun onFragmentResumed(fm: FragmentManager, f: Fragment) =
 *               fragResume(f.javaClass.simpleName, this@MainActivity.javaClass.simpleName)
 *           override fun onFragmentPaused(fm: FragmentManager, f: Fragment) =
 *               fragPause(f.javaClass.simpleName, this@MainActivity.javaClass.simpleName)
 *           override fun onFragmentViewDestroyed(fm: FragmentManager, f: Fragment) =
 *               fragDestroyView(f.javaClass.simpleName, this@MainActivity.javaClass.simpleName)
 *       }, true
 *   )
 */
