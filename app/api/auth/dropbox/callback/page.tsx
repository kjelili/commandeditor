'use client'

// OAuth callback for the Cloud Storage connector (dropbox).
// The provider redirects here with the access token in the URL hash
// (implicit flow). We relay it to the opener window and close.
// The token never touches a server — this page runs entirely client-side.

import { useEffect } from 'react'

export default function CallbackPage() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = params.get('access_token')
      const expiresIn = params.get('expires_in')
      if (accessToken && window.opener) {
        window.opener.postMessage({
          type: 'oauth_callback',
          provider: 'dropbox',
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
