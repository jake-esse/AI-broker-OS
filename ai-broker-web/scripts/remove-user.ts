import prisma from '../lib/prisma'

async function main() {
  const email = 'jake@hiaiden.com'
  console.log(`Removing user account for: ${email}\n`)
  
  try {
    // Find the user
    const user = await prisma.user.findFirst({
      where: { email }
    })
    
    if (!user) {
      console.log('User not found')
      return
    }
    
    console.log('Found user:', user.id)
    
    // Find the broker
    const broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })
    
    if (broker) {
      console.log('Found broker:', broker.id)
      
      // Delete in order of dependencies
      
      // 1. Delete chat messages
      const chatMessages = await prisma.chatMessage.deleteMany({
        where: { brokerId: broker.id }
      })
      console.log(`Deleted ${chatMessages.count} chat messages`)
      
      // 2. Delete emails
      const emails = await prisma.email.deleteMany({
        where: { brokerId: broker.id }
      })
      console.log(`Deleted ${emails.count} emails`)
      
      // 3. Delete communications
      const communications = await prisma.communication.deleteMany({
        where: { brokerId: broker.id }
      })
      console.log(`Deleted ${communications.count} communications`)
      
      // 4. Get all loads for this broker first
      const brokerLoads = await prisma.load.findMany({
        where: { brokerId: broker.id },
        select: { id: true }
      })
      const loadIds = brokerLoads.map(l => l.id)
      
      // 5. Delete quotes for these loads
      const quotes = await prisma.quote.deleteMany({
        where: { loadId: { in: loadIds } }
      })
      console.log(`Deleted ${quotes.count} quotes`)
      
      // 6. Delete load blasts for these loads
      const loadBlasts = await prisma.loadBlast.deleteMany({
        where: { loadId: { in: loadIds } }
      })
      console.log(`Deleted ${loadBlasts.count} load blasts`)
      
      // 7. Delete loads
      const loads = await prisma.load.deleteMany({
        where: { brokerId: broker.id }
      })
      console.log(`Deleted ${loads.count} loads`)
      
      // 8. Delete notifications
      const notifications = await prisma.notification.deleteMany({
        where: { brokerId: broker.id }
      })
      console.log(`Deleted ${notifications.count} notifications`)
      
      // 9. Delete email connections
      const emailConnections = await prisma.emailConnection.deleteMany({
        where: { brokerId: broker.id }
      })
      console.log(`Deleted ${emailConnections.count} email connections`)
      
      // 10. Delete broker
      await prisma.broker.delete({
        where: { id: broker.id }
      })
      console.log('Deleted broker')
    }
    
    // 11. Delete user settings if exists
    const userSettings = await prisma.userSettings.deleteMany({
      where: { userId: user.id }
    })
    console.log(`Deleted ${userSettings.count} user settings`)
    
    // 12. Delete OAuth states if any
    const oauthStates = await prisma.oAuthState.deleteMany({
      where: { userId: user.id }
    })
    console.log(`Deleted ${oauthStates.count} OAuth states`)
    
    // 13. Finally delete the user
    await prisma.user.delete({
      where: { id: user.id }
    })
    console.log('Deleted user')
    
    console.log('\nSuccessfully removed all data for', email)
  } catch (error) {
    console.error('Error removing user:', error)
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