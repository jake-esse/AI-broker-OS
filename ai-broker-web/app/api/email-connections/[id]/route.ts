import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params

    // Verify the connection belongs to the user before deleting
    const connection = await prisma.emailConnection.findFirst({
      where: {
        id,
        userId: user.id
      }
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'Connection not found or access denied' },
        { status: 404 }
      )
    }

    // Delete the connection
    await prisma.emailConnection.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting email connection:', error)
    return NextResponse.json(
      { 
        error: 'Failed to delete connection',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}