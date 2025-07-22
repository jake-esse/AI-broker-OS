'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Circle, ArrowRight, Mail, Building, TestTube } from 'lucide-react'
import { trackUserAction } from '@/lib/monitoring'

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  component: React.ReactNode
}

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [companyData, setCompanyData] = useState({
    company_name: '',
    mc_number: '',
    phone: '',
  })

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to AI-Broker',
      description: "Let's get your account set up in just 2 minutes",
      icon: <CheckCircle className="h-6 w-6" />,
      component: <WelcomeStep onNext={() => handleNextStep()} />,
    },
    {
      id: 'company',
      title: 'Company Information',
      description: 'Tell us about your brokerage',
      icon: <Building className="h-6 w-6" />,
      component: (
        <CompanyInfoStep
          data={companyData}
          onChange={setCompanyData}
          onNext={() => handleNextStep()}
        />
      ),
    },
    {
      id: 'email',
      title: 'Email Connection',
      description: 'Connect your email to receive quotes automatically',
      icon: <Mail className="h-6 w-6" />,
      component: <EmailSetupStep onNext={() => handleNextStep()} />,
    },
    {
      id: 'test',
      title: 'Your First Quote',
      description: 'Try generating a quote right now',
      icon: <TestTube className="h-6 w-6" />,
      component: <TestQuoteStep onComplete={() => completeOnboarding()} />,
    },
  ]

  const handleNextStep = () => {
    setCompletedSteps(new Set([...completedSteps, currentStep]))
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
      trackUserAction('onboarding_step_completed', {
        step: steps[currentStep].id,
        step_number: currentStep,
      })
    }
  }

  const completeOnboarding = async () => {
    trackUserAction('onboarding_completed', {
      company_name: companyData.company_name,
    })
    
    // Save company data
    await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyData),
    })
    
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    completedSteps.has(index)
                      ? 'bg-green-600 text-white'
                      : index === currentStep
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {completedSteps.has(index) ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`mx-2 h-1 w-24 ${
                      completedSteps.has(index) ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between text-sm">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`text-center ${
                  index === currentStep ? 'text-gray-900' : 'text-gray-500'
                }`}
              >
                {step.title}
              </div>
            ))}
          </div>
        </div>

        {/* Current step content */}
        <div className="rounded-lg bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            {steps[currentStep].icon}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {steps[currentStep].title}
              </h2>
              <p className="text-gray-600">{steps[currentStep].description}</p>
            </div>
          </div>
          
          {steps[currentStep].component}
        </div>
      </div>
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-lg text-gray-700">
        <p className="mb-4">
          AI-Broker automates your freight quoting process using AI to:
        </p>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <CheckCircle className="mt-1 h-5 w-5 text-green-600" />
            <span>Process quote requests from emails automatically</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="mt-1 h-5 w-5 text-green-600" />
            <span>Generate accurate FTL quotes in seconds</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="mt-1 h-5 w-5 text-green-600" />
            <span>Track all your loads in one place</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="mt-1 h-5 w-5 text-green-600" />
            <span>Chat with AI to manage your operations</span>
          </li>
        </ul>
      </div>
      
      <button
        onClick={onNext}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
      >
        Get Started
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function CompanyInfoStep({
  data,
  onChange,
  onNext,
}: {
  data: any
  onChange: (data: any) => void
  onNext: () => void
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="company_name" className="block text-sm font-medium text-gray-700">
          Company Name
        </label>
        <input
          id="company_name"
          type="text"
          required
          value={data.company_name}
          onChange={(e) => onChange({ ...data, company_name: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="ABC Freight Brokers LLC"
        />
      </div>

      <div>
        <label htmlFor="mc_number" className="block text-sm font-medium text-gray-700">
          MC Number (Optional)
        </label>
        <input
          id="mc_number"
          type="text"
          value={data.mc_number}
          onChange={(e) => onChange({ ...data, mc_number: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="MC-123456"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
          Phone Number
        </label>
        <input
          id="phone"
          type="tel"
          required
          value={data.phone}
          onChange={(e) => onChange({ ...data, phone: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="(555) 123-4567"
        />
      </div>

      <button
        type="submit"
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
      >
        Continue
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  )
}

function EmailSetupStep({ onNext }: { onNext: () => void }) {
  const [testEmailSent, setTestEmailSent] = useState(false)

  const sendTestEmail = async () => {
    trackUserAction('onboarding_test_email_sent')
    
    try {
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'AI-Broker Test Email',
          html: '<p>This is a test email from AI-Broker. Your email connection is working!</p>',
        }),
      })
      
      const result = await response.json()
      
      if (result.success) {
        setTestEmailSent(true)
      } else {
        alert('Failed to send test email: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Test email error:', error)
      alert('Error sending test email')
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          You've already connected your email during login. Now let's test it!
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-gray-900">Test Your Email Connection</h3>
        <p className="text-gray-600">
          Send a test email to verify everything is working correctly.
        </p>
        
        {!testEmailSent ? (
          <button
            onClick={sendTestEmail}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Send Test Email
          </button>
        ) : (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span>Test email sent! Check your inbox.</span>
          </div>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!testEmailSent}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Continue
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function TestQuoteStep({ onComplete }: { onComplete: () => void }) {
  const [quoteGenerated, setQuoteGenerated] = useState(false)

  const generateTestQuote = async () => {
    trackUserAction('onboarding_test_quote_generated')
    // In real implementation, this would generate a test quote
    setQuoteGenerated(true)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-gray-50 p-6">
        <h3 className="mb-2 font-medium text-gray-900">Sample Quote Request:</h3>
        <p className="text-gray-700">
          "Need a quote for a load from Los Angeles, CA to Dallas, TX. 
          35,000 lbs of general freight, pickup Monday morning."
        </p>
      </div>

      {!quoteGenerated ? (
        <button
          onClick={generateTestQuote}
          className="rounded-lg bg-green-600 px-6 py-3 text-white hover:bg-green-700"
        >
          Generate Quote
        </button>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-green-50 p-4">
            <h4 className="font-medium text-green-900">Quote Generated!</h4>
            <p className="mt-1 text-green-700">
              Rate: $2,450 | Distance: 1,435 miles | Confidence: 92%
            </p>
          </div>
          
          <p className="text-gray-600">
            Great! You're all set to start processing real quotes.
          </p>
          
          <button
            onClick={onComplete}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
          >
            Complete Setup
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}