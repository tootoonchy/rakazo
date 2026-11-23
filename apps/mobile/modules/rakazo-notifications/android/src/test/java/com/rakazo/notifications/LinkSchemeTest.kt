// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
package com.rakazo.notifications

import org.junit.Assert.assertEquals
import org.junit.Test

class LinkSchemeTest {
  @Test
  fun `uses the scheme the build named and falls back when it is missing or unsafe`() {
    assertEquals("agental", LinkScheme.pick("agental"))
    assertEquals(LinkScheme.DEFAULT, LinkScheme.pick(null))
    assertEquals(LinkScheme.DEFAULT, LinkScheme.pick(""))
    assertEquals(LinkScheme.DEFAULT, LinkScheme.pick("java script:"))
    assertEquals(LinkScheme.DEFAULT, LinkScheme.pick("Agental"))
  }
}
