'use client'

import { Chrome, Mail, Truck, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  
  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam) {
      setError(decodeURIComponent(errorParam))
    }
  }, [searchParams])

  const handleSignIn = (provider: string) => {
    setIsLoading(provider)
  }

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-800 p-12 flex-col justify-between">
        <div className="flex items-center text-white">
          <Truck className="h-8 w-8 mr-3" />
          <span className="text-2xl font-bold">AI Broker</span>
        </div>
        
        <div className="space-y-6 text-white">
          <h1 className="text-4xl font-bold leading-tight">
            Revolutionize Your Freight Operations
          </h1>
          <p className="text-lg opacity-90">
            Harness the power of AI to streamline load management, automate communications, and maximize your brokerage efficiency.
          </p>
          <div className="flex items-center space-x-8 pt-8">
            <div>
              <div className="text-3xl font-bold">98%</div>
              <div className="text-sm opacity-75">Faster Processing</div>
            </div>
            <div>
              <div className="text-3xl font-bold">24/7</div>
              <div className="text-sm opacity-75">AI Assistance</div>
            </div>
            <div>
              <div className="text-3xl font-bold">50%</div>
              <div className="text-sm opacity-75">Cost Reduction</div>
            </div>
          </div>
        </div>
        
        <div className="text-sm text-white opacity-60">
          © 2024 AI Broker. All rights reserved.
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center text-blue-600">
            <Truck className="h-10 w-10 mr-3" />
            <span className="text-3xl font-bold">AI Broker</span>
          </div>

          <div className="text-center">
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Sign in to manage your freight operations with AI
            </p>
          </div>
          
          {error && (
            <div className="rounded-lg bg-red-50 p-4 mt-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-8 space-y-6">
            <div className="space-y-3">
              <Link 
                href="/api/auth/direct/google" 
                onClick={() => handleSignIn('google')}
                className="block"
              >
                <button 
                  disabled={isLoading !== null}
                  className="relative flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading === 'google' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                    </div>
                  ) : (
                    <>
                      <Chrome className="mr-2 h-5 w-5" />
                      Continue with Google
                    </>
                  )}
                </button>
              </Link>
              
              <Link 
                href="/api/auth/direct/microsoft" 
                onClick={() => handleSignIn('microsoft')}
                className="block"
              >
                <button 
                  disabled={isLoading !== null}
                  className="relative flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading === 'microsoft' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                    </div>
                  ) : (
                    <>
                      <Mail className="mr-2 h-5 w-5" />
                      Continue with Microsoft
                    </>
                  )}
                </button>
              </Link>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-gray-50 px-2 text-gray-500">Secure sign in with your work account</span>
              </div>
            </div>
            
            <div className="text-center">
              <p className="text-xs text-gray-500">
                By signing in, you agree to our{' '}
                <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              New to AI Broker?{' '}
              <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                Contact sales for a demo
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}