'use client'

// OAuth callback for the Cloud Storage connector (google).
// The provider redirects here with the access token in the URL hash
// (implicit flow). We relay it to the opener window and close.
// The token never touches a server — this page runs entirely client-side.

import { useEffect } from 'react'
import { relayToDesktopIfNeeded } from '@/lib/cloudDesktopAuth'

export default function CallbackPage() {
  useEffect(() => {
    try {
      // Desktop app flow: hand the token to the loopback listener the
      // desktop shell started, instead of postMessaging a popup opener.
      if (relayToDesktopIfNeeded('google')) return
      const params = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = params.get('access_token')
      const expiresIn = params.get('expires_in')
      if (accessToken && window.opener) {
        window.opener.postMessage({
          type: 'oauth_callback',
          provider: 'google_drive',
          access_token: accessToken,
          expires_in: parseInt(expiresIn || '3600', 10),
        }, window.location.origin)
      }
    } finally {
      window.close()
    }
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', color: '#374151' }}>
      Authenticating… you can close this window.
    </div>
  )
}
