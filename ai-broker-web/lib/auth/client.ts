// Client-side auth utilities

export async function getCurrentUserClient() {
  try {
    const response = await fetch('/api/auth/me')
    if (!response.ok) return null
    const data = await response.json()
    return data.user
  } catch (error) {
    console.error('Failed to get current user:', error)
    return null
  }
}

export async function signOut() {
  try {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/'
  } catch (error) {
    console.error('Failed to sign out:', error)
  }
}