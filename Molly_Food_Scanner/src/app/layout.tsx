import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import React from 'react'
import { ThemeProvider } from '@/lib/theme/theme-context'
import { OnboardingProvider } from '@/lib/onboarding/onboarding-context'
import { CookieConsent } from '@/components/privacy/CookieConsent'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics'
import { AnalyticsProvider } from '@/components/analytics/GoogleAnalytics'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

// Get app URL from environment
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: {
    default: 'Molly Food Scanner - AI-Powered Nutrition Analysis',
    template: '%s | Molly Food Scanner',
  },
  description: 'Scan food barcodes and analyze nutrition with AI. Get detailed ingredient analysis, allergen detection, Nutri-Score ratings, and personalized recipe suggestions based on your dietary needs.',
  keywords: [
    'food scanner',
    'barcode scanner',
    'nutrition analysis',
    'food ingredients',
    'allergen detection',
    'Nutri-Score',
    'healthy eating',
    'diet tracker',
    'food app',
    'AI nutrition',
    'recipe finder',
  ],
  authors: [{ name: 'Molly Food Scanner', url: appUrl }],
  creator: 'Molly Food Scanner',
  publisher: 'Molly Food Scanner',
  applicationName: 'Molly Food Scanner',
  generator: 'Next.js',
  metadataBase: new URL(appUrl),
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/',
      'en-GB': '/',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: appUrl,
    siteName: 'Molly Food Scanner',
    title: 'Molly Food Scanner - AI-Powered Nutrition Analysis',
    description: 'Scan food barcodes and analyze nutrition with AI. Get detailed ingredient analysis, allergen detection, Nutri-Score ratings, and personalized recipe suggestions.',
    images: [
      {
        url: '/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'Molly Food Scanner Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Molly Food Scanner - AI-Powered Nutrition Analysis',
    description: 'Scan food barcodes and analyze nutrition with AI. Get detailed ingredient analysis, allergen detection, Nutri-Score ratings, and personalized recipe suggestions.',
    images: ['/icons/icon-512x512.png'],
    creator: '@MollyFoodScanner',
  },
  manifest: '/manifest.json',
  themeColor: '#10B981',
  colorScheme: 'light dark',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Molly Food Scanner',
  },
  icons: {
    icon: [
      { url: '/icons/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/icon-96x96.png',
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-167x167.png', sizes: '167x167', type: 'image/png' },
      { url: '/icons/icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
}

// Disable static generation for API routes that use Prisma
// This prevents Next.js from trying to run database queries at build time
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        {/* Google reCAPTCHA v3 - loaded only if site key is configured */}
        <script
          id="recaptcha-script"
          src={`https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ''}`}
          async
          defer
        />
        {/* Google Analytics */}
        <GoogleAnalytics />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {/* Theme Flash Prevention Script - MUST run before React hydrates */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const storageKey = 'molly-theme';
                const theme = localStorage.getItem(storageKey) || 'system';
                const root = document.documentElement;

                function getSystemTheme() {
                  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }

                let resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
                root.classList.remove('light', 'dark');
                root.classList.add(resolvedTheme);
              })();
            `,
          }}
        />
        <AnalyticsProvider>
          <ThemeProvider defaultTheme="system">
            <OnboardingProvider autoShow={true}>
              {children}
              <OnboardingWizard />
              <CookieConsent />
            </OnboardingProvider>
          </ThemeProvider>
        </AnalyticsProvider>
        {/* PWA Service Worker Registration */}
        <script
          id="service-worker-register"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', {
                    scope: '/',
                  }).then(function(registration) {
                    console.log('SW registered: ', registration);
                  }).catch(function(error) {
                    console.log('SW registration failed: ', error);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}