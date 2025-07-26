import prisma from '../lib/prisma'

async function main() {
  console.log('Checking email connections...\n')
  
  const connections = await prisma.emailConnection.findMany()
  
  console.log(`Found ${connections.length} email connections:\n`)
  
  connections.forEach((conn, index) => {
    console.log(`Connection #${index + 1}:`)
    console.log(`  Email: ${conn.email}`)
    console.log(`  Provider: ${conn.provider}`)
    console.log(`  Status: ${conn.status}`)
    console.log(`  Has Access Token: ${!!conn.oauthAccessToken}`)
    console.log(`  Has Refresh Token: ${!!conn.oauthRefreshToken}`)
    console.log(`  Token Expires: ${conn.oauthTokenExpiresAt}`)
    console.log(`  Last Checked: ${conn.lastChecked}`)
    console.log(`  Error: ${conn.errorMessage || 'None'}`)
    console.log('')
  })
  
  // Check if any connections need tokens
  const needTokens = connections.filter(c => !c.oauthAccessToken && c.provider.startsWith('oauth'))
  if (needTokens.length > 0) {
    console.log(`\n${needTokens.length} OAuth connections need to be reconnected to get tokens.`)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })