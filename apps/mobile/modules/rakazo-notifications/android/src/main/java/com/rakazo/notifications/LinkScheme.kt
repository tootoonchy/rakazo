// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
package com.rakazo.notifications

import android.content.Context
import android.content.pm.PackageManager

/**
 * The scheme the app's own links use. The build writes it into the manifest
 * (plugins/with-link-scheme.js); a build that did not keeps the scheme upstream's links use.
 */
internal object LinkScheme {
  const val META = "rakazo.link_scheme"
  const val DEFAULT = "rakazo"
  private val VALID = Regex("^[a-z][a-z0-9+.-]*$")

  fun of(context: Context): String =
    pick(
      runCatching {
        context.packageManager
          .getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
          .metaData
          ?.getString(META)
      }.getOrNull(),
    )

  /** A scheme safe to build a link with, or the default. */
  fun pick(value: String?): String = value?.takeIf { VALID.matches(it) } ?: DEFAULT
}
