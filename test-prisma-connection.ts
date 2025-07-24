import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    // Test connection
    await prisma.$connect()
    console.log('✅ Connected to database successfully!')
    
    // Count users
    const userCount = await prisma.user.count()
    console.log(`📊 Users in database: ${userCount}`)
    
    // Count other tables
    const brokerCount = await prisma.broker.count()
    const loadCount = await prisma.load.count()
    const emailConnectionCount = await prisma.emailConnection.count()
    
    console.log(`📊 Brokers: ${brokerCount}`)
    console.log(`📊 Loads: ${loadCount}`)
    console.log(`📊 Email connections: ${emailConnectionCount}`)
    
    console.log('\n✨ Prisma is working correctly!')
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()