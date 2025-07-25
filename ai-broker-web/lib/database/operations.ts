import prisma from '@/lib/prisma'

// Database operations to replace Supabase queries

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId }
  })
}

export async function getUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email }
  })
}

export async function getBrokerByUserId(userId: string) {
  return prisma.broker.findFirst({
    where: { userId }
  })
}

export async function createBroker(data: {
  userId: string
  email: string
  companyName: string
  subscriptionTier?: string
}) {
  return prisma.broker.create({
    data: {
      userId: data.userId,
      email: data.email,
      companyName: data.companyName,
      subscriptionTier: data.subscriptionTier || 'trial'
    }
  })
}

export async function getEmailConnectionsByUserId(userId: string) {
  return prisma.emailConnection.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getActiveEmailConnections() {
  return prisma.emailConnection.findMany({
    where: { 
      status: 'active',
      provider: { in: ['oauth_google', 'oauth_outlook'] }
    }
  })
}

export async function getActiveImapConnections() {
  return prisma.emailConnection.findMany({
    where: { 
      status: 'active',
      provider: 'imap',
      imapHost: { not: null }
    }
  })
}

export async function updateEmailConnection(
  id: string, 
  data: {
    oauthAccessToken?: string
    oauthRefreshToken?: string
    oauthTokenExpiresAt?: Date
    lastChecked?: Date
    status?: string
    errorMessage?: string | null
  }
) {
  return prisma.emailConnection.update({
    where: { id },
    data
  })
}

export async function createEmailConnection(data: {
  userId: string
  brokerId: string
  email: string
  provider: string
  oauthAccessToken?: string
  oauthRefreshToken?: string
  oauthTokenExpiresAt?: Date
  imapHost?: string
  imapPort?: number
  imapUsername?: string
  imapPasswordEncrypted?: string
  imapUseSsl?: boolean
  status?: string
  isPrimary?: boolean
}) {
  return prisma.emailConnection.upsert({
    where: {
      userId_provider_email: {
        userId: data.userId,
        provider: data.provider,
        email: data.email
      }
    },
    update: {
      brokerId: data.brokerId,
      oauthAccessToken: data.oauthAccessToken,
      oauthRefreshToken: data.oauthRefreshToken,
      oauthTokenExpiresAt: data.oauthTokenExpiresAt,
      status: data.status || 'active',
      updatedAt: new Date()
    },
    create: {
      ...data,
      status: data.status || 'active'
    }
  })
}

export async function deleteEmailConnection(id: string) {
  return prisma.emailConnection.delete({
    where: { id }
  })
}

export async function createIntakeSession(data: {
  threadId: string
  brokerId: string
  rawEmail: any
  status: string
}) {
  return prisma.intakeSession.create({
    data
  })
}

export async function updateIntakeSession(
  threadId: string,
  data: {
    extractedData?: any
    status?: string
  }
) {
  return prisma.intakeSession.update({
    where: { threadId },
    data
  })
}

export async function createLoad(data: {
  brokerId: string
  emailConnectionId?: string
  intakeThreadId?: string
  originZip: string
  destZip: string
  pickupDt: Date
  weight?: number
  equipment?: string
  commodity?: string
  specialInstructions?: string
  referenceNumber?: string
  rate?: number
  distance?: number
  source: string
  status?: string
}) {
  return prisma.load.create({
    data: {
      ...data,
      status: data.status || 'new'
    }
  })
}