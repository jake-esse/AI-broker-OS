import prisma from '../lib/prisma'

async function main() {
  console.log('Seeding database...')
  
  // Create a test user
  let user = await prisma.user.findFirst({
    where: { email: 'jake@hiaiden.com' }
  })
  
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'jake@hiaiden.com',
        name: 'Jake Test',
        provider: 'google'
      }
    })
  }
  
  console.log('Created user:', user.email)
  
  // Create a broker for the user
  let broker = await prisma.broker.findFirst({
    where: { userId: user.id }
  })
  
  if (!broker) {
    broker = await prisma.broker.create({
      data: {
        userId: user.id,
        email: user.email,
        companyName: 'Test Freight Brokers',
        subscriptionTier: 'pro',
        preferences: {
          defaultMarginPercent: 15,
          autoQuoteEnabled: true,
          preferredCarriers: []
        }
      }
    })
  }
  
  console.log('Created broker:', broker.companyName)
  
  // Create an email connection for Gmail
  const emailConnection = await prisma.emailConnection.upsert({
    where: {
      userId_provider_email: {
        userId: user.id,
        provider: 'oauth_google',
        email: 'jake@hiaiden.com'
      }
    },
    update: {},
    create: {
      userId: user.id,
      brokerId: broker.id,
      email: 'jake@hiaiden.com',
      provider: 'oauth_google',
      status: 'active',
      isPrimary: true
    }
  })
  
  console.log('Created email connection:', emailConnection.email)
  
  console.log('Seeding complete!')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })